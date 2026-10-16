import {initializeApp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,setPersistence,browserLocalPersistence,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js';
import {getFirestore,doc,collection,getDoc,setDoc,deleteDoc,onSnapshot,Timestamp,serverTimestamp,runTransaction} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.mjs?build=20261016-invite-v10';
import {newInviteToken,parseInviteHash,oneTimeInviteUrl} from './invite-links.mjs?build=20261016-invite-v10';
import {shelfThumbnailUrl} from './cover-thumbnails.mjs?build=20261016-invite-v10';
import {mountBookCommunity} from './book-community.mjs?build=20261016-invite-v10';
import {mountRecommendations} from './recommendations.mjs?build=20261016-invite-v10';
import {mountFamilyActivity} from './activity.mjs?build=20261016-invite-v10';
import {STATUSES,filteredBooks,readPeriodLabel,readPeriodGrouping,readingModeLabel} from './domain.mjs?build=20261016-invite-v10';

const APP_BUILD='20261016-invite-v10';
const $=id=>{const element=document.getElementById(id);if(!element)throw new Error('APP_DOM_MISMATCH: missing #'+id);return element};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeCover=url=>/^(https:\/\/|data:image\/(jpeg|png|webp);base64,)/i.test(String(url||''))?String(url):'';
const SHOW=['loading','loginPanel','setupPanel','shelfPanel'];
let auth,db,user=null,fid='',role='',household=null,books=[],series=[],members=[],invites=[],openInvites=[],lastInviteLink='';
let unsubs=[],view='shelf',generation=0;
let closeCommunity=null,closeRecommendations=null,closeActivity=null;
const inviteFromUrl=new URLSearchParams(location.search).get('family')||'';
const openInviteFromUrl=parseInviteHash(location.hash);

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
  $('search').addEventListener('input',render);
  $('filter').addEventListener('change',render);
  $('sort').addEventListener('change',render);
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$((b.dataset.close)).close());
  $('bookInfoDialog').addEventListener('close',()=>{closeCommunity?.();closeCommunity=null});
}
function updateShelfHeading(){
  const name=household?.name||'本棚';
  $('shelfName').textContent=name;
  document.title=household?'よんでね | '+name:'よんでね';
}
function closeListeners(){closeActivity?.();closeActivity=null;closeRecommendations?.();closeRecommendations=null;closeCommunity?.();closeCommunity=null;unsubs.forEach(u=>u());unsubs=[];fid='';books=[];series=[];members=[];invites=[];openInvites=[];lastInviteLink='';household=null;role='';updateShelfHeading()}
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
    else if(openInviteFromUrl){await joinOpenInvite(openInviteFromUrl,seq)}
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
async function joinOpenInvite({familyId,token},seq){
  show('setupPanel');$('setupTitle').textContent='家族の本棚に参加';
  $('setupDesc').textContent='1回限りの招待を確認しています…';$('setupBody').replaceChildren();
  try{
    if(!user.emailVerified)throw Error('確認済みのGoogleメールアドレスが必要です');
    const invite=doc(db,'families',familyId,'openInvites',token);
    const membership=doc(db,'families',familyId,'members',user.uid);
    await runTransaction(db,async transaction=>{
      const snapshot=await transaction.get(invite);
      if(!snapshot.exists())throw Error('招待URLが見つからないか、取り消されています');
      const row=snapshot.data();
      if(row.claimedByUid===user.uid)return; // Existing claim: recover interrupted profile write.
      if(row.claimedByUid)throw Error('この招待URLはすでに使用されています');
      if(row.expiresAt.toMillis()<=Date.now())throw Error('招待URLの期限が切れています');
      if(row.role!=='viewer')throw Error('招待の権限設定が正しくありません');
      transaction.update(invite,{claimedByUid:user.uid,claimedAt:serverTimestamp()});
      transaction.set(membership,{uid:user.uid,email:user.email,displayName:user.displayName||'',
        role:'viewer',joinedAt:serverTimestamp(),inviteToken:token});
    });
    if(seq!==generation)return;
    await setDoc(doc(db,'users',user.uid),{familyId});
    if(seq!==generation)return;
    history.replaceState(null,'',location.pathname);
    await enterFamily(familyId,++generation);
  }catch(error){
    if(seq!==generation)return;
    $('setupDesc').textContent='招待による参加を完了できませんでした。';
    statusError(error);
  }
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
  if(role==='owner'){
    unsubs.push(onSnapshot(familyCollection('invites'),snap=>{invites=snap.docs.map(d=>d.data());render()},statusError));
    unsubs.push(onSnapshot(familyCollection('openInvites'),snap=>{openInvites=snap.docs.map(d=>({id:d.id,...d.data()}));render()},statusError));
  }
  render();
}
function render(){
  closeActivity?.();closeActivity=null;
  if(view!=='recommendations'){closeRecommendations?.();closeRecommendations=null}
  if(!fid||!$('shelfPanel')||$('shelfPanel').hidden)return;
  $('readCount').textContent=books.filter(b=>b.status==='read').length+'冊';
  $('totalCount').textContent=books.length+'冊';
  $('seriesCount').textContent=series.length;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $('familySettings').classList.toggle('active',view==='family');
  $('bookControls').hidden=view!=='shelf';
  const periodMode=view==='shelf'&&$('filter').value==='timeline';
  $('sort').disabled=periodMode;
  $('sort').title=periodMode?'時期別表示は読んだ順に並びます':'';
  if(view==='family'){renderFamily();return}
  if(view==='recommendations'){renderRecommendations();return}
  const opts={
    search:$('search').value,
    filter:view==='series'?'all':(periodMode?'read':$('filter').value),
    sort:periodMode?'order-new':$('sort').value
  };
  const data=filteredBooks(books,opts,series);
  const root=$('content');root.className='';root.replaceChildren();
  if(!data.length){root.innerHTML='<div class="empty">該当する本はまだありません。</div>';return}
  if(view==='shelf'&&!periodMode){
    const area=document.createElement('div');root.append(area);
    closeActivity=mountFamilyActivity({db,fid,container:area,members:()=>members,onError:statusError,
      onBook:id=>{const found=books.find(b=>b.id===id);if(found)openBookInfo(found)},
      onRecommendations:()=>{view='recommendations';render()}});
    root.append(bookGrid(data));return;
  }
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
    if(url){
      const img=document.createElement('img');img.loading='lazy';img.decoding='async';
      img.alt=b.title+'の表紙';
      const thumbnail=shelfThumbnailUrl(url);
      img.src=thumbnail;
      img.onerror=()=>{if(thumbnail!==url){img.onerror=()=>img.remove();img.src=url}else img.remove()};
      cover.append(img);
    }
    const tag=document.createElement('span');tag.className='flag '+b.status;tag.textContent=STATUSES[b.status]||'';cover.append(tag);
    const title=document.createElement('strong');title.textContent=b.title+(b.edition?' 〈'+b.edition+'〉':'');
    const author=document.createElement('span');author.className='sub';author.textContent=b.author||'作者未登録';
    // Book cards prioritize reading history; bibliographic year and age stay in detail.
    const trail=document.createElement('span');trail.className='bookReadingTrail';
    const mode=readingModeLabel(b);
    if(mode&&['read','reading','paused'].includes(b.status)){
      const chip=document.createElement('span');chip.className='modeChip';chip.textContent=mode;
      trail.append(chip);
    }
    if(b.status==='read'){
      const period=document.createElement('span');period.className='readPeriodCompact';
      period.textContent=readPeriodLabel(b);trail.append(period);
    }
    btn.append(cover,title,author,trail);div.append(btn);
  }return div;
}
function openBookInfo(book){
  $('bookInfoTitle').textContent=book.title;
  const root=$('bookInfoBody');root.replaceChildren();
  const summary=document.createElement('div');summary.className='bookSummary bookSummaryCompact';
  const art=document.createElement('div');art.className='bookDetailCover cover';art.textContent=book.title;
  const src=safeCover(book.coverUrl);
  if(src){
    const img=document.createElement('img');img.alt=book.title+' の表紙';img.src=src;
    img.onerror=()=>img.remove();art.append(img);
  }
  const lead=document.createElement('div');lead.className='bookLead';
  const label=document.createElement('span');label.className='bookStatusPill';
  label.textContent=STATUSES[book.status]||'状態未登録';lead.append(label);
  for(const value of [
    book.author,
    book.status==='read'?readPeriodLabel(book):'',
    ['read','reading','paused'].includes(book.status)?readingModeLabel(book):'',
    series.find(q=>q.id===book.seriesId)?.name,
  ]){
    if(!value)continue;
    const p=document.createElement('p');p.className='bookLeadLine';p.textContent=value;lead.append(p);
  }
  summary.append(art,lead);root.append(summary);

  // Family interactions are the primary use of the detail page, not ISBN data.
  closeCommunity?.();
  const community=document.createElement('div');community.className='communityRoot';
  root.append(community);
  closeCommunity=mountBookCommunity({
    db,fid,book,user,owner:role==='owner',members:()=>members,container:community,onError:statusError
  });

  // Preserve the complete original bibliography in an optional disclosure.
  const disclosure=document.createElement('details');disclosure.className='bookMetadataDetails';
  const heading=document.createElement('summary');heading.textContent='書誌情報・読書メモを見る';
  disclosure.append(heading);
  const metadata=document.createElement('dl');metadata.className='bibliography';
  const seriesName=series.find(q=>q.id===book.seriesId)?.name||'';
  const verified=book.publicationYearBasis==='photo-confirmed-edition';
  const fields=[
    ['状態',STATUSES[book.status]||'未登録'],
    ['読んだ時期',book.status==='read'?readPeriodLabel(book):''],
    ['読み方',readingModeLabel(book)],
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
    const field=document.createElement('dt');field.textContent=name;
    const detail=document.createElement('dd');detail.textContent=String(value);
    metadata.append(field,detail);
  }
  disclosure.append(metadata);
  for(const [name,value] of [
    ['版の説明',book.editionNote],
    ['読書・観察メモ',book.notes],
    ['書影の参照元',book.coverReferenceSource]
  ]){
    if(!value)continue;
    const p=document.createElement('p');p.className='detailNote';
    const strong=document.createElement('strong');strong.textContent=name+'：';
    p.append(strong,document.createTextNode(value));disclosure.append(p);
  }
  const reference=safeCover(book.bibliographicSource);
  if(reference){
    const p=document.createElement('p');p.className='detailNote';
    const a=document.createElement('a');a.href=reference;a.target='_blank';a.rel='noopener noreferrer';
    a.textContent='出版社・図書館などの書誌出典を確認 ↗';
    p.append(a);disclosure.append(p);
  }
  root.append(disclosure);
  const dialog=$('bookInfoDialog');
  dialog.showModal();
  dialog.scrollTop=0;
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
  const hint=document.createElement('p');hint.className='muted';
  hint.textContent='リンクを受け取った最初のGoogleログイン利用者1人だけが参加できます。有効期限は7日間です。URLは家族へ個別に共有してください。';
  root.append(hint);
  const create=document.createElement('button');create.className='primary';create.textContent='1回限りの招待URLを作成';
  create.onclick=async()=>{
    create.disabled=true;
    try{
      const token=newInviteToken();
      await setDoc(familyDoc('openInvites',token),{role:'viewer',createdAt:serverTimestamp(),
        expiresAt:Timestamp.fromMillis(Date.now()+7*86400000),claimedByUid:'',claimedAt:null});
      lastInviteLink=oneTimeInviteUrl(location.href,fid,token);
      renderFamily();
      notice('新しい招待URLを作成しました。信頼できる家族へ個別に送ってください。');
    }catch(error){statusError(error)}finally{create.disabled=false}
  };
  root.append(create);
  if(lastInviteLink){
    const share=document.createElement('div');share.className='invite';
    const label=document.createElement('strong');label.textContent='新しく発行した招待URL';
    const address=document.createElement('div');address.className='link';address.textContent=lastInviteLink;
    const copy=document.createElement('button');copy.textContent='URLをコピー';
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(lastInviteLink);notice('URLをコピーしました')}catch(e){statusError(e)}};
    share.append(label,address,copy);root.append(share);
  }
  for(const invite of openInvites){
    const row=document.createElement('div');row.className='person';
    const label=document.createElement('span');
    label.textContent=(invite.claimedByUid?'使用済み':'未使用')+' · 有効期限 '+invite.expiresAt?.toDate?.()?.toLocaleDateString('ja-JP');
    row.append(label);
    if(!invite.claimedByUid){
      const cancel=document.createElement('button');cancel.textContent='リンクを取り消す';
      cancel.onclick=async()=>{try{
        await deleteDoc(familyDoc('openInvites',invite.id));
        if(lastInviteLink.includes(invite.id))lastInviteLink='';
      }catch(error){statusError(error)}};
      row.append(cancel);
    }
    root.append(row);
  }
  if(invites.length){
    const old=document.createElement('p');old.className='muted tiny';
    old.textContent='旧方式のメール招待（新規発行は終了）';root.append(old);
  }
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
  const version=document.createElement('p');version.className='muted tiny appVersion';
  version.textContent='アプリのバージョン：'+APP_BUILD;
  root.append(version);
}
async function start(){
  if(document.documentElement.dataset.appBuild!==APP_BUILD){
    console.error('HTML and JavaScript build IDs do not match');
    const alert=document.getElementById('message');
    if(alert){alert.hidden=false;alert.textContent='アプリの更新データが一致しません。画面を更新してください。';alert.className='notice error'}
    return;
  }
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
