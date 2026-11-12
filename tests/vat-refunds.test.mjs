import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const grab=(a,b)=>{const i=code.indexOf(a),j=code.indexOf(b,i);assert.ok(i>=0&&j>i,'Missing boundary '+a);return code.slice(i,j);};
const helpers=grab('const currentDay=','function migrateV1(').replace(/const currentDay=[^\n]+/,"const currentDay=()=> '2026-11-11';");
const core=grab('function recordedProfit(','function euWarnings(');
const vat=grab('function vatSplitAmount(','function fundingSplit(')+grab('function fundingSplit(','function fundingFormFields(');
const allocate=grab('function allocateResult(','/* Ledger movements are explicit');
const api=vm.runInNewContext(helpers+core+grab('function validDate(','function assertState(')+allocate+vat+
 ';({emptyState,vehicleVatLedger,vehicleVatSummary,vatSplitAmount,capitalView,vehicleFinancial,vatResult,cashAt,validateVatRefundReceipt})',{
 crypto:{randomUUID:()=> 'test-id'},getCloudStore:()=>null,cloudMode:()=>false,money:n=>String(n),
 roundMoney:n=>Math.round((n+Number.EPSILON)*100)/100,finite:n=>{if(!Number.isFinite(n))throw Error('Not finite');}
});
function vehicle(id='car',fraction=.7){
 return {id,name:'Test Octavia',year:2021,km:50000,plate:'TEST',vin:'',status:'stock',review:false,test:false,
  bought:'2026-08-10',stockDate:'2026-08-10',purchase:285560,purchaseCurrency:'CZK',purchaseRate:1,purchaseVatRate:21,purchaseVatExact:49560,
  purchaseDeduction:100,purchaseVatConfirmed:true,purchasePeriod:'2026-08',purchaseInvoice:'P-test',purchaseOpening:true,
  vat:'eu',sale:null,sold:'',saleCurrency:'CZK',saleRate:1,saleVatRate:21,saleVatExact:null,salePeriod:'',saleOpening:false,
  helperPercent:0,profitMode:'calculated',eu:{},funding:{purchaseCash:285560,ownerAmount:Math.round(285560*(1-fraction)*100)/100,
   investorAmount:Math.round(285560*fraction*100)/100,investorFraction:fraction,investorProfitPercent:35,helperProfitPercent:0}};
}
function fixture(){const s=structuredClone(api.emptyState());s.settings.reserve=0;s.settings.plannedWithdrawal=0;
 s.capital={owner:500000,investor:700000,asOf:'2026-08-01'};s.accounts=[{id:'bank',name:'Test bank',currency:'CZK',opening:1000000,openingDate:'2026-08-01'}];s.vehicles=[vehicle()];return s;}
function file(s,actual=-api.vatResult(s,'2026-08').purchases,id='2026-08'){
 s.vatPeriods.push({id,status:actual<0?'Čeká na vrácení':'Čeká na úhradu',actual,filed:id+'-28',due:'2026-09-25'});
}
function refund(s,amount,id='r1',date='2026-09-25',periodId='2026-08'){
 const t={id,type:'vatRefund',periodId,accountId:'bank',amount,rate:1,date,allocations:[],taxVat:0,taxRelevant:false,test:false};s.transactions.push(t);return t;
}
function sell(v,{date='2026-08-20',mode='eu',price=330000}={}){Object.assign(v,{status:'sold',sold:date,sale:price,salePeriod:date.slice(0,7),vat:mode,saleVatExact:mode==='standard'?Math.round(price*21/121*100)/100:0});}
const summary=s=>api.vehicleVatSummary(s,s.vehicles[0]);
test('CSP and app syntax match the integrated source',()=>{
 assert.ok(html.includes("script-src 'sha256-"+createHash('sha256').update(code).digest('base64')+"'"));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;assert.doesNotThrow(()=>new AsyncFunction(code));
});
test('stock bought in August retains its August credit while still held in September',()=>{
 const s=fixture(),before=api.capitalView(s),x=summary(s);assert.equal(x.expectedRefund,49560);assert.equal(x.remainingRefund,49560);
 assert.equal(x.rows[0].period,'2026-08');assert.equal(before.vatPendingInv,34692);assert.equal(before.vatReceivedInv,0);
 file(s);assert.equal(api.capitalView(s).freeInv,before.freeInv,'filing a refund is not receiving it');
 refund(s,20000);const partial=api.capitalView(s);assert.equal(summary(s).refundReceived,20000);assert.equal(partial.freeInv-before.freeInv,14000);
 assert.equal(partial.inv,before.inv);assert.equal(api.cashAt(s)-1000000,20000);
 refund(s,29560,'r2');const full=api.capitalView(s);assert.equal(summary(s).remainingRefund,0);assert.equal(full.tiedInv,165200);assert.equal(full.tiedOwn,70800);
 assert.equal(full.freeInv-before.freeInv,34692);assert.equal(full.vatReceivedInv,34692);
});
test('a sale before the refund keeps the receivable held and releases only real receipts',()=>{
 const s=fixture();sell(s.vehicles[0]);file(s);const before=api.capitalView(s),profit=api.vehicleFinancial(s,s.vehicles[0]).profit;
 assert.equal(before.stockInv,0);assert.equal(before.soldVatInv,34692);assert.equal(before.tiedInv,34692);
 refund(s,20000);const partial=api.capitalView(s);assert.equal(partial.freeInv-before.freeInv,14000);assert.equal(partial.soldVatInv,20692);
 refund(s,29560,'r2');const full=api.capitalView(s);assert.equal(full.tiedInv+full.tiedOwn,0);assert.equal(full.freeInv-before.freeInv,34692);
 assert.equal(full.inv,before.inv);assert.equal(api.vehicleFinancial(s,s.vehicles[0]).profit,profit);
 assert.deepEqual(JSON.parse(JSON.stringify(api.capitalView(s))),JSON.parse(JSON.stringify(full)),'re-rendering cannot create another capital credit');
});
test('refund before a later sale cannot release VAT a second time',()=>{
 const s=fixture();file(s);refund(s,49560);const before=api.capitalView(s);sell(s.vehicles[0],{date:'2026-09-15'});
 const after=api.capitalView(s);assert.equal(after.tiedInv+after.tiedOwn,0);assert.equal(after.vatReceivedInv,before.vatReceivedInv);
 assert.equal(after.freeInv-before.freeInv,after.inv-before.inv+165200,'only net car principal and profit are released on sale');
 assert.equal(api.cashAt(s),1049560,'no invented sale payment or repeated refund');
});
test('August purchase VAT is not re-created or removed by a September domestic sale',()=>{
 const s=fixture();sell(s.vehicles[0],{date:'2026-09-15',mode:'standard'});file(s);
 let x=summary(s);assert.equal(x.expectedRefund,49560);assert.equal(x.rows.find(r=>r.period==='2026-09').expectedRefund,0);assert.equal(x.pendingInput,49560);
 refund(s,49560);x=summary(s);assert.equal(x.pendingInput,0);assert.equal(x.refundReceived,49560);
 assert.equal(api.vatResult(s,'2026-09').result,57272.73);
});
test('monthly output VAT reduces cash refund and only the remaining refund is held',()=>{
 const s=fixture();s.vehicles[0]=vehicle('export',1);sell(s.vehicles[0]);const domestic=vehicle('domestic',0);
 Object.assign(domestic,{purchase:121000,purchaseVatExact:21000,funding:{purchaseCash:121000,ownerAmount:121000,investorAmount:0,investorFraction:0,investorProfitPercent:35,helperProfitPercent:0}});
 sell(domestic,{mode:'standard',price:242000});s.vehicles.push(domestic);file(s,-28560);
 const x=summary(s);assert.equal(x.expectedRefund,28560);assert.equal(x.offsetUsed,21000);assert.equal(x.pendingInput,28560);
 assert.equal(api.vehicleVatSummary(s,domestic).expectedRefund,0);assert.equal(api.vehicleVatSummary(s,domestic).offsetUsed,21000);
 const before=api.capitalView(s);refund(s,28560);const after=api.capitalView(s);assert.equal(after.freeInv-before.freeInv,28560);
 assert.equal(api.vehicleVatSummary(s,domestic).refundReceived,0);assert.equal(after.inv,before.inv);
});
test('zero or payable returns use input VAT as an offset without inventing cash refunds',()=>{
 const s=fixture();sell(s.vehicles[0],{mode:'standard',price:285560});file(s,0);
 const x=summary(s);assert.equal(x.expectedRefund,0);assert.equal(x.refundReceived,0);assert.equal(x.offsetUsed,49560);assert.equal(x.pendingInput,0);
 assert.equal(api.cashAt(s),1000000);
});
test('filing mismatches and unknown sale VAT block release even after money arrives',()=>{
 const s=fixture();file(s,-40000);refund(s,40000);assert.equal(summary(s).refundReceived,0);assert.equal(summary(s).pendingInput,49560);
 assert.equal(api.vehicleVatLedger(s).periods[0].unallocatedReceived,40000);assert.equal(api.capitalView(s).vatReceivedInv,0);
 s.vatPeriods[0].actual=-49560;assert.equal(summary(s).refundReceived,40000);
 sell(s.vehicles[0],{mode:'pending'});assert.equal(summary(s).expectedRefund,null);assert.equal(summary(s).refundReceived,0);assert.equal(summary(s).pendingInput,49560);
});
test('unconfirmed historical purchase VAT cannot create a claim or available money',()=>{
 const s=fixture();Object.assign(s.vehicles[0],{review:true,purchaseVatConfirmed:false});
 assert.equal(summary(s).input,0);assert.equal(summary(s).expectedRefund,0);assert.equal(api.capitalView(s).tiedInv,199892);
});
test('the recorded net profit and its existing investor split remain unchanged by a refund',()=>{
 const s=fixture();sell(s.vehicles[0]);Object.assign(s.vehicles[0],{profitMode:'recorded',recordedProfit:33161,helperPercent:15,review:true});file(s);
 const before=api.capitalView(s);refund(s,49560);const after=api.capitalView(s);
 assert.equal(api.vehicleFinancial(s,s.vehicles[0]).profit,33161);assert.equal(after.inv,before.inv);assert.equal(after.own,before.own);
 assert.equal(after.freeInv-before.freeInv,34692);
});
test('unfunded cars and overhead retain their own refund shares instead of crediting someone else',()=>{
 const s=fixture();const other=vehicle('unfunded');delete other.funding;s.vehicles.push(other);
 s.costs.push({id:'office',name:'Office',vehicleId:'',amount:12100,currency:'CZK',rate:1,vatRate:21,deduction:100,vatExact:2100,date:'2026-08-12',period:'2026-08',openingPaid:true});
 file(s,-101220);refund(s,101220);const ledger=api.vehicleVatLedger(s);
 assert.equal(summary(s).refundReceived,49560);assert.equal(ledger.rows.find(r=>r.key==='__unassigned__').refundReceived,2100);
 assert.equal(api.vehicleVatSummary(s,other).receivedParts,null);assert.equal(api.capitalView(s).vatReceivedInv,34692);
});
test('VAT on costs stays with its car, is released only once, and does not change the profit',()=>{
 const s=fixture();s.costs.push({id:'repair',name:'Repair',vehicleId:'car',amount:12100,currency:'CZK',rate:1,vatRate:21,deduction:100,vatExact:2100,date:'2026-08-12',period:'2026-08',openingPaid:true});
 file(s,-51660);const before=api.capitalView(s);assert.equal(summary(s).costInput,2100);refund(s,51660);
 const after=api.capitalView(s);assert.equal(after.freeInv-before.freeInv,36162);assert.equal(after.tiedInv,165200);
 sell(s.vehicles[0]);const profit=api.vehicleFinancial(s,s.vehicles[0]).profit;assert.equal(profit,84000);assert.equal(summary(s).pendingInput,0);
});
test('receipts before the bank opening settle old claims without counting the bank cash again',()=>{
 const s=fixture();s.accounts[0].openingDate='2026-10-01';file(s);refund(s,49560,'history','2026-09-25');
 assert.equal(summary(s).refundReceived,49560);assert.equal(api.cashAt(s),1000000);
 assert.equal(api.vehicleVatLedger(s,'2026-09-01').rows[0].refundReceived,0,'a future receipt is not available early');
});
test('deleting or editing a receipt derives the balance again without adding ledger events',()=>{
 const s=fixture();file(s);const t=refund(s,20000);const after=api.capitalView(s);t.amount=10000;const edited=api.capitalView(s);
 assert.equal(after.freeInv-edited.freeInv,7000);s.transactions=[];assert.equal(summary(s).refundReceived,0);
 assert.equal(s.capitalEvents.length,0);assert.equal(api.capitalView(s).vatReceivedInv,0);
});
test('refund entry rejects duplicates and amounts above the filed credit; editing one receipt is allowed',()=>{
 const s=fixture();file(s);const first=refund(s,20000);const next={...first,id:'r2',amount:29560};
 assert.doesNotThrow(()=>api.validateVatRefundReceipt(s,next));assert.throws(()=>api.validateVatRefundReceipt(s,{...next,amount:49560}),/podruhé/);
 assert.doesNotThrow(()=>api.validateVatRefundReceipt(s,{...first,amount:49560},first.id));
 refund(s,29560,'r2');assert.throws(()=>api.validateVatRefundReceipt(s,{...next,id:'r3',amount:.02}),/podruhé/);
});
test('overpayments from old data are visible but never release more than the filed refund',()=>{
 const s=fixture();file(s);refund(s,60000);const p=api.vehicleVatLedger(s).periods[0];
 assert.equal(p.allocatedReceived,49560);assert.equal(p.unallocatedReceived,10440);assert.equal(summary(s).pendingInput,0);
});
test('partial refund cent allocations are exact, deterministic and never exceed any car share',()=>{
 const s=fixture();s.vehicles=[vehicle('a',1),vehicle('b',0),vehicle('c',.3)];file(s,-148680);
 for(let i=0;i<11;i++)refund(s,.01,'cent-'+i);
 const ledger=api.vehicleVatLedger(s),rows=ledger.rows;assert.equal(Math.round(rows.reduce((n,r)=>n+r.refundReceived,0)*100),11);
 for(const r of rows)assert.ok(r.refundReceived<=r.expectedRefund);
 refund(s,148679.89,'rest');assert.equal(api.vehicleVatLedger(s).periods[0].allocatedReceived,148680);
 for(const r of api.vehicleVatLedger(s).rows)assert.equal(r.refundReceived,r.expectedRefund);
 const big=api.vatSplitAmount(100000000,[{key:'a',weight:33333333.33},{key:'b',weight:66666666.67}]);
 assert.equal(big.get('a')+big.get('b'),100000000);
});
