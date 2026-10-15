import {readFileSync} from 'node:fs';
import test,{after} from 'node:test';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,collection,getDoc,getDocs,setDoc,updateDoc,deleteDoc,Timestamp,serverTimestamp,query,where} from 'firebase/firestore';

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
