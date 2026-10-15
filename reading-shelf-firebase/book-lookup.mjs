// Optional Google Books metadata lookup: no credentials, server or paid storage.
// User must select a candidate. Never silently replace the submitted title.
export const BOOKS_ENDPOINT='https://www.googleapis.com/books/v1/volumes';
const str=(value,max=250)=>String(value||'').trim().slice(0,max);
const cleanURL=(value)=>{
  try{
    const u=new URL(value);
    if(u.protocol==='http:'&&['books.google.com','books.google.co.jp'].includes(u.hostname))u.protocol='https:';
    return u.protocol==='https:'&&u.toString().length<=1500?u.toString():'';
  }catch{return ''}
};
export function parseBookCandidates(result){
  if(!Array.isArray(result?.items))return [];
  return result.items.slice(0,8).map(item=>{
    const info=item?.volumeInfo||{};
    const isbn=info.industryIdentifiers?.find(v=>v.type==='ISBN_13')?.identifier||
      info.industryIdentifiers?.find(v=>v.type==='ISBN_10')?.identifier||'';
    return {
      title:str(info.title),author:str((info.authors||[]).join('・')),
      publisher:str(info.publisher),publishedDate:str(info.publishedDate,35),
      isbn:/^(?:[0-9]{13}|[0-9]{10})$/.test(isbn)?isbn:'',
      coverUrl:cleanURL(info.imageLinks?.thumbnail||info.imageLinks?.smallThumbnail),
      sourceUrl:cleanURL(info.infoLink),
      provider:'Google Books'
    };
  }).filter(x=>x.title);
}
export async function searchBookMetadata(title,{fetcher=fetch,signal}={}){
  const query=str(title);
  if(!query)throw new Error('タイトルを入力してください');
  const url=new URL(BOOKS_ENDPOINT);
  url.searchParams.set('q','intitle:'+query);
  url.searchParams.set('maxResults','5');
  url.searchParams.set('printType','books');
  url.searchParams.set('langRestrict','ja');
  const response=await fetcher(url.toString(),{method:'GET',signal});
  if(!response.ok)throw new Error('公開書誌APIを利用できません（HTTP '+response.status+'）');
  return parseBookCandidates(await response.json());
}
