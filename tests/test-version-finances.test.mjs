import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const script=html=>html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
function modelFor(code,manualVat=false){
 const grab=(start,end)=>{
  const first=code.indexOf(start),last=code.indexOf(end,first);
  assert.ok(first>=0&&last>first,start);
  return code.slice(first,last);
 };
 return vm.runInNewContext(
  grab('const currentDay=','function migrateV1(').replace(/const currentDay=[^\n]+/,"const currentDay=()=> '2026-12-20';")+
  grab('function recordedProfit(','function euWarnings(')+grab('function validDate(','function canonical(')+
  grab('function allocateResult(','/* Ledger movements are explicit')+grab('function fundingSplit(','function fundingFormFields(')+
  (manualVat?grab('function vatSplitAmount(','function fundingSplit(')+
   grab('const SALES_INVOICE_KINDS=','const salesNorm=')+grab('function salesInvoicePatch(','function stagePurchaseInvoiceDocuments(')+
   grab('function salesInvoiceMetadata(','function simplifyVehicleForm(')+
   grab('function vehicleProfitNote(','function renderOverview('):'')+
  ';({emptyState,assertState,helperLedger,vehicleFinancial,fundingSplit,vatResult,financeDashboard,cashAt,cashflow'+
  (manualVat?',vehicleVatCheck,monthlyVatCheck,vehicleVatLedger,periodSettlement,setPurchaseVatClaim,capitalView,salesInvoicePatch,stageSalesInvoiceDocuments,monthlyCapitalBefore,monthlyProfitEstimate,monthlySplit,saveMonthlySplit,reopenMonthlySplit,nextMonthlyPeriod,vatBankMonth,vehicleProfitNote,checkOriginalSplitChange':'')+'})',
  {getCloudStore:()=>null,cloudMode:()=>false,crypto:{randomUUID:()=> 'fixture-document'},roundMoney:n=>Math.round((n+Number.EPSILON)*100)/100,
   finite:n=>{if(!Number.isFinite(n))throw Error('Invalid');}}
 );
}
const html=readFileSync(new URL('../test/index.html',import.meta.url),'utf8');
const code=script(html),api=modelFor(code,true);
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

test('pending purchase VAT is excluded from profit, the helper amount and the monthly VAT estimate',()=>{
 const v=car('Odpočet k ověření',{purchaseVatConfirmed:false});
 const s=stateWith(v);
 const pending=api.vehicleFinancial(s,v);
 assert.equal(pending.pendingPurchaseVat,42000);
 assert.equal(pending.preProfit,8000);
 assert.equal(pending.helper,1020);
 assert.equal(pending.profitAfterIncomeTax,6800);
 assert.equal(api.vatResult(s,'2026-11').purchases,0);

 v.purchaseVatConfirmed=true;
 assert.equal(api.vehicleFinancial(s,v).preProfit,50000);
 assert.equal(api.vatResult(s,'2026-11').result,10500);
});

test('a sale with known dates and price can be saved while its VAT mode is pending',()=>{
 const v=car('Prodej k ověření',{vat:'pending'});
 const s=stateWith(v);
 api.assertState(s);
 assert.equal(api.vehicleFinancial(s,v).profitAfterIncomeTax,null);
 const vat=api.vatResult(s,'2026-11');
 assert.equal(vat.unknownSales,true);
 assert.equal(vat.lines.find(line=>line.kind==='sale').output,null);
 v.vat='standard';
 assert.equal(api.vatResult(s,'2026-11').unknownSales,false);
});

test('entered vehicle VAT is authoritative and the check only reports the difference',()=>{
 const v=car('Slovenský prodej',{purchase:484000,purchaseVatExact:84000,purchaseVatConfirmed:false,purchaseVatClaim:83999.75,
  sale:12100,saleCurrency:'EUR',saleRate:25,saleVatAmount:0,vat:'eu'});
 const s=stateWith(v);
 api.assertState(s);
 const before=JSON.stringify(v),check=api.vehicleVatCheck(v);
 assert.equal(check.purchase.expected,84000);
 assert.equal(check.purchase.difference,-.25);
 assert.equal(check.sale.expected,0);
 assert.equal(check.sale.difference,0);
 assert.equal(JSON.stringify(v),before);
 assert.equal(api.vatResult(s,'2026-11').result,-83999.75);
 assert.equal(api.vehicleFinancial(s,v).purchaseVat,83999.75);

 v.vat='standard';
 v.saleVatAmount=50000;
 assert.equal(api.vehicleVatCheck(v).sale.expected,52500);
 assert.equal(api.vehicleFinancial(s,v).saleVat,50000);
});

test('empty VAT stays open for review and zero is a recorded amount',()=>{
 const v=car('Ruční VAT',{purchaseVatClaim:null,saleVatAmount:null});
 const s=stateWith(v);
 s.costs.push({id:'transport',vehicleId:v.id,name:'Doprava',date:'2026-11-11',period:'2026-11',
  amount:1210,currency:'CZK',rate:1,vatRate:21,deduction:100,vatClaim:null});
 api.assertState(s);
 assert.equal(api.vatResult(s,'2026-11').missingAmounts,3);
 assert.equal(api.vehicleFinancial(s,v).profitAfterIncomeTax,null);
 assert.equal(api.vehicleVatCheck(v).sale.entered,null);

 Object.assign(v,{vat:'pending',purchaseVatClaim:0,saleVatAmount:0});
 s.costs[0].vatClaim=100;
 api.assertState(s);
 const r=api.vatResult(s,'2026-11');
 assert.equal(r.missingAmounts,0);
 assert.equal(r.result,-100);
 assert.equal(api.vehicleFinancial(s,v).costNet,1110);
 assert.equal(api.vehicleFinancial(s,v).saleVat,0);
 assert.equal(api.vehicleVatCheck(v).sale.expected,null);
});

test('a missing profit explains what to complete and a recorded after-tax profit is displayed',()=>{
 const v=car('Prodej bez české DPH',{vat:'eu',saleVatAmount:null});
 const s=stateWith(v);
 const profitNote=()=>api.vehicleProfitNote(s,v,api.vehicleFinancial(s,v));
 assert.equal(profitNote(),'Chybí DPH z prodeje');

 v.saleVatAmount=0;
 assert.ok(Number.isFinite(api.vehicleFinancial(s,v).profitAfterIncomeTax));
 v.review=true;
 assert.equal(profitNote(),'Historický záznam čeká na doplnění');

 v.review=false;
 s.costs.push({vehicleId:v.id,review:true,amount:500,currency:'CZK',rate:1,vatRate:0,deduction:0});
 assert.equal(profitNote(),'Náklady auta čekají na ověření');

 Object.assign(v,{profitMode:'recorded',recordedProfit:120366,recordedProfitAfterIncomeTax:true,saleVatAmount:null});
 assert.equal(api.vehicleFinancial(s,v).profitAfterIncomeTax,120366);
 assert.equal(profitNote(),'Zadaný po dani');
});

test('a refund can be recorded without a bank account, filing, or a full vehicle assignment',()=>{
 const v=car('Scout',{vat:'eu',purchaseVatClaim:42000,saleVatAmount:0}),s=stateWith(v);
 const t={id:'refund',type:'vatRefund',date:'2026-12-18',periodId:'2026-11',amount:40000,
  rate:1,accountId:'',allocations:[],vatShares:[]};
 const profit=api.vehicleFinancial(s,v).profitAfterIncomeTax;
 s.transactions.push(t);
 api.assertState(s);
 assert.equal(api.cashAt(s),1000000);
 assert.equal(api.monthlyVatCheck(s,'2026-11').paymentComparison.difference,2000);
 assert.equal(api.vehicleVatLedger(s).periods.find(p=>p.id==='2026-11').unallocatedReceived,40000);

 t.vatShares.push({vehicleId:v.id,amount:25000});
 api.assertState(s);
 const row=api.vehicleVatLedger(s).rows.find(r=>r.vehicleId===v.id&&r.period==='2026-11');
 assert.equal(row.refundReceived,25000);
 assert.equal(row.pendingInput,17000);
 assert.equal(api.vehicleFinancial(s,v).profitAfterIncomeTax,profit);
 assert.equal(api.vehicleVatLedger(s).periods.find(p=>p.id==='2026-11').unallocatedReceived,15000);

 t.vatShares[0].amount=40000.01;
 assert.throws(()=>api.assertState(s),/přesahuje přijatou vratku/);
});

test('declared VAT and movements can be recorded when they disagree, without inventing an extra liability',()=>{
 const v=car('Prodej',{purchaseVatClaim:42000,saleVatAmount:52500}),s=stateWith(v);
 const p={id:'2026-11',status:'Podáno',actual:10000,filed:'2026-12-10'};
 s.vatPeriods.push(p);
 s.transactions.push({id:'paid',type:'vatPayment',date:'2026-12-18',periodId:p.id,amount:10500,rate:1,
  accountId:'bank',allocations:[]});
 api.assertState(s);
 const check=api.monthlyVatCheck(s,p.id);
 assert.equal(check.declaredComparison.difference,-500);
 assert.equal(check.paymentComparison.difference,500);
 assert.equal(api.periodSettlement(s,p).outstanding,0);
 assert.equal(api.cashAt(s),989500);
});

test('a single manual purchase claim can be saved on a sold and already financed car',()=>{
 const v=car('Prodané auto',{vat:'eu',purchaseVatClaim:null,purchaseInvoice:'',purchaseDocumentDate:'',
  purchaseVatConfirmed:false,saleVatAmount:null,profitMode:'recorded',recordedProfit:30000,
  funding:{purchaseCash:242000,ownerAmount:145200,investorAmount:96800,investorFraction:.4,
   investorProfitPercent:35,helperProfitPercent:15}});
 const s=stateWith(v),before={...v};
 api.setPurchaseVatClaim(s,v.id,40000,'2026-12');
 api.assertState(s);
 assert.deepEqual(v,{...before,purchaseVatClaim:40000},'the action changes only the purchase claim');
 assert.equal(api.vatResult(s,'2026-11').purchases,40000);
 assert.equal(api.vehicleFinancial(s,v).profitAfterIncomeTax,30000);
 api.setPurchaseVatClaim(s,v.id,0,'2026-12');
 assert.equal(api.vatResult(s,'2026-11').purchases,0);
});

test('an assigned refund releases tied capital across months according to the original funding',()=>{
 const v=car('Sklad',{purchase:363000,status:'stock',sale:null,sold:'',salePeriod:'',purchaseVatClaim:60000,
  funding:{purchaseCash:363000,ownerAmount:217800,investorAmount:145200,investorFraction:.4,
   investorProfitPercent:35,helperProfitPercent:15}});
 const s=stateWith(v);
 s.capital={owner:1000000,investor:1000000,asOf:'2026-11-01'};
 const movement={id:'refund',type:'vatRefund',date:'2026-12-18',periodId:'2026-12',
  amount:50000,rate:1,accountId:'',allocations:[],vatShares:[]};
 s.transactions.push(movement);
 const unassigned=api.capitalView(s);
 assert.equal(unassigned.vatReleasedOwn,0);
 assert.equal(unassigned.vatReleasedInv,0);
 movement.vatShares=[{vehicleId:v.id,amount:50000}];
 api.assertState(s);
 const assigned=api.capitalView(s);
 assert.equal(assigned.freeOwn-unassigned.freeOwn,30000);
 assert.equal(assigned.freeInv-unassigned.freeInv,20000);
 assert.equal(assigned.own,unassigned.own);
 assert.equal(assigned.inv,unassigned.inv);
 assert.equal(assigned.vatReceivedInv,20000);
 assert.equal(s.transactions.length,1);
});

test('a sales PDF can be attached before review, and its VAT fields do not block price prefill',()=>{
 const v=car('Prodej',{saleVatAmount:0});
 const s=stateWith(v);
 const info={kind:'invoice',number:'SYNTHETIC',currency:'CZK',taxableDate:'2026-11-20',total:302500,
  settledAdvances:null,balanceDue:null,vin:'',vatMode:'eu',vatId:'SK?',vatRate:null,exemptionText:''};
 const patch=api.salesInvoicePatch(v,info);
 assert.equal(patch.sale,302500);
 assert.equal(patch.vat,undefined);
 assert.equal(patch.saleVatAmount,undefined);
 assert.equal(patch.vatId,undefined);
 api.stageSalesInvoiceDocuments(s,v.id,[{fileName:'Fiktivní faktura.pdf',hash:'synthetic-pdf',
  info,attachment:{mime:'application/pdf',data:'JVBERi0xLjQK'},applied:false}]);
 api.assertState(s);
 assert.equal(s.documents[0].vehicleId,v.id);
 assert.equal(s.documents[0].salesInvoiceData,undefined);
 assert.equal(v.saleVatAmount,0);
});

test('the 15% is calculated on positive after-tax earnings, including a recorded historical result',()=>{
 const live=car('Prodej',{helperPercent:5,funding:{purchaseCash:242000,ownerAmount:121000,investorAmount:121000,
  investorFraction:.5,investorProfitPercent:35,helperProfitPercent:5}});
 const past=car('Import z tabulky',{sold:'',salePeriod:'',vat:'pending',review:true,profitMode:'recorded',recordedProfit:30000});
 const loss=car('Ztráta',{sale:200000}),stock=car('Sklad',{status:'stock',sale:null,sold:'',salePeriod:''});
 const s=stateWith(live,past,loss,stock,car('Fiktivní',{test:true}));
 s.costs.push({id:'repair',vehicleId:live.id,name:'Servis',date:'2026-11-15',period:'2026-11',amount:1210,
  currency:'CZK',rate:1,vatRate:21,deduction:100,vatExact:210});
 api.assertState(s);
 assert.equal(api.vehicleFinancial(s,live).preProfit,49000);
 assert.equal(api.vehicleFinancial(s,live).profitAfterIncomeTax,41650);
 assert.equal(api.vehicleFinancial(s,live).helper,6247.5);
 assert.equal(api.vehicleFinancial(s,live).profit,42752.5);
 const split=api.fundingSplit(s,live);
 assert.equal(split.investor,8575);
 assert.equal(split.helper,6247.5);
 assert.equal(split.owner,34177.5);
 assert.equal(api.vehicleFinancial(s,past).profit,30000,'previously recorded profit is preserved');
 const ledger=api.helperLedger(s);
 assert.equal(ledger.earned,10747.5);
 assert.deepEqual(Array.from(ledger.earnings,r=>[r.v.id,r.amount]),[['Prodej',6247.5],['Import z tabulky',4500],['Ztráta',0]]);
});

test('monthly split uses one opening balance and the same profit base for both percentages',()=>{
 const carInPool=car('Společný prodej',{bought:'2026-10-20',stockDate:'2026-10-20',purchasePeriod:'2026-10',purchaseDocumentDate:''});
 const oldCar=car('Původní prodej',{bought:'2026-10-10',stockDate:'2026-10-10',purchasePeriod:'2026-10',
  purchaseDocumentDate:'',sold:'2026-10-25',salePeriod:'2026-10'});
 const s=stateWith(carInPool,oldCar);
 s.monthlyDeal={startDate:'2026-11-08',owner:1500000,investor:1500000,months:[]};
 const movement=(id,type,amount,date,capitalParty='owner')=>({id,type,amount,date,accountId:'',rate:1,capitalParty,allocations:[]});
 s.transactions.push(movement('personal','withdrawal',45000,'2026-11-27'));
 assert.equal(api.helperLedger(s).earned,6375,'only the earlier sale earns an individual commission');
 assert.equal(api.vehicleFinancial(s,carInPool).helper,0);
 assert.equal(api.monthlyProfitEstimate(s,'2026-11').profit,42500);
 const m=api.saveMonthlySplit(s,'2026-11',120000,'2026-12-01');
 assert.deepEqual([m.opening.owner,m.opening.investor,m.investorRate,m.investor,m.helper,m.owner],
  [1500000,1500000,17.5,21000,18000,81000]);
 assert.equal(api.helperLedger(s).earned,24375);
 assert.equal(api.cashAt(s),1000000,'book entries and allocation do not move bank cash');
 assert.throws(()=>api.saveMonthlySplit(s,'2026-11',120000),/otevřený měsíc/);
 const dec=api.monthlyCapitalBefore(s,'2026-12-01');
 assert.deepEqual([dec.owner,dec.investor],[1536000,1521000]);
 assert.equal(api.monthlySplit(dec,0).investorRate.toFixed(2),'17.41');

 s.transactions.push(movement('investor-out','withdrawal',21000,'2026-12-02','investor'));
 assert.equal(api.monthlyCapitalBefore(s,'2026-12-01').investor,1521000);
 assert.equal(api.monthlyCapitalBefore(s,'2027-01-01').investor,1500000);
 assert.equal(api.financeDashboard(s).withdrawnYear,45000);
 const loss=api.saveMonthlySplit(s,'2026-12',-10000,'2026-12-20');
 assert.equal(loss.helper,0);
 assert.equal(loss.investor,-1741.41);
 assert.equal(loss.owner,-8258.59);
 assert.equal(api.helperLedger(s).earned,24375);
 api.assertState(s);
 api.reopenMonthlySplit(s,'2026-12');
 api.reopenMonthlySplit(s,'2026-11');
 assert.equal(api.nextMonthlyPeriod(s.monthlyDeal),'2026-11');
 api.assertState(s);
});

test('sales from the cutover use the monthly capital ratio even when bought with only the owner’s money',()=>{
 const earlier=car('Původní prodej',{sold:'2026-11-19',funding:{purchaseCash:242000,ownerAmount:0,
  investorAmount:242000,investorFraction:1,investorProfitPercent:35,helperProfitPercent:15}});
 const later=car('Prodej od začátku dohody',{funding:{purchaseCash:242000,ownerAmount:242000,
  investorAmount:0,investorFraction:0,investorProfitPercent:35,helperProfitPercent:15}});
 const s=stateWith(earlier,later);
 s.monthlyDeal={startDate:'2026-11-20',owner:2500000,investor:1500000,months:[]};
 assert.equal(api.fundingSplit(s,earlier).investor,17500);
 assert.equal(api.vehicleFinancial(s,later).helper,0);
 assert.equal(api.monthlyProfitEstimate(s,'2026-11').sales,1);
 assert.equal(api.monthlyProfitEstimate(s,'2026-11').profit,42500);

 const nov=api.saveMonthlySplit(s,'2026-11',200000,'2026-12-01');
 assert.deepEqual([nov.investorRate,nov.investor,nov.helper,nov.owner],[13.125,26250,30000,143750]);
 s.transactions.push({id:'capital-out',date:'2026-11-30',type:'withdrawal',amount:500000,accountId:'',
  rate:1,capitalParty:'owner',allocations:[]});
 const dec=api.saveMonthlySplit(s,'2026-12',100000,'2026-12-20');
 assert.deepEqual([dec.opening.owner,dec.opening.investor],[2143750,1526250]);
 assert.equal(dec.investor,14555.52);
 assert.equal(api.fundingSplit(s,earlier).investor,17500);
 api.assertState(s);
});

test('a car under the original agreement stays outside the monthly split after the cutover',()=>{
 const s=stateWith(
  car('Původní dohoda',{originalSplit:true,funding:{purchaseCash:242000,ownerAmount:121000,
   investorAmount:121000,investorFraction:.5,investorProfitPercent:35,helperProfitPercent:15}}),
  car('Měsíční dohoda')
 );
 const oldSale=s.vehicles[0];
 s.monthlyDeal={startDate:'2026-11-15',owner:2500000,investor:1500000,months:[]};
 const result=api.fundingSplit(s,oldSale);
 assert.deepEqual([result.investor,result.helper,result.owner],[8750,6375,34875]);
 assert.equal(api.monthlyProfitEstimate(s,'2026-11').sales,1);
 assert.equal(api.monthlyProfitEstimate(s,'2026-11').profit,42500);
 assert.equal(api.helperLedger(s).earned,6375);
 const november=api.saveMonthlySplit(s,'2026-11',42500,'2026-12-01');
 const december=api.monthlyCapitalBefore(s,'2026-12-01');
 assert.equal(december.owner,2500000+34875+november.owner);
 assert.equal(december.investor,1500000+8750+november.investor);
 assert.equal(api.cashAt(s),1000000);
 api.assertState(s);

 assert.throws(()=>api.checkOriginalSplitChange(s,oldSale,{...oldSale,originalSplit:false}),/znovu otevři uzávěrku za 2026-11/);
 api.reopenMonthlySplit(s,'2026-11');
 api.checkOriginalSplitChange(s,oldSale,{...oldSale,originalSplit:false});
});

test('a saved fixed-rate month stays intact while the next month uses the capital ratio',()=>{
 const s=stateWith();
 const opening={owner:2500000,investor:1500000};
 const october={period:'2026-10',opening,profit:200000,closedAt:'2026-11-01',
  investorRate:17.5,investor:35000,helper:30000,owner:135000};
 s.monthlyDeal={startDate:'2026-10-15',fixedRateFrom:'2026-10-15',...opening,months:[october]};
 api.assertState(s);
 const november=api.saveMonthlySplit(s,'2026-11',200000,'2026-12-01');
 assert.equal(november.investor,25767.39);
 assert.equal(s.monthlyDeal.months.find(m=>m.period==='2026-10').investor,35000);
 api.assertState(s);
});

test('a bank VAT receipt with unknown destination period changes bank cash once and leaves the split base intact',()=>{
 const v=car('Auto',{purchaseVatClaim:42000,saleVatAmount:52500});
 const s=stateWith(v);
 s.monthlyDeal={startDate:'2026-11-01',owner:1500000,investor:2500000,months:[]};
 const before=api.monthlyProfitEstimate(s,'2026-11');
 const t={id:'bank-vat',type:'vatRefund',date:'2026-12-18',periodId:'',amount:80000,
  rate:1,accountId:'bank',vatCashOnly:true,allocations:[],taxRelevant:false,taxVat:0};
 s.transactions.push(t);
 api.assertState(s);
 assert.equal(api.cashAt(s),1080000);
 assert.equal(api.vatBankMonth(s,'2026-12').received,80000);
 assert.equal(api.vatBankMonth(s,'2026-11').received,0);
 assert.equal(api.monthlyVatCheck(s,'2026-11').received,0);
 assert.equal(api.monthlyCapitalBefore(s,'2027-01-01').investor,2500000);
 assert.deepEqual(api.monthlyProfitEstimate(s,'2026-11'),before);

 t.periodId='2026-11';
 assert.equal(api.monthlyVatCheck(s,'2026-11').received,80000);
 assert.equal(api.vatBankMonth(s,'2026-12').received,80000);
 assert.equal(api.vehicleVatLedger(s).rows.find(r=>r.vehicleId===v.id).refundReceived,0);
 assert.equal(api.monthlySplit({owner:0,investor:2000000},100000).investor,35000);
});

test('the test app estimates income tax after costs and calculates the helper fee from earnings after tax',()=>{
 const v=car('Skaut',{purchase:488000,purchaseVatExact:84694,vat:'eu',sale:25200,
  saleCurrency:'EUR',saleRate:24.18,saleVatExact:0});
 const s=stateWith(v);
 const result=api.vehicleFinancial(s,v);
 assert.equal(result.profit,179761.17);
 assert.equal(result.incomeTaxEstimate,30904.50);
 assert.equal(result.profitAfterIncomeTax,175125.50);
 assert.equal(api.financeDashboard(s,'2026-11-30').afterTax.month,175125.50);
 assert.equal(api.helperLedger(s).earned,26268.83);

 s.settings.taxLow=20;
 assert.equal(api.vehicleFinancial(s,v).profitAfterIncomeTax,164824);
 assert.equal(api.helperLedger(s).earned,24723.60);
});

test('a recorded after-tax profit of 120000 gives the helper 18000',()=>{
 const v=car('Ruční výsledek',{profitMode:'recorded',recordedProfit:142000,recordedProfitAfterIncomeTax:false});
 const s=stateWith(v);
 assert.equal(api.helperLedger(s).earnings[0].base,120700);
 assert.equal(api.helperLedger(s).earned,18105);

 v.recordedProfit=120000;
 v.recordedProfitAfterIncomeTax=true;
 assert.equal(api.helperLedger(s).earnings[0].base,120000);
 assert.equal(api.helperLedger(s).earned,18000);
 assert.equal(api.vehicleFinancial(s,v).helper,18000);
 assert.equal(api.vehicleFinancial(s,v).incomeTaxEstimate,null);
});

test('the after-tax totals preserve recorded amounts, losses, and the date and test filters',()=>{
 const recorded=car('Uzavřený výdělek',{profitMode:'recorded',recordedProfit:120366});
 const beforeTax=car('Zadaný výdělek před daní',{profitMode:'recorded',recordedProfit:100000,
  recordedProfitAfterIncomeTax:false,bought:'2026-10-10',stockDate:'2026-10-10',purchasePeriod:'2026-10',
  purchaseDocumentDate:'2026-10-10',sold:'2026-10-20',salePeriod:'2026-10'});
 const loss=car('Ztráta',{profitMode:'recorded',recordedProfit:-5000,recordedProfitAfterIncomeTax:false});
 const undated=car('Prodej bez data',{profitMode:'recorded',recordedProfit:30000,sold:'',salePeriod:'',review:true});
 const s=stateWith(recorded,beforeTax,loss,undated,car('Testovací',{test:true}));
 api.assertState(s);
 assert.equal(api.vehicleFinancial(s,recorded).profitAfterIncomeTax,120366);
 assert.equal(api.vehicleFinancial(s,recorded).incomeTaxEstimate,null);
 assert.equal(api.vehicleFinancial(s,loss).incomeTaxEstimate,0);
 const totals=api.financeDashboard(s,'2026-11-30').afterTax;
 assert.equal(totals.month,115366);
 assert.equal(totals.previous,85000);
 assert.equal(totals.undated,30000);
 assert.equal(totals.total,230366);
});

test('old payments and new partial payouts count once, with cash movement only on the selected account',()=>{
 const s=stateWith(car('dříve-párováno',{helperPercent:10}),car('starší-hotovost',{helperPercent:5,helperOpening:true}));
 s.transactions.push({...payout('old',2000,{accountId:'bank',date:'2026-11-23'}),type:'cost',
  allocations:[{invoiceId:'helper:dříve-párováno',amount:2000}]});
 api.assertState(s);
 assert.equal(api.helperLedger(s).balance,8250);
 s.transactions.push(payout('record-only',3000),payout('bank-payout',3500,{accountId:'bank'}));
 api.assertState(s);
 assert.equal(api.helperLedger(s).paid,11000);
 assert.equal(api.helperLedger(s).balance,1750);
 assert.equal(api.financeDashboard(s).invoiceDebt,1750);
 assert.equal(api.cashAt(s),994500);
 assert.equal(api.cashflow(s,'2026-12').groups.helperPayout,-3500);
 assert.equal(api.vehicleFinancial(s,s.vehicles[0]).profit,43625);
});

test('payouts before opening count against the helper balance without changing the initial bank cash',()=>{
 const s=stateWith(car('starší'));
 s.accounts[0].currency='EUR';
 s.transactions.push(payout('eur-history',100,{accountId:'bank',rate:24.5,date:'2026-10-10'}));
 api.assertState(s);
 assert.equal(api.helperLedger(s).paid,2450);
 assert.equal(api.helperLedger(s).balance,3925);
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
