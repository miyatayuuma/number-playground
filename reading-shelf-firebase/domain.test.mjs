import test from 'node:test';
import assert from 'node:assert/strict';
import {STATUSES,sortBooks,filteredBooks,validateBackup,normalizeBook,validDate,validatePeriodUpdates,readPeriodLabel} from './domain.mjs';

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

test('school terms preserve unknown month instead of inventing a completion date',()=>{
  const b=normalizeBook({title:'ねこと王さま',status:'read',finishedAt:'',finishedPeriodLabel:'2026年度・小1・2学期',
    finishedPeriodStart:'2026-09',finishedPeriodEnd:'2026-10'});
  assert.equal(b.finishedAt,'');
  assert.equal(b.finishedPeriodLabel,'2026年度・小1・2学期');
  assert.equal(b.finishedPeriodStart,'2026-09');
  assert.equal(b.finishedPeriodEnd,'2026-10');
});
test('bad ranges are rejected',()=>{
  assert.throws(()=>normalizeBook({title:'a',status:'read',finishedPeriodStart:'2026-10',finishedPeriodEnd:'2026-09'}),/開始/);
  assert.throws(()=>normalizeBook({title:'a',status:'read',finishedPeriodStart:'2026-09'}),/開始/);
  assert.throws(()=>normalizeBook({title:'a',status:'unread',finishedPeriodStart:'2026-09',finishedPeriodEnd:'2026-09'}),/未読/);
});
test('period labels and chronological sorting retain historical reading order',()=>{
  const list=[
    {title:'先に読了',status:'read',finishedPeriodStart:'2026-09',finishedPeriodLabel:'2026年度・小1・2学期',readOrder:15},
    {title:'後に読了',status:'read',finishedAt:'2026-09',finishedPeriodStart:'2026-09',finishedPeriodLabel:'2026年9月',readOrder:16},
    {title:'夏休み',status:'read',finishedPeriodStart:'2026-07',finishedPeriodLabel:'2026年・夏休み',readOrder:3}
  ];
  assert.deepEqual(sortBooks(list,'read-new').map(x=>x.title),['後に読了','先に読了','夏休み']);
});

test('period patch validates unique IDs, precision and month bounds',()=>{
  const base={schemaVersion:1,type:'reading-period-update',books:[{id:'initial-01',title:'星モグラサンジの伝説',
    finishedPeriodStart:'2025-04',finishedPeriodEnd:'2026-03',finishedPeriodLabel:'2025年度・年長',
    finishedPeriodPrecision:'school_year',finishedPeriodBasis:'parent_retrospective_2026-10-15'}]};
  assert.equal(validatePeriodUpdates(base).length,1);
  assert.throws(()=>validatePeriodUpdates({...base,books:[base.books[0],base.books[0]]}),/重複/);
  assert.throws(()=>validatePeriodUpdates({...base,books:[{...base.books[0],finishedPeriodEnd:'2024-04'}]}),/年月/);
});
