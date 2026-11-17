
// Polaris general source discovery: app-scoped read-only cross-project
// GitHub default branches, feature branches, commits and CI.
// Never execute untrusted repository content or infer production deployment.
const PGDISC_SKIP=new Set(("what where when which that this these those your our and the for have from been were with about could would should do did done "+
"we us they their there project projects status update progress upgrade working worked latest last previous earlier current please "+
"feature features branch branches look looking check tell give show me all any other thing things built building finished "+
"implementation implemented custom version want know of at it is are was not").split(/\s+/));
const PGDISC_SYNONYMS=[
 ["dictionary","vocabulary","glossary","terminology","lexicon","words","phrases"],
 ["login","sign-in","signin","authentication","auth","password","passkey","sso"],
 ["transcript","transcription","translation","recognition","captions","speech"],
 ["mobile","android","apk","phone","ios","app"],["notification","alerts","reminders","push"],
 ["payment","invoice","billing","subscription","pricing"],["inventory","items","storage","nfc","bins"],
 ["security","access","permissions","encryption"],["ai","automatic","autonomous","automation"]
];
function pgDiscoveryTerms(q,project=""){
 const brand=new Set(String(project).toLowerCase().split(/[^a-z0-9]+/));
 const initial=[...new Set(String(q).toLowerCase().replace(/[’']/g,"").split(/[^a-z0-9]+/)
  .filter(t=>t.length>2&&!brand.has(t)&&!PGDISC_SKIP.has(t)))].slice(0,11);
 const expanded=new Set(initial);
 for(const word of initial)for(const group of PGDISC_SYNONYMS)
  if(group.some(t=>t===word||t.replace(/s$/,"")===word.replace(/s$/,"")))
   for(const term of group)expanded.add(term);
 return [...expanded].filter(x=>x.length>2).slice(0,40);
}
function pgDiscoveryScore(value,terms){
 const lower=String(value||"").toLowerCase();
 return terms.reduce((n,term)=>n+(lower.includes(term)?(lower.split("/").pop()===term?13:7):0),0);
}
function pgDiscoveryRelevant(question){
 return /\b(?:status|where|last|worked|working|progress|feature|upgrade|change|changed|fix|bug|build|built|implementation|implemented|branch|test|tested|deployment|deploy|deployed|dictionary|vocabulary|review|remember|revisit|previous|recent|code|github|source|version|custom|discussed|talked|planned|plan|plans|how\u0027s|hows)\b|\bwhat about\b|\bhow are we doing\b|\bdid we\b/i.test(String(question||""));
}
async function pgDiscoveryRepos(env,project,question){
 let rows=[];
 try{
  const sql=project?
   "SELECT DISTINCT path FROM project_registry WHERE source='github' AND project=? LIMIT 80":
   "SELECT DISTINCT path FROM project_registry WHERE source='github' LIMIT 200";
  const r=project?await env.POLARIS_DB.prepare(sql).bind(project).all():await env.POLARIS_DB.prepare(sql).all();
  rows=r.results||[];
 }catch{}
 const known=new Set(rows.map(x=>String(x.path||"")).filter(x=>paValidRepo(x)));
 // For newly created or not-yet-indexed projects, discover the app's actual
 // installed repositories, including all linked GitHub accounts.
 if(!known.size){
  try{
   const installs=await paGithubAppApi(env,"/app/installations");
   const responses=await Promise.allSettled((Array.isArray(installs)?installs:[]).slice(0,4).map(async inst=>{
    const credentials=await paGithubAppApi(env,"/app/installations/"+inst.id+"/access_tokens","POST",
     {permissions:{contents:"read",actions:"read"}});
    const r=await fetch("https://api.github.com/installation/repositories?per_page=100",{
     headers:{"Authorization":"Bearer "+credentials.token,"Accept":"application/vnd.github+json",
      "X-GitHub-Api-Version":"2022-11-28","User-Agent":"Polaris-SourceDiscovery"},
     signal:AbortSignal.timeout(9000)
    });
    return r.ok?(await r.json()).repositories:[];
   }));
   for(const result of responses)if(result.status==="fulfilled"&&Array.isArray(result.value))
    for(const r of result.value)if(paValidRepo(r.full_name))known.add(r.full_name);
  }catch{}
 }
 const terms=pgDiscoveryTerms(question,project),projectTerms=String(project||"").toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>2);
 const repositories=[...known].map(repo=>{
  const projectFit=projectTerms.reduce((n,t)=>n+(repo.toLowerCase().includes(t)?11:0),0);
  const queryFit=pgDiscoveryScore(repo,terms);
  const crossProjectHub=!project&&repo==="northstarventuresca-livebridge/northstarventures"?8:0;
  return {repo,rank:projectFit+queryFit+crossProjectHub};
 }).sort((a,b)=>b.rank-a.rank).slice(0,project?8:5);
 return {repositories,terms};
}
async function pgDiscoveryInspectRepo(env,repo,terms){
 const data=await paGithubInstallationToken(env,repo,"read");
 const prefix="https://api.github.com/repos/"+encodeURIComponent(data.repo.owner)+"/"+encodeURIComponent(data.repo.name);
 async function get(path){
  const r=await fetch(prefix+path,{headers:{"Authorization":"Bearer "+data.token,"Accept":"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28","User-Agent":"Polaris-SourceDiscovery"},
   signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error("HTTP "+r.status);
  return r.json();
 }
 const [root,branchesPage,commitsPage]=await Promise.allSettled([
  get(""),get("/branches?per_page=100"),get("/commits?per_page=35")
 ]);
 const base=root.status==="fulfilled"?String(root.value.default_branch||"main"):"main";
 let branches=branchesPage.status==="fulfilled"&&Array.isArray(branchesPage.value)?branchesPage.value:[];
 let incomplete=branches.length>=100;
 if(incomplete){
  try{
   const next=await get("/branches?per_page=100&page=2");
   if(Array.isArray(next)){branches=branches.concat(next);incomplete=next.length>=100}
  }catch{}
 }
 const matches=branches.map(b=>({branch:String(b.name||""),score:pgDiscoveryScore(b.name,terms)}))
  .filter(x=>x.branch&&x.branch!==base&&x.score>0)
  .sort((a,b)=>b.score-a.score).slice(0,4);
 const commits=(commitsPage.status==="fulfilled"&&Array.isArray(commitsPage.value)?commitsPage.value:[])
  .map(c=>({message:String(c.commit?.message||"").split("\n")[0].slice(0,190),
   date:String(c.commit?.committer?.date||c.commit?.author?.date||"").slice(0,19),
   sha:String(c.sha||"").slice(0,12)}))
  .map(c=>({...c,score:pgDiscoveryScore(c.message,terms)}))
  .filter(c=>c.score>0).sort((a,b)=>b.score-a.score).slice(0,5);
 return {repo,base,branches:matches,commits,branchesExamined:branches.length,incomplete};
}
async function pgDiscoveryInspectBranch(env,repo,base,branch,terms){
 const suffix=encodeURIComponent(base)+"..."+branch.split("/").map(encodeURIComponent).join("/");
 const [comparison,ci]=await Promise.allSettled([
  paGithubRepoRequest(env,repo,"/compare/"+suffix),
  paGithubRepoRequest(env,repo,"/actions/runs?branch="+encodeURIComponent(branch)+"&per_page=5")
 ]);
 if(comparison.status!=="fulfilled")return {repo,branch,error:"Could not verify branch difference"};
 const v=comparison.value,files=(Array.isArray(v.files)?v.files:[])
  .map(f=>({path:String(f.filename||""),status:f.status,score:pgDiscoveryScore(f.filename,terms)}))
  .sort((a,b)=>b.score-a.score).slice(0,9);
 const commits=(v.commits||[]).slice(-5).map(c=>({
  message:String(c.commit?.message||"").split("\n")[0].slice(0,160),date:c.commit?.committer?.date||""}));
 const runs=ci.status==="fulfilled"&&Array.isArray(ci.value?.workflow_runs)?
  ci.value.workflow_runs.filter(x=>x.head_branch===branch).slice(0,3)
   .map(x=>({name:String(x.name||"CI"),result:String(x.conclusion||x.status),
    date:x.updated_at||x.created_at||""})):[];
 return {repo,branch,base,status:v.status||"unknown",ahead:Number(v.ahead_by||0),
  behind:Number(v.behind_by||0),files,commits,runs};
}
async function pgDiscoverHistory(env,project,question){
 if(!env.POLARIS_DB||!env.POLARIS_GITHUB_APP_ID||!env.POLARIS_GITHUB_APP_PRIVATE_KEY||!pgDiscoveryRelevant(question))
  return null;
 const checkedAt=new Date().toISOString(),focus=project||polarisProjectName(question),found=await pgDiscoveryRepos(env,focus,question);
 if(!found.repositories.length)return {ok:false,project:focus||"",checkedAt,reason:"No matching GitHub repositories available"};
 const repoResults=await Promise.allSettled(found.repositories.map(x=>pgDiscoveryInspectRepo(env,x.repo,found.terms)));
 const indexed=repoResults.filter(x=>x.status==="fulfilled").map(x=>x.value);
 const leads=indexed.flatMap(x=>x.branches.map(b=>({repo:x.repo,base:x.base,...b})))
  .sort((a,b)=>b.score-a.score).slice(0,3);
 const reviewed=await Promise.allSettled(leads.map(x=>pgDiscoveryInspectBranch(env,x.repo,x.base,x.branch,found.terms)));
 const matches=reviewed.filter(x=>x.status==="fulfilled").map(x=>x.value);
 const commits=indexed.flatMap(x=>x.commits.map(c=>({repo:x.repo,...c})))
  .sort((a,b)=>b.score-a.score).slice(0,5);
 const output={ok:true,project:focus||"Unknown project",checkedAt,repositoriesChecked:indexed.length,
  branchNamesScanned:indexed.reduce((n,x)=>n+x.branchesExamined,0),
  incompleteScan:indexed.some(x=>x.incomplete),matches,commits};
 const lines=["[LIVE GITHUB PROJECT SEARCH · checked "+checkedAt+"]",
  "Project "+output.project+" · "+output.repositoriesChecked+" repos searched · "+
  output.branchNamesScanned+" branch names checked"+(output.incompleteScan?" (some branches may be omitted)":"")];
 for(const m of matches){
  if(m.error){lines.push(m.repo+" "+m.branch+" · "+m.error);continue}
  lines.push("VERIFIED BRANCH "+m.repo+" @ "+m.branch+" vs "+m.base+" = "+m.status+
   " · "+m.ahead+" commits ahead, "+m.behind+" behind");
  if(m.files.length)lines.push("Changed files: "+m.files.map(f=>f.path).join(", ").slice(0,1500));
  if(m.commits.length)lines.push("Branch commits: "+m.commits.map(c=>c.date.slice(0,10)+": "+c.message).join("; ").slice(0,1300));
  if(m.runs.length)lines.push("Branch CI checks: "+m.runs.map(c=>c.name+" "+c.result+" on "+c.date.slice(0,10)).join("; "));
 }
 if(commits.length)lines.push("Recent relevant commits: "+commits.map(x=>x.repo+" "+x.date.slice(0,10)+" "+x.message).join("; ").slice(0,1300));
 if(!matches.length&&!commits.length)lines.push("No matching branch or recent commit found in the inspected scope. Do NOT claim the feature never existed: it could be in older history, Cloudflare, uncommitted work, or prior chat records.");
 lines.push("Source truth: branch existence, CI success, merges and live deployments are DIFFERENT statuses. Never infer production release from GitHub branches.");
 output.evidence=lines.join("\n").slice(0,8500);
 // Persist verified branch discoveries as searchable historical project memory.
 // Never mark branch work as "live" or confuse commits with deployment status.
 if(focus&&Array.isArray(matches)&&matches.length){
  await Promise.allSettled(matches.filter(m=>!m.error).slice(0,3).map(m=>{
   const id="github-discovery:"+m.repo+"@"+m.branch;
   const details="Checked "+checkedAt+". Branch "+m.branch+" in "+m.repo+
    " compared with "+m.base+": "+m.status+", "+m.ahead+" ahead, "+m.behind+
    " behind. Files: "+(m.files||[]).map(f=>f.path).join(", ").slice(0,1800)+
    ". CI: "+(m.runs||[]).map(x=>x.name+"="+x.result).join("; ").slice(0,550)+
    ". GitHub evidence DOES NOT establish production deployment.";
   const sql="INSERT INTO project_memory(id,project,category,title,details,source,as_of,verified_live) "+
    "VALUES(?,?,?,?,?,?,?,0) ON CONFLICT(id) DO UPDATE SET details=excluded.details,as_of=excluded.as_of,source=excluded.source";
   return env.POLARIS_DB.prepare(sql).bind(id,focus,"development","GitHub branch: "+m.branch,
    details,"Live GitHub branch comparison (last checked)",checkedAt.slice(0,10)).run();
  }));
 }
 return output;
}
