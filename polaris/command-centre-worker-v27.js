/* Polaris command centre operations - included into worker.js on deploy. */
const CMDSITES=[{key:"tapbin",url:"https://tapbin.ca"},{key:"livebridge",url:"https://livebridge.ca"},{key:"compass",url:"https://compass.northstarventures.ca"},{key:"greatchurch",url:"https://greatchurch.ca"}];
function cmdJSON(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}})}
function cmdClean(x,max){return String(x==null?"":x).replace(/[\u0000-\u001f\u007f]/g," ").slice(0,max).replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_-]{16,})\b/gi,"[REDACTED]").replace(/\b(password|secret|token|api.key)\s*(?:is|:|=)\s*\S+/gi,"[REDACTED]").trim()}
async function cmdSummary(env){
 const db=env.POLARIS_DB;
 const [a,b,c,d,e,f]=await Promise.all([
  db.prepare("SELECT project_key,project_name,site_url,context_summary,verified_summary,verified_at,next_step,source_ref,status FROM polaris_project_intelligence ORDER BY CASE project_key WHEN 'polaris' THEN 0 ELSE 1 END,project_name").all(),
  db.prepare("SELECT id,project_key,title,details,priority,status,requires_approval,updated_at FROM polaris_work_queue ORDER BY CASE status WHEN 'in_progress' THEN 0 WHEN 'blocked' THEN 1 WHEN 'verification' THEN 2 ELSE 3 END,priority,updated_at DESC LIMIT 60").all(),
  db.prepare("SELECT project_key,sampled_at,state,http_status,latency_ms,metric_json,details FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY project_key ORDER BY sampled_at DESC,id DESC) AS rnk FROM polaris_health_samples) WHERE rnk=1 ORDER BY project_key").all(),
  db.prepare("SELECT id,project_key,severity,summary,source,occurrences,last_seen FROM polaris_error_events WHERE resolved=0 ORDER BY last_seen DESC LIMIT 15").all(),
  db.prepare("SELECT local_date,created_at,briefing_json FROM polaris_briefings ORDER BY local_date DESC LIMIT 1").all(),
  db.prepare("SELECT started_at,completed_at,state,notes FROM polaris_monitor_runs ORDER BY started_at DESC LIMIT 1").all()
 ]);
 const health=(c.results||[]).map(function(x){let metrics={};try{metrics=JSON.parse(x.metric_json||"{}")}catch(e){}return {...x,metrics}});
 const briefing=(e.results||[])[0];let brief=null;try{if(briefing)brief={date:briefing.local_date,createdAt:briefing.created_at,...JSON.parse(briefing.briefing_json)}}catch(e){}
 return {projects:a.results||[],tasks:b.results||[],health,errors:d.results||[],briefing:brief,monitor:(f.results||[])[0]||null,updated:new Date().toISOString(),note:"Health checks, not complete user-journey tests; statistics reflect sampled D1 values."};
}
function cmdOrigin(request,url){return request.headers.get("origin")===url.origin}
async function cmdTaskCreate(request,env,url){
 if(!cmdOrigin(request,url))return cmdJSON({error:"Same-origin required"},403);
 let d;try{const s=await request.text();if(s.length>2700)return cmdJSON({error:"Too much content"},413);d=JSON.parse(s)}catch(e){return cmdJSON({error:"Invalid request"},400)}
 const title=cmdClean(d.title,140),details=cmdClean(d.details,950),project=cmdClean(d.project_key,40),priority=Math.min(5,Math.max(1,Number(d.priority)||3));
 if(title.length<3||!/^[a-z0-9-]{2,35}$/.test(project))return cmdJSON({error:"Title and project required"},400);
 const found=await env.POLARIS_DB.prepare("SELECT project_key FROM polaris_project_intelligence WHERE project_key=?").bind(project).first();
 if(!found)return cmdJSON({error:"Unknown project"},400);
 const id=crypto.randomUUID();
 await env.POLARIS_DB.prepare("INSERT INTO polaris_work_queue(id,project_key,title,details,priority,status,requires_approval,source) VALUES(?,?,?,?,?,'backlog',1,'manual')").bind(id,project,title,details,priority).run();
 return cmdJSON({ok:true,id,status:"backlog"});
}
async function cmdTaskUpdate(request,env,url){
 if(!cmdOrigin(request,url))return cmdJSON({error:"Same-origin required"},403);
 let d;try{const s=await request.text();if(s.length>900)return cmdJSON({error:"Too much content"},413);d=JSON.parse(s)}catch(e){return cmdJSON({error:"Invalid request"},400)}
 if(!/^(?:[a-z0-9-]{4,64})$/.test(String(d.id||""))||!["backlog","ready","in_progress","blocked","verification","done"].includes(d.status))return cmdJSON({error:"Invalid task or status"},400);
 const r=await env.POLARIS_DB.prepare("UPDATE polaris_work_queue SET status=?,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").bind(d.status,d.id).run();
 return cmdJSON({ok:Boolean(r.meta?.changes),changed:r.meta?.changes||0});
}
async function cmdHash(s){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return Array.from(new Uint8Array(h)).slice(0,12).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function cmdLogError(env,project,summary,source,severity){
 if(!env.POLARIS_DB)return;
 const safe=cmdClean(summary,210),id=await cmdHash(project+"|"+source+"|"+safe),now=new Date().toISOString();
 try{await env.POLARIS_DB.prepare("INSERT INTO polaris_error_events(id,project_key,severity,summary,fingerprint,source,first_seen,last_seen) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET occurrences=occurrences+1,last_seen=excluded.last_seen,resolved=0").bind(id,project,severity||"error",safe,id,source,now,now).run()}catch(e){}
}
async function cmdClientError(request,env,url){
 if(!cmdOrigin(request,url))return cmdJSON({error:"Same-origin required"},403);
 let d;try{const s=await request.text();if(s.length>1500)return cmdJSON({error:"Too much content"},413);d=JSON.parse(s)}catch(e){return cmdJSON({error:"Invalid input"},400)}
 if(d.project_key!=="polaris"||!["warning","error"].includes(d.severity))return cmdJSON({error:"Only Polaris errors accepted"},400);
 await cmdLogError(env,"polaris",d.summary||"Client error","polaris-dashboard",d.severity);return cmdJSON({ok:true});
}
async function cmdMetrics(kind,db){
 if(!db)return {};
 try{
  if(kind==="tapbin"){const [a,b]=await Promise.all([db.prepare("SELECT COUNT(*) AS n FROM saas_users WHERE role='organization'").first(),db.prepare("SELECT COALESCE(SUM(requests),0) AS n FROM saas_ai_usage").first()]);return {accounts:a.n,ai_requests:b.n}}
  if(kind==="livebridge"){const [a,b,r]=await Promise.all([db.prepare("SELECT COUNT(*) AS n FROM organizations").first(),db.prepare("SELECT COUNT(*) AS n FROM broadcast_sessions").first(),db.prepare("SELECT COUNT(*) AS n FROM active_broadcasts WHERE last_seen>=(strftime('%s','now')*1000)-120000").first()]);return {organizations:a.n,broadcasts:b.n,recent_rooms:r.n}}
  if(kind==="compass"){const [a,b,z]=await Promise.all([db.prepare("SELECT COUNT(*) AS n FROM users").first(),db.prepare("SELECT COUNT(*) AS n FROM songs").first(),db.prepare("SELECT COUNT(*) AS n FROM ai_call_logs").first()]);return {users:a.n,songs:b.n,ai_calls:z.n}}
 }catch(e){return {error:"Metrics unavailable"}}
 return {};
}
async function cmdCheck(site,env,now){
 const started=Date.now();let state="unknown",status=null,details="",elapsed=0;
 try{
  const r=await fetch(site.url,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(9500)});
  status=r.status;state=status>=200&&status<400?"responding":status<500?"degraded":"unreachable";
  details=state==="responding"?"HTTP response received":"HTTP "+status;
  try{await r.body?.cancel()}catch(e){}
 }catch(e){state="unreachable";details="HTTP request failed";}
 elapsed=Date.now()-started;
 await env.POLARIS_DB.prepare("INSERT INTO polaris_health_samples(project_key,sampled_at,state,http_status,latency_ms,source,details) VALUES(?,?,?,?,?,'scheduled-http',?)").bind(site.key,now,state,status,elapsed,details).run();
 if(state==="unreachable")await cmdLogError(env,site.key,"Website health check failed: "+(status||"network"),"scheduled-http","warning");
 return {key:site.key,state,status,elapsed};
}
async function cmdBriefing(env,date){
 const [h,t,e]=await Promise.all([
  env.POLARIS_DB.prepare("SELECT project_key,state,http_status,sampled_at FROM (SELECT *,ROW_NUMBER() OVER(PARTITION BY project_key ORDER BY sampled_at DESC,id DESC) AS rn FROM polaris_health_samples) WHERE rn=1").all(),
  env.POLARIS_DB.prepare("SELECT project_key,title,priority,status FROM polaris_work_queue WHERE status!='done' ORDER BY priority,updated_at LIMIT 10").all(),
  env.POLARIS_DB.prepare("SELECT project_key,summary,last_seen FROM polaris_error_events WHERE resolved=0 ORDER BY last_seen DESC LIMIT 8").all()
 ]);
 const sites=h.results||[],result={headline:sites.some(x=>x.state==="unreachable")?"Some systems need attention":"Project monitoring summary",sites,priorities:t.results||[],errors:e.results||[],note:"Scheduled HTTP checks and D1 snapshots; not a live audience count or functional test."};
 await env.POLARIS_DB.prepare("INSERT OR IGNORE INTO polaris_briefings(local_date,created_at,timezone,briefing_json) VALUES(?,?,'America/Edmonton',?)").bind(date,new Date().toISOString(),JSON.stringify(result)).run();
}
async function cmdScheduled(env){
 if(!env.POLARIS_DB)return;
 const now=new Date().toISOString(),id=crypto.randomUUID();
 await env.POLARIS_DB.prepare("INSERT INTO polaris_monitor_runs(id,started_at,state) VALUES(?,?,'running')").bind(id,now).run();
 try{
  const checks=await Promise.allSettled(CMDSITES.map(x=>cmdCheck(x,env,now)));
  const sources=[["tapbin",env.TAPBIN_METRICS_DB],["livebridge",env.LIVEBRIDGE_METRICS_DB],["compass",env.COMPASS_METRICS_DB]];
  for(const pair of sources){
   const m=await cmdMetrics(pair[0],pair[1]);
   await env.POLARIS_DB.prepare("UPDATE polaris_health_samples SET metric_json=? WHERE id=(SELECT id FROM polaris_health_samples WHERE project_key=? ORDER BY sampled_at DESC,id DESC LIMIT 1)").bind(JSON.stringify(m),pair[0]).run();
  }
  const parts=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Edmonton",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  if(Number(parts.hour)===7)await cmdBriefing(env,parts.year+"-"+parts.month+"-"+parts.day);
  const failed=checks.filter(x=>x.status==="rejected").length;
  await env.POLARIS_DB.prepare("UPDATE polaris_monitor_runs SET state=?,completed_at=?,notes=? WHERE id=?").bind(failed?"partial":"complete",new Date().toISOString(),String(checks.length)+" checks; "+failed+" operation failures",id).run();
  await env.POLARIS_DB.prepare("DELETE FROM polaris_health_samples WHERE sampled_at < datetime('now','-35 days')").run();
  await env.POLARIS_DB.prepare("DELETE FROM polaris_monitor_runs WHERE started_at < datetime('now','-14 days')").run();
 }catch(e){
  await cmdLogError(env,"polaris","Scheduled monitor failed ("+cmdClean(e?.name||"error",50)+")","polaris-scheduler","error");
  try{await env.POLARIS_DB.prepare("UPDATE polaris_monitor_runs SET state='error',completed_at=? WHERE id=?").bind(new Date().toISOString(),id).run()}catch(z){}
 }
}
