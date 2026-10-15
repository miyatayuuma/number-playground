import {readFileSync} from 'node:fs';
import test,{after} from 'node:test';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,Timestamp,serverTimestamp,query,where,orderBy,limit,writeBatch} from 'firebase/firestore';

const env=await initializeTestEnvironment({
  projectId:'demo-reading-shelf-rules',
  firestore:{host:'127.0.0.1',port:8080,rules:readFileSync(new URL('./firestore.rules',import.meta.url),'utf8')}
});
after(async()=>{await env.cleanup()});
const path=(...xs)=>['families','familyOne',...xs];
const user=(uid,email)=>env.authenticatedContext(uid,{email,email_verified:true}).firestore();
const anonymous=env.unauthenticatedContext().firestore();

await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,'families','familyOne'),{ownerUid:'owner1',name:'Test Family',schemaVersion:1,createdAt:Timestamp.now()});
  await setDoc(doc(db,...path('members','owner1')),{uid:'owner1',email:'owner@gmail.com',displayName:'Owner',role:'owner',joinedAt:Timestamp.now()});
  await setDoc(doc(db,...path('invites','viewer@gmail.com')),{email:'viewer@gmail.com',role:'viewer',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
  await setDoc(doc(db,...path('invites','editor@gmail.com')),{email:'editor@gmail.com',role:'editor',expiresAt:Timestamp.fromMillis(Date.now()+86400000)});
  await setDoc(doc(db,...path('books','book1')),{id:'book1',title:'赤毛のアン',status:'read'});
  await setDoc(doc(db,...path('members','relative2')),{uid:'relative2',email:'relative2@gmail.com',displayName:'Relative 2',role:'viewer',joinedAt:Timestamp.now()});
});

test('anonymous and uninvited users cannot view a family book',async()=>{
  await assertFails(getDoc(doc(anonymous,...path('books','book1'))));
  await assertFails(getDoc(doc(user('stranger','stranger@gmail.com'),...path('books','book1'))));
  await assertFails(getDoc(doc(user('stranger','stranger@gmail.com'),...path('invites','viewer@gmail.com'))));
});
test('owner can view books but cannot edit from a browser',async()=>{
  const db=user('owner1','owner@gmail.com');
  await assertSucceeds(getDoc(doc(db,...path('books','book1'))));
  await assertFails(setDoc(doc(db,...path('books','book2')),{id:'book2',title:'猫と王さま',status:'read'}));
  await assertFails(deleteDoc(doc(db,...path('books','book1'))));
  await assertFails(setDoc(doc(db,...path('series','new-series')),{id:'new-series',name:'追加シリーズ'}));
});
test('invitation email must match actual signed-in Google email',async()=>{
  await assertFails(setDoc(doc(user('evil','evil@gmail.com'),...path('members','evil')),{uid:'evil',email:'evil@gmail.com',displayName:'Evil',role:'viewer',joinedAt:Timestamp.now()}));
  await assertFails(setDoc(doc(user('viewer1','viewer@gmail.com'),...path('members','viewer1')),{uid:'viewer1',email:'viewer@gmail.com',displayName:'Viewer',role:'owner',joinedAt:Timestamp.now()}));
});
test('invited viewer can join but cannot write books or self-escalate',async()=>{
  const db=user('viewer1','viewer@gmail.com');
  await assertSucceeds(getDoc(doc(db,...path('invites','viewer@gmail.com'))));
  await assertSucceeds(setDoc(doc(db,...path('members','viewer1')),{uid:'viewer1',email:'viewer@gmail.com',displayName:'Viewer',role:'viewer',joinedAt:Timestamp.now()}));
  await assertSucceeds(getDoc(doc(db,...path('books','book1'))));
  await assertFails(setDoc(doc(db,...path('books','wrong')),{id:'wrong',title:'No write',status:'read'}));
  await assertFails(setDoc(doc(db,...path('members','viewer1')),{uid:'viewer1',email:'viewer@gmail.com',displayName:'Viewer',role:'owner',joinedAt:Timestamp.now()}));
});
test('old editor membership is also read-only for books',async()=>{
  const db=user('editor1','editor@gmail.com');
  await assertSucceeds(setDoc(doc(db,...path('members','editor1')),{uid:'editor1',email:'editor@gmail.com',displayName:'Editor',role:'editor',joinedAt:Timestamp.now()}));
  await assertFails(setDoc(doc(db,...path('books','book3')),{id:'book3',title:'新しい本',status:'read'}));
  await assertFails(setDoc(doc(db,...path('invites','outsider@gmail.com')),{email:'outsider@gmail.com',role:'editor',expiresAt:Timestamp.fromMillis(Date.now()+86400000)}));
});
test('revocation denies subsequent remote reads',async()=>{
  const o=user('owner1','owner@gmail.com');
  await assertSucceeds(deleteDoc(doc(o,...path('members','viewer1'))));
  await assertFails(getDoc(doc(user('viewer1','viewer@gmail.com'),...path('books','book1'))));
});

test('family members can comment but cannot impersonate other authors',async()=>{
  const member=user('relative2','relative2@gmail.com');
  const other=user('stranger','stranger@gmail.com');
  const ref=doc(member,...path('books','book1','comments','commentA'));
  const content={authorUid:'relative2',body:'この本、また読んでほしい',hidden:false,
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  await assertFails(setDoc(doc(other,...path('books','book1','comments','bad')),content));
  await assertFails(setDoc(ref,{...content,authorUid:'owner1'}));
  await assertSucceeds(setDoc(ref,content));
  await assertSucceeds(getDoc(ref));
  await assertFails(updateDoc(doc(user('owner1','owner@gmail.com'),...path('books','book1','comments','commentA')),{body:'改ざん',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(ref,{body:'もう一度読みたい',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ref,{authorUid:'owner1'}));
  await assertFails(setDoc(doc(member,...path('books','book1','childReflections','child01')),
    {quote:'実際には言っていない'}));
});
test('owner may moderate but not impersonate family; hidden content is excluded',async()=>{
  const owner=user('owner1','owner@gmail.com');
  const member=user('relative2','relative2@gmail.com');
  const ref=doc(owner,...path('books','book1','comments','commentA'));
  await assertSucceeds(updateDoc(ref,{hidden:true}));
  await assertFails(updateDoc(doc(member,...path('books','book1','comments','commentA')),{hidden:false}));
  await assertFails(getDoc(doc(user('stranger','stranger@gmail.com'),...path('books','book1','comments','commentA'))));
  const visible=query(collection(member,...path('books','book1','comments')),where('hidden','==',false));
  await assertSucceeds(getDocs(visible));
  await assertSucceeds(updateDoc(ref,{hidden:false}));
  await assertSucceeds(getDocs(visible));
});
test('reactions and reflection requests are owned by the authenticated family member',async()=>{
  const member=user('relative2','relative2@gmail.com');
  for(const [bucket,kind] of [['reactions','like'],['requests','ask-reflection']]){
    const ref=doc(member,...path('books','book1',bucket,'relative2'));
    await assertSucceeds(setDoc(ref,{uid:'relative2',kind,createdAt:serverTimestamp()}));
    await assertFails(setDoc(doc(user('owner1','owner@gmail.com'),...path('books','book1',bucket,'relative2')),
      {uid:'relative2',kind,createdAt:serverTimestamp()}));
    await assertFails(updateDoc(ref,{kind:'hack'}));
    await assertSucceeds(deleteDoc(ref));
  }
});

test('recommendations permit family sharing but prohibit impersonation and catalog writes',async()=>{
  const relative=user('relative2','relative2@gmail.com');
  const outsider=user('stranger','stranger@gmail.com');
  const owner=user('owner1','owner@gmail.com');
  const pathTo=['families','familyOne','recommendations','recommend1'];
  const value={authorUid:'relative2',title:'ねこと王さま',normalizedTitle:'ねこと王さま',
    reason:'絵が気に入った',url:'https://example.com/book',hidden:false,
    createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  await assertFails(setDoc(doc(outsider,...pathTo),value));
  await assertFails(setDoc(doc(relative,...pathTo),{...value,authorUid:'owner1'}));
  await assertFails(setDoc(doc(relative,...pathTo),{...value,url:'javascript:alert(1)'}));
  await assertSucceeds(setDoc(doc(relative,...pathTo),value));
  await assertSucceeds(getDoc(doc(relative,...pathTo)));
  await assertFails(updateDoc(doc(owner,...pathTo),{reason:'勝手に改ざん',updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(relative,...pathTo),{title:'別の本'}));
  await assertSucceeds(updateDoc(doc(relative,...pathTo),{reason:'一緒に読みたい',updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(doc(owner,...pathTo),{hidden:true}));
  const visible=query(collection(relative,'families','familyOne','recommendations'),where('hidden','==',false));
  await assertSucceeds(getDocs(visible));
  await assertSucceeds(updateDoc(doc(owner,...pathTo),{hidden:false}));
  await assertSucceeds(deleteDoc(doc(relative,...pathTo)));
});


test('book lookup metadata is optional; unsafe covers and unexpected fields are rejected',async()=>{
  const family=user('relative2','relative2@gmail.com');
  const record={authorUid:'relative2',title:'あたらしい本',normalizedTitle:'あたらしい本',
    reason:'おすすめ',url:'',hidden:false,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  const reference=doc(family,...path('recommendations','with-metadata'));
  await assertSucceeds(setDoc(reference,{...record,
    author:'作家',publisher:'出版社',publishedDate:'2021-09',
    isbn:'9784198650032',coverUrl:'https://books.google.com/books/content?id=book',
    metadataSource:'https://books.google.com/books?id=book'}));
  await assertFails(setDoc(doc(family,...path('recommendations','bad-cover')),
    {...record,coverUrl:'javascript:alert(1)'}));
  await assertFails(setDoc(doc(family,...path('recommendations','unexpected')),
    {...record,privateEmail:'example@private.test'}));
});
test('only authenticated family may publish metadata-only activity',async()=>{
  const family=user('relative2','relative2@gmail.com');
  const stranger=user('stranger','stranger@gmail.com');
  const data={actorUid:'relative2',kind:'comment',title:'ねこと王さま',
    bookId:'book1',sourceId:'comment-new',hidden:false,createdAt:serverTimestamp()};
  await assertFails(setDoc(doc(stranger,...path('activity','bad')),data));
  await assertFails(setDoc(doc(family,...path('activity','spoof')),{...data,actorUid:'owner1'}));
  await assertFails(setDoc(doc(family,...path('activity','body')),{...data,body:'子どもの感想全文'}));
  await assertSucceeds(setDoc(doc(family,...path('activity','activity1')),data));
  const stream=query(collection(family,...path('activity')),orderBy('createdAt','desc'),limit(10));
  await assertSucceeds(getDocs(stream));
  await assertFails(updateDoc(doc(family,...path('activity','activity1')),{hidden:true}));
  await assertSucceeds(updateDoc(doc(user('owner1','owner@gmail.com'),...path('activity','activity1')),{hidden:true}));
  await assertSucceeds(deleteDoc(doc(family,...path('activity','activity1'))));
});
test('community comment plus activity can be committed in one atomic batch',async()=>{
  const family=user('relative2','relative2@gmail.com');
  const batch=writeBatch(family);
  batch.set(doc(family,...path('books','book1','comments','new-comment')),{
    authorUid:'relative2',body:'大好きな本です',createdAt:serverTimestamp(),
    updatedAt:serverTimestamp(),hidden:false
  });
  batch.set(doc(family,...path('activity','comment-new-comment')),{
    actorUid:'relative2',kind:'comment',title:'ねこと王さま',
    bookId:'book1',sourceId:'new-comment',hidden:false,createdAt:serverTimestamp()
  });
  await assertSucceeds(batch.commit());
});
