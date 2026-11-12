import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const script=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'Missing application script');
const begin=script.indexOf('const SALES_INVOICE_KINDS=');
const end=script.indexOf('function salesInvoiceFormFields(',begin);
assert.ok(begin>=0&&end>begin,'Sales invoice import functions missing');
const round=x=>Math.round((x+Number.EPSILON)*100)/100;
const invoiceAmounts=text=>[...String(text).replace(/[\u00a0\u202f]/g,' ').matchAll(/-?(?:\d{1,3}(?:[ .]\d{3})+|\d+)(?:[,.]\d{2})?/g)]
 .map(m=>Number(m[0].replace(/[ ]/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'))).filter(Number.isFinite);
const {parseSalesInvoice,salesInvoicePatch}=vm.runInNewContext(script.slice(begin,end)+
 ';({parseSalesInvoice,salesInvoicePatch})',{
 round,invoiceAmounts,
 sum:(rows,f)=>rows.reduce((total,row)=>total+f(row),0),
 vatPart:(gross,rate)=>round(gross*rate/(100+rate)),
 extractInvoiceVAT:()=>null,
 validDate:x=>/^\d{4}-\d{2}-\d{2}$/.test(x),
 month:x=>x.slice(0,7),currentDay:()=> '2026-11-12',
 isSold:v=>['sold','delivered'].includes(v.status)
});

const vin='TMBJG7NX7NY000001';  // Synthetic fixture, not a customer record.
const buyer='Test Odběratel';
const final=[
 'Faktura - daňový doklad 120015',
 'Odběratel',buyer,'Slovenská republika','DIČ: SK1234567890',
 'vystavení: 18.09.2026','splatnosti: 18.09.2026','zd. plnění: 18.09.2026',
 'Označení dodávky Počet m. j. Cena za m. j. Sazba Základ DPH Celkem',
 'Škoda Scout 1,00 ks 25 200,00 0 % 25 200,00 0,00 25 200,00',
 'Celkem k úhradě: 25 200,00 EUR',
 'snížená 12 % 0,00 0,00 0,00 Uhrazeno zálohou: 0,00',
 'Zbývá uhradit: 25 200,00',
 'CELKEM 25 200,00 0,00 25 200,00',
 'OSVOBOZENO OD DPH','VIN: '+vin,'Zpracováno systémem Money S3'
];
test('Money S3 zero-VAT EU invoice imports as exempt EU delivery, not domestic VAT',()=>{
 const x=parseSalesInvoice(final);
 assert.equal(x.kind,'final');assert.equal(x.number,'120015');
 assert.equal(x.vin,vin);assert.equal(x.vatId,'SK1234567890');
 assert.equal(x.vatMode,'eu');assert.equal(x.taxableDate,'2026-09-18');
 assert.equal(x.total,25200);assert.equal(x.currency,'EUR');
 assert.equal(x.settledAdvances,0);assert.equal(x.balanceDue,25200);
 assert.equal(x.vatExact,0);
 assert.ok(!x.warnings.includes('Doklad současně obsahuje vyčíslenou DPH a text osvobození. Ověř režim ručně.'));
 const patch=salesInvoicePatch({vin,bought:'2026-08-01',status:'stock',sale:null,eu:{},vat:'standard'},x);
 assert.equal(patch.vat,'eu');assert.equal(patch.status,'sold');
 assert.equal(patch.sale,25200);assert.equal(patch.saleCurrency,'EUR');
 assert.equal(patch.saleInvoice,'120015');assert.equal(patch.saleVatExact,0);
 assert.equal(patch.viesValid,false);
 assert.equal(patch.conditionsConfirmed,false);
});
test('an issued advance invoice never records a completed sale or received cash',()=>{
 const rows=[
  'Faktura - záloha 120014','Odběratel',buyer,'DIČ: SK1234567890',
  'vystavení: 18.08.2026','Celkem k úhradě: 1 500,00 EUR',
  'Škoda Scout - záloha','OSVOBOZENO OD DPH','VIN: '+vin
 ];
 const x=parseSalesInvoice(rows);
 assert.equal(x.kind,'advance');assert.equal(x.total,null);assert.equal(x.requestedAdvance,1500);
 const patch=salesInvoicePatch({vin,bought:'2026-08-01',status:'stock',sale:null,eu:{}},x);
 assert.equal(patch.sale,undefined);assert.equal(patch.status,undefined);
});
test('zero VAT without Slovak buyer and exemption is not assumed EU',()=>{
 const rows=final.map(s=>s.replace('SK1234567890','CZ12345678').replace('OSVOBOZENO OD DPH','JINÁ POZNÁMKA'));
 const x=parseSalesInvoice(rows);
 assert.notEqual(x.vatMode,'eu');
});
