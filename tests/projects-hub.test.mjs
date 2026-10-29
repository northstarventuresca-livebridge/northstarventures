import test from 'node:test';
import assert from 'node:assert/strict';
import {handleProjects} from '../projects-hub.js';
function kv(){
 const map=new Map();
 return {map,async get(k,format){const value=map.get(k);return value===undefined?null:format==='json'?JSON.parse(value):value},
 async put(k,v){map.set(k,v)},async list({prefix}){return {keys:[...map.keys()].filter(k=>k.startsWith(prefix)).sort().map(name=>({name})),list_complete:true}}};
}
const root='https://northstarventures.ca';
function request(path,method='GET',body={},origin=root){
 const headers=method==='GET'?{}:{'content-type':'application/json',origin};
 return new Request(root+path,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(body)})});
}
async function route(req,store,authorized=true){return handleProjects(req,{REGISTRY:store},new URL(req.url),async()=>authorized)}
test('private catalog seeds user-listed portfolio without exposing it to public users',async()=>{
 const store=kv();let r=await route(request('/api/admin/projects'),store,false);
 assert.equal(r.status,401);assert.equal(store.map.size,0);
 r=await route(request('/api/admin/projects'),store,true);
 assert.equal(r.status,200);
 const data=await r.json();
 const names=data.projects.map(p=>p.name);
 for(const name of ['Great Church Website','Healing the Heart Website','Home of Hope — HOH Platform','Home of Hope — HOHS Website','TapBin','LiveBridge','Website Studio & Client Builder',"Monica's House — Renovation Tracker",'X32 AI Audio Engineer (Auto AI)','Spectra Sensing Lab','MTI Database Project','ProPresenter Files Project','BrainDump'])assert.ok(names.includes(name),name);
 assert.ok(data.projects.length>=26);
 assert.equal(data.projects.find(p=>p.name==='TapBin').website,'https://tapbin.ca/');
 assert.equal(data.projects.find(p=>p.name==='Spectra Sensing Lab').website,'');
 const repeat=await route(request('/api/admin/projects'),store);
 assert.equal((await repeat.json()).projects.length,data.projects.length);
});
test('new projects can be created, edited and archived; valid links required',async()=>{
 const store=kv();
 let r=await route(request('/api/admin/projects','POST',{name:'New Studio App',category:'Internal Tools',status:'Planning',website:'https://example.com/',next_action:'Sketch launch plan',pinned:true}),store);
 assert.equal(r.status,201);let doc=(await r.json()).project;
 assert.match(doc.id,/^[a-f0-9]{32}$/);
 assert.equal(doc.website,'https://example.com/');
 r=await route(request('/api/admin/projects/'+doc.id,'PATCH',{status:'Building',notes:'Specs in design',priority:'Focus'}),store);
 assert.equal(r.status,200);doc=(await r.json()).project;
 assert.equal(doc.notes,'Specs in design');
 assert.equal(doc.name,'New Studio App');
 assert.equal(doc.priority,'Focus');
 r=await route(request('/api/admin/projects/'+doc.id,'DELETE',{}),store);
 assert.equal(r.status,200);assert.equal((await r.json()).project.status,'Archived');
 r=await route(request('/api/admin/projects/'+doc.id,'PATCH',{status:'Building'}),store);
 assert.equal(r.status,200);assert.equal((await r.json()).project.status,'Building');
});
test('write access prevents cross-site requests and javascript links',async()=>{
 const store=kv();
 let r=await route(request('/api/admin/projects','POST',{name:'Abc'},'https://hostile.test'),store);
 assert.equal(r.status,403);
 r=await route(request('/api/admin/projects','POST',{name:'Abc',website:'javascript:alert(1)'}),store);
 assert.equal(r.status,400);
 r=await route(request('/api/admin/projects','POST',{name:'Abc',reference:'http://localhost/admin'}),store);
 assert.equal(r.status,400);
 r=await route(request('/api/admin/projects','POST',{name:'Abc'}),store,false);
 assert.equal(r.status,401);
});
