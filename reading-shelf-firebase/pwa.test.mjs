import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const get=(name)=>readFileSync(new URL('./'+name,import.meta.url));
const text=(name)=>get(name).toString('utf8');
const manifest=JSON.parse(text('manifest.webmanifest'));

test('installable Japanese よんでね PWA manifest',()=>{
  assert.equal(manifest.name,'よんでね');
  assert.equal(manifest.short_name,'よんでね');
  assert.equal(manifest.lang,'ja');
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'/');
  assert.equal(manifest.scope,'/');
  for(const size of [192,512]){
    const name='icon-'+size+'.png';
    assert.ok(manifest.icons.some(i=>i.src==='/'+name&&i.sizes===size+'x'+size&&i.type==='image/png'));
    const buf=get(name);
    assert.deepEqual([...buf.subarray(0,8)],[137,80,78,71,13,10,26,10]);
    assert.equal(buf.toString('ascii',12,16),'IHDR');
    assert.equal(buf.readUInt32BE(16),size);
    assert.equal(buf.readUInt32BE(20),size);
  }
  assert.match(text('icon.svg'),/<svg /);
});
test('read-only library has no book editors, imports, or upload controls',()=>{
  const html=text('index.html'),js=text('app.mjs');
  assert.match(html,/よんでね/);
  assert.match(html,/manifest\.webmanifest/);
  assert.match(html,/id="bookInfoDialog"/);
  assert.match(html,/読んだ本/);
  assert.match(html,/<span>シリーズ<\/span>/);
  for(const forbidden of ['bookForm','bookDialogTitle','removeBook','addBook','bookInfoEdit','createFamily','importData','importReadingPeriods','openEditor','saveEditor','exportData']){
    assert.ok(!html.includes(forbidden)&&!js.includes(forbidden),forbidden+' must not be in PWA UI');
  }
});
test('only static app files are cached; user records remain Firebase-only',()=>{
  const sw=text('sw.js');
  assert.match(sw,/caches\.open/);
  assert.match(sw,/url\.origin!==self\.location\.origin/);
  assert.ok(!sw.includes('firestore.googleapis.com'));
  assert.ok(!sw.includes('accounts.google.com'));
  assert.match(text('app.mjs'),/serviceWorker\.register\('\/sw\.js',\{updateViaCache:'none'\}\)/);
});
test('browser security rules deny all book and series writes',()=>{
  const rules=text('firestore.rules');
  for(const path of ['books','series']){
    const x=rules.match(new RegExp('match \\/'+path+'\\/\\{[^}]+\\} \\{([\\s\\S]*?)\\n      \\}'));
    assert.ok(x,'rules missing for '+path);
    assert.match(x[1],/allow get, list: if member\(fid\);/);
    assert.match(x[1],/allow create, update, delete: if false;/);
  }
});

test('install button is connected to a real browser install event',()=>{
  const html=text('index.html'),js=text('app.mjs');
  assert.match(html,/id="installApp"[^>]*hidden/);
  assert.match(js,/beforeinstallprompt/);
  assert.match(js,/appinstalled/);
  assert.match(js,/await prompt\.prompt\(\)/);
});
test('series is not counted solely by completed series',()=>{
  const js=text('app.mjs');
  assert.match(js,/\$\('seriesCount'\)\.textContent=series\.length/);
  assert.match(js,/if\(!book\.seriesId\)continue/);
});

test('new family interaction surfaces preserve chat-only formal record editing',()=>{
  const html=text('index.html'),app=text('app.mjs'),rules=text('firestore.rules');
  assert.match(html,/data-view="recommendations"/);
  assert.match(html,/id="familySettings"/);
  assert.match(html,/id="sort" aria-label="並び順"/);
  assert.match(html,/id="filter" aria-label="表示する本"/);
  assert.doesNotMatch(html,/id="sortDirection"|id="timelineToggle"/);
  assert.doesNotMatch(app,/sortDirection|timelineToggle|sortDescending/);
  assert.match(app,/mountBookCommunity/);
  assert.match(app,/mountRecommendations/);
  for(const collection of ['comments','reactions','requests','childReflections','recommendations']){
    assert.ok(rules.includes('match /'+collection+'/'),collection+' must have a Firestore access rule');
  }
  assert.doesNotMatch(html,/id="bookForm"/);
});


test('no removed DOM ID can silently cause a null property assignment',()=>{
  const html=text('index.html'),app=text('app.mjs');
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
  const references=[...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
  assert.ok(references.length>20);
  for(const id of references)assert.ok(ids.has(id),'app references missing DOM element: '+id);
  assert.ok(!app.includes("$('familyTab')"),'removed family tab cannot be accessed');
});
test('PWA cannot combine stale JS with current HTML after deployment',()=>{
  const html=text('index.html'),sw=text('sw.js');
  const config=JSON.parse(text('firebase.json'));
  assert.match(html,/app\.mjs\?build=20261016-invite-v10/);
  assert.match(sw,/const ARTWORK_PATHS=new Set\(ARTWORK\)/);
  assert.ok(!sw.includes('PUBLIC_ASSETS'));
  for(const path of ['/app.mjs','/index.html','/domain.mjs','/book-community.mjs','/recommendations.mjs']){
    assert.ok(!sw.includes("'"+path+"'"),path+' must not be service-worker-cached');
  }
  for(const source of ['/', '**/*.html','**/*.mjs','**/*.css','/sw.js']){
    assert.ok(config.hosting.headers.some(h=>h.source===source&&h.headers.some(k=>k.key==='Cache-Control'&&k.value==='no-store')),source);
  }
});

test('family-facing copy consistently identifies 管理者, not ChatGPT',()=>{
  const app=text('app.mjs'),community=text('book-community.mjs'),html=text('index.html');
  assert.doesNotMatch(app,/ChatGPT/);
  assert.doesNotMatch(community,/ChatGPT/);
  assert.doesNotMatch(html,/ChatGPT/);
  assert.match(app,/本の登録・修正・削除は管理者が行います。/);
  assert.match(community,/子どもの感想は管理者が記録します。/);
});
test('book detail exposes conversation before collapsed complete catalog data',()=>{
  const app=text('app.mjs'),css=text('style.css');
  const start=app.indexOf('function openBookInfo(book){');
  const end=app.indexOf('function renderRecommendations()',start);
  assert.ok(start>=0&&end>start);
  const block=app.slice(start,end);
  assert.ok(block.indexOf('mountBookCommunity(')<block.indexOf('root.append(disclosure)'), 'social section precedes catalog');
  assert.match(block,/document\.createElement\('details'\)/);
  assert.match(block,/ISBN/);
  assert.match(block,/読書・観察メモ/);
  assert.match(block,/dialog\.scrollTop=0/);
  assert.match(css,/#bookInfoDialog \.dialogTop/);
  assert.match(css,/position:sticky/);
});

test('single-step sorting options have distinct clear Japanese descriptions',()=>{
  const html=text('index.html'),app=text('app.mjs');
  for(const [key,label] of [
    ['order-new','最近読んだ順'],
    ['order-old','最初に読んだ順'],
    ['title-asc','タイトル順'],
    ['author-asc','作者順'],
    ['year-new','出版年：新しい順'],
    ['year-old','出版年：古い順']
  ]){
    assert.ok(html.includes('<option value="'+key+'">'+label+'</option>'),key);
  }
  assert.ok(html.includes('<option value="timeline">読んだ時期別</option>'));
  assert.match(app,/filter:view==='series'\?'all':\(periodMode\?'read':\$\('filter'\)\.value\)/);
  assert.match(app,/sort:periodMode\?'order-new':\$\('sort'\)\.value/);
});
test('PWA build matches all local module edges and cannot silently run old domain labels',()=>{
  const html=text('index.html'),app=text('app.mjs'),recs=text('recommendations.mjs');
  const build='20261016-invite-v10';
  assert.match(html,new RegExp('data-app-build="'+build+'"'));
  assert.match(html,new RegExp('app\\.mjs\\?build='+build));
  assert.match(html,new RegExp('style\\.css\\?build='+build));
  assert.match(app,new RegExp("const APP_BUILD='"+build+"'"));
  assert.match(app,/document\.documentElement\.dataset\.appBuild!==APP_BUILD/);
  for(const module of ['domain','book-community','recommendations','firebase-config','activity']){
    assert.ok(app.includes("'./"+module+".mjs?build="+build+"'"),'versioned import: '+module);
  }
  assert.ok(recs.includes("'./domain.mjs?build="+build+"'"));
  assert.doesNotMatch(app,/ChatGPT|sortDirection|timelineToggle/);
  assert.match(app,/アプリのバージョン：/);
});

test('bookshelf cards focus on reading rather than publication metadata',()=>{
  const app=text('app.mjs'),domain=text('domain.mjs');
  const card=app.slice(app.indexOf('function bookGrid(data){'),app.indexOf('function openBookInfo('));
  assert.match(card,/readingModeLabel\(b\)/);
  assert.match(card,/readPeriodLabel\(b\)/);
  assert.doesNotMatch(card,/b\.publicationYear|b\.ageLabel/);
  assert.match(domain,/export function readingModeLabel/);
});
test('recent family activity uses one limited live listener, no all-book fanout',()=>{
  const app=text('app.mjs'),activity=text('activity.mjs'),rules=text('firestore.rules');
  assert.match(app,/mountFamilyActivity/);
  assert.match(activity,/orderBy\('createdAt','desc'\),limit\(15\)/);
  assert.match(rules,/match \/activity\/\{activityId\}/);
  const community=text('book-community.mjs'),recs=text('recommendations.mjs');
  assert.match(community,/batch\.set\(activityFor\(ref\.id\)/);
  assert.match(recs,/batch\.set\(activityFor\(recRef\.id\)/);
});
test('recommendation enrichment is explicit and optional',()=>{
  const recs=text('recommendations.mjs'),lookup=text('book-lookup.mjs'),rules=text('firestore.rules');
  assert.match(recs,/書誌を検索/);
  assert.match(recs,/selected=\{\.\.\.candidate,queryTitle:query\}/);
  assert.match(recs,/const confirmed=selected\?\.queryTitle===book\?selected:null/);
  assert.ok(lookup.includes('https://openlibrary.org/search.json'));
  assert.match(rules,/metadataSource/);
});

test('formal child reflection composer is owner-only and separate from informal comments',()=>{
  const community=text('book-community.mjs');
  const form=text('owner-reflection.mjs');
  const dictation=text('speech-dictation.mjs');
  assert.match(community,/if\(owner\)/);
  assert.match(community,/addOwnerReflectionForm/);
  assert.match(form,/source:'owner-app'/);
  assert.match(form,/attribution:kind\.value/);
  assert.match(dictation,/SpeechRecognition/);
  assert.doesNotMatch(dictation,/MediaRecorder|uploadBytes/);
});


test('v9 owner reflection and browser dictation modules have versioned import edges',()=>{
  const app=text('app.mjs'),community=text('book-community.mjs');
  const reflection=text('owner-reflection.mjs'),speech=text('speech-dictation.mjs');
  const build='20261016-invite-v10';
  assert.ok(community.includes("'./owner-reflection.mjs?build="+build+"'"));
  assert.ok(reflection.includes("'./speech-dictation.mjs?build="+build+"'"));
  assert.match(reflection,/writeBatch\(db\)/);
  assert.match(reflection,/batch\.set\(reflection,/);
  assert.match(reflection,/batch\.set\(activity,/);
  assert.match(reflection,/await batch\.commit\(\)/);
  assert.match(speech,/recognizer\.lang='ja-JP'/);
  assert.match(speech,/session\?\.abort\(\)/);
  assert.doesNotMatch(app,/uploadBytes|MediaRecorder/);
});
