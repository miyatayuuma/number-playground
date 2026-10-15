import {collection,doc,query,where,limit,onSnapshot,setDoc,updateDoc,deleteDoc,getDoc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';
import {normalize,STATUSES} from './domain.mjs?build=20261016-high-v7';
import {searchBookMetadata} from './book-lookup.mjs?build=20261016-high-v7';

const el=(tag,className='',text='')=>{
  const n=document.createElement(tag);
  if(className)n.className=className;
  if(text)n.textContent=text;
  return n;
};
const stamp=r=>r.createdAt?.toMillis?.()||0;
const safeURL=v=>!v||(/^https:\/\/[^\s]+$/i.test(v)&&v.length<=1500);
export function mountRecommendations({db,fid,user,owner,members,books,container,onError}){
  const ref=collection(db,'families',fid,'recommendations');
  const subscriptions=[];
  const activity=collection(db,'families',fid,'activity');
  const activityFor=id=>doc(activity,'recommendation-'+id);
  let active=true,visible=[],moderated=[];
  const who=uid=>uid===user.uid?'自分':members().find(m=>m.uid===uid)?.displayName||'家族';
  const root=el('section','recommendationPage');
  root.append(el('h2','','家族のおすすめ'));
  root.append(el('p','muted','読んでほしい本を家族に紹介できます。おすすめは読書履歴には追加されません。'));
  const compose=el('form','recommendationCompose');
  const title=el('input');title.type='text';title.maxLength=250;title.required=true;
  title.placeholder='本のタイトル';title.setAttribute('aria-label','おすすめする本のタイトル');
  const url=el('input');url.type='url';url.maxLength=1500;
  url.placeholder='本の紹介URL（任意）';url.setAttribute('aria-label','本の紹介URL');
  const reason=el('textarea');reason.rows=2;reason.maxLength=1000;
  reason.placeholder='おすすめしたい理由（任意）';reason.setAttribute('aria-label','おすすめ理由');
  const lookup=el('button','bookLookupButton','書誌を検索');lookup.type='button';
  const results=el('div','bookLookupResults');
  const chosen=el('div','bookLookupSelected');
  const submit=el('button','primary','おすすめする');submit.type='submit';
  const status=el('p','muted tiny');status.setAttribute('role','status');
  let selected=null,lookupSeq=0;
  const resetSelection=()=>{
    selected=null;chosen.replaceChildren();results.replaceChildren();
  };
  title.addEventListener('input',resetSelection);
  lookup.onclick=async()=>{
    const query=title.value.trim();if(!query)return(status.textContent='先にタイトルを入力してください');
    lookup.disabled=true;results.replaceChildren();chosen.replaceChildren();selected=null;
    status.textContent='書誌を確認しています…';
    const seq=++lookupSeq;
    try{
      const matches=await searchBookMetadata(query);
      if(!active||seq!==lookupSeq)return;
      if(!matches.length){status.textContent='候補が見つかりません。検索せず投稿できます。';return}
      status.textContent='該当する版を選んでください。合わなければ選択せずに投稿できます。';
      for(const candidate of matches){
        const pick=el('button','bookLookupCandidate');pick.type='button';
        const desc=[candidate.title,candidate.author,candidate.publisher,candidate.publishedDate].filter(Boolean).join(' · ');
        pick.textContent=desc;
        pick.onclick=()=>{
          selected={...candidate,queryTitle:query};
          chosen.textContent='書誌候補：'+desc;
          results.replaceChildren();
          status.textContent='書誌は参考情報として保存します。';
        };
        results.append(pick);
      }
    }catch(e){if(active&&seq===lookupSeq)status.textContent='書誌検索が使えません。タイトルだけでも投稿できます。'}
    finally{if(active&&seq===lookupSeq)lookup.disabled=false}
  };
  compose.append(title,lookup,results,chosen,url,reason,submit,status);root.append(compose);
  const list=el('div','recommendationList');root.append(list);
  const moderation=el('div','recommendationModeration');
  if(owner){
    moderation.append(el('h3','','非表示にしたおすすめ'));
    root.append(moderation);
  }
  container.replaceChildren(root);
  const notify=e=>{if(onError)onError(e);else console.error(e)};
  const link=(url,label)=>{
    const a=el('a','recommendationLink',label);
    a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;
  };
  async function mutate(rec,patch){await updateDoc(doc(ref,rec.id),patch)}
  const date=x=>x.createdAt?.toDate?.()?.toLocaleDateString('ja-JP')||'投稿中';
  function renderCard(group,moderationMode=false){
    const card=el('article','recommendationCard');
    const lead=group[0];
    const booksNow=books();
    const linked=booksNow.find(b=>normalize(b.title)===normalize(lead.title));
    const heading=el('h3','',lead.title);card.append(heading);
    const enriched=group.find(r=>r.coverUrl||r.author||r.publisher);
    if(enriched?.coverUrl&&safeURL(enriched.coverUrl)){
      const img=el('img','recommendationCover');img.alt=lead.title+' の参考書影';img.loading='lazy';
      img.src=enriched.coverUrl;img.onerror=()=>img.remove();card.append(img);
    }
    if(enriched?.author||enriched?.publisher)card.append(el('p','muted tiny',[enriched.author,enriched.publisher].filter(Boolean).join(' · ')));
    if(linked){
      card.append(el('span','recommendationTag',STATUSES[linked.status]||'本棚に登録済み'));
    }else card.append(el('span','recommendationTag','家族のおすすめ'));
    card.append(el('p','muted tiny',group.length+'人からのおすすめ'));
    for(const rec of group){
      const item=el('div','recommendationOpinion');
      item.append(el('strong','',who(rec.authorUid)+' · '+date(rec)));
      if(rec.reason)item.append(el('p','',rec.reason));
      if(rec.url&&safeURL(rec.url))item.append(link(rec.url,'本の紹介を見る ↗'));
      const actions=el('div','commentActions');
      const action=(label,work)=>{
        const btn=el('button','textAction',label);btn.type='button';
        btn.onclick=async()=>{btn.disabled=true;try{await work()}catch(e){notify(e)}finally{btn.disabled=false}};
        actions.append(btn);
      };
      if(rec.authorUid===user.uid&&!moderationMode){
        action('編集',async()=>{
          const edit=el('textarea','commentEdit');edit.maxLength=1000;edit.rows=2;edit.value=rec.reason;
          const address=el('input');address.type='url';address.maxLength=1500;address.value=rec.url||'';
          const save=el('button','primary','保存');save.type='button';
          const cancel=el('button','','やめる');cancel.type='button';
          cancel.onclick=()=>{edit.remove();address.remove();save.remove();cancel.remove()};
          save.onclick=async()=>{
            const next=address.value.trim();
            if(!safeURL(next)){status.textContent='紹介URLはHTTPSを指定してください';return}
            save.disabled=true;
            try{await mutate(rec,{reason:edit.value.trim(),url:next,updatedAt:serverTimestamp()})}
            catch(e){notify(e);save.disabled=false}
          };
          item.append(edit,address,save,cancel);edit.focus();
        });
        action('取り下げる',async()=>{
          if(!confirm('自分のおすすめを取り下げますか？'))return;
          const a=activityFor(rec.id),existing=await getDoc(a);
          const batch=writeBatch(db);batch.delete(doc(ref,rec.id));
          if(existing.exists())batch.delete(a);
          await batch.commit();
        });
      }
      if(owner)action(moderationMode?'表示を戻す':'非表示にする',async()=>{
        const a=activityFor(rec.id),existing=await getDoc(a);
        const batch=writeBatch(db);batch.update(doc(ref,rec.id),{hidden:!moderationMode});
        if(existing.exists())batch.update(a,{hidden:!moderationMode});
        await batch.commit();
      });
      item.append(actions);card.append(item);
    }
    return card;
  }
  function draw(){
    list.replaceChildren();
    const groups=new Map();
    for(const rec of visible){
      const key=normalize(rec.title);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(rec);
    }
    const rows=[...groups.values()].sort((a,b)=>Math.max(...b.map(stamp))-Math.max(...a.map(stamp)));
    if(!rows.length)list.append(el('p','empty','まだおすすめはありません。最初の1冊を紹介してみましょう。'));
    for(const row of rows){row.sort((a,b)=>stamp(b)-stamp(a));list.append(renderCard(row))}
    if(owner){
      moderation.replaceChildren(el('h3','','非表示にしたおすすめ'));
      const hidden=[...moderated].sort((a,b)=>stamp(b)-stamp(a));
      for(const rec of hidden)moderation.append(renderCard([rec],true));
      moderation.hidden=!hidden.length;
    }
  }
  const listen=(q,fn)=>{
    subscriptions.push(onSnapshot(q,snap=>{
      if(!active)return;
      fn(snap.docs.map(d=>({id:d.id,...d.data()})));draw();
    },e=>{if(active)notify(e)}));
  };
  listen(query(ref,where('hidden','==',false),limit(100)),a=>{visible=a});
  if(owner)listen(query(ref,where('hidden','==',true),limit(100)),a=>{moderated=a});
  compose.onsubmit=async event=>{
    event.preventDefault();
    const book=title.value.trim(),web=url.value.trim(),why=reason.value.trim();
    if(!book||!safeURL(web)){status.textContent='本のタイトルとHTTPSの紹介URLを確認してください';return}
    if(visible.some(x=>x.authorUid===user.uid&&normalize(x.title)===normalize(book))){
      status.textContent='この本はすでにおすすめしています';return;
    }
    submit.disabled=true;status.textContent='';
    try{
      const recRef=doc(ref);
      const confirmed=selected?.queryTitle===book?selected:null;
      const patch=confirmed?{
        author:confirmed.author,publisher:confirmed.publisher,
        publishedDate:confirmed.publishedDate,isbn:confirmed.isbn,
        coverUrl:confirmed.coverUrl,metadataSource:confirmed.sourceUrl
      }:{};
      const batch=writeBatch(db);
      batch.set(recRef,{authorUid:user.uid,title:book,normalizedTitle:normalize(book),
        reason:why,url:web,hidden:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),...patch});
      batch.set(activityFor(recRef.id),{actorUid:user.uid,kind:'recommendation',title:book,
        bookId:'',sourceId:recRef.id,hidden:false,createdAt:serverTimestamp()});
      await batch.commit();
      title.value=url.value=reason.value='';resetSelection();
      status.textContent='おすすめを追加しました';
    }catch(e){notify(e)}finally{if(active)submit.disabled=false}
  };
  return ()=>{
    active=false;for(const unsub of subscriptions)unsub();
    compose.onsubmit=null;
  };
}
