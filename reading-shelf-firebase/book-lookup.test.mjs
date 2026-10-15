import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBookCandidates,searchBookMetadata} from './book-lookup.mjs';

test('Google Books candidates expose edition metadata but sanitize insecure and invalid links',()=>{
  const items=[{volumeInfo:{
    title:'ねこと王さま',authors:['ニック・シャラット'],publisher:'徳間書店',
    publishedDate:'2019-12',industryIdentifiers:[{type:'ISBN_13',identifier:'9784198650032'}],
    imageLinks:{thumbnail:'http://books.google.com/books/content?id=abc'},
    infoLink:'https://books.google.com/books?id=abc'
  }},{volumeInfo:{title:'別の版',imageLinks:{thumbnail:'javascript:alert(1)'},infoLink:'http://evil.example/'}}];
  const rows=parseBookCandidates({items});
  assert.equal(rows.length,2);
  assert.equal(rows[0].isbn,'9784198650032');
  assert.equal(rows[0].author,'ニック・シャラット');
  assert.match(rows[0].coverUrl,/^https:\/\/books.google.com/);
  assert.equal(rows[1].coverUrl,'');
  assert.equal(rows[1].sourceUrl,'');
});
test('lookup requests at most five book candidates and is never executed without title',async()=>{
  let requested;
  const fake=async(url,options)=>{
    requested=new URL(url);
    assert.equal(options.method,'GET');
    return {ok:true,json:async()=>({items:[{volumeInfo:{title:'猫の本'}}]})};
  };
  const result=await searchBookMetadata('猫の本',{fetcher:fake});
  assert.equal(result[0].title,'猫の本');
  assert.equal(requested.origin,'https://www.googleapis.com');
  assert.equal(requested.searchParams.get('maxResults'),'5');
  assert.equal(requested.searchParams.get('printType'),'books');
  await assert.rejects(searchBookMetadata('　',{fetcher:fake}),/タイトル/);
  await assert.rejects(searchBookMetadata('猫',{fetcher:async()=>({ok:false,status:403})}),/HTTP 403/);
});
