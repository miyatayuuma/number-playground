export const STATUSES=Object.freeze({read:'読んだ',reading:'読んでいる',paused:'お休み中',unread:'まだ読んでいない'});
export const READING_MODES=Object.freeze({'read-aloud':'読み聞かせ','independent':'自分で読んだ','mixed':'両方'});
export function readingModeLabel(book){
  return Object.hasOwn(READING_MODES,book?.readingMode)?READING_MODES[book.readingMode]:'';
}
const collator=new Intl.Collator('ja',{numeric:true,sensitivity:'base'});
export function normalize(v){return String(v??'').normalize('NFKC').toLowerCase().replace(/[\s\u3000『』（）・\-]/g,'')}
export function cleanTitle(t){return String(t??'').trim().slice(0,250)}
export function validDate(s){return s===''||/^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/.test(s)}
export function validMonth(s){return !s||/^\d{4}-(0[1-9]|1[0-2])$/.test(s)}
export function readPeriodLabel(b){return b.finishedPeriodLabel||b.finishedAt||'時期未登録'}
export function readPeriodStart(b){return b.finishedPeriodStart||String(b.finishedAt||'').slice(0,7)}
export function readPeriodEnd(b){return b.finishedPeriodEnd||String(b.finishedAt||'').slice(0,7)}
export function readPeriodGrouping(b){return b.finishedPeriodLabel|| (b.finishedAt?b.finishedAt.slice(0,7).replace('-','年')+'月':'時期未登録')}

export function sortBooks(books,sort='order-new'){
  if(sort==='order-new'||sort==='order-old'){
    const direction=sort==='order-new'?-1:1;
    return [...books].sort((a,b)=>{
      const missing=x=>!Number.isFinite(x.readOrder)||x.readOrder<=0;
      if(missing(a)!==missing(b))return missing(a)?1:-1;
      const delta=missing(a)?0:direction*(a.readOrder-b.readOrder);
      return delta||collator.compare(a.title||'',b.title||'');
    });
  }
  const fields={
    'read-new':['readPeriodStart',-1],
    'read-old':['readPeriodStart',1],
    'author-asc':['authorKana',1],
    'author-desc':['authorKana',-1],
    'title-asc':['titleKana',1],
    'title-desc':['titleKana',-1],
    'year-new':['publicationYear',-1],
    'year-old':['publicationYear',1]
  };
  const [field,dir]=fields[sort]||fields['read-new'];
  return [...books].sort((a,b)=>{
    const pick=o=>field==='readPeriodStart'?readPeriodStart(o):field==='authorKana'?(o.authorKana||o.author):field==='titleKana'?(o.titleKana||o.title):o[field];
    const x=pick(a),y=pick(b),missing=v=>v===undefined||v===null||v==='';
    if(missing(x)!==missing(y))return missing(x)?1:-1;
    const diff=missing(x)?0:dir*collator.compare(String(x),String(y));
    return diff||(field==='readPeriodStart'?(dir===-1?-1:1)*(Number(a.readOrder||999999)-Number(b.readOrder||999999)):Number(a.readOrder||999999)-Number(b.readOrder||999999))||collator.compare(a.title||'',b.title||'');
  });
}
export function filteredBooks(books,{search='',filter='read',sort='order-new'}={},series=[]){
  const q=normalize(search), names=new Map(series.map(s=>[s.id,s.name]));
  return sortBooks(books.filter(b=>(filter==='all'||b.status===filter)
    &&normalize([b.title,b.titleKana,b.author,b.authorKana,names.get(b.seriesId)].join(' ')).includes(q)),sort);
}
export function validateBackup(raw){
  if(!raw||raw.version!==1||!Array.isArray(raw.books)||!Array.isArray(raw.series))throw Error('読書記録のJSON形式が正しくありません');
  if(raw.books.length>10000||raw.series.length>1000)throw Error('データ件数が上限を超えています');
  const ids=new Set();for(const b of raw.books){
    if(!b||typeof b.id!=='string'||b.id.length>200||!b.id||ids.has(b.id))throw Error('書籍IDが重複または不正です');
    if(!cleanTitle(b.title)||!Object.hasOwn(STATUSES,b.status))throw Error('作品名または読書状況が不正です');
    ids.add(b.id);
  }
  const seriesIds=new Set();for(const s of raw.series){
    if(!s||typeof s.id!=='string'||!s.id||seriesIds.has(s.id)||!cleanTitle(s.name))throw Error('シリーズ情報が不正です');
    seriesIds.add(s.id);
  }
  return {books:raw.books,series:raw.series};
}
export function normalizeBook(src){
  const title=cleanTitle(src.title);if(!title)throw Error('作品名を入力してください');
  const status=src.status;if(!Object.hasOwn(STATUSES,status))throw Error('読書状況が不正です');
  const finishedAt=status==='read'?String(src.finishedAt||'').trim():'';
  if(!validDate(finishedAt))throw Error('読了時期はYYYY-MMまたはYYYY-MM-DDです');
  const start=String(src.finishedPeriodStart||'').trim(),end=String(src.finishedPeriodEnd||'').trim(),label=String(src.finishedPeriodLabel||'').trim();
  if(!validMonth(start)||!validMonth(end))throw Error('期間の月はYYYY-MMで入力してください');
  if((start&&!end)||(!start&&end)|| (start&&end&&start>end))throw Error('期間の開始・終了月を確認してください');
  if(label.length>160)throw Error('読了時期の表示名は160文字以内です');
  if(status!=='read'&&(start||end||label))throw Error('未読・中断の本には読了期間を登録できません');
  const cover=String(src.coverUrl||'').trim();
  if(cover&&!/^https:\/\//i.test(cover)&&!/^data:image\/(?:jpeg|png|webp);base64,/i.test(cover))throw Error('表紙はHTTPS画像URLまたは画像データのみ指定できます');
  if(cover.length>650000)throw Error('表紙画像が大きすぎます');
  const toNum=v=>v?Number(v):null;
  return {...src,title,status,finishedAt,finishedPeriodStart:start,finishedPeriodEnd:end,
    finishedPeriodLabel:label,coverUrl:cover,
    publicationYear:toNum(src.publicationYear),volume:toNum(src.volume),
    pageCount:toNum(src.pageCount),updatedAt:new Date().toISOString()};
}
export function newBook(){return {id:crypto.randomUUID(),title:'',titleKana:'',author:'',authorKana:'',status:'unread',publicationYear:null,finishedAt:'',finishedPeriodStart:'',finishedPeriodEnd:'',finishedPeriodLabel:'',isbn:'',seriesId:'',volume:null,edition:'',publisher:'',ageLabel:'',ageSource:'',coverUrl:'',notes:'',readOrder:null,readingMode:'read-aloud'}}

// Patch-only import: never overwrites the book record, status, or family notes.
export function validatePeriodUpdates(raw){
  if(!raw||raw.schemaVersion!==1||raw.type!=='reading-period-update'||!Array.isArray(raw.books))throw Error('読了時期の更新ファイル形式が不正です');
  if(raw.books.length===0||raw.books.length>10000)throw Error('期間の件数が不正です');
  const ids=new Set();
  return raw.books.map((b)=>{
    if(!b||typeof b.id!=='string'||!b.id||b.id.includes('/')||ids.has(b.id))throw Error('期間情報のIDが重複または不正です');
    ids.add(b.id);
    if(typeof b.title!=='string'||!b.title.trim())throw Error('書名を指定してください');
    const start=b.finishedPeriodStart,end=b.finishedPeriodEnd,label=b.finishedPeriodLabel;
    if(!validMonth(start)||!start||!validMonth(end)||!end||start>end)throw Error('期間の年月が不正です: '+b.title);
    if(typeof label!=='string'||!label.trim()||label.length>160)throw Error('表示名が不正です: '+b.title);
    if(!['school_year','school_term','school_holiday','month','month_range','quarter'].includes(b.finishedPeriodPrecision))throw Error('読了時期の精度が不正です: '+b.title);
    if(typeof b.finishedPeriodBasis!=='string'||b.finishedPeriodBasis.length>120)throw Error('根拠情報が不正です');
    if(b.finishedPeriodNote!==undefined&&(typeof b.finishedPeriodNote!=='string'||b.finishedPeriodNote.length>1500))throw Error('注記が不正です');
    return b;
  });
}
