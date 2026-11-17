
// Polaris independent GitHub App approvals — requests never deploy to production.
// Installation access tokens remain server-side and expire automatically.
const PA_OWNER_ALLOW=new Set(["northstarventuresca-livebridge","rwyers","globalconnectionschurch-eng"]);
const PA_DEFAULT_REPOS=Object.freeze({
 "monica":"rwyers/monicas-house",
 "great church":"globalconnectionschurch-eng/greatchurch",
 "healing the heart":"globalconnectionschurch-eng/healing-the-heart",
 "hth":"globalconnectionschurch-eng/healing-the-heart",
 "tapbin":"northstarventuresca-livebridge/northstar-organizer",
 "livebridge":"northstarventuresca-livebridge/livebridge-production",
 "polaris":"northstarventuresca-livebridge/northstarventures",
 "north star ventures":"northstarventuresca-livebridge/northstarventures",
 "nsv":"northstarventuresca-livebridge/northstarventures",
 "x32":"northstarventuresca-livebridge/x32-ai-engineer"
});
function paRepoFromProject(text){
 const k=String(text||"").toLowerCase().replace(/[’']/g,"").trim();
 if(k.includes("monica"))return PA_DEFAULT_REPOS.monica;
 if(k.includes("great church")||k.includes("greatchurch"))return PA_DEFAULT_REPOS["great church"];
 if(k.includes("healing")||k==="hth")return PA_DEFAULT_REPOS.hth;
 if(k.includes("tapbin")||k.includes("tap bin"))return PA_DEFAULT_REPOS.tapbin;
 if(k.includes("livebridge")||k.includes("live bridge"))return PA_DEFAULT_REPOS.livebridge;
 if(k.includes("polaris"))return PA_DEFAULT_REPOS.polaris;
 if(k.includes("north star")||k.includes("northstarventures")||k==="nsv")return PA_DEFAULT_REPOS.nsv;
 if(k.includes("x32"))return PA_DEFAULT_REPOS.x32;
 return null;
}
function paValidRepo(full){
 const m=/^([a-zA-Z0-9-]{1,80})\/([a-zA-Z0-9._-]{1,95})$/.exec(String(full||""));
 return m&&PA_OWNER_ALLOW.has(m[1])?{owner:m[1],name:m[2]}:null;
}
function paChangeJson(data,status=200){
 return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
async function paGithubAppApi(env,path,method="GET",payload=null){
 const jwt=await paAppJwt(env);
 const response=await fetch("https://api.github.com"+path,{
  method,
  headers:{"Authorization":"Bearer "+jwt,"Accept":"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28","User-Agent":"Polaris-Northstarventures-Integration",
   ...(payload===null?{}:{"Content-Type":"application/json"})},
  body:payload===null?undefined:JSON.stringify(payload),
  signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw new Error("GitHub App endpoint returned HTTP "+response.status);
 return response.json();
}
const PA_GITHUB_TOKEN_CACHE = new Map();
async function paGithubInstallationToken(env,repository,permission="read"){
 const info=paValidRepo(repository);
 if(!info)throw new Error("Repository is outside the approved GitHub accounts");
 const cacheKey=repository+"#"+permission;
 const cached=PA_GITHUB_TOKEN_CACHE.get(cacheKey);
 if(cached && cached.expires>Date.now()+90_000) return cached.data;
 const install=await paGithubAppApi(env,"/repos/"+encodeURIComponent(info.owner)+"/"+encodeURIComponent(info.name)+"/installation");
 if(!install?.id||install.account?.login!==info.owner)throw new Error("Polaris has not been installed on this repository");
 const rights={contents:permission==="write"?"write":"read",pull_requests:permission==="write"?"write":"read"};
 const session=await paGithubAppApi(env,"/app/installations/"+install.id+"/access_tokens","POST",
   {repositories:[info.name],permissions:rights});
 if(typeof session.token!=="string"||session.token.length<30)throw new Error("GitHub did not return a valid installation token");
 const data={token:session.token,expiresAt:session.expires_at,repo:info};
 const expires=Date.parse(session.expires_at)||Date.now()+900_000;
 PA_GITHUB_TOKEN_CACHE.set(cacheKey,{data,expires});
 return data;
}
async function paGithubRepoRequest(env,repository,path,options={}){
 const inst=await paGithubInstallationToken(env,repository,options.write?"write":"read");
 const res=await fetch("https://api.github.com/repos/"+encodeURIComponent(inst.repo.owner)+"/"+encodeURIComponent(inst.repo.name)+path,{
  method:options.method||"GET",
  headers:{"Authorization":"Bearer "+inst.token,"Accept":"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28","User-Agent":"Polaris-Northstarventures-Integration",
    ...(options.body===undefined?{}:{"Content-Type":"application/json"})},
  body:options.body===undefined?undefined:JSON.stringify(options.body),
  signal:AbortSignal.timeout(12500)
 });
 if(!res.ok)throw new Error("GitHub repository request failed (HTTP "+res.status+").");
 return res.status===204?null:res.json();
}
function paJsonInput(request,max=2500){
 return request.text().then(s=>{
  if(s.length>max)throw new Error("Request exceeds permitted length");
  try{return JSON.parse(s)}catch{throw new Error("Invalid JSON request")}
 });
}
function paSafeOrigin(request){
 const origin=request.headers.get("origin");
 const host=new URL(request.url).origin;
 return origin===host && request.headers.get("x-polaris-action")==="1";
}
async function paWriteChangeRequest(env,body,source){
 const project=String(body?.project||"").trim().slice(0,100);
 const instructions=String(body?.instructions||body?.request||"").trim().slice(0,1800);
 const repository=body?.repository?String(body.repository).trim():paRepoFromProject(project);
 if(!project||instructions.length<12||instructions.length>1800)return paChangeJson({ok:false,error:"Please include a project and a specific change request."},400);
 if(repository&&!paValidRepo(repository))return paChangeJson({ok:false,error:"Unsupported GitHub repository owner"},400);
 if(!env.POLARIS_DB)return paChangeJson({ok:false,error:"Polaris project database not available"},503);
 const id=crypto.randomUUID(),now=new Date().toISOString();
 await env.POLARIS_DB.prepare("INSERT INTO polaris_change_requests(id,requested_at,updated_at,source,project,repository,request_text,status) VALUES(?,?,?,?,?,?,?,?)")
  .bind(id,now,now,source,project,repository||null,instructions,"requested").run();
 return paChangeJson({ok:true,id,project,repository:repository||null,
  status:"requested",next:"Review the request in Polaris. No GitHub code or live website was changed."},201);
}
async function paListChanges(env){
 const rows=await env.POLARIS_DB.prepare("SELECT id,requested_at,updated_at,source,project,repository,request_text,status,proposal_json,pr_url,last_error FROM polaris_change_requests ORDER BY requested_at DESC LIMIT 60").all();
 return (rows.results||[]).map(x=>{
  let proposal=null;
  try{const p=JSON.parse(x.proposal_json||"null");if(p)proposal={path:p.file,summary:p.summary,old_text:p.old_text,new_text:p.new_text,baseSha:p.sha}}catch{}
  return {...x,proposal,proposal_json:undefined};
 });
}
async function paChangeVoiceRequest(request,env){
 if(request.method!=="POST")return paChangeJson({error:"POST required"},405);
 const device=await pcDevice(request,env);
 if(!device)return paChangeJson({error:"Polaris phone pairing required"},401);
 try{return await paWriteChangeRequest(env,await paJsonInput(request,2300),"voice:"+device.id)}
 catch(e){return paChangeJson({ok:false,error:String(e.message).slice(0,150)},400)}
}
async function paChangesApi(request,env,url){
 if(!env.POLARIS_DB)return paChangeJson({ok:false,error:"Change tracking database unavailable"},503);
 if(request.method==="GET"&&url.pathname==="/api/github-app/changes"){
  return paChangeJson({ok:true,items:await paListChanges(env)});
 }
 if(request.method==="POST"&&url.pathname==="/api/github-app/changes"){
  if(!paSafeOrigin(request))return paChangeJson({ok:false,error:"Polaris same-origin confirmation required"},403);
  try{return await paWriteChangeRequest(env,await paJsonInput(request,2300),"web")}
  catch(e){return paChangeJson({ok:false,error:String(e.message).slice(0,170)},400)}
 }
 return paChangeJson({ok:false,error:"Unknown change action"},404);
}
