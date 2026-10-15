import test from 'node:test';
import assert from 'node:assert/strict';
import {STATUSES,sortBooks,filteredBooks,validateBackup,normalizeBook,validDate} from './domain.mjs';

test('book statuses remain distinct',()=>{
  assert.deepEqual(Object.keys(STATUSES),['read','reading','paused','unread']);
});
test('sort puts unknown dates after known dates',()=>{
  const data=[{title:'Unknown',finishedAt:''},{title:'Old',finishedAt:'2025-12'},{title:'New',finishedAt:'2026-10'}];
  assert.deepEqual(sortBooks(data,'read-new').map(x=>x.title),['New','Old','Unknown']);
  assert.deepEqual(sortBooks(data,'read-old').map(x=>x.title),['Old','New','Unknown']);
});
test('author and title sorting uses Japanese reading where present',()=>{
  const data=[{title:'B',titleKana:'い',author:'B',authorKana:'い'},{title:'A',titleKana:'あ',author:'A',authorKana:'あ'}];
  assert.deepEqual(sortBooks(data,'title-asc').map(x=>x.title),['A','B']);
  assert.deepEqual(sortBooks(data,'author-desc').map(x=>x.title),['B','A']);
});
test('series and filtered search retain unread',()=>{
  const books=[{id:'a',title:'ねこと王さま',status:'read',seriesId:'cat'},
    {id:'b',title:'ねこと王さま しごとをさがす',status:'unread',seriesId:'cat'}];
  assert.equal(filteredBooks(books,{search:'ねこと王さま',filter:'all'},[{id:'cat',name:'ねこと王さま'}]).length,2);
  assert.equal(filteredBooks(books,{filter:'read'},[]).length,1);
});
test('validateBackup rejects repeated IDs and unexpected statuses',()=>{
  const good={version:1,books:[{id:'a',title:'赤毛のアン',status:'read'}],series:[{id:'s',name:'シリーズ'}]};
  assert.equal(validateBackup(good).books.length,1);
  assert.throws(()=>validateBackup({...good,books:[good.books[0],good.books[0]]}),/ID/);
  assert.throws(()=>validateBackup({...good,books:[{...good.books[0],status:'invalid'}]}),/不正/);
});
test('dates are explicit and unknown is not invented',()=>{
  assert.equal(validDate('2026-10'),true);
  assert.equal(validDate('2026-10-15'),true);
  assert.equal(validDate('2026-13'),false);
  assert.equal(validDate('2026-00'),false);
  assert.equal(validDate(''),true);
  assert.equal(normalizeBook({title:'a',status:'read'}).finishedAt,'');
});
test('rejects script URLs in cover and preserves book edition metadata',()=>{
  assert.throws(()=>normalizeBook({id:'a',title:'a',status:'read',coverUrl:'javascript:alert(1)'}),/HTTPS/);
  const obj=normalizeBook({id:'a',title:'赤毛のアン',edition:'ビジュアル特別版',adaptedBy:'松本侑子',status:'read',coverUrl:'https://example.org/anne.jpg'});
  assert.equal(obj.edition,'ビジュアル特別版');
  assert.equal(obj.adaptedBy,'松本侑子');
});
