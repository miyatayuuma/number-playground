import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBookCandidates,searchBookMetadata} from './book-lookup.mjs';

test('Open Library metadata is optional and filters invalid record links',()=>{
  const rows=parseBookCandidates({docs:[
    {key:'/works/OL12345W',title:'ねこと王さま',author_name:['ニック・シャラット'],publisher:['徳間書店'],
      first_publish_year:2019,isbn:['9784198650032'],cover_i:12345},
    {key:'javascript:alert(1)',title:'別の版',cover_i:'bad'},
  ]});
  assert.equal(rows.length,2);
  assert.equal(rows[0].author,'ニック・シャラット');
  assert.equal(rows[0].isbn,'9784198650032');
  assert.equal(rows[0].coverUrl,'https://covers.openlibrary.org/b/id/12345-M.jpg');
  assert.equal(rows[0].sourceUrl,'https://openlibrary.org/works/OL12345W');
  assert.equal(rows[1].coverUrl,'');
  assert.equal(rows[1].sourceUrl,'');
});
test('a single explicit search uses keyless Open Library title endpoint',async()=>{
  let calls=0;
  const fake=async(url,opts)=>{
    calls++;
    const u=new URL(url);
    assert.equal(u.origin,'https://openlibrary.org');
    assert.equal(u.pathname,'/search.json');
    assert.equal(u.searchParams.get('title'),'ねこと王さま');
    assert.equal(u.searchParams.get('limit'),'5');
    assert.equal(opts.method,'GET');
    return {ok:true,json:async()=>({docs:[{title:'ねこと王さま'}]})};
  };
  assert.equal((await searchBookMetadata('ねこと王さま',{fetcher:fake}))[0].title,'ねこと王さま');
  assert.equal(calls,1);
  await assert.rejects(searchBookMetadata('　',{fetcher:fake}),/タイトル/);
  await assert.rejects(searchBookMetadata('猫',{fetcher:async()=>({ok:false,status:429})}),/HTTP 429/);
  await assert.rejects(searchBookMetadata('猫',{fetcher:async()=>{throw Error('offline')}}),/接続/);
  assert.deepEqual(await searchBookMetadata('猫',{fetcher:async()=>({ok:true,json:async()=>({docs:[]})})}),[]);
});
