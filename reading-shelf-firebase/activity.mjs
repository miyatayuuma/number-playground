import {collection,query,orderBy,limit,onSnapshot} from 'https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js';

export function mountFamilyActivity({db,fid,container,members,onBook,onRecommendations,onError}){
  const root=document.createElement('section');root.className='familyActivity';
  const heading=document.createElement('h2');heading.textContent='家族の最近の活動';
  const list=document.createElement('div');list.className='familyActivityList';
  root.append(heading,list);container.append(root);
  let active=true;
  const entries=collection(db,'families',fid,'activity');
  const stop=onSnapshot(query(entries,orderBy('createdAt','desc'),limit(15)),snapshot=>{
    if(!active)return;
    list.replaceChildren();
    const rows=snapshot.docs.map(d=>d.data()).filter(item=>!item.hidden).slice(0,5);
    if(!rows.length){
      const empty=document.createElement('p');empty.className='muted tiny';
      empty.textContent='これからの家族コメントやおすすめをここに表示します。';
      list.append(empty);
      return;
    }
    for(const item of rows){
      const who=members().find(m=>m.uid===item.actorUid)?.displayName||'家族';
      const button=document.createElement('button');button.type='button';button.className='activityItem';
      const lead=document.createElement('span');lead.className='activityTitle';
      lead.textContent=who+(item.kind==='recommendation'?'がおすすめしました':'がコメントしました');
      const book=document.createElement('span');book.className='activityBook';
      book.textContent=item.title;
      const date=document.createElement('span');date.className='muted tiny';
      date.textContent=item.createdAt?.toDate?.()?.toLocaleDateString('ja-JP')||'';
      button.append(lead,book,date);
      button.onclick=()=>item.kind==='recommendation'?onRecommendations():onBook(item.bookId);
      list.append(button);
    }
  },error=>{if(active)onError?.(error)});
  return ()=>{active=false;stop();root.remove()};
}
