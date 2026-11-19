import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=html=>html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
function modelFor(code){
 const grab=(start,end)=>{
  const first=code.indexOf(start),last=code.indexOf(end,first);
  assert.ok(first>=0&&last>first,start);
  return code.slice(first,last);
 };
 return vm.runInNewContext(
  grab('const currentDay=','function migrateV1(').replace(/const currentDay=[^\n]+/,"const currentDay=()=> '2026-12-20';")+
  grab('function recordedProfit(','function euWarnings(')+grab('function validDate(','function canonical(')+
  grab('function allocateResult(','/* Ledger movements are explicit')+grab('function fundingSplit(','function fundingFormFields(')+
  ';({emptyState,assertState,helperLedger,vehicleFinancial,fundingSplit,vatResult,financeDashboard,cashAt,cashflow})',
  {getCloudStore:()=>null,cloudMode:()=>false,roundMoney:n=>Math.round((n+Number.EPSILON)*100)/100,
   finite:n=>{if(!Number.isFinite(n))throw Error('Invalid');}}
 );
}
const html=readFileSync(new URL('../test/index.html',import.meta.url),'utf8');
const code=script(html),api=modelFor(code);
const production=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const productionCode=script(production),live=modelFor(productionCode);

function car(id,more={}){
 return {id,name:id,year:null,km:null,plate:'',status:'sold',test:false,review:false,
  bought:'2026-11-10',stockDate:'2026-11-10',purchase:242000,purchaseCurrency:'CZK',purchaseRate:1,
  purchaseVatRate:21,purchaseVatExact:42000,purchaseDeduction:100,purchaseVatConfirmed:true,purchasePeriod:'2026-11',
  purchaseDocumentDate:'2026-11-10',purchaseInvoice:'P-'+id,purchaseOpening:true,
  vat:'standard',sale:302500,sold:'2026-11-20',saleCurrency:'CZK',saleRate:1,saleVatRate:21,
  saleVatExact:null,salePeriod:'2026-11',saleOpening:false,helperPercent:0,profitMode:'calculated',...more};
}
function stateWith(...vehicles){
 const s=api.emptyState();
 s.vehicles=vehicles;
 s.accounts=[{id:'bank',name:'Účet',currency:'CZK',opening:1000000,openingDate:'2026-11-01'}];
 return s;
}
const payout=(id,amount,more={})=>({id,amount,type:'helperPayout',accountId:'',date:'2026-12-10',rate:1,allocations:[],...more});

test('test build can execute its inline module and uses isolated storage',()=>{
 assert.ok(html.includes("script-src 'sha256-"+createHash('sha256').update(code).digest('base64')+"'"));
 assert.match(code,/const DB='AutoDama-SANDBOX-/);
 assert.match(code,/const CLOUD_CONFIG=Object\.freeze\(\{\s*enabled: false,/);
});

test('monthly VAT adds both domestic documents, keeps the EU credit and counts each purchase once',()=>{
 const base={purchase:500000,purchaseVatExact:86776.86,sale:600000};
 const domestic=car('Český prodej',base),eu=car('Slovenský prodej',{...base,vat:'eu',sale:495867.77});
 const s=stateWith(domestic);
 assert.equal(api.vatResult(s,'2026-11').result,17355.37);
 s.vehicles=[eu];
 assert.equal(api.vatResult(s,'2026-11').result,-86776.86);
 s.vehicles=[domestic];
 Object.assign(domestic,{sold:'2026-12-01',salePeriod:'2026-12'});
 assert.equal(api.vatResult(s,'2026-11').result,-86776.86);
 assert.equal(api.vatResult(s,'2026-12').result,104132.23);
});

test('the 15% is calculated on each positive sale, including a recorded historical result',()=>{
 const live=car('Prodej',{helperPercent:5,funding:{purchaseCash:242000,ownerAmount:121000,investorAmount:121000,
  investorFraction:.5,investorProfitPercent:35,helperProfitPercent:5}});
 const past=car('Import z tabulky',{sold:'',salePeriod:'',vat:'pending',review:true,profitMode:'recorded',recordedProfit:30000});
 const loss=car('Ztráta',{sale:200000}),stock=car('Sklad',{status:'stock',sale:null,sold:'',salePeriod:''});
 const s=stateWith(live,past,loss,stock,car('Fiktivní',{test:true}));
 s.costs.push({id:'repair',vehicleId:live.id,name:'Servis',date:'2026-11-15',period:'2026-11',amount:1210,
  currency:'CZK',rate:1,vatRate:21,deduction:100,vatExact:210});
 api.assertState(s);
 assert.equal(api.vehicleFinancial(s,live).preProfit,49000);
 assert.equal(api.vehicleFinancial(s,live).helper,7350);
 assert.equal(api.vehicleFinancial(s,live).profit,41650);
 const split=api.fundingSplit(s,live);
 assert.equal(split.investor,8575);
 assert.equal(split.helper,7350);
 assert.equal(split.owner,33075);
 assert.equal(api.vehicleFinancial(s,past).profit,30000,'previously recorded profit is preserved');
 const ledger=api.helperLedger(s);
 assert.equal(ledger.earned,11850);
 assert.deepEqual(Array.from(ledger.earnings,r=>[r.v.id,r.amount]),[['Prodej',7350],['Import z tabulky',4500],['Ztráta',0]]);
});

test('old payments and new partial payouts count once, with cash movement only on the selected account',()=>{
 const s=stateWith(car('dříve-párováno',{helperPercent:10}),car('starší-hotovost',{helperPercent:5,helperOpening:true}));
 s.transactions.push({...payout('old',2000,{accountId:'bank',date:'2026-11-23'}),type:'cost',
  allocations:[{invoiceId:'helper:dříve-párováno',amount:2000}]});
 api.assertState(s);
 assert.equal(api.helperLedger(s).balance,10500);
 s.transactions.push(payout('record-only',3000),payout('bank-payout',3500,{accountId:'bank'}));
 api.assertState(s);
 assert.equal(api.helperLedger(s).paid,11000);
 assert.equal(api.helperLedger(s).balance,4000);
 assert.equal(api.financeDashboard(s).invoiceDebt,4000);
 assert.equal(api.cashAt(s),994500);
 assert.equal(api.cashflow(s,'2026-12').groups.helperPayout,-3500);
 assert.equal(api.vehicleFinancial(s,s.vehicles[0]).profit,42500);
});

test('payouts before opening count against the helper balance without changing the initial bank cash',()=>{
 const s=stateWith(car('starší'));
 s.accounts[0].currency='EUR';
 s.transactions.push(payout('eur-history',100,{accountId:'bank',rate:24.5,date:'2026-10-10'}));
 api.assertState(s);
 assert.equal(api.helperLedger(s).paid,2450);
 assert.equal(api.helperLedger(s).balance,5050);
 assert.equal(api.cashAt(s),24500000);
});

test('production stays connected to shared data and compatible bank expenses count once as helper payouts',()=>{
 assert.match(productionCode,/const CLOUD_CONFIG=Object\.freeze\(\{\s*enabled: true,/);
 assert.match(productionCode,/const DB='AutoDama-local-v2'/);
 assert.doesNotMatch(production,/AutoDama-SANDBOX|Zkušební kapitál|id="autodama-initial-data"/);
 const s=stateWith(car('Prodané auto'));
 s.transactions.push({...payout('bank-payout',2500,{accountId:'bank',note:''}),type:'operating',helperPayout:true});
 s.helperPayouts=[{id:'no-bank',amount:1000,date:'2026-12-12',note:''}];
 live.assertState(s);
 assert.equal(live.helperLedger(s).earned,7500);
 assert.equal(live.helperLedger(s).paid,3500);
 assert.equal(live.helperLedger(s).balance,4000);
 assert.equal(live.financeDashboard(s).invoiceDebt,4000);
 assert.equal(live.cashAt(s),997500);
 assert.equal(live.cashflow(s,'2026-12').groups.operating,-2500);
 s.helperPayouts.push({...s.helperPayouts[0],id:'bank-payout'});
 assert.throws(()=>live.assertState(s),/duplicitní výplata/);
});

test('pending production VAT stays out of the monthly estimate until confirmed',()=>{
 const v=car('Auto',{purchaseVatConfirmed:false}),s=stateWith(v);
 live.assertState(s);
 assert.equal(live.vatResult(s,'2026-11').purchases,0);
 assert.equal(live.vatResult(s,'2026-11').sales,52500);
 v.purchaseVatConfirmed=true;
 assert.equal(live.vatResult(s,'2026-11').result,10500);
});
