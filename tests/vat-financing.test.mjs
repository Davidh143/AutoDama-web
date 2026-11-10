import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const start=html.indexOf('<script type="module">')+'<script type="module">'.length;
const stop=html.indexOf('</script>',start);
const code=html.slice(start,stop);
const grab=(a,b)=>{
 const i=code.indexOf(a),j=code.indexOf(b,i);
 assert.ok(i>=0&&j>i,'missing function boundary '+a);
 return code.slice(i,j);
};
const round=n=>Math.round((n+Number.EPSILON)*100)/100;
const vatPart=(gross,rate)=>round(gross*rate/(100+rate));
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);

test('single-file content security policy matches app script',()=>{
 const expected=createHash('sha256').update(code).digest('base64');
 assert.ok(html.includes("script-src 'sha256-"+expected+"'"));
});
test('app script parses as modern JavaScript',()=>{
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 assert.doesNotThrow(()=>new AsyncFunction(code));
});
const parser=vm.runInNewContext(grab('function invoiceAmounts(','function organizeVehicleFormSections(')+';parseVehicleInvoice',{round,vatPart,validDate});
const invoice=(line)=>[
 'FAKTURA číslo 7654321','Značka a model: Škoda Octavia',
 'VIN: TMBJG7NX7NY000001','Částka k úhradě: 285 560,00 Kč',line
];
test('final invoice clearly documenting 21% VAT pre-fills 49 560 Kč',()=>{
 const r=parser(invoice('Sazba DPH 21 %: 236 000,00 49 560,00'));
 assert.equal(r.kind,'final');
 assert.equal(r.amount,285560);
 assert.equal(r.vatRate,21);
 assert.equal(r.vatExact,49560);
});
test('proforma, undocumented and inconsistent VAT never create claims',()=>{
 const proforma=['PROFORMA FAKTURA',...invoice('Sazba DPH 21 %: 236 000,00 49 560,00')];
 assert.equal(parser(proforma).vatExact,null);
 assert.equal(parser(proforma,'final').kind,'proforma');
 assert.equal(parser(proforma,'final').vatExact,null);
 assert.equal(parser(invoice('Bez rozpisu daně')).vatExact,null);
 assert.equal(parser(invoice('Sazba DPH 21 %: 236 000,00 48 560,00')).vatExact,null);
});

const drivaliaLayout=[
 'FAKTURA',
 'Klientské číslo: 142596 Daňový doklad č. / variabilní symbol:',
 '7654321',
 'Drivalia Lease Czech Republic s.r.o.',
 'Datum uskutečnění zdanitelného plnění: 03.11.2026',
 'Datum splatnosti: Uhrazeno',
 'Datum vystavení: 06.11.2026',
 'Tovární značka: SKODA Octavia 2.0 Tdi 85kw Ambition Combi',
 'Č. karoserie: TMBJG7NX7NY000001',
 'RZ: 8AY4844',
 'Daňová rekapitulace: Základ DPH',
 'Sazba DPH 21%: 236 000,00 49 560,00',
 'Celkem: 285 560,00 Kč'
];
test('Drivalia Crystal Reports final invoice recognizes every required field',()=>{
 const r=parser(drivaliaLayout);
 assert.equal(r.kind,'final');
 assert.equal(r.name,'SKODA Octavia 2.0 Tdi 85kw Ambition Combi');
 assert.equal(r.vin,'TMBJG7NX7NY000001');
 assert.equal(r.plate,'8AY4844');
 assert.equal(r.number,'7654321');
 assert.equal(r.issued,'2026-11-06');
 assert.equal(r.taxableDate,'2026-11-03');
 assert.equal(r.amount,285560);
 assert.equal(r.vatBase,236000);
 assert.equal(r.vatRate,21);
 assert.equal(r.vatExact,49560);
 assert.equal(r.firstRegistration,'');
 assert.equal(r.due,'');
});
const updateInvoice=vm.runInNewContext(grab('function invoiceVehicleUpdate(','function latestStoredPurchaseInvoice(')+';invoiceVehicleUpdate',{
 month:s=>s.slice(0,7),currentDay:()=> '2026-11-09'
});
const vehicle=()=>({
 id:'example',name:'Octavia',vin:'TMBJG7NX7NY000001',purchase:285560,
 purchaseDocumentDate:'2026-11-09',purchasePeriod:'2026-11',purchaseVatRate:0,purchaseDeduction:0,
 purchaseVatExact:null,review:true,firstRegistration:'2021-10-19'
});
test('approved final invoice fills VAT, document number, DUZP and period',()=>{
 const v=updateInvoice(vehicle(),parser(drivaliaLayout),100);
 assert.equal(v.purchaseVatRate,21);
 assert.equal(v.purchaseVatExact,49560);
 assert.equal(v.purchaseDeduction,100);
 assert.equal(v.purchaseVatConfirmed,true);
 assert.equal(v.purchaseInvoice,'7654321');
 assert.equal(v.bought,'2026-11-03');
 assert.equal(v.purchasePeriod,'2026-11');
 assert.equal(v.firstRegistration,'2021-10-19');
});
test('no approval: invoice values can be read without claiming an input VAT deduction',()=>{
 const v=updateInvoice(vehicle(),parser(drivaliaLayout));
 assert.equal(v.purchaseVatExact,49560);
 assert.equal(v.purchaseVatConfirmed,false);
 assert.equal(v.purchaseDeduction,0);
});
test('VIN or gross-price mismatch blocks automatic update',()=>{
 assert.throws(()=>updateInvoice({...vehicle(),vin:'TMBJG7NX7NY000002'},parser(drivaliaLayout),100));
 assert.throws(()=>updateInvoice({...vehicle(),purchase:350000},parser(drivaliaLayout),100));
});
test('a final invoice on a complete vehicle cannot save an unconfirmed positive deduction',()=>{
 const validate=vm.runInNewContext(grab('function validateVehiclePurchaseVat(','function latestStoredPurchaseInvoice(')+';validateVehiclePurchaseVat',
  {month:s=>s?.slice(0,7)||''});
 const v={...vehicle(),review:false,bought:'2026-11-03',purchaseVatExact:49560,purchaseDeduction:100,purchaseVatConfirmed:false};
 assert.throws(()=>validate(v,true),/potvrď nárok na odpočet/);
 assert.doesNotThrow(()=>validate(v,false));
 assert.doesNotThrow(()=>validate({...v,review:true},true));
 assert.doesNotThrow(()=>validate({...v,purchaseDeduction:0},true));
 assert.doesNotThrow(()=>validate({...v,purchaseVatConfirmed:true},true));
 assert.throws(()=>validate({...v,purchaseVatConfirmed:true,purchasePeriod:'2026-10'},true),/nejdříve/);
});
test('previously uploaded final invoices have a one-click reconciliation path',()=>{
 assert.ok(code.includes("function reconcileStoredPurchaseInvoices(vehicleId='')"));
 assert.ok(code.includes("reconcileInvoices:()=>reconcileStoredPurchaseInvoices()"));
 assert.ok(code.includes("action('Načíst DPH z uložených faktur','reconcileInvoices')"));
});

test('stored invoice reconciliation shows the newest pending PDF and requires explicit confirmation',async()=>{
 const confirmed={...vehicle(),id:'confirmed',purchaseVatConfirmed:true,purchaseDeduction:50};
 const pending={...vehicle(),id:'pending',vin:'TMBJG7NX7NY000002',purchaseVatExact:49560,purchaseDeduction:75};
 const finalPdf=(id,v)=>({id,vehicleId:v.id,category:'Nákupní faktura',mime:'application/pdf',name:id+'.pdf'});
 const state={
  vehicles:[confirmed,pending],
  documents:[finalPdf('confirmed',confirmed),finalPdf('old',pending),finalPdf('latest',pending),
   {...finalPdf('proforma',pending),category:'Zálohová faktura'}]
 };
 const reads=[];
 const elements={'#editor':{open:true},'#invoice-vat-review':{isConnected:true}};
 const values={vatClaimReceived:'2026-11-09',vatClaimPeriod:'2026-10'};
 let dialog,writes=0;
 const {reconcileStoredPurchaseInvoices:reconcile,pendingPurchaseVat,pendingPurchaseVatTable}=vm.runInNewContext(
  grab('function invoiceVehicleUpdate(','function vehicleForm(')+';({reconcileStoredPurchaseInvoices,pendingPurchaseVat,pendingPurchaseVatTable})',{
   state,File,month:s=>s.slice(0,7),currentDay:()=> '2026-11-09',money:String,esc:String,date:String,
   $:key=>elements[key],note:String,table:(_heads,rows)=>rows.join(''),action:String,card:(_label,val)=>val,
   input:(_name,_label,val)=>String(val),amount:(_name,_label,val)=>String(val),
   showDialog:(_title,html,submit,{saveLabel})=>{dialog={html,submit,saveLabel};},
   number:()=>75,value:key=>values[key],round,validDate,validPeriod:s=>/^\d{4}-\d{2}$/.test(s),
   finiteAmount:(value,min,max)=>Number.isFinite(value)&&value>=min&&value<=max,
   documentBlob:()=>new Blob(),readInvoicePdfLines:async file=>{
    reads.push(file.name);
    return drivaliaLayout.map(line=>line.replace('TMBJG7NX7NY000001',pending.vin));
   },
   parseVehicleInvoice:parser,saved:async update=>{update(state);writes++;},toast:()=>{}
  });
 assert.match(pendingPurchaseVatTable(pendingPurchaseVat(state)),/49560.*Čeká na potvrzení/);
 await reconcile();
 assert.equal(writes,0);
 assert.equal(dialog.saveLabel,'Potvrdit odpočet a uložit');
 assert.match(dialog.html,/49560/);
 assert.equal(state.vehicles[1].purchaseVatConfirmed,undefined);
 await assert.rejects(dialog.submit(),/Zvol období/);
 assert.equal(writes,0);
 values.vatClaimPeriod='2026-11';
 await dialog.submit();
 assert.equal(writes,1);
 await reconcile(pending.id);
 assert.deepEqual(reads,['latest.pdf']);
 assert.equal(state.vehicles[0],confirmed);
 assert.equal(state.vehicles[0].purchaseDeduction,50);
 assert.equal(state.vehicles[1].purchaseVatExact,49560);
 assert.equal(state.vehicles[1].purchaseVatConfirmed,true);
 assert.equal(state.vehicles[1].purchaseDeduction,75);
});

const capitalDependencies={
 round,month:s=>s.slice(0,7),purchaseTax:()=>({deductible:49560}),
 periodSettlement:(s,p)=>({outstanding:round(p.actual-s.transactions
  .filter(x=>x.periodId===p.id)
  .reduce((n,x)=>n+(x.type==='vatRefund'?-x.amount:x.amount),0))}),
 vatResult:()=>({result:-49560}),
 financeDashboard:()=>({cashKnown:false}),
 real:(_s,rows)=>rows.filter(x=>!x.test),
 txCZK:(_s,t)=>t.amount,
 isSold:v=>v.status==='sold',
 fundingSplit:()=>({owner:8000,investor:2000}),
 currentDay:()=> '2026-11-09'
};
const capital=vm.runInNewContext(grab('function settledPurchaseVAT(','function fundingSplit(')+';capitalView',capitalDependencies);
const make=()=>({
 capital:{owner:500000,investor:700000,asOf:'2026-08-01'},capitalEvents:[],
 vehicles:[{id:'octavia',status:'stock',bought:'2026-11-09',purchasePeriod:'2026-11',
  review:true,purchaseVatConfirmed:true,
  funding:{ownerAmount:85668,investorAmount:199892,investorFraction:.7}}],
 vatPeriods:[],transactions:[]
});
test('unpaid refund remains tied to respective owner and investor capitals',()=>{
 const s=make();
 let c=capital(s);
 assert.equal(c.vatPendingOwn,14868);
 assert.equal(c.vatPendingInv,34692);
 assert.equal(c.vatReleasedOwn,0);
 assert.equal(c.vatReleasedInv,0);
 s.vatPeriods=[{id:'2026-11',status:'Čeká na vrácení',actual:-49560}];
 c=capital(s);
 assert.equal(c.vatReleasedOwn,0);
 assert.equal(c.vatReleasedInv,0);
});
test('actually settled refund releases 30/70 to owners without increasing profit',()=>{
 const s=make();
 s.vatPeriods=[{id:'2026-11',status:'Čeká na vrácení',actual:-49560}];
 s.transactions=[{type:'vatRefund',periodId:'2026-11',date:'2027-01-25',amount:49560}];
 const c=capital(s);
 assert.equal(c.vatReleasedOwn,14868);
 assert.equal(c.vatReleasedInv,34692);
 assert.equal(c.tiedOwn,70800);
 assert.equal(c.tiedInv,165200);
 assert.equal(c.own,s.capital.owner);
 assert.equal(c.inv,s.capital.investor);
});
test('sale after refund never gives a second VAT credit',()=>{
 const s=make();
 s.vatPeriods=[{id:'2026-11',status:'Vypořádáno',actual:-49560}];
 s.transactions=[{type:'vatRefund',periodId:'2026-11',date:'2027-01-25',amount:49560}];
 s.vehicles[0].status='sold';
 s.vehicles[0].sold='2027-02-02';
 const c=capital(s);
 assert.equal(c.tiedOwn+c.tiedInv,0);
 assert.equal(c.vatReleasedOwn+c.vatReleasedInv,0);
 assert.equal(c.own,s.capital.owner+8000);
 assert.equal(c.inv,s.capital.investor+2000);
});
test('unreconciled tax filing cannot release VAT even after an incoming bank transaction',()=>{
 const s=make();
 s.vatPeriods=[{id:'2026-11',status:'Vypořádáno',actual:-40000}];
 s.transactions=[{type:'vatRefund',periodId:'2026-11',date:'2027-01-25',amount:40000}];
 assert.equal(capital(s).vatReleasedOwn,0);
});

const checksFor=vm.runInNewContext(
 grab('function recordedProfit(','function txSign(')+
 grab('function financeChecks(','function renderFinanceChecks(')+';financeChecks',{
  round,vatPart,month:s=>s?.slice(0,7)||'',isSold:v=>['sold','delivered'].includes(v.status)
 });
const purchases=vehicles=>({vehicles,costs:[],policies:[],transactions:[]});
const confirmedPurchase=(id,extra={})=>({
 ...vehicle(),id,status:'stock',bought:'2026-11-03',purchaseVatConfirmed:true,
 purchaseVatExact:49560,purchaseDeduction:100,...extra
});
test('finance checks flag missing or mismatched funding and clear after correction',()=>{
 const missing=confirmedPurchase('missing');
 const mismatch=confirmedPurchase('mismatch',{funding:{ownerAmount:142780,investorAmount:142779.99}});
 const s=purchases([
  missing,mismatch,
  confirmedPurchase('test',{test:true}),
  confirmedPurchase('sold',{status:'sold',sale:300000}),
  confirmedPurchase('unconfirmed',{purchaseVatConfirmed:false})
 ]);
 const result=checksFor(s);
 assert.equal(result.funding.length,2);
 assert.equal(result.funding[0].vehicle.id,'missing');
 assert.equal(result.funding[0].deductible,49560);
 assert.equal(result.funding[1].vehicle.id,'mismatch');
 assert.equal(result.funding[1].total,285559.99);
 missing.funding={ownerAmount:285560,investorAmount:0};
 mismatch.funding.investorAmount=142780;
 assert.equal(checksFor(s).funding.length,0);
});
test('possible duplicates only include purchases with a deduction in VAT evidence',()=>{
 const first=confirmedPurchase('first',{purchaseInvoice:7654321});
 const second=confirmedPurchase('second',{purchaseInvoice:' 7654321 ',purchasePeriod:'2026-12'});
 const s=purchases([
  first,second,
  confirmedPurchase('test',{test:true,purchaseInvoice:'7654321'}),
  confirmedPurchase('unconfirmed',{purchaseVatConfirmed:false,purchaseInvoice:'7654321'}),
  confirmedPurchase('zero',{purchaseDeduction:0,purchaseInvoice:'7654321'}),
  confirmedPurchase('without-number')
 ]);
 const result=checksFor(s);
 assert.equal(result.duplicates.length,1);
 assert.equal(result.duplicates[0].map(row=>row.vehicleId).join(','),'first,second');
 second.purchaseInvoice='7654322';
 assert.equal(checksFor(s).duplicates.length,0);
});
