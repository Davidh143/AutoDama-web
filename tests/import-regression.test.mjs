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
const vehicle=()=>({
 id:'example',name:'Octavia',vin:'TMBJG7NX7NY000001',purchase:285560,
 purchaseCurrency:'CZK',purchaseRate:1,
 purchaseDocumentDate:'2026-11-09',purchasePeriod:'2026-11',purchaseVatRate:21,purchaseDeduction:0,
 purchaseVatExact:null,review:true,firstRegistration:'2021-10-19'
});
const {financeChecks:checksFor,vehicleVatCheck,setPurchaseVatClaim}=vm.runInNewContext(
 grab('function recordedProfit(','function txSign(')+
 grab('function financeChecks(','function renderFinanceChecks(')+';({financeChecks,vehicleVatCheck,setPurchaseVatClaim})',{
  round,vatPart,month:s=>s?.slice(0,7)||'',isSold:v=>['sold','delivered'].includes(v.status),
  grossCZK:v=>round(v.amount*(v.currency==='EUR'?v.rate:1)),
  finiteAmount:(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max,
  validPeriod:s=>/^\d{4}-\d{2}$/.test(s),currentDay:()=> '2026-11-12'
 });
test('invoice VAT is a read-only comparison until the purchase claim is entered',()=>{
 const invoice=parser(drivaliaLayout);
 const v={...vehicle(),bought:invoice.taxableDate,purchase:invoice.amount,purchaseVatClaim:null};
 const s={vehicles:[v]},original=structuredClone(v);
 const before=vehicleVatCheck(v);
 assert.deepEqual(v,original);
 assert.equal(before.purchase.entered,null);
 assert.equal(before.purchase.expected,49560);
 assert.throws(()=>setPurchaseVatClaim(s,v.id,300000),/do výše nákupní ceny/);
 setPurchaseVatClaim(s,v.id,invoice.vatExact);
 assert.equal(v.purchaseVatClaim,49560);
 assert.equal(vehicleVatCheck(v).purchase.difference,0);
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
