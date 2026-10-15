import {collection,doc,onSnapshot,query,where,limit,setDoc,updateDoc,deleteDoc,getDoc,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

const elem=(tag,className='',text='')=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(text)node.textContent=text;
  return node;
};
const newest=(a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0);
const formatted=stamp=>stamp?.toDate?.()?.toLocaleDateString('ja-JP')||'投稿中';
const clean=value=>String(value||'').trim();
const sayError=(onError,e)=>{if(onError)onError(e);else console.error(e)};

export function mountBookCommunity({db,fid,book,user,owner,members,container,onError}){
  let stopped=false;
  const unsubs=[];
  const base=['families',fid,'books',book.id];
  const comments=collection(db,...base,'comments');
  const activity=collection(db,'families',fid,'activity');
  const activityFor=id=>doc(activity,'comment-'+id);
  const likes=collection(db,...base,'reactions');
  const requests=collection(db,...base,'requests');
  const reflections=collection(db,...base,'childReflections');
  const displayName=uid=>{
    if(uid===user.uid)return '自分';
    const member=members().find(m=>m.uid===uid);
    return member?.displayName||'家族';
  };
  const section=elem('section','community');
  const title=elem('h3','communityHeading','本を囲む家族の声');
  section.append(title);

  const reflectionBox=elem('div','communityPanel');
  reflectionBox.append(elem('h4','','子どもの感想'));
  const reflectionItems=elem('div','communityStack');
  reflectionItems.append(elem('p','muted tiny','まだ記録されていません。子どもの感想は管理者が記録します。'));
  reflectionBox.append(reflectionItems);
  section.append(reflectionBox);

  const reactionBox=elem('div','communityReactions');
  const likeButton=elem('button','reactionButton','♡ いいね');
  const askButton=elem('button','reactionButton','感想をききたい');
  likeButton.type=askButton.type='button';
  reactionBox.append(likeButton,askButton);
  section.append(reactionBox);

  const commentBox=elem('div','communityPanel');
  commentBox.append(elem('h4','','家族のコメント'));
  const commentItems=elem('div','communityStack');
  commentItems.append(elem('p','muted tiny','まだコメントはありません。'));
  commentBox.append(commentItems);
  const form=elem('form','commentCompose');
  const input=elem('textarea');input.rows=2;input.maxLength=2000;
  input.placeholder='本について家族にひとこと…';
  input.setAttribute('aria-label','コメントを入力');
  const submit=elem('button','primary','投稿する');submit.type='submit';
  form.append(input,submit);commentBox.append(form);
  const moderatedItems=elem('div','communityStack');
  if(owner){
    const moderatedTitle=elem('h4','','非表示にしたコメント');
    moderatedTitle.className='moderatedHeading';
    commentBox.append(moderatedTitle,moderatedItems);
    moderatedTitle.hidden=true;moderatedItems.hidden=true;
    // Only show moderation tools when there is moderated content.
    unsubs.push(()=>{moderatedTitle.hidden=true;moderatedItems.hidden=true});
  }
  section.append(commentBox);
  container.append(section);

  const subscribe=(ref,callback)=>{
    const unsubscribe=onSnapshot(ref,snapshot=>{
      if(!stopped)callback(snapshot.docs.map(d=>({id:d.id,...d.data()})));
    },e=>{if(!stopped)sayError(onError,e)});
    unsubs.push(unsubscribe);
  };
  subscribe(query(reflections,limit(30)),list=>{
    reflectionItems.replaceChildren();
    if(!list.length){reflectionItems.append(elem('p','muted tiny','まだ記録されていません。子どもの感想は管理者が記録します。'));return}
    for(const entry of list.sort(newest)){
      const card=elem('article','reflectionCard');
      card.append(elem('p','reflectionQuote',entry.quote||entry.text||''));
      const label=entry.attribution==='verbatim'?'本人の言葉':'親による要約・観察';
      card.append(elem('p','muted tiny',label+(entry.observedAt?' · '+entry.observedAt:'')));
      reflectionItems.append(card);
    }
  });

  const renderToggle=(button,list,verb)=>{
    const mine=list.some(x=>x.uid===user.uid);
    button.classList.toggle('selected',mine);
    button.setAttribute('aria-pressed',String(mine));
    button.textContent=(verb==='like'?'♡ いいね':'感想をききたい')+' · '+list.length+(mine?' ✓':'');
    button.onclick=async()=>{
      button.disabled=true;
      try{
        const key=doc(db,...base,verb==='like'?'reactions':'requests',user.uid);
        if(mine)await deleteDoc(key);
        else await setDoc(key,{uid:user.uid,kind:verb==='like'?'like':'ask-reflection',createdAt:serverTimestamp()});
      }catch(e){sayError(onError,e)}finally{if(!stopped)button.disabled=false}
    };
  };
  subscribe(query(likes,limit(100)),list=>renderToggle(likeButton,list,'like'));
  subscribe(query(requests,limit(100)),list=>renderToggle(askButton,list,'request'));

  function drawComments(whereTo,list,isModerated=false){
    whereTo.replaceChildren();
    if(!list.length&&!isModerated){whereTo.append(elem('p','muted tiny','まだコメントはありません。'));return}
    for(const item of list.sort(newest)){
      const card=elem('article','commentItem');
      const head=elem('div','commentHead');
      head.append(elem('strong','',displayName(item.authorUid)),elem('span','muted tiny',formatted(item.createdAt)));
      const message=elem('p','commentText',item.body);
      card.append(head,message);
      const actions=elem('div','commentActions');
      const own=item.authorUid===user.uid;
      const action=(text,fn)=>{
        const button=elem('button','textAction',text);button.type='button';
        button.onclick=async()=>{button.disabled=true;try{await fn()}catch(e){sayError(onError,e)}finally{button.disabled=false}};
        actions.append(button);
      };
      if(own&&!isModerated){
        action('編集',async()=>{
          const editor=elem('textarea','commentEdit');editor.rows=3;editor.maxLength=2000;
          editor.value=item.body;
          const save=elem('button','primary','保存');save.type='button';
          const cancel=elem('button','','やめる');cancel.type='button';
          cancel.onclick=()=>{editor.remove();save.remove();cancel.remove();message.hidden=false};
          save.onclick=async()=>{
            const body=clean(editor.value);
            if(!body||body.length>2000)return;
            save.disabled=true;
            try{
              await updateDoc(doc(comments,item.id),{body,updatedAt:serverTimestamp()});
            }catch(e){sayError(onError,e);save.disabled=false}
          };
          message.hidden=true;message.after(editor,save,cancel);editor.focus();
        });
        action('削除',async()=>{
          if(!confirm('自分のコメントを削除しますか？'))return;
          const activityRef=activityFor(item.id);
          const record=await getDoc(activityRef);
          const batch=writeBatch(db);
          batch.delete(doc(comments,item.id));
          if(record.exists())batch.delete(activityRef);
          await batch.commit();
        });
      }
      if(owner)action(isModerated?'表示を戻す':'非表示にする',async()=>{
        const activityRef=activityFor(item.id);
        const present=await getDoc(activityRef);
        const batch=writeBatch(db);
        batch.update(doc(comments,item.id),{hidden:!isModerated});
        if(present.exists())batch.update(activityRef,{hidden:!isModerated});
        await batch.commit();
      });
      card.append(actions);whereTo.append(card);
    }
  }
  subscribe(query(comments,where('hidden','==',false),limit(40)),list=>drawComments(commentItems,list));

  if(owner){
    const heading=commentBox.querySelector('.moderatedHeading');
    subscribe(query(comments,where('hidden','==',true),limit(40)),list=>{
      heading.hidden=!list.length;
      moderatedItems.hidden=!list.length;
      drawComments(moderatedItems,list,true);
    });
  }
  form.onsubmit=async event=>{
    event.preventDefault();
    const body=clean(input.value);
    if(!body||body.length>2000)return;
    submit.disabled=true;
    try{
      const ref=doc(comments);
      const batch=writeBatch(db);
      batch.set(ref,{authorUid:user.uid,body,createdAt:serverTimestamp(),
        updatedAt:serverTimestamp(),hidden:false});
      batch.set(activityFor(ref.id),{actorUid:user.uid,kind:'comment',
        title:book.title,bookId:book.id,sourceId:ref.id,hidden:false,createdAt:serverTimestamp()});
      await batch.commit();
      input.value='';
    }catch(e){sayError(onError,e)}finally{if(!stopped)submit.disabled=false}
  };
  return ()=>{
    stopped=true;
    for(const unsubscribe of unsubs)unsubscribe();
    form.onsubmit=null;
    likeButton.onclick=askButton.onclick=null;
  };
}
