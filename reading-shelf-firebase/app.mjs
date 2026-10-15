import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,setPersistence,browserLocalPersistence,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,setDoc,updateDoc,deleteDoc,onSnapshot,writeBatch,runTransaction,Timestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.mjs';
import {STATUSES,sortBooks,filteredBooks,validateBackup,normalizeBook,newBook,readPeriodLabel,readPeriodGrouping,validatePeriodUpdates} from './domain.mjs';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeCover=url=>/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(String(url||''))?String(url):'';
const SHOW=['loading','loginPanel','setupPanel','shelfPanel'];
const MAX_IMPORT_BYTES=15*1024*1024;
let auth,db,user=null,fid='',role='',household=null,books=[],series=[],members=[],invites=[],currentBook=null;
let unsubs=[],view='shelf',generation=0,busy=false;
const inviteFromUrl=new URLSearchParams(location.search).get('family')||'';

function show(id){SHOW.forEach(x=>$(x).hidden=x!==id)}
function notice(m,error=false){$('message').hidden=!m;$('message').textContent=m||'';$('message').className='notice'+(error?' error':'')}
function statusError(e){console.error(e);notice('操作を完了できません: '+(e?.code||e?.message||e)+'\n接続状態・ログイン権限を確認してください。',true)}
function initUI(){
  $('googleLogin').onclick=login;
  $('signOut').onclick=async()=>{closeListeners();await signOut(auth)};
  $('createFamily').onclick=createFamily;
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});
  ['search','sort','filter'].forEach(x=>$(x).addEventListener(x==='search'?'input':'change',render));
  $('addBook').onclick=()=>openEditor(null);
  $('bookForm').onsubmit=saveEditor;
  $('removeBook').onclick=removeEditor;
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$((b.dataset.close)).close());
}
function updateShelfHeading(){
  const name=household?.name||'本棚';
  $('shelfName').textContent=name;
  document.title=household?name+' | 読書記録':'読書記録';
}
function closeListeners(){unsubs.forEach(u=>u());unsubs=[];fid='';books=[];series=[];members=[];invites=[];household=null;role='';updateShelfHeading()}
function familyDoc(...a){return doc(db,'families',fid,...a)}
function familyCollection(...a){return collection(db,'families',fid,...a)}
async function login(){
  try{await setPersistence(auth,browserLocalPersistence);await signInWithPopup(auth,new GoogleAuthProvider())}
  catch(e){
    if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment','auth/cancelled-popup-request'].includes(e.code)){
      await signInWithRedirect(auth,new GoogleAuthProvider());return;
    }
    if(e.code!=='auth/popup-closed-by-user')statusError(e);
  }
}
async function signedIn(u){
  const seq=++generation;closeListeners();user=u;notice('');
  $('identity').textContent=u?.email||'';$('signOut').hidden=!u;
  if(!u){show('loginPanel');return}
  show('loading');
  try{
    const profile=await getDoc(doc(db,'users',u.uid));if(seq!==generation)return;
    if(profile.exists()&&profile.data().familyId){await enterFamily(profile.data().familyId,seq)}
    else if(inviteFromUrl&&/^[A-Za-z0-9]{8,60}$/.test(inviteFromUrl)){await joinInvite(inviteFromUrl,seq)}
    else showFirstSetup();
  }catch(e){if(seq===generation)statusError(e)}
}
function showFirstSetup(){
  show('setupPanel');$('setupTitle').textContent='家族の本棚を作成';
  $('setupDesc').textContent='家族に本棚がある場合は、管理者から招待URLを受け取ってください。新規作成すると、あなたが管理者になります。';
  $('setupBody').replaceChildren();
  const label=document.createElement('label');label.textContent='本棚の名前';
  const inp=document.createElement('input');inp.id='familyName';inp.maxLength=80;inp.value='あおのほんだな';label.append(inp);
  const btn=document.createElement('button');btn.id='createFamily';btn.className='primary';btn.textContent='新しい本棚を作成';btn.onclick=createFamily;
  $('setupBody').append(label,btn);
}
async function createFamily(){
  if(busy||!user)return;busy=true;try{
    const name=($('familyName')?.value||'あおのほんだな').trim();
    if(!name||name.length>80)throw Error('本棚の名前を確認してください');
    const ref=doc(collection(db,'families'));
    await setDoc(ref,{ownerUid:user.uid,name,createdAt:Timestamp.now(),schemaVersion:1});
    await setDoc(doc(db,'families',ref.id,'members',user.uid),{uid:user.uid,email:user.email,displayName:user.displayName||'',role:'owner',joinedAt:Timestamp.now()});
    await setDoc(doc(db,'users',user.uid),{familyId:ref.id});
    await enterFamily(ref.id,++generation);
  }catch(e){statusError(e)}finally{busy=false}
}
async function joinInvite(id,seq){
  show('setupPanel');$('setupTitle').textContent='家族の本棚に参加';
  $('setupDesc').textContent='招待を確認しています…';$('setupBody').replaceChildren();
  try{
    if(!user.emailVerified)throw Error('確認済みのGoogleメールアドレスが必要です');
    const email=user.email.toLowerCase(), ref=doc(db,'families',id,'invites',email);
    const invitation=await getDoc(ref);if(seq!==generation)return;
    if(!invitation.exists()||invitation.data().expiresAt.toMillis()<Date.now())throw Error('有効な招待がありません。管理者へ確認してください');
    const info=invitation.data();
    $('setupDesc').textContent=email+' 宛の招待があります。権限：'+(info.role==='editor'?'編集可能':'閲覧のみ');
    const btn=document.createElement('button');btn.textContent='家族の本棚に参加する';btn.className='primary';
    btn.onclick=async()=>{btn.disabled=true;try{
      const membership=doc(db,'families',id,'members',user.uid);
      try{await setDoc(membership,{uid:user.uid,email:user.email,displayName:user.displayName||'',role:info.role,joinedAt:Timestamp.now()})}
      catch(error){const existing=await getDoc(membership).catch(()=>null);if(!existing?.exists())throw error}
      await setDoc(doc(db,'users',user.uid),{familyId:id});
      history.replaceState(null,'',location.pathname);
      await enterFamily(id,++generation);
    }catch(e){btn.disabled=false;statusError(e)}};
    $('setupBody').append(btn);
  }catch(e){$('setupDesc').textContent='招待を確認できませんでした。';statusError(e)}
}
async function enterFamily(id,seq){
  fid=id;const f=await getDoc(doc(db,'families',id));if(seq!==generation)return;
  if(!f.exists())throw Error('家族の本棚が見つかりません。アクセス権を確認してください');
  household=f.data();
  updateShelfHeading();
  const memberRef=await getDoc(doc(db,'families',id,'members',user.uid));
  role=household.ownerUid===user.uid?'owner':memberRef.data()?.role||'viewer';
  show('shelfPanel');
  unsubs.push(onSnapshot(doc(db,'families',fid),snapshot=>{
    if(!snapshot.exists()){notice('本棚が見つかりません。管理者にお問い合わせください。',true);return}
    household=snapshot.data();updateShelfHeading();if(view==='family')render();
  },statusError));
  unsubs.push(onSnapshot(familyCollection('books'),snap=>{books=snap.docs.map(d=>d.data());render()},statusError));
  unsubs.push(onSnapshot(familyCollection('series'),snap=>{series=snap.docs.map(d=>d.data());render()},statusError));
  unsubs.push(onSnapshot(familyCollection('members'),snap=>{members=snap.docs.map(d=>d.data());render()},statusError));
  if(role==='owner')unsubs.push(onSnapshot(familyCollection('invites'),snap=>{invites=snap.docs.map(d=>d.data());render()},statusError));
  $('addBook').hidden=role==='viewer';
  $('familyTab').textContent=role==='owner'?'家族の管理':'家族';
  render();
}
function render(){
  if(!fid||!$('shelfPanel')||$('shelfPanel').hidden)return;
  $('readCount').textContent=books.filter(b=>b.status==='read').length+'冊';
  $('totalCount').textContent=books.length+'冊';
  $('seriesCount').textContent=new Set(books.filter(b=>b.status==='read'&&b.seriesId).map(b=>b.seriesId)).size;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $('bookControls').hidden=view==='family';
  if(view==='family'){renderFamily();return}
  const opts={search:$('search').value,filter:view==='series'?'all':$('filter').value,sort:$('sort').value};
  const data=filteredBooks(books,opts,series);
  const root=$('content');root.replaceChildren();
  if(!data.length){root.innerHTML='<div class="empty">該当する本はまだありません。</div>';return}
  if(view==='shelf'){root.append(bookGrid(data));return}
  if(view==='series'){
    const known=new Map(series.map(s=>[s.id,s]));
    const grouped=new Map();
    for(const book of data){const key=book.seriesId||'none';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(book)}
    for(const [key,items] of grouped){const section=groupSection(known.get(key)?.name||'シリーズ未登録',known.get(key)?.note||'',items.sort((a,b)=>(a.volume||999)-(b.volume||999)),known.get(key)?.totalVolumes);root.append(section)}
    return;
  }
  const groups=new Map();
  for(const b of data.filter(x=>x.status==='read')){const p=readPeriodGrouping(b);if(!groups.has(p))groups.set(p,[]);groups.get(p).push(b)}
  for(const [key,items] of groups)root.append(groupSection(key,'',items));
}
function groupSection(title,note,items,total){
  const section=document.createElement('section');section.className='group';
  const h=document.createElement('h2');h.textContent=title;section.append(h);
  const p=document.createElement('p');p.textContent=items.filter(b=>b.status==='read').length+'冊読了'+(total?' / 本編全'+total+'巻':'')+(note?' · '+note:'');section.append(p,bookGrid(items));return section;
}
function bookGrid(data){
  const div=document.createElement('div');div.className='books';
  for(const b of data){
    const btn=document.createElement('button');btn.className='book';btn.onclick=()=>openEditor(b);
    const cover=document.createElement('div');cover.className='cover';cover.textContent=b.title;
    const url=safeCover(b.coverUrl);
    if(url){const img=document.createElement('img');img.loading='lazy';img.alt=b.title+'の表紙';img.src=url;img.onerror=()=>img.remove();cover.append(img)}
    const tag=document.createElement('span');tag.className='flag '+b.status;tag.textContent=STATUSES[b.status]||'';cover.append(tag);
    const title=document.createElement('strong');title.textContent=b.title+(b.edition?' 〈'+b.edition+'〉':'');
    const author=document.createElement('span');author.className='sub';author.textContent=b.author||'作者未登録';
    const meta=document.createElement('span');meta.className='sub';meta.textContent=[b.publicationYear?b.publicationYear+'年':'出版年不明',b.ageLabel].filter(Boolean).join(' · ');
    const period=document.createElement('span');period.className='sub';period.textContent=b.status==='read'?readPeriodLabel(b):'';
    btn.append(cover,title,author,meta,period);div.append(btn);
  }return div;
}
function openEditor(book){
  if(role==='viewer'){notice('閲覧専用アカウントです。編集するには管理者へお問い合わせください。');return}
  currentBook=book?structuredClone(book):newBook();
  const form=$('bookForm');form.reset();
  const sid=$('seriesPicker');sid.replaceChildren(new Option('なし',''),...series.map(s=>new Option(s.name,s.id)));
  for(const [k,v] of Object.entries(currentBook)){if(form.elements.namedItem(k)&&typeof v!=='object')form.elements.namedItem(k).value=v??''}
  $('bookDialogTitle').textContent=book?'読書記録の編集':'本を追加';
  $('removeBook').hidden=!book;$('bookDialog').showModal();
}
async function saveEditor(e){
  e.preventDefault();if(busy||role==='viewer')return;busy=true;
  $('saveBook').disabled=true;
  try{
    const data=Object.fromEntries(new FormData(e.currentTarget).entries());
    const updated=normalizeBook({...currentBook,...data});
    if(updated.status!=='read'){
      updated.finishedPeriodLabel='';updated.finishedPeriodStart='';updated.finishedPeriodEnd='';
      updated.finishedPeriodPrecision='';updated.finishedPeriodBasis='';updated.finishedPeriodNote='';
    }
    if(!currentBook.createdAt)updated.createdAt=new Date().toISOString();
    if(updated.status==='read'&&!updated.readOrder)updated.readOrder=1+Math.max(0,...books.map(b=>Number(b.readOrder||0)));
    await setDoc(familyDoc('books',updated.id),updated);
    $('bookDialog').close();notice('');
  }catch(err){statusError(err)}finally{busy=false;$('saveBook').disabled=false}
}
async function removeEditor(){
  if(role==='viewer'||!currentBook||!confirm('この本の読書記録を削除しますか？'))return;
  try{await deleteDoc(familyDoc('books',currentBook.id));$('bookDialog').close()}catch(e){statusError(e)}
}
async function exportData(){
  const payload=JSON.stringify({version:1,exportedAt:new Date().toISOString(),books,series},null,2);
  const u=URL.createObjectURL(new Blob([payload],{type:'application/json'}));
  const a=document.createElement('a');a.href=u;a.download='reading-shelf-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1500);
}
async function importData(ev){
  const file=ev.target.files?.[0];ev.target.value='';if(!file)return;
  if(role!=='owner')return;
  if(file.size>MAX_IMPORT_BYTES)return notice('JSONファイルが大きすぎます',true);
  try{
    const {books:imported,series:importSeries}=validateBackup(JSON.parse(await file.text()));
    if(!confirm(imported.length+'冊・'+importSeries.length+'シリーズを取り込みます。IDが一致する既存データは上書きします。続けますか？'))return;
    busy=true;let count=0;
    const tasks=[...importSeries.map(s=>({type:'series',data:s})),...imported.map(b=>({type:'books',data:normalizeBook(b)}))];
    for(let i=0;i<tasks.length;i+=250){
      const batch=writeBatch(db);
      for(const t of tasks.slice(i,i+250))batch.set(familyDoc(t.type,t.data.id),t.data);
      await batch.commit();count+=Math.min(250,tasks.length-i);
    }
    notice('クラウドへの移行完了：'+imported.length+'冊を確認してください。');
  }catch(e){statusError(e)}finally{busy=false}
}
async function importReadingPeriods(ev){
  const file=ev.target.files?.[0];ev.target.value='';if(!file)return;
  if(role!=='owner'||busy)return;
  if(file.size>MAX_IMPORT_BYTES)return notice('ファイルが大きすぎます',true);
  try{
    const updates=validatePeriodUpdates(JSON.parse(await file.text()));
    if(!confirm(updates.length+'冊の読了時期だけを反映します。既存の感想・表紙・読書状況は変更しません。続けますか？'))return;
    busy=true;
    const outcome=await runTransaction(db,async tx=>{
      const refs=updates.map(b=>familyDoc('books',b.id));
      const snapshots=[];
      for(const ref of refs)snapshots.push(await tx.get(ref));
      const edits=[];
      for(let i=0;i<updates.length;i++){
        const b=updates[i],snap=snapshots[i];
        if(!snap.exists())throw Error('移行先に本がありません: '+b.title+'。先に27冊の全件移行を完了してください');
        const current=snap.data();
        if(current.title!==b.title)throw Error('書名が一致しません: '+b.title);
        if(current.status!=='read')throw Error('読了済みではありません: '+b.title);
        const changes={};
        for(const key of ['finishedPeriodLabel','finishedPeriodStart','finishedPeriodEnd','finishedPeriodPrecision','finishedPeriodBasis','finishedPeriodNote']){
          const next=b[key]??'';
          const old=current[key]??'';
          if(old&&old!==next)throw Error('既存の時期情報と競合: '+b.title+'。手動変更を保護しました');
          if(old!==next)changes[key]=next;
        }
        if(Object.keys(changes).length)edits.push({ref:refs[i],changes});
      }
      for(const e of edits)tx.update(e.ref,e.changes);
      return edits.length;
    });
    notice('期間情報を確認しました。'+outcome+'冊分を更新しました（感想・表紙は保持）。');
  }catch(e){statusError(e)}finally{busy=false}
}
function renderFamily(){
  const root=$('content');root.replaceChildren();root.className='listPanel';
  const h=document.createElement('h2');h.textContent=household?.name||'本棚';root.append(h);
  if(role==='owner'){
    const renameRow=document.createElement('div');renameRow.className='familyActions';
    const nameInput=document.createElement('input');nameInput.value=household?.name||'';nameInput.maxLength=80;nameInput.setAttribute('aria-label','本棚の名前');
    const rename=document.createElement('button');rename.textContent='本棚名を変更';
    rename.onclick=async()=>{
      const name=nameInput.value.trim();
      if(!name||name.length>80)return notice('本棚名は1〜80文字で入力してください。',true);
      if(name===household?.name)return;
      rename.disabled=true;
      try{
        await updateDoc(doc(db,'families',fid),{name});
        household={...household,name};updateShelfHeading();notice('本棚名を変更しました。');
        if(view==='family')renderFamily();
      }catch(e){statusError(e)}finally{rename.disabled=false}
    };
    renameRow.append(nameInput,rename);root.append(renameRow);
  }
  const info=document.createElement('p');info.className='muted';info.textContent='ログイン中：'+user.email+' / 権限：'+(role==='owner'?'管理者':role==='editor'?'編集可能':'閲覧のみ');root.append(info);
  const heading=document.createElement('h3');heading.textContent='家族メンバー';root.append(heading);
  for(const m of members){const row=document.createElement('div');row.className='person';const who=document.createElement('div');
    const name=document.createElement('strong');name.textContent=m.displayName||m.email;
    const detail=document.createElement('div');detail.className='muted tiny';detail.textContent=m.email+' · '+(m.role==='owner'?'管理者':m.role==='editor'?'編集可能':'閲覧のみ');who.append(name,detail);row.append(who);
    if(role==='owner'&&m.role!=='owner'){
      const actions=document.createElement('div');const selector=document.createElement('select');
      selector.append(new Option('編集可能','editor'),new Option('閲覧のみ','viewer'));selector.value=m.role;
      selector.onchange=async()=>{try{await setDoc(familyDoc('members',m.uid),{...m,role:selector.value})}catch(e){selector.value=m.role;statusError(e)}};
      const revoke=document.createElement('button');revoke.className='danger';revoke.textContent='削除';
      revoke.onclick=async()=>{if(confirm(m.email+' のアクセス権を削除しますか？'))try{await deleteDoc(familyDoc('members',m.uid))}catch(e){statusError(e)}};
      actions.append(selector,revoke);row.append(actions);
    }root.append(row);
  }
  if(role==='owner'){
    const inviteTitle=document.createElement('h3');inviteTitle.textContent='家族を招待';root.append(inviteTitle);
    const p=document.createElement('p');p.className='muted';p.textContent='招待先のGoogleメールアドレスを登録し、専用URLを相手に送ります。有効期限は14日です。';root.append(p);
    const input=document.createElement('input');input.type='email';input.placeholder='family@gmail.com';input.setAttribute('aria-label','招待するメールアドレス');
    const select=document.createElement('select');select.append(new Option('編集可能','editor'),new Option('閲覧のみ','viewer'));
    const btn=document.createElement('button');btn.className='primary';btn.textContent='招待を作成';
    const ctr=document.createElement('div');ctr.className='familyActions';ctr.append(input,select,btn);root.append(ctr);
    btn.onclick=async()=>{const email=input.value.trim().toLowerCase();if(!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email))return notice('有効なメールアドレスを入力してください',true);
      try{await setDoc(familyDoc('invites',email),{email,role:select.value,expiresAt:Timestamp.fromMillis(Date.now()+14*86400000)});notice('招待を登録しました。以下の共有URLをコピーして送ってください。');}catch(e){statusError(e)}
    };
    const link=new URL(location.href);link.search='';link.searchParams.set('family',fid);
    const url=document.createElement('div');url.className='invite';const title=document.createElement('strong');title.textContent='招待URL（家族へ共有）';const a=document.createElement('div');a.className='link';a.textContent=link.toString();
    const copy=document.createElement('button');copy.textContent='URLをコピー';copy.onclick=async()=>{try{await navigator.clipboard.writeText(link.toString());notice('URLをコピーしました')}catch(e){statusError(e)}};
    url.append(title,a,copy);root.append(url);
    for(const inv of invites){const v=document.createElement('div');v.className='person';const tx=document.createElement('span');tx.textContent=inv.email+' · '+(inv.role==='editor'?'編集可能':'閲覧のみ')+' · 期限 '+inv.expiresAt?.toDate().toLocaleDateString('ja-JP');const del=document.createElement('button');del.textContent='招待を取り消す';del.onclick=async()=>{try{await deleteDoc(familyDoc('invites',inv.email))}catch(e){statusError(e)}};v.append(tx,del);root.append(v)}
    const periods=document.createElement('input');periods.type='file';periods.accept='.json,application/json';periods.hidden=true;periods.onchange=importReadingPeriods;
    const periodButton=document.createElement('button');periodButton.textContent='読了時期だけを更新';periodButton.onclick=()=>periods.click();
    const periodRow=document.createElement('div');periodRow.className='familyActions';periodRow.append(periodButton,periods);
    root.append(periodRow);
    const backupTitle=document.createElement('h3');backupTitle.textContent='記録の移行とバックアップ';root.append(backupTitle);
    const backup=document.createElement('button');backup.textContent='全記録をJSONで保存';backup.onclick=exportData;
    const upload=document.createElement('input');upload.type='file';upload.accept='.json,application/json';upload.hidden=true;upload.onchange=importData;
    const imp=document.createElement('button');imp.textContent='旧アプリからJSONを取り込む';imp.onclick=()=>upload.click();
    const actions=document.createElement('div');actions.className='familyActions';actions.append(backup,imp,upload);root.append(actions);
    const seriesTitle=document.createElement('h3');seriesTitle.textContent='シリーズの追加';root.append(seriesTitle);
    const si=document.createElement('input');si.placeholder='シリーズ名';si.maxLength=150;
    const sb=document.createElement('button');sb.textContent='シリーズ追加';sb.onclick=async()=>{const name=si.value.trim();if(!name)return;try{const ref=doc(familyCollection('series'));await setDoc(ref,{id:ref.id,name,totalVolumes:null});si.value=''}catch(e){statusError(e)}};const sr=document.createElement('div');sr.className='familyActions';sr.append(si,sb);root.append(sr);
  }else{const a=document.createElement('button');a.textContent='全記録をバックアップ';a.onclick=exportData;root.append(a)}
}
async function start(){
  initUI();
  if(!firebaseConfig?.apiKey||!firebaseConfig?.projectId||!firebaseConfig?.appId){
    show('setupPanel');$('setupTitle').textContent='Firebaseの初期設定が必要です';$('setupDesc').textContent='プロジェクト接続設定がまだ登録されていません。管理者がFirebaseを作成し、firebase-config.mjsを設定してください。';$('setupBody').replaceChildren();return;
  }
  try{
    const app=initializeApp(firebaseConfig);auth=getAuth(app);db=getFirestore(app);
    await setPersistence(auth,browserLocalPersistence);
    await getRedirectResult(auth).catch(e=>{if(e.code!=='auth/no-auth-event')throw e});
    onAuthStateChanged(auth,u=>{void signedIn(u)},statusError);
  }catch(e){show('setupPanel');statusError(e)}
}
void start();
