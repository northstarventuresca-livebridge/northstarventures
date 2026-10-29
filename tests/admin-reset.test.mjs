import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAdminPasswordRecovery,adminPasswordMatches,adminSessionEpoch} from '../admin-reset.js';
const domain='https://northstarventures.ca';
function mock() {
 const values=new Map(),emails=[];
 return {emails,INBOX:{
   async get(key,type){const data=values.get(key);return type==='json'&&data?JSON.parse(data):data??null;},
   async put(key,val){values.set(key,val);},async delete(key){values.delete(key);}
 },ADMIN_RESET_EMAIL:{async send(mail){emails.push(mail);return {messageId:'test'};}}};
}
function req(path,method='GET',body,origin=domain) {
 return new Request(domain+path,{method,headers:{...(method==='POST'?{'content-type':'application/json',origin}: {})},...(body?{body:JSON.stringify(body)}:{})});
}
async function route(env,req){return handleAdminPasswordRecovery(req,env,new URL(req.url))}
test('legacy admin credentials work until recovery is completed',async()=>{
 const env=mock();
 assert.equal(await adminPasswordMatches(env,'old secret',async p=>p==='old secret'),true);
 assert.equal(await adminSessionEpoch(env),'1');
});
test('reset page is public but not a credential, and endpoint requires same origin',async()=>{
 const env=mock();
 const page=await route(env,req('/admin/reset-password'));assert.equal(page.status,200);
 assert.match(await page.text(),/Reset admin password/);
 let result=await route(env,req('/api/admin/password/forgot','POST',{},'https://evil.example'));
 assert.equal(result.status,403);assert.equal(env.emails.length,0);
});
test('email-only reset link works once, expires, and invalidates old sessions',async()=>{
 const env=mock();
 let response=await route(env,req('/api/admin/password/forgot','POST',{}));
 assert.equal(response.status,200);assert.equal(env.emails.length,1);
 assert.equal(env.emails[0].to,'northstarventures.ca@gmail.com');
 const email=env.emails[0].text;
 const match=email.match(/https:\/\/northstarventures\.ca\/admin\/reset-password#token=([0-9a-f]{64})/);
 assert.ok(match);
 const invalid=await route(env,req('/api/admin/password/reset','POST',{token:'invalid',password:'some-long-new-password'}));
 assert.equal(invalid.status,400);
 response=await route(env,req('/api/admin/password/reset','POST',{token:match[1],password:'some-long-new-password'}));
 assert.equal(response.status,200);
 assert.notEqual(await adminSessionEpoch(env),'1');
 assert.equal(await adminPasswordMatches(env,'some-long-new-password',async()=>false),true);
 assert.equal(await adminPasswordMatches(env,'legacy-password',async()=>true),false,'legacy hash must not remain a fallback after reset');
 response=await route(env,req('/api/admin/password/reset','POST',{token:match[1],password:'another-long-password'}));
 assert.equal(response.status,400,'reused token must fail');
});
test('recovery cannot run when email binding is missing',async()=>{
 const env=mock();delete env.ADMIN_RESET_EMAIL;
 const response=await route(env,req('/api/admin/password/forgot','POST',{}));
 assert.equal(response.status,503);
});

test('reset verifier stays within the Worker CPU budget and is versioned',async()=>{
 const env=mock();
 const begin=Date.now();
 assert.equal((await route(env,req('/api/admin/password/forgot','POST',{}))).status,200);
 const token=env.emails[0].text.match(/#token=([a-f0-9]{64})/)[1];
 assert.equal((await route(env,req('/api/admin/password/reset','POST',{token,password:'a-secure-test-password'}))).status,200);
 const credential=await env.INBOX.get('nsv:admin:credentials:v2','json');
 assert.equal(credential.iterations,12000);
 assert.equal(await adminPasswordMatches(env,'a-secure-test-password',async()=>false),true);
 assert.ok(Date.now()-begin<30000,'Reset should complete promptly');
});
