import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto,randomUUID} from 'node:crypto';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const code=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const grab=(a,b)=>{const i=code.indexOf(a),j=code.indexOf(b,i);assert.ok(i>=0&&j>i,a);return code.slice(i,j);};
const api=vm.runInNewContext(
 grab('const currentDay=','function migrateV1(').replace(/const currentDay=[^\n]+/,"const currentDay=()=> '2026-11-12';")+
 grab('function recordedProfit(','function euWarnings(')+grab('function validDate(','function canonical(')+
 grab('function allocateResult(','/* Ledger movements are explicit')+
 grab('function vatSplitAmount(','function fundingFormFields(')+
 grab('function vehicleDeletionPlan(','function deleteVehicleForm(')+
 grab('function prepareSimpleVatReceipt(','function recordVatRefund(')+
 grab('function stagePurchaseInvoiceDocuments(','function salesInvoiceFormFields(')+
 ';({emptyState,assertState,vehicleDeletionPlan,prepareSimpleVatReceipt,vehicleVatSummary,capitalView,cashAt,vehicleFinancial,stagePurchaseInvoiceDocuments})',
 {crypto:{...webcrypto,randomUUID},structuredClone,getCloudStore:()=>null,cloudMode:()=>false,money:n=>String(n),
 roundMoney:n=>Math.round((n+Number.EPSILON)*100)/100,finite:n=>{if(!Number.isFinite(n))throw Error('Invalid');}});
export function car(id='one',fraction=.5){return {id,name:'Test Octavia '+id,year:2021,km:50000,plate:'TEST',vin:'',status:'stock',test:false,review:false,
 bought:'2026-08-10',stockDate:'2026-08-10',purchase:242000,purchaseCurrency:'CZK',purchaseRate:1,purchaseVatRate:21,purchaseVatExact:42000,purchaseDeduction:100,purchaseVatConfirmed:true,purchasePeriod:'2026-08',purchaseDocumentDate:'2026-08-10',purchaseInvoice:'P-'+id,purchaseOpening:false,
 vat:'standard',sale:null,sold:'',saleCurrency:'CZK',saleRate:1,saleVatRate:21,saleVatExact:null,salePeriod:'',saleOpening:false,helperPercent:0,profitMode:'calculated',eu:{},
 funding:{purchaseCash:242000,ownerAmount:242000*(1-fraction),investorAmount:242000*fraction,investorFraction:fraction,investorProfitPercent:35,helperProfitPercent:0}};}
export function fixture(){const s=structuredClone(api.emptyState());s.settings.reserve=0;s.settings.plannedWithdrawal=0;
 s.capital={owner:1000000,investor:1000000,asOf:'2026-08-01'};s.accounts=[{id:'bank',name:'Testovací banka',currency:'CZK',opening:1000000,openingDate:'2026-08-01'}];s.vehicles=[car()];return s;}
const cost=(id,vehicleId)=>({id,vehicleId,name:'Servis '+id,category:'Servis',date:'2026-08-15',period:'2026-08',amount:1210,currency:'CZK',rate:1,vatRate:21,deduction:100,vatExact:210,taxDeductible:true,openingPaid:false,test:false});
const tx=(id,type,amount,more={})=>({id,type,accountId:'bank',amount,date:'2026-08-20',rate:1,allocations:[],taxVat:0,taxRelevant:false,test:false,...more});
const doc=(id,vehicleId,targetType,targetId)=>({id,name:id+'.pdf',vehicleId,targetType,targetId,mime:'application/pdf',data:'JVBERi0xLjQK',category:'Další dokument'});
const wheel=(id,source,assigned)=>({id,code:id,kind:'tires',season:'winter',rim:'none',qty:4,brand:'Test',size:'205/55 R16',location:'Sklad',note:'',tread:5,estimatedValue:null,received:true,status:assigned?'assigned':'available',sourceVehicleId:source,assignedVehicleId:assigned,movements:[]});
const receive=(s,amount,more={})=>api.prepareSimpleVatReceipt(s,{id:randomUUID(),periodId:'2026-08',accountId:'bank',date:'2026-09-25',amount,rate:1,...more});

test('a simple receipt requires no invented filing and releases only received capital',()=>{
 const s=fixture(),original=structuredClone(s),before=api.capitalView(s),first=receive(s,12000).next;
 assert.deepEqual(s,original);api.assertState(first);assert.equal(first.vatPeriods[0].trackingOnly,true);assert.equal(first.vatPeriods[0].filed,'');assert.equal(first.vatPeriods[0].status,'Předběžné');
 const x=api.vehicleVatSummary(first,first.vehicles[0]);assert.equal(x.refundReceived,12000);assert.equal(x.remainingRefund,30000);
 assert.equal(api.capitalView(first).freeInv-before.freeInv,6000);assert.equal(api.capitalView(first).inv,before.inv);assert.equal(api.cashAt(first)-api.cashAt(s),12000);
 const final=receive(first,30000).next;api.assertState(final);assert.equal(api.vehicleVatSummary(final,final.vehicles[0]).remainingRefund,0);assert.equal(api.capitalView(final).freeInv-before.freeInv,21000);
 assert.throws(()=>receive(final,1),/překročily/);
});
test('EU sale keeps the purchase VAT and its profit stays unchanged after receipt',()=>{
 const s=fixture();Object.assign(s.vehicles[0],{vat:'eu',status:'sold',sold:'2026-08-20',sale:250000,salePeriod:'2026-08',saleVatExact:0});
 const before=api.vehicleFinancial(s,s.vehicles[0]),next=receive(s,42000).next;api.assertState(next);
 assert.equal(api.vehicleVatSummary(next,next.vehicles[0]).refundReceived,42000);assert.equal(api.vehicleFinancial(next,next.vehicles[0]).profit,before.profit);
 assert.equal(api.capitalView(next).tiedInv,0);
});
test('same-month domestic sale and unknown regimes cannot create a cash refund',()=>{
 const s=fixture();Object.assign(s.vehicles[0],{status:'sold',sold:'2026-08-20',sale:302500,salePeriod:'2026-08'});
 assert.throws(()=>receive(s,42000),/není vypočtená vratka/);
 s.vehicles[0].vat='pending';assert.throws(()=>receive(s,42000),/není vypočtená vratka/);
});
test('an existing filed discrepancy stays blocked and unchanged',()=>{
 const s=fixture();s.vatPeriods=[{id:'2026-08',status:'Čeká na vrácení',actual:-50000,filed:'2026-09-20',due:'2026-09-25'}];
 const original=structuredClone(s);assert.throws(()=>receive(s,1000),/liší/);assert.deepEqual(s,original);
});
test('simple receipts use the real exchange rate and reject invalid dates and accounts',()=>{
 const s=fixture();s.accounts[0].currency='EUR';s.accounts[0].opening=0;
 const next=receive(s,1000,{rate:24.5}).next;api.assertState(next);assert.equal(api.vehicleVatSummary(next,next.vehicles[0]).refundReceived,24500);assert.equal(api.capitalView(next).vatReceivedInv,12250);
 for(const more of [{accountId:'missing'},{date:'2027-01-01'},{date:'2026-07-01'},{amount:0},{rate:0}])assert.throws(()=>receive(s,100,more));
});
test('complete deletion removes funded car, costs, policies, own payments, all linked files and wheels in one valid state',()=>{
 const s=fixture();s.vehicles.push(car('two',0));s.costs=[cost('c1','one'),cost('c2','two')];
 s.policies=[{id:'p1',vehicleId:'one',insurer:'Test',number:'P',start:'2026-08-10',end:'2027-08-09',premium:1000,openingPaid:false}];
 s.transactions=[tx('purchase','purchase',242000,{vehicleId:'one',allocations:[{invoiceId:'purchase:one',amount:242000}]}),tx('service','cost',1210,{allocations:[{invoiceId:'cost:c1',amount:1210}]}),tx('insurance','cost',1000,{allocations:[{invoiceId:'policy:p1',amount:1000}]}),tx('payout','insuranceRefund',100,{policyId:'p1'}),tx('unrelated','deposit',1000)];
 s.documents=[doc('car','one','vehicle','one'),doc('cost','','invoice','cost:c1'),doc('payment','','transaction','purchase'),doc('policy','','policy','p1'),doc('keep','two','vehicle','two')];
 s.wheelSets=[wheel('own','one','one'),wheel('keep','two','two')];api.assertState(s);const original=structuredClone(s);
 const {next,counts}=api.vehicleDeletionPlan(s,'one');api.assertState(next);assert.deepEqual(s,original);
 assert.deepEqual(Array.from(next.vehicles,v=>v.id),['two']);assert.deepEqual(Array.from(next.costs,c=>c.id),['c2']);assert.equal(next.policies.length,0);
 assert.deepEqual(Array.from(next.transactions,t=>t.id),['unrelated']);assert.deepEqual(Array.from(next.documents,d=>d.id),['keep']);assert.deepEqual(Array.from(next.wheelSets,w=>w.id),['keep']);
 assert.equal(counts.documents,4);assert.equal(counts.transactions,4);assert.equal(counts.costs,1);assert.equal(counts.wheels,1);assert.throws(()=>api.vehicleDeletionPlan(next,'one'));
});
test('deleting a car splits only its share of a joint payment and preserves the other invoice and file',()=>{
 const s=fixture();s.vehicles.push(car('two',0));s.costs=[cost('c1','one'),cost('c2','two')];
 s.transactions=[tx('shared','cost',2420,{vehicleId:'one',allocations:[{invoiceId:'cost:c1',amount:1210},{invoiceId:'cost:c2',amount:1210}],taxVat:420})];
 s.documents=[doc('shared-file','one','transaction','shared')];api.assertState(s);
 const {next}=api.vehicleDeletionPlan(s,'one');api.assertState(next);
 assert.equal(next.transactions[0].amount,1210);assert.equal(next.transactions[0].taxVat,210);assert.equal(next.transactions[0].vehicleId,'');assert.equal(next.transactions[0].allocations[0].invoiceId,'cost:c2');
 assert.equal(next.documents[0].vehicleId,'');assert.equal(next.documents[0].targetId,'shared');
});
test('borrowed and reassigned wheels are retained with valid links',()=>{
 const s=fixture();s.vehicles.push(car('two',0));s.wheelSets=[wheel('reassigned','one','two'),wheel('borrowed','two','one')];api.assertState(s);
 const {next}=api.vehicleDeletionPlan(s,'one');api.assertState(next);assert.equal(next.wheelSets.length,2);
 assert.equal(next.wheelSets[0].assignedVehicleId,'two');assert.equal(next.wheelSets[0].sourceVehicleId,'');assert.equal(next.wheelSets[1].status,'available');assert.equal(next.wheelSets[1].sourceVehicleId,'two');
});
test('shared monthly VAT and receipt survive deleting a car',()=>{
 const s=fixture();s.vehicles.push(car('two',0));const received=receive(s,84000).next;
 const {next}=api.vehicleDeletionPlan(received,'one');api.assertState(next);assert.equal(next.transactions[0].amount,84000);assert.equal(next.vatPeriods[0].actual,-84000);
 assert.equal(api.vehicleVatSummary(next,next.vehicles[0]).remainingRefund,null,'changed monthly basis is flagged rather than reassigning a historic receipt');
});
test('multiple purchase PDFs remain separate attachments and duplicates are rejected',()=>{
 const s=fixture(),drafts=[{fileName:'zaloha.pdf',kind:'proforma',number:'A1',attachment:{mime:'application/pdf',data:'JVBERi0xLjQK'}},{fileName:'final.pdf',kind:'final',number:'F1',attachment:{mime:'application/pdf',data:'JVBERi0xLjUK'}}];
 api.stagePurchaseInvoiceDocuments(s,'one',drafts);api.assertState(s);assert.equal(s.documents.length,2);assert.equal(s.documents[1].invoiceKind,'final');assert.throws(()=>api.stagePurchaseInvoiceDocuments(s,'one',[drafts[1]]),/už je uložená/);
});
