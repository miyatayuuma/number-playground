import {readFileSync} from 'node:fs';
import test,{after} from 'node:test';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,deleteDoc,Timestamp} from 'firebase/firestore';

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
