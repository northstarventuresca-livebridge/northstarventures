import test from 'node:test';
import assert from 'node:assert/strict';
import { handleCardAccessRequest } from '../card-access.js';

function fakeRegistry() {
 const values=new Map();
 return {
   async get(key) { const value=values.get(key); return value?JSON.parse(value):null; },
   async put(key,value){values.set(key,value);},
   async list({prefix}) {return {keys:[...values.keys()].filter(k=>k.startsWith(prefix)).map(name=>({name})),list_complete:true};}
 };
}
const base='https://northstarventures.ca';
function request(path,method='GET',body,origin=base) {
 const headers=method==='GET'?{}:{Origin:origin,'content-type':'application/json'};
 return new Request(base+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})});
}
async function route(request,registry,authorized=true) {
 return handleCardAccessRequest(request,{REGISTRY:registry},new URL(request.url),async()=>authorized);
}
test('admin card API rejects unauthenticated requests and cross-origin mutations',async()=>{
 const kv=fakeRegistry();
 let response=await route(request('/api/admin/access-cards'),kv,false);
 assert.equal(response.status,401);
 response=await route(request('/api/admin/access-cards','POST',{label:'A',owner:'B',tapbin_email:'a@example.com',apps:['tapbin']},'https://evil.example'),kv);
 assert.equal(response.status,403);
});
test('create TapBin-only card, public landing, suspend and revoke without account login',async()=>{
 const kv=fakeRegistry();
 const payload={label:'Pilot',owner:'Customer',tapbin_email:'customer@example.com',apps:['tapbin']};
 const created=await route(request('/api/admin/access-cards','POST',payload),kv);
 assert.equal(created.status,201);
 const {card}=await created.json();
 assert.match(card.program_url,/^https:\/\/northstarventures\.ca\/access\/[a-f0-9]{32}$/);
 const landing=await route(request('/access/'+card.id),kv);
 assert.equal(landing.status,200);
 const page=await landing.text();
 assert.ok(page.includes('TapBin'));
 assert.ok(!page.includes('customer@example.com'),'public card route must not leak account identity');
 assert.ok(!page.includes('nsorg_session'),'card must not create TapBin sessions');
 const list=await route(request('/api/admin/access-cards'),kv);
 assert.equal((await list.json()).cards.length,1);
 let result=await route(request('/api/admin/access-cards/'+card.id,'PATCH',{status:'suspended'}),kv);
 assert.equal(result.status,200);
 assert.equal((await route(request('/access/'+card.id),kv)).status,404);
 result=await route(request('/api/admin/access-cards/'+card.id,'DELETE'),kv);
 assert.equal(result.status,200);
 assert.equal((await route(request('/access/'+card.id),kv)).status,404);
});
test('reject unsupported apps and invalid email',async()=>{
 const kv=fakeRegistry();
 const baseCard={label:'Pilot',owner:'Customer',tapbin_email:'customer@example.com'};
 assert.equal((await route(request('/api/admin/access-cards','POST',{...baseCard,apps:['tapbin','hoh']}),kv)).status,400);
 assert.equal((await route(request('/api/admin/access-cards','POST',{...baseCard,tapbin_email:'bad',apps:['tapbin']}),kv)).status,400);
});
