// Explicit, optional public catalog lookup — does not require an API key.
// Open Library has limited Japanese-title coverage; failure never blocks posting.
export const BOOKS_ENDPOINT='https://openlibrary.org/search.json';
const str=(value,max=250)=>String(value||'').trim().slice(0,max);
const cleanURL=value=>{
  try{
    const u=new URL(value);
    return u.protocol==='https:'&&u.toString().length<=1500?u.toString():'';
  }catch{return ''}
};
export function parseBookCandidates(result){
  if(!Array.isArray(result?.docs))return [];
  return result.docs.slice(0,5).map(book=>{
    const isbn=(Array.isArray(book.isbn)?book.isbn:[]).find(n=>/^\d{13}$/.test(n))||'';
    const coverId=Number(book.cover_i);
    const key=/^\/works\/OL\d+W$/.test(book.key||'')?book.key:'';
    return {
      title:str(book.title),
      author:str(Array.isArray(book.author_name)?book.author_name.join('・'):''),
      publisher:str(Array.isArray(book.publisher)?book.publisher[0]:''),
      publishedDate:Number.isSafeInteger(book.first_publish_year)?String(book.first_publish_year):'',
      isbn,
      coverUrl:Number.isSafeInteger(coverId)&&coverId>0?
        'https://covers.openlibrary.org/b/id/'+coverId+'-M.jpg':'',
      sourceUrl:key?'https://openlibrary.org'+key:'',
      provider:'Open Library'
    };
  }).filter(x=>x.title);
}
export async function searchBookMetadata(title,{fetcher=fetch,signal}={}){
  const query=str(title);
  if(!query)throw Error('タイトルを入力してください');
  const url=new URL(BOOKS_ENDPOINT);
  url.searchParams.set('title',query);
  url.searchParams.set('limit','5');
  url.searchParams.set('fields','key,title,author_name,publisher,first_publish_year,isbn,cover_i');
  let response;
  try{response=await fetcher(url.toString(),{method:'GET',signal})}
  catch(error){throw new Error('外部書誌サービスに接続できません。通信状態を確認するか、検索せずに投稿してください。',{cause:error})}
  if(!response.ok)throw Error('外部書誌サービスが利用できません（HTTP '+response.status+'）。検索せずに投稿できます。');
  try{return parseBookCandidates(await response.json())}
  catch{throw Error('書誌データを読み取れませんでした。検索せずに投稿できます。')}
}
