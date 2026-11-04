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
const handler=(req,env,authorized=true,fetchImpl=async()=>({status:200}),selfCheck=async()=>({status:"passed"}))=>
 handleDiagnostics(req,env,new URL(req.url),async()=>authorized,{fetchImpl,selfCheck});

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
 assert.equal(urls.length,1); // North Star checks render routes internally and do not self-fetch
});
test("unsafe origins and unconfigured tests cannot run",async()=>{
 const env=await setup();
 assert.equal((await handler(request("/api/admin/diagnostics/seed-07/run","POST","https://evil.test"),env)).status,403);
 assert.equal((await handler(request("/api/admin/diagnostics/seed-10/run","POST"),env)).status,409);
 assert.equal(await handler(request("/api/admin/diagnostics/unknown/run","POST"),env),null);
});
test("network failures produce sanitized details; no leaked exception text",async()=>{
 const env=await setup();
 const r=await handler(request("/api/admin/diagnostics/seed-06/run","POST"),env,true,async()=>{throw Error("secret=abc")});
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

test("browser events are admin-only, redacted, and isolated to the correct project", async()=>{
 const env=await setup();
 const url=origin+"/api/admin/diagnostics/seed-07/events";
 const data={kind:"javascript",code:"TypeError",route:"/admin",message:"crashed token=super-secret-bearer"};
 const make=(input=data,from=origin)=>new Request(url,{method:"POST",
  headers:{"origin":from,"content-type":"application/json"},body:JSON.stringify(input)});
 let r=await handler(make(),env,false);
 assert.equal(r.status,401);
 r=await handler(make(data,"https://evil.example"),env);
 assert.equal(r.status,403);
 r=await handler(make(),env);
 assert.equal(r.status,201);
 const saved=await handler(request("/api/admin/diagnostics/seed-07"),env);
 const errors=(await saved.json()).browserErrors;
 assert.equal(errors.length,1);
 assert.equal(errors[0].projectId,"seed-07");
 assert.equal(errors[0].kind,"javascript");
 assert.doesNotMatch(JSON.stringify(errors),/super-secret-bearer/);
 const other=await handler(request("/api/admin/diagnostics/seed-06"),env);
 assert.deepEqual((await other.json()).browserErrors,[]);
});
test("unconfigured projects refuse event ingestion",async()=>{
 const env=await setup();
 const r=await handler(new Request(origin+"/api/admin/diagnostics/seed-06/events",{
   method:"POST",headers:{origin,"content-type":"application/json"},
   body:JSON.stringify({kind:"api",code:"HTTP503",route:"/admin"})}),env);
 assert.equal(r.status,409);
});
test("browser event validation refuses payloads with routes containing query strings",async()=>{
 const env=await setup();
 const mk=(route)=>new Request(origin+"/api/admin/diagnostics/seed-07/events",{
   method:"POST",headers:{origin,"content-type":"application/json"},
   body:JSON.stringify({kind:"javascript",code:"Error",route})});
 assert.equal((await handler(mk("/admin?token=abc"),env)).status,400);
 assert.equal((await handler(mk("//other-host/path"),env)).status,400);
});
test("embedded browser error collector is valid JavaScript",async()=>{
 const {DIAGNOSTICS_CLIENT}=await import("../diagnostics-client.js");
 const script=DIAGNOSTICS_CLIENT.match(/<script[^>]*>([\s\S]*?)<\/script>/);
 assert.ok(script);
 assert.doesNotThrow(()=>new Script(script[1]));
 assert.ok(DIAGNOSTICS_CLIENT.includes("unhandledrejection"));
 assert.ok(DIAGNOSTICS_CLIENT.includes("nativeFetch"));
});

test("North Star internal diagnostics avoid Worker self-fetch and label what was tested",async()=>{
 const env=await setup();
 let publicFetchCalls=0,checks=[];
 const r=await handler(request("/api/admin/diagnostics/seed-07/run","POST"),env,true,
   async()=>{publicFetchCalls++;throw Error("Same-zone self-fetch is not allowed")},
   async id=>{checks.push(id);return {status:"passed"}});
 assert.equal(r.status,200);
 const report=(await r.json()).report;
 assert.equal(report.status,"passed");
 assert.equal(report.type,"internal-route-render");
 assert.equal(publicFetchCalls,0);
 assert.deepEqual(checks,["public-home","admin-route"]);
 assert.equal(report.checks.every(c=>c.kind==="internal-route"),true);
 assert.equal(report.checks.every(c=>c.detail==="Internal route rendered"),true);
});
test("internal route failure is not silently converted to a pass",async()=>{
 const env=await setup();
 const r=await handler(request("/api/admin/diagnostics/seed-07/run","POST"),env,true,
   async()=>({status:200}),
   async id=>({status:id==="admin-route"?"failed":"passed"}));
 const report=(await r.json()).report;
 assert.equal(report.status,"failed");
 assert.equal(report.checks.find(x=>x.id==="admin-route").detail,"Internal route render failed");
});
test("missing internal check does not make a false pass",async()=>{
 const env=await setup();
 const r=await handleDiagnostics(request("/api/admin/diagnostics/seed-07/run","POST"),env,
   new URL(origin+"/api/admin/diagnostics/seed-07/run"),async()=>true,{
     fetchImpl:async()=>({status:200})
   });
 const report=(await r.json()).report;
 assert.equal(report.status,"failed");
 assert.ok(report.checks.every(c=>c.detail==="Internal route check unavailable"));
});
