
// Macadam browser-print PDF layout parser. No source report or personal data is embedded.
function parseMacadamTextItems(pages){
 const buildText=parts=>{
  let text='',prev=null;
  for(const piece of [...parts].sort((a,b)=>a.x-b.x)){
   if(prev){
    const width=prev.width||prev.text.length*prev.size*.51;
    const gap=piece.x-(prev.x+width),threshold=Math.max(1.5,Math.min(prev.size,piece.size)*.22);
    if(gap>threshold&&!text.endsWith(' ')&&!piece.text.startsWith(' '))text+=' ';
   }
   text+=piece.text;prev=piece;
  }
  return text.replace(/\s+/g,' ').trim();
 };
 const structured=pages.map(raw=>{
  const words=[];
  for(const item of raw){
   if(typeof item.str!=='string'||!item.str.length||!Array.isArray(item.transform))continue;
   const x=Number(item.transform[4]),y=Number(item.transform[5]);
   if(!Number.isFinite(x)||!Number.isFinite(y))continue;
   words.push({text:item.str,x,y,width:Math.max(0,Number(item.width)||0),
    size:Math.max(1,Math.hypot(Number(item.transform[0])||0,Number(item.transform[1])||0))});
  }
  words.sort((a,b)=>b.y-a.y||a.x-b.x);
  const rows=[];
  for(const word of words){
   let row=rows.find(r=>Math.abs(r.y-word.y)<=3);
   if(!row){row={y:word.y,words:[]};rows.push(row);}
   row.words.push(word);
  }
  rows.sort((a,b)=>b.y-a.y);
  return rows.map(row=>{
   const left=buildText(row.words.filter(w=>w.x<300));
   const right=buildText(row.words.filter(w=>w.x>=300));
   const bounds=[75,120,173,235,346,453,507];
   const cells=Array.from({length:8},()=>[]);
   for(const word of row.words){
    const i=bounds.findIndex(b=>word.x<b);
    cells[i<0?7:i].push(word);
   }
   return {left,right,all:buildText(row.words),cells:cells.map(buildText)};
  });
 });
 if(!structured.length||!structured[0].some(r=>/Zpráva o hodnocení/i.test(r.all))||
    !structured[0].some(r=>/INFORMACE O VOZIDLE/i.test(r.all)))
  throw Error('Toto PDF nevypadá jako hodnoticí report Macadam.');
 const first=structured[0];
 function valueOf(label){
  const re=new RegExp('^'+label+'\\s+(.+)$','i');
  for(const row of first)for(const s of [row.left,row.right]){
   const m=s.match(re);if(m?.[1])return m[1].trim();
  }return '';
 }
 function czechDate(s){
  const m=String(s).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if(!m)return '';
  const d=m[3]+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
  return validDate(d)?d:'';
 }
 const vin=valueOf('VIN').match(/\b[A-HJ-NPR-Z0-9]{17}\b/i)?.[0]?.toUpperCase()||'';
 const plate=valueOf('Registrační značka').match(/\b[A-Z0-9]{5,12}\b/i)?.[0]||'';
 const kmText=valueOf('Najeté kilometry').replace(/[^0-9]/g,'');
 const km=kmText?Number(kmText):null;
 if(!vin||!plate||km===null||km>2000000)throw Error('Nepodařilo se spolehlivě načíst VIN, SPZ nebo nájezd.');
 const brand=valueOf('Značka')||'',model=valueOf('Model')||'',version=valueOf('Verze')||'';
 const name=[brand,model,version].filter(Boolean).join(' ').trim();
 const keysText=valueOf('Počet klíčů celkem');
 const keys=/^\d+$/.test(keysText)?Number(keysText):null;
 const secondSetReported=/^ano$/i.test(valueOf('Druhá sada kol'));
 const equipment=[];let inEquipment=false;
 for(const row of first){
  if(/^PŘÍSLUŠENSTVÍ$/i.test(row.left)){inEquipment=true;continue;}
  if(!inEquipment)continue;
  for(const part of [row.left,row.right]){
   const m=part.match(/^(.+?)\s+(Ano|Ne)$/i);
   if(m&&m[2].toLowerCase()==='ano'&&m[1]!=='Druhá sada kol')equipment.push(m[1].trim());
  }
 }
 for(const label of ['Typ klimatizace','Typ světlometů','Typ tažného zařízení','Typ čalounění']){
  const x=valueOf(label);if(x)equipment.push(x);
 }
 const tires={mounted:null,extra:null,spare:null};
 const items={mounted:[],extra:[],spare:[]};let mode='';
 for(const row of structured[1]||[]){
  if(/Pneumatiky na vozidle/i.test(row.all)){mode='mounted';continue;}
  if(/Rezervní kolo/i.test(row.all)){mode='spare';continue;}
  if(/Pneumatiky ve vozidle/i.test(row.all)){mode='extra';continue;}
  if(!mode)continue;
  const cells=row.cells,depth=Number(String(cells[2]).replace(',','.').match(/\d+(?:\.\d+)?/)?.[0]);
  if(!Number.isFinite(depth)||!/\bmm\b/i.test(cells[2])||depth>20)continue;
  items[mode].push({tread:depth,brand:cells[3],size:cells[4].replace(/\s+/g,' ').trim(),
    season:cells[5],rim:cells[6]});
 }
 for(const [key,values] of Object.entries(items)){
  if(!values.length)continue;
  const v=values[0];
  tires[key]={qty:values.length,brand:v.brand,size:v.size,season:v.season,rim:v.rim,
    treadMin:Math.min(...values.map(x=>x.tread)),treadMax:Math.max(...values.map(x=>x.tread))};
 }
 return {source:'Macadam',vin,plate,km,name,firstRegistration:czechDate(valueOf('První registrace')),
  inspectionDate:czechDate(valueOf('Datum inspekce')),
  engine:version.match(/\b\d[.,]\d\s*(?:TDI|TSI|TFSI|HDI|DCI)\b/i)?.[0]||'',
  power:version.match(/\b(\d{2,3})\s*kW/i)?.[1]||'',
  gearbox:valueOf('Typ převodovky'),keys,secondSetReported,
  fuel:valueOf('Typ paliva'),drive:valueOf('Typ pohonu'),bodyColor:valueOf('Barva karoserie'),
  equipment:[...new Set(equipment)],tires};
}
async function readMacadamPdf(file){
 if(!file||file.size>20971520)throw Error('PDF Macadam smí mít maximálně 20 MB.');
 const bytes=new Uint8Array(await file.slice(0,5).arrayBuffer());
 if(String.fromCharCode(...bytes)!=='%PDF-')throw Error('Soubor není PDF.');
 if(!invoicePdfLibrary)invoicePdfLibrary=import(INVOICE_PDF_MODULE).catch(()=>{invoicePdfLibrary=null;throw Error('Čtečka PDF není dostupná.');});
 const lib=await invoicePdfLibrary;
 lib.GlobalWorkerOptions.workerSrc=INVOICE_PDF_WORKER;
 const loading=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false,disableFontFace:true});
 try{
  const doc=await loading.promise;
  if(doc.numPages>20)throw Error('PDF má více než 20 stran.');
  const pages=[];
  for(let i=1;i<=doc.numPages;i++){
   pages.push((await (await doc.getPage(i)).getTextContent()).items);
  }
  return parseMacadamTextItems(pages);
 }finally{
  if(typeof loading.destroy==='function')try{await loading.destroy();}catch(e){console.warn('PDF cleanup failed',e);}
 }
}
