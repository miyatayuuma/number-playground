import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,setPersistence,browserLocalPersistence,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,setDoc,deleteDoc,onSnapshot,Timestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.mjs';
import {mountBookCommunity} from './book-community.mjs';
import {mountRecommendations} from './recommendations.mjs';
import {STATUSES,filteredBooks,readPeriodLabel,readPeriodGrouping} from './domain.mjs';

const $=id=>{const element=document.getElementById(id);if(!element)throw new Error('APP_DOM_MISMATCH: missing #'+id);return element};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeCover=url=>/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(String(url||''))?String(url):'';
const SHOW=['loading','loginPanel','setupPanel','shelfPanel'];
let auth,db,user=null,fid='',role='',household=null,books=[],series=[],members=[],invites=[];
let unsubs=[],view='shelf',generation=0,periodMode=false,sortDescending=true;
let closeCommunity=null,closeRecommendations=null;
const inviteFromUrl=new URLSearchParams(location.search).get('family')||'';

function show(id){SHOW.forEach(x=>$(x).hidden=x!==id)}
function notice(m,error=false){$('message').hidden=!m;$('message').textContent=m||'';$('message').className='notice'+(error?' error':'')}
function statusError(e){
  console.error(e);
  const detail=String(e?.code||e?.message||e);
  const versionMismatch=/APP_DOM_MISMATCH|Cannot set properties of null|Cannot read properties of null/.test(detail);
  notice(versionMismatch
    ?'アプリの表示に不整合が発生しました。更新後の画面を読み直すため、アプリを一度終了して開き直してください。改善しない場合はブラウザから開いてください。'
    :'操作を完了できません: '+detail+'\n接続状態・ログイン権限を確認してください。',true);
}
let deferredInstallPrompt=null;
function registerInstallAction(){
  const button=$('installApp');
  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();
    deferredInstallPrompt=event;
    button.hidden=false;
  });
  window.addEventListener('appinstalled',()=>{
    deferredInstallPrompt=null;
    button.hidden=true;
  });
  button.onclick=async()=>{
    if(!deferredInstallPrompt)return;
    const prompt=deferredInstallPrompt;deferredInstallPrompt=null;
    button.hidden=true;
    try{await prompt.prompt();await prompt.userChoice}catch(error){console.warn('Install prompt cancelled',error)}
  };
}
function initUI(){
  registerInstallAction();
  $('googleLogin').onclick=login;
  $('signOut').onclick=async()=>{closeListeners();await signOut(auth)};
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{view=b.dataset.view;render()});
  $('familySettings').onclick=()=>{view=view==='family'?'shelf':'family';render()};
  ['search','filter'].forEach(x=>$(x).addEventListener(x==='search'?'input':'change',render));
  $('sort').addEventListener('change',()=>{
    sortDescending=['order','year'].includes($('sort').value);render();
  });
  $('sortDirection').onclick=()=>{sortDescending=!sortDescending;render()};
  $('timelineToggle').onclick=()=>{periodMode=!periodMode;if(periodMode)$('filter').value='read';render()};
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$((b.dataset.close)).close());
  $('bookInfoDialog').addEventListener('close',()=>{closeCommunity?.();closeCommunity=null});
}
function updateShelfHeading(){
  const name=household?.name||'本棚';
  $('shelfName').textContent=name;
  document.title=household?'よんでね | '+name:'よんでね';
}
function closeListeners(){closeRecommendations?.();closeRecommendations=null;closeCommunity?.();closeCommunity=null;unsubs.forEach(u=>u());unsubs=[];fid='';books=[];series=[];members=[];invites=[];household=null;role='';updateShelfHeading()}
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
  $('identity').textContent=u?.email||'';$('signOut').hidden=!u;$('familySettings').hidden=!u;
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
  show('setupPanel');
  $('setupTitle').textContent='家族の本棚へ参加';
  $('setupDesc').textContent='この本棚は家族専用です。管理者から招待URLを受け取って開いてください。';
  $('setupBody').replaceChildren();
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
    $('setupDesc').textContent=email+' 宛に家族の本棚への招待が届いています。';
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
  render();
}
function render(){
  if(view!=='recommendations'){closeRecommendations?.();closeRecommendations=null}
  if(!fid||!$('shelfPanel')||$('shelfPanel').hidden)return;
  $('readCount').textContent=books.filter(b=>b.status==='read').length+'冊';
  $('totalCount').textContent=books.length+'冊';
  $('seriesCount').textContent=series.length;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $('familySettings').classList.toggle('active',view==='family');
  $('bookControls').hidden=view!=='shelf';
  $('timelineToggle').setAttribute('aria-pressed',String(periodMode));
  $('timelineToggle').classList.toggle('active',periodMode);
  $('filter').disabled=view==='shelf'&&periodMode;
  const sort=$('sort').value;
  $('sortDirection').textContent=['order','year'].includes(sort)
    ?(sortDescending?'新しい順 ↓':'古い順 ↑')
    :(sortDescending?'降順 ↓':'昇順 ↑');
  if(view==='family'){renderFamily();return}
  if(view==='recommendations'){renderRecommendations();return}
  const sortKey=sort==='order'?'order-'+(sortDescending?'new':'old')
    :sort==='year'?'year-'+(sortDescending?'new':'old')
    :sort+'-'+(sortDescending?'desc':'asc');
  const opts={search:$('search').value,filter:view==='series'?'all':$('filter').value,sort:sortKey};
  const data=filteredBooks(books,opts,series);
  const root=$('content');root.className='';root.replaceChildren();
  if(!data.length){root.innerHTML='<div class="empty">該当する本はまだありません。</div>';return}
  if(view==='shelf'&&!periodMode){root.append(bookGrid(data));return}
  if(view==='series'){
    // A series screen should never collect unrelated stand-alone books.
    const known=new Map(series.map(s=>[s.id,s]));
    const grouped=new Map();
    for(const book of data){
      if(!book.seriesId)continue;
      if(!grouped.has(book.seriesId))grouped.set(book.seriesId,[]);
      grouped.get(book.seriesId).push(book);
    }
    const keys=[...grouped.keys()].sort((a,b)=>(known.get(a)?.name||a).localeCompare(known.get(b)?.name||b,'ja'));
    for(const key of keys){
      const items=grouped.get(key).sort((a,b)=>(a.volume||999)-(b.volume||999));
      const meta=known.get(key);
      root.append(groupSection(meta?.name||'名称未登録のシリーズ',meta?.note||'',items,meta?.totalVolumes,true));
    }
    if(!keys.length)root.innerHTML='<div class="empty">シリーズに登録された本はまだありません。</div>';
    return;
  }
  const groups=new Map();
  for(const b of data.filter(x=>x.status==='read')){const p=readPeriodGrouping(b);if(!groups.has(p))groups.set(p,[]);groups.get(p).push(b)}
  for(const [key,items] of groups)root.append(groupSection(key,'',items));
}
function groupSection(title,note,items,total,isSeries=false){
  const section=document.createElement('section');section.className='group';
  const h=document.createElement('h2');h.textContent=title;section.append(h);
  const p=document.createElement('p');
  const read=items.filter(b=>b.status==='read').length;
  p.textContent=isSeries
    ?'登録'+items.length+'冊・読んだ'+read+'冊'+(total?' / 全'+total+'巻':'')+(note?' · '+note:'')
    :read+'冊読んだ'+(note?' · '+note:'');
  section.append(p,bookGrid(items));return section;
}
function bookGrid(data){
  const div=document.createElement('div');div.className='books';
  for(const b of data){
    const btn=document.createElement('button');btn.className='book';btn.onclick=()=>openBookInfo(b);
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
function openBookInfo(book){
  $('bookInfoTitle').textContent=book.title;
  const root=$('bookInfoBody');root.replaceChildren();
  const summary=document.createElement('div');summary.className='bookSummary';
  const art=document.createElement('div');art.className='bookDetailCover cover';art.textContent=book.title;
  const src=safeCover(book.coverUrl);
  if(src){const img=document.createElement('img');img.alt=book.title+' の表紙';img.src=src;img.onerror=()=>img.remove();art.append(img)}
  const metadata=document.createElement('div');metadata.className='bibliography';
  const seriesName=series.find(q=>q.id===book.seriesId)?.name||'';
  const verified=book.publicationYearBasis==='photo-confirmed-edition';
  const fields=[
    ['状態',STATUSES[book.status]||'未登録'],
    ['読了時期',book.status==='read'?readPeriodLabel(book):''],
    ['作者',book.author],
    ['訳',book.translator],
    ['文・再話',book.adaptedBy],
    ['挿絵',book.illustrator],
    ['出版社',book.publisher],
    ['出版年',book.publicationYear?book.publicationYear+'年':'未登録'],
    ['出版年月',book.publicationDate],
    ['書誌の版',verified?'実物の版を確認済み':'参照版の書誌（実物の版は未確認）'],
    ['ISBN',book.isbn],
    ['ページ数',book.pageCount?book.pageCount+'ページ':''],
    ['対象年齢・学年',book.ageLabel],
    ['シリーズ',seriesName],
    ['巻番号',book.volume?book.volume+'巻':''],
    ['版',book.edition],
    ['作品区分',book.workType]
  ];
  for(const [name,value] of fields){
    if(value===undefined||value===null||value==='')continue;
    const label=document.createElement('dt');label.textContent=name;
    const detail=document.createElement('dd');detail.textContent=String(value);
    metadata.append(label,detail);
  }
  summary.append(art,metadata);root.append(summary);
  for(const [heading,value] of [['版の説明',book.editionNote],['読書・観察メモ',book.notes],['書影の参照元',book.coverReferenceSource]]){
    if(!value)continue;
    const p=document.createElement('p');p.className='detailNote';
    const strong=document.createElement('strong');strong.textContent=heading+'：';
    p.append(strong,document.createTextNode(value));root.append(p);
  }
  const reference=safeCover(book.bibliographicSource);
  if(reference){
    const p=document.createElement('p');p.className='detailNote';
    const a=document.createElement('a');a.href=reference;a.target='_blank';a.rel='noopener noreferrer';
    a.textContent='出版社・図書館などの書誌出典を確認 ↗';
    p.append(a);root.append(p);
  }
  closeCommunity?.();
  const community=document.createElement('div');community.className='communityRoot';
  root.append(community);
  closeCommunity=mountBookCommunity({
    db,fid,book,user,owner:role==='owner',members:()=>members,container:community,onError:statusError
  });
  $('bookInfoDialog').showModal();
}
function renderRecommendations(){
  if(closeRecommendations)return;
  const root=$('content');root.className='';root.replaceChildren();
  closeRecommendations=mountRecommendations({
    db,fid,user,owner:role==='owner',members:()=>members,books:()=>books,container:root,onError:statusError
  });
}
function renderFamily(){
  const root=$('content');root.replaceChildren();root.className='listPanel';
  const title=document.createElement('h2');title.textContent='家族で共有';root.append(title);
  const info=document.createElement('p');info.className='muted';
  info.textContent='ログイン中：'+user.email;
  root.append(info);
  const heading=document.createElement('h3');heading.textContent='参加している家族';
  root.append(heading);
  for(const m of members){
    const row=document.createElement('div');row.className='person';
    const who=document.createElement('div');
    const name=document.createElement('strong');name.textContent=m.displayName||m.email;
    const detail=document.createElement('div');detail.className='muted tiny';
    detail.textContent=m.email+(m.role==='owner'?' · 管理者':'');
    who.append(name,detail);row.append(who);
    if(role==='owner'&&m.role!=='owner'){
      const revoke=document.createElement('button');revoke.className='danger';
      revoke.textContent='アクセスを解除';
      revoke.onclick=async()=>{
        if(!confirm(m.email+' の本棚へのアクセスを解除しますか？'))return;
        try{await deleteDoc(familyDoc('members',m.uid))}catch(e){statusError(e)}
      };
      row.append(revoke);
    }
    root.append(row);
  }
  if(role!=='owner')return;
  const inviteTitle=document.createElement('h3');inviteTitle.textContent='家族を招待';root.append(inviteTitle);
  const p=document.createElement('p');p.className='muted';
  p.textContent='招待先のGoogleメールアドレスを登録し、招待URLを送ってください。招待は14日間有効です。';
  root.append(p);
  const input=document.createElement('input');input.type='email';input.placeholder='family@gmail.com';
  input.setAttribute('aria-label','招待するGoogleメールアドレス');
  const btn=document.createElement('button');btn.className='primary';btn.textContent='招待を作成';
  const ctr=document.createElement('div');ctr.className='familyActions';ctr.append(input,btn);root.append(ctr);
  btn.onclick=async()=>{
    const email=input.value.trim().toLowerCase();
    if(!/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(email))return notice('有効なメールアドレスを入力してください',true);
    try{
      await setDoc(familyDoc('invites',email),{email,role:'viewer',expiresAt:Timestamp.fromMillis(Date.now()+14*86400000)});
      notice('招待を作成しました。以下のURLを家族に送ってください。');
    }catch(e){statusError(e)}
  };
  const link=new URL(location.href);link.search='';link.searchParams.set('family',fid);
  const url=document.createElement('div');url.className='invite';
  const shareTitle=document.createElement('strong');shareTitle.textContent='招待URL（家族へ共有）';
  const address=document.createElement('div');address.className='link';address.textContent=link.toString();
  const copy=document.createElement('button');copy.textContent='URLをコピー';
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(link.toString());notice('URLをコピーしました')}catch(e){statusError(e)}};
  url.append(shareTitle,address,copy);root.append(url);
  for(const invite of invites){
    const row=document.createElement('div');row.className='person';
    const tx=document.createElement('span');
    tx.textContent=invite.email+' · 有効期限 '+invite.expiresAt?.toDate().toLocaleDateString('ja-JP');
    const cancel=document.createElement('button');cancel.textContent='招待を取り消す';
    cancel.onclick=async()=>{try{await deleteDoc(familyDoc('invites',invite.email))}catch(e){statusError(e)}};
    row.append(tx,cancel);root.append(row);
  }
  const note=document.createElement('p');note.className='muted';
  note.textContent='本の登録・修正・削除は管理者が行います。';
  root.append(note);
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
// Install the app shell without caching private Firebase data.
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'})
      .then(registration=>registration.update())
      .catch(error=>console.warn('PWA registration failed',error));
  });
}
void start();
