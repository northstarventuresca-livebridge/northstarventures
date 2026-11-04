// North Star Command Center diagnostics: admin-only, read-only checks with isolated per-project results.
// A green result confirms an HTTP response, NOT functioning buttons, authenticated logins or device connectivity.
const PREFIX="nsv:diagnostics:v1:";
const CATALOG={
  "seed-01":{name:"Great Church Website",checks:[["public-home","regression","https://greatchurch.ca/"]]},
  "seed-02":{name:"Healing the Heart Website",checks:[["public-home","regression","https://healingtheheart.ca/"]]},
  "seed-03":{name:"Home of Hope — HOH Platform",checks:[["admin-page","targeted","https://hoh.northstarventures.ca/"]]},
  "seed-05":{name:"TapBin",checks:[["public-home","regression","https://tapbin.ca/"]]},
  "seed-06":{name:"LiveBridge",checks:[["public-home","regression","https://livebridge.ca/"]]},
  "seed-07":{name:"North Star Ventures Website",checks:[["public-home","regression","https://northstarventures.ca/"],["admin-route","targeted","https://northstarventures.ca/admin"]]},
  "seed-15":{name:"AudioPassport",checks:[["public-home","regression","https://audiopassport.ca/"]]},
  "seed-18":{name:"Say It With Flours",checks:[["public-home","regression","https://sayitwithflours.ca/"]]}
};
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
const validId=id=>/^seed-\d{2}$|^[0-9a-f]{32}$/.test(id);
const base=id=>PREFIX+id+":";
async function readHistory(env,id){
 const latest=await env.REGISTRY.get(base(id)+"latest","json");
 return latest||null;
}
export async function handleDiagnostics(req,env,url,authorize,{fetchImpl=fetch}={}){
 const path=url.pathname;
 const list="/api/admin/diagnostics";
 const detail=/^\/api\/admin\/diagnostics\/(seed-\d{2}|[0-9a-f]{32})$/.exec(path);
 const run=/^\/api\/admin\/diagnostics\/(seed-\d{2}|[0-9a-f]{32})\/run$/.exec(path);
 if(path!==list&&!detail&&!run)return null;
 if(!await authorize(req,env))return reply({error:"Not authorized"},401);
 if(!env.REGISTRY)return reply({error:"Diagnostics storage unavailable"},503);
 if(req.method==="GET"&&path===list){
   const projects=await getProjects(env);
   return reply({projects:await Promise.all(projects.map(async p=>({
     id:p.id,name:p.name,category:p.category,other:!!p.other,configured:!!CATALOG[p.id],
     checkCount:CATALOG[p.id]?.checks.length||0,
     latest:await readHistory(env,p.id)
   }))),note:"HTTP checks only. Buttons, authentication and X32 audio are not tested."});
 }
 const id=detail?.[1]||run?.[1];
 if(!id||!validId(id))return reply({error:"Invalid project"},400);
 const project=(await getProjects(env)).find(p=>p.id===id);
 if(!project)return reply({error:"Project not found"},404);
 if(detail&&req.method==="GET"){
   const history=await env.REGISTRY.list({prefix:base(id)+"run:",limit:15});
   const reports=(await Promise.all(history.keys.map(k=>env.REGISTRY.get(k.name,"json")))).filter(Boolean)
     .sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,10);
   return reply({project:{id:project.id,name:project.name},configured:!!CATALOG[id],
     checks:(CATALOG[id]?.checks||[]).map(([id,group])=>({id,group,kind:"HTTP response"})),
     latest:await readHistory(env,id),history:reports});
 }
 if(run&&req.method==="POST"){
   if(req.headers.get("origin")!==url.origin)return reply({error:"Invalid request origin"},403);
   if(!CATALOG[id])return reply({error:"No safe diagnostic checks configured for this project yet"},409);
   if(!env.INBOX)return reply({error:"Test rate limiting unavailable"},503);
   const rateKey=PREFIX+"rate:"+id+":"+Math.floor(Date.now()/60000);
   const recent=Number(await env.INBOX.get(rateKey)||0);
   if(recent>=2)return reply({error:"Please wait before running this project again"},429);
   await env.INBOX.put(rateKey,String(recent+1),{expirationTtl:90});
   const startedAt=new Date().toISOString(),checks=[];
   for(const [checkId,group,address] of CATALOG[id].checks){
     let result="failed",detail="Request failed",durationMs=0;
     const started=Date.now();
     try{
       const res=await fetchImpl(address,{method:"GET",redirect:"manual",
         signal:AbortSignal.timeout(8000),headers:{"accept":"text/html, */*"}});
       detail="HTTP "+res.status;
       result=res.status>=200&&res.status<400?"passed":"failed";
       // A 3xx is a reachable route, not confirmation of an authenticated page.
     }catch{detail="Network error or timeout";}
     durationMs=Date.now()-started;
     checks.push({id:checkId,group,status:result,detail,durationMs});
   }
   const report={id:crypto.randomUUID(),projectId:id,startedAt,finishedAt:new Date().toISOString(),
     type:"read-only-http",status:checks.every(x=>x.status==="passed")?"passed":"failed",checks};
   await env.REGISTRY.put(base(id)+"run:"+startedAt+":"+report.id,JSON.stringify(report));
   await env.REGISTRY.put(base(id)+"latest",JSON.stringify(report));
   return reply({report});
 }
 return reply({error:"Method not allowed"},405);
}
async function getProjects(env){
 const result=[],seen=new Set();
 let cursor;
 for(let i=0;i<8;i++){
   const page=await env.REGISTRY.list({prefix:"nsv:project-hub:v1:",limit:100,...(cursor?{cursor}:{})});
   for(const entry of page.keys){
     if(!/^nsv:project-hub:v1:(seed-\d{2}|[0-9a-f]{32})$/.test(entry.name))continue;
     const p=await env.REGISTRY.get(entry.name,"json");
     if(p?.id&&!seen.has(p.id)){seen.add(p.id);result.push(p)}
   }
   if(page.list_complete||!page.cursor)break;
   cursor=page.cursor;
 }
 return result.sort((a,b)=>a.name.localeCompare(b.name));
}
