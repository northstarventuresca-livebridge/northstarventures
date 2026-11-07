// POLARIS RELATIONAL ROUTER v2.4
// A single AI conversation is preserved. This module supplies source-specific facts
// from read-only tools ONLY when needed, without granting the model arbitrary SQL.
const POLARIS_ROUTED_TOOLS=["conversation","project-history","project-directory","project-source","live-metrics"];
function polarisRouteIntent(question, project){
 const q=String(question||"").toLowerCase();
 if((/\b(?:how many|number of|count|total)\b/.test(q)&&/\b(?:organizations?|organisations?|orgs?|registered accounts?)\b/.test(q))&&(project==="LiveBridge"||/\blive\s?bridge\b/.test(q)))return "live-metrics";
 if(/\b(?:website|site|url|domain|link|web address)\b/.test(q)&&/\b(?:give|what|where|send|open|share|visit|link|website|site)\b/.test(q))return "project-directory";
 if(/\b(?:last|previous|earlier|yesterday|recent|remember|recall|what did we|we did|we changed|completed|finished|outstanding|remaining|four things|four items|to.do|tasks?|milestones?)\b/.test(q))return "project-history";
 if(/\b(?:github|cloudflare|workers?|scripts?|repository|repos?|source code|files?|inspect|codebase|deploy|deployment)\b/.test(q))return "project-source";
 return "conversation";
}
function polarisResolveProject(question,selected,prior){
 const explicit=polarisProjectName(question);
 if(explicit)return {name:explicit,origin:"question"};
 if(typeof selected==="string"&&POLARIS_KNOWN_PROJECTS.includes(selected)&&selected!=="Other / Client Projects")return {name:selected,origin:"project-picker"};
 // Unnamed follow-ups inherit the most recent named project rather than starting fresh.
 const follow=/\b(?:it|its|that|those|this|the site|the website|last|previous|before|we did|we changed|give me the link|what about|how about|them|there)\b/i.test(question);
 if(follow){
  for(const r of (prior||[]).slice().reverse()){
   if(r.project&&POLARIS_KNOWN_PROJECTS.includes(r.project))return {name:r.project,origin:"conversation"};
   const inferred=polarisProjectName(r.user_text||"");
   if(inferred)return {name:inferred,origin:"conversation"};
  }
 }
 return {name:"",origin:"none"};
}
function polarisRelevance(question,memory){
 const q=String(question||"").toLowerCase();
 const hay=String(memory.title+" "+memory.details).toLowerCase();
 let score=0;
 for(const word of [...new Set(q.split(/[^a-z0-9]+/).filter(x=>x.length>=4&&!["what","where","when","were","that","this","with","about","please","tell","would","have","could","your","their","from","last"].includes(x)))]){
  if(hay.includes(word))score+=3;
  if(String(memory.title).toLowerCase().includes(word))score+=4;
 }
 return score;
}
async function polarisRetrieveMemory(env,project,route,question){
 if(!project||!env.POLARIS_DB)return "";
 try{
  const q=await env.POLARIS_DB.prepare("SELECT category,title,details,source,as_of,verified_live FROM project_memory WHERE project=? LIMIT 35").bind(project).all();
  const records=q.results||[];
  const priority={ "project-directory":["website","overview"],"project-history":["history"],"live-metrics":["overview"],"project-source":["overview"],"conversation":["overview","history"]};
  const kind=priority[route]||["overview"];
  records.sort((a,b)=>{
   const p=(x)=>kind.includes(x.category)?30:0;
   return p(b)+polarisRelevance(question,b)-(p(a)+polarisRelevance(question,a));
  });
  const take=route==="project-history"?4:route==="project-directory"?3:route==="conversation"?2:2;
  const entries=records.slice(0,take).filter(x=>route!=="project-directory"||x.category==="website"||x.category==="overview");
  if(!entries.length)return "";
  return entries.map(x=>"[PROJECT MEMORY "+x.category.toUpperCase()+" · "+x.title+" · as of "+x.as_of+"; source: "+x.source+"; "+(x.verified_live?"source verified":"historical report, not live-verified")+"]\n"+x.details).join("\n\n").slice(0,9200);
 }catch(e){return "Stored project memory was temporarily unavailable."}
}
async function polarisReadLiveStats(env,project,route){
 if(route!=="live-metrics"||project!=="LiveBridge")return "";
 if(!env.LIVEBRIDGE_METRICS_DB)return "LiveBridge production database is not connected in Polaris. Do not guess counts.";
 try{
  // Fixed read-only aggregate. No organization names, IDs or personal data are fetched.
  const v=await env.LIVEBRIDGE_METRICS_DB.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN account_status='active' THEN 1 ELSE 0 END),0) AS active FROM organizations").first();
  if(!v||!Number.isFinite(Number(v.total)))return "LiveBridge organization count query returned no valid result.";
  return "[LIVE READ-ONLY METRICS · source: livebridge Worker TRANSLATIONS_DB · fetched "+new Date().toISOString()+"]\nRegistered organization records: "+Number(v.total)+". Active organization records: "+Number(v.active)+". These are organization rows, not necessarily ministry parent accounts or campus count. Do not extrapolate beyond this database.";
 }catch(e){return "Unable to read the live LiveBridge organization count. Do not invent a number."}
}
async function polarisBuildEvidence(env,question,selected,prior){
 const resolved=polarisResolveProject(question,selected,prior);
 const project=resolved.name;
 const route=polarisRouteIntent(question,project);
 const memory=await polarisRetrieveMemory(env,project,route,question);
 let directory="",live="",source="";
 if(route==="project-directory"&&project==="TapBin")directory="[VERIFIED PROJECT DIRECTORY] TapBin official site: https://tapbin.ca .";
 if(route==="project-directory"&&project==="Songwriters Compass")directory="[PROJECT DIRECTORY, previously reported] https://compass.northstarventures.ca . The site's current availability was not independently verified here.";
 if(route==="live-metrics")live=await polarisReadLiveStats(env,project,route);
 return {project,route,origin:resolved.origin,memory,directory,live};
}
