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
 assert.equal(parser(['PROFORMA FAKTURA',...invoice('Sazba DPH 21 %: 236 000,00 49 560,00')]).vatExact,null);
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
const updateInvoice=vm.runInNewContext(grab('function invoiceVehicleUpdate(','function invoiceApprovalPrompt(')+';invoiceVehicleUpdate',{
 month:s=>s.slice(0,7),currentDay:()=> '2026-11-09'
});
const vehicle=()=>({
 id:'example',name:'Octavia',vin:'TMBJG7NX7NY000001',purchase:285560,
 purchaseDocumentDate:'2026-11-09',purchasePeriod:'2026-11',purchaseVatRate:0,purchaseDeduction:0,
 purchaseVatExact:null,review:true,firstRegistration:'2021-10-19'
});
test('approved final invoice fills VAT, document number, DUZP and period',()=>{
 const v=updateInvoice(vehicle(),parser(drivaliaLayout),true);
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
 const v=updateInvoice(vehicle(),parser(drivaliaLayout),false);
 assert.equal(v.purchaseVatExact,49560);
 assert.equal(v.purchaseVatConfirmed,false);
 assert.equal(v.purchaseDeduction,0);
});
test('VIN or gross-price mismatch blocks automatic update',()=>{
 assert.throws(()=>updateInvoice({...vehicle(),vin:'TMBJG7NX7NY000002'},parser(drivaliaLayout),true));
 assert.throws(()=>updateInvoice({...vehicle(),purchase:350000},parser(drivaliaLayout),true));
});
test('previously uploaded final invoices have a one-click reconciliation path',()=>{
 assert.ok(code.includes("function reconcileStoredPurchaseInvoices(vehicleId='')"));
 assert.ok(code.includes("reconcileInvoices:()=>reconcileStoredPurchaseInvoices()"));
 assert.ok(code.includes("action('Načíst DPH z uložených faktur','reconcileInvoices')"));
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
