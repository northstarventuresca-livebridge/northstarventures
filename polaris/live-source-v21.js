// Polaris live source reader v2.1 — authenticated, read-only, least privilege.
// Only examines registered resources and fetches small relevant text portions.
// Optional secrets (not configured until owner adds them):
// POLARIS_GITHUB_NSV_READ_TOKEN, POLARIS_GITHUB_CHURCH_READ_TOKEN,
// POLARIS_GITHUB_PERSONAL_READ_TOKEN, POLARIS_CF_NSV_READ_TOKEN.
const POLARIS_CF_NSV_ACCOUNT="de139270326790931c82df02d785528f";
function polarisSourceTokens(env){
 return {
  githubNSV:Boolean(env.POLARIS_GITHUB_NSV_READ_TOKEN),
  githubChurch:Boolean(env.POLARIS_GITHUB_CHURCH_READ_TOKEN),
  githubPersonal:Boolean(env.POLARIS_GITHUB_PERSONAL_READ_TOKEN),
  cloudflareNSV:Boolean(env.POLARIS_CF_NSV_READ_TOKEN)
 };
}
function polarisSourceSafe(path){
 const p=String(path||"").toLowerCase();
 if(!p||p.length>300||p.includes("..")||p.startsWith("/")||p.includes("\\"))return false;
 if(/(^|\/)(?:\.env(?:\..*)?|\.git|node_modules|vendor|secrets?|credentials?|private|certs?|\.wrangler|dist|build)(\/|$)/i.test(p))return false;
 if(/\.(?:pem|p12|pfx|key|keystore|crt|cer|sqlite|db|wasm|zip|lock|min\.js|map|png|jpg|jpeg|gif|webp|svg|mp3|mp4|pdf|woff2?)$/i.test(p))return false;
 if(/(?:token|password|secret|credentials|privatekey|private_key)/i.test(p.split("/").pop()))return false;
 return /\.(?:md|txt|js|mjs|cjs|ts|tsx|jsx|html|css|json|toml|yaml|yml|py|go|rs|sh)$/i.test(p);
}
function polarisRedactSource(content){
 return String(content||"").slice(0,12500)
  .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g,"[REDACTED PRIVATE KEY]")
  .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g,"[REDACTED CREDENTIAL]")
  .replace(/(\b(?:token|password|secret|api[_ -]?key|private[_ -]?key)\b\s*[:=]\s*["']?)[A-Za-z0-9_./+!=-]{12,}/gi,"$1[REDACTED]")
  .slice(0,11000);
}
function polarisRepoToken(env,repo){
 const owner=repo.split("/")[0];
 if(owner==="northstarventuresca-livebridge")return env.POLARIS_GITHUB_NSV_READ_TOKEN;
 if(owner==="globalconnectionschurch-eng")return env.POLARIS_GITHUB_CHURCH_READ_TOKEN;
 if(owner==="rwyers")return env.POLARIS_GITHUB_PERSONAL_READ_TOKEN;
 return null;
}
function polarisSourceInterest(query){
 return /\b(?:read|inspect|look at|show|check|search|find|source|repo|repository|github|code|files?|scripts?|workers?|cloudflare|configuration|latest|currently|recent|what changed|implementation|deployed|deployment|live status)\b/i.test(query);
}
async function polarisLiveSources(env,selectedProject,query){
 if(!env.POLARIS_DB||!polarisSourceInterest(query))return "";
 const project=selectedProject||polarisProjectName(query);
 if(!project||project==="All tracked resources")return "";
 const lower=String(query||"").toLowerCase(),parts=[];
 const sourceRows=await env.POLARIS_DB.prepare("SELECT source,name,path,visibility,notes FROM project_registry WHERE project=? ORDER BY name LIMIT 50").bind(project).all();
 const all=sourceRows.results||[];
 const qTerms=lower.split(/[^a-z0-9]+/).filter(v=>v.length>=3&&!["the","and","from","with","that","this","have","about","what","could","would","tell","please","last","latest","your","project"].includes(v));
 const gh=all.filter(r=>r.source==="github");
 const cf=all.filter(r=>r.source==="cloudflare-worker");
 // Look up at most one GitHub repository and up to two relevant files.
 if(/\b(?:github|repository|repo|code|file|source|readme|implementation|scripts?)\b/i.test(query)){
  let candidates=gh.filter(r=>r.visibility==="public"||polarisRepoToken(env,r.path));
  if(!candidates.length){
   parts.push("Live private GitHub file reading is not connected for this project. A repository-scoped GitHub Contents Read token is required.");
  }else{
   candidates.sort((a,b)=>{
    const score=r=>{
     const name=r.name.toLowerCase(),repoPart=name.split("/").pop();
     let s=qTerms.filter(x=>name.includes(x)).length*7;
     if(lower.includes(repoPart))s+=10;
     if(project==="LiveBridge"&&name.includes("production"))s+=5;
     if(project==="TapBin"&&name.includes("organizer"))s+=5;
     if(name.includes("allinone"))s+=1;
     return s;
    };
    return score(b)-score(a);
   });
   const chosen=candidates[0],repo=chosen.path,token=polarisRepoToken(env,repo);
   const [owner,repoName]=repo.split("/");
   const headers={"user-agent":"Polaris-ReadOnly/2.1","accept":"application/vnd.github+json","x-github-api-version":"2026-03-10"};
   if(token)headers.authorization="Bearer "+token;
   try{
    const treeResponse=await fetch("https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repoName)+"/git/trees/main?recursive=1",{headers});
    if(treeResponse.ok){
     const tree=await treeResponse.json();
     const files=(tree.tree||[]).filter(x=>x.type==="blob"&&polarisSourceSafe(x.path)&&x.size<=45000);
     const rank=f=>{
      const p=f.path.toLowerCase();let s=qTerms.filter(term=>p.includes(term)).length*7;
      if(project==="HOH HUB"&&/(hoh|hope|sponsor)/.test(p))s+=8;
      if(project==="LiveBridge"&&p.includes("livebridge"))s+=5;
      if(p.endsWith("readme.md"))s+=2;
      if(/\/(?:tests?|fixtures?|archives?|legacy|backup)\//.test(p))s-=8;
      if(/\/(?:api|src|worker|server)\//.test(p))s+=1;
      return s;
     };
     files.sort((a,b)=>rank(b)-rank(a));
     const chosenFiles=files.slice(0,2).filter(f=>rank(f)>0||files.length===1);
     for(const file of chosenFiles){
      try{
       const u="https://api.github.com/repos/"+encodeURIComponent(owner)+"/"+encodeURIComponent(repoName)+"/contents/"+file.path.split("/").map(encodeURIComponent).join("/");
       const r=await fetch(u,{headers:{...headers,accept:"application/vnd.github.raw+json"}});
       if(!r.ok)continue;
       let body=await r.text();
       if(body.startsWith('{"type":"file"')){
        try{const o=JSON.parse(body);if(o.encoding==="base64"&&typeof o.content==="string")body=atob(o.content.replace(/\s+/g,""))}catch(e){}
       }
       parts.push("[LIVE GITHUB READ — "+repo+"/"+file.path+"]\n"+polarisRedactSource(body).slice(0,4200));
      }catch(e){}
     }
     if(!chosenFiles.length)parts.push("GitHub read succeeded for "+repo+", but no small relevant text files matched. Ask for a specific filename or directory.");
    }else parts.push("GitHub "+repo+" live read returned HTTP "+treeResponse.status+". Access to private files may need a correct read-only token.");
   }catch(e){parts.push("GitHub source read was temporarily unavailable.")}
  }
 }
 // Read Cloudflare Worker source only for an explicit Worker/Cloudflare question.
 if(/\b(?:cloudflare|worker|script|workers)\b/i.test(query)){
  if(!env.POLARIS_CF_NSV_READ_TOKEN){
   parts.push("Cloudflare Worker source has not been connected live; the known Worker names are inventory snapshots only. A Workers Scripts Read token is required.");
  }else{
   const named=cf.filter(r=>lower.includes(r.name.toLowerCase()));
   const worker=named.length===1?named[0]:(cf.length===1?cf[0]:null);
   if(!worker){
    parts.push("There are "+cf.length+" registered Cloudflare Worker names for "+project+". Specify the particular script name to inspect its live source.");
   }else{
    try{
     const url="https://api.cloudflare.com/client/v4/accounts/"+POLARIS_CF_NSV_ACCOUNT+"/workers/scripts/"+encodeURIComponent(worker.name)+"/content/v2";
     const r=await fetch(url,{headers:{authorization:"Bearer "+env.POLARIS_CF_NSV_READ_TOKEN,accept:"application/javascript"}});
     if(!r.ok)parts.push("Cloudflare Worker "+worker.name+" source returned HTTP "+r.status+".");
     else{
      const raw=await r.text();
      const body=polarisRedactSource(raw).slice(0,5500);
      parts.push("[LIVE CLOUDFLARE WORKER SOURCE (read-only): "+worker.name+"]\n"+body);
     }
    }catch(e){parts.push("Cloudflare Worker source could not be loaded right now.")}
   }
  }
 }
 return parts.slice(0,4).join("\n\n").slice(0,11800);
}
