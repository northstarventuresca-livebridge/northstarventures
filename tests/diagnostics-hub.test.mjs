import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { handleDiagnostics } from "../diagnostics-hub.js";
import { DIAGNOSTICS_WIDGET } from "../diagnostics-hub-ui.js";
const origin="https://northstarventures.ca";
function kv(){
 const map=new Map();
 return {async get(key,format){const x=map.get(key);return x==null?null:format==="json"?JSON.parse(x):x;},
 async put(key,value){map.set(key,value);},
 async list({prefix}){return {keys:[...map.keys()].filter(x=>x.startsWith(prefix)).map(name=>({name})),list_complete:true}}};
}
const project=(id,name)=>({id,name,category:"Internal Tools",other:false});
async function setup(){
 const REGISTRY=kv(),INBOX=kv();
 await REGISTRY.put("nsv:project-hub:v1:seed-07",JSON.stringify(project("seed-07","North Star Ventures Website")));
 await REGISTRY.put("nsv:project-hub:v1:seed-06",JSON.stringify(project("seed-06","LiveBridge")));
 await REGISTRY.put("nsv:project-hub:v1:seed-10",JSON.stringify(project("seed-10","X32 AI Engineer")));
 return {REGISTRY,INBOX};
}
function request(path,method="GET",from=origin){
 return new Request(origin+path,{method,headers:method==="POST"?{origin:from}:{}});
}
const handler=(req,env,authorized=true,fetchImpl=async()=>({status:200}))=>
 handleDiagnostics(req,env,new URL(req.url),async()=>authorized,{fetchImpl});

test("unauthorized access denied even for read-only report list",async()=>{
 const env=await setup();
 assert.equal((await handler(request("/api/admin/diagnostics"),env,false)).status,401);
 assert.equal((await handler(request("/api/admin/diagnostics/seed-07/run","POST"),env,false)).status,401);
});
test("project catalog includes separate configurations and unconfigured hardware projects",async()=>{
 const env=await setup();
 const r=await handler(request("/api/admin/diagnostics"),env);
 const rows=(await r.json()).projects;
 assert.equal(rows.find(p=>p.id==="seed-07").configured,true);
 assert.equal(rows.find(p=>p.id==="seed-10").configured,false);
 assert.equal(rows.every(p=>!p.latest),true);
});
test("run writes only its own report namespace and preserves separate history",async()=>{
 const env=await setup(),urls=[];
 const fetchImpl=async url=>{urls.push(url);return {status:url.includes("livebridge")?503:200}};
 let r=await handler(request("/api/admin/diagnostics/seed-07/run","POST"),env,true,fetchImpl);
 assert.equal(r.status,200);
 assert.equal((await r.json()).report.status,"passed");
 r=await handler(request("/api/admin/diagnostics/seed-06/run","POST"),env,true,fetchImpl);
 assert.equal((await r.json()).report.status,"failed");
 const one=await handler(request("/api/admin/diagnostics/seed-07"),env);
 const two=await handler(request("/api/admin/diagnostics/seed-06"),env);
 assert.equal((await one.json()).latest.status,"passed");
 assert.equal((await two.json()).latest.status,"failed");
 assert.equal(urls.length,3);
});
test("unsafe origins and unconfigured tests cannot run",async()=>{
 const env=await setup();
 assert.equal((await handler(request("/api/admin/diagnostics/seed-07/run","POST","https://evil.test"),env)).status,403);
 assert.equal((await handler(request("/api/admin/diagnostics/seed-10/run","POST"),env)).status,409);
 assert.equal(await handler(request("/api/admin/diagnostics/unknown/run","POST"),env),null);
});
test("network failures produce sanitized details; no leaked exception text",async()=>{
 const env=await setup();
 const r=await handler(request("/api/admin/diagnostics/seed-07/run","POST"),env,true,async()=>{throw Error("secret=abc")});
 const data=await r.json();
 assert.equal(data.report.status,"failed");
 assert.doesNotMatch(JSON.stringify(data),/secret=abc/);
});
test("diagnostic UI is valid script with project actions and no invented outcomes",()=>{
 const match=DIAGNOSTICS_WIDGET.match(/<script[^>]*>([\s\S]*?)<\/script>/);
 assert.ok(match);
 assert.doesNotThrow(()=>new Script(match[1]));
 for(const word of ["Testing & Diagnostics","nd-run","Not configured","Run Read-only Tests"])
 assert.ok(DIAGNOSTICS_WIDGET.includes(word));
});
