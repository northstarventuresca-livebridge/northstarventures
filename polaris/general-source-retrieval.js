
// General read-only source activity retrieval, reusing the project's authorized
// GitHub access and catalogued repositories instead of single-command handlers.
function pkActivityQuery(question){
 return /\b(?:latest|recent|recently|yesterday|today|last\s+week|this\s+week|progress|update(?:d|s)?|changes?|commits?|history|worked|working|built|develop(?:ed|ment)?|unfinished|pending|status|since)\b|what did (?:we|i) (?:do|work|change|finish)/i.test(question);
}
async function pkGitHubActivity(env,project,question){
 if(!env.POLARIS_DB||!project||!pkActivityQuery(question))return "";
 let rows;
 try{const r=await env.POLARIS_DB.prepare("SELECT name,path,visibility,notes FROM project_registry WHERE project=? AND source='github' ORDER BY name LIMIT 35").bind(project).all();rows=r.results||[]}
 catch{return "[GITHUB SOURCE STATUS] GitHub inventory query failed; do not infer current changes."}
 if(!rows.length)return "";
 const q=String(question||"").toLowerCase();
 const genericWords=["what","did","the","and","are","our","was","work","latest","with","that","those","today","yesterday","last","this","updated","recent","progress","have","from","they","there","been","project","projects"];
 const terms=q.split(/[^a-z0-9]+/).filter(t=>t.length>=4&&!genericWords.includes(t));
 const appEnabled=Boolean(env.POLARIS_GITHUB_APP_ID&&env.POLARIS_GITHUB_APP_PRIVATE_KEY);
 const selected=rows.filter(row=>row.visibility==="public"||!!polarisRepoToken(env,row.path)||(appEnabled&&!!paValidRepo(row.path)));
 if(!selected.length)return "[GITHUB READ PERMISSIONS] "+rows.length+" repositories are catalogued for "+project+", but none currently has live file/commit read access in Polaris. Do not guess code changes.";
 const ranked=selected.map(row=>{
  const repo=String(row.path||"").toLowerCase();
  let points=terms.reduce((v,t)=>v+(repo.includes(t)?5:0),0);
  if(q.includes(repo.split("/").pop()))points+=20;
  if(project==="TapBin"&&repo.includes("organizer"))points+=12;
  if(project==="LiveBridge"&&repo.endsWith("livebridge-production"))points+=12;
  if(project==="Polaris"&&repo.endsWith("northstarventures"))points+=12;
  return {...row,points};
 }).sort((a,b)=>b.points-a.points);
 const take=ranked.slice(0,Math.min(3,ranked.length));
 const results=await Promise.all(take.map(async row=>{
  const repo=row.path.split("/");
  if(repo.length!==2)return null;
  const headers={accept:"application/vnd.github+json","user-agent":"Polaris-ProjectResearch/1.0","x-github-api-version":"2022-11-28"};
  try{
   const token=polarisRepoToken(env,row.path)||(appEnabled&&paValidRepo(row.path)?(await paGithubInstallationToken(env,row.path,"read")).token:null);
   if(token)headers.authorization="Bearer "+token;
   const endpoint="https://api.github.com/repos/"+encodeURIComponent(repo[0])+"/"+encodeURIComponent(repo[1])+"/commits?per_page=6";
   const response=await fetch(endpoint,{headers,signal:AbortSignal.timeout(7000)});
   if(!response.ok)return {name:row.name,status:"HTTP "+response.status};
   const items=await response.json();
   if(!Array.isArray(items))return {name:row.name,status:"Unexpected GitHub response"};
   return {name:row.name,commits:items.slice(0,6).map(c=>({date:String(c.commit?.committer?.date||c.commit?.author?.date||"").slice(0,19),shortSha:String(c.sha||"").slice(0,10),
    message:String(c.commit?.message||"").split("\n")[0].slice(0,180)}))};
  }catch{return {name:row.name,status:"GitHub temporarily unavailable"}}
 }));
 const seen=results.filter(Boolean);
 const lines=seen.map(r=>r.commits?
  "[LIVE GITHUB COMMITS · "+r.name+" · fetched "+new Date().toISOString()+"]\n"+(r.commits.length?r.commits.map(c=>c.date+" · "+c.shortSha+" · "+c.message).join("\n"):"No commits returned"):
  "[GITHUB CONNECTION · "+r.name+"] "+r.status);
 const note="GitHub commits only show recorded code changes in accessible repositories, not every change in Cloudflare or every real-world task. Do not treat absence of commits as absence of work.";
 return lines.length?"[VERIFIED, SOURCE-SCOPED GITHUB HISTORY]\n"+lines.join("\n\n")+"\n"+note:"";
}
async function pkBroadMemorySearch(env,question,alreadyNamed){
 if(!env.POLARIS_DB||alreadyNamed)return "";
 const stop=new Set(["about","what","which","when","where","whose","this","that","your","there","with","they","them","have","from","could","would","please","tell","show","give","some","been","project","projects","update","status","latest","recent","today","yesterday","last","work","working","finished","unfinished","done","changes"]);
 const terms=[...new Set(String(question||"").toLowerCase().split(/[^a-z0-9]+/).filter(t=>t.length>=4&&!stop.has(t)))].slice(0,7);
 if(!terms.length)return "";
 let rows;
 try{const r=await env.POLARIS_DB.prepare("SELECT project,category,title,details,source,as_of,verified_live FROM project_memory ORDER BY as_of DESC LIMIT 140").all();rows=r.results||[]}
 catch{return ""}
 const rated=rows.map(r=>{
  const hay=(r.project+" "+r.title+" "+r.details).toLowerCase(),label=(r.project+" "+r.title).toLowerCase();
  const score=terms.reduce((p,t)=>p+(label.includes(t)?8:0)+(hay.includes(t)?2:0),0);
  return {row:r,score};
 }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
 if(!rated.length)return "";
 return "[SEARCHABLE POLARIS PROJECT MEMORY · historical, not necessarily live]\n"+
 rated.map(x=>"["+x.row.project+" · "+x.row.title+" · "+x.row.as_of+" · "+x.row.source+"]\n"+String(x.row.details).slice(0,1500)).join("\n\n")+
 "\nDo not claim any historical project record verifies current deployment.";
}
