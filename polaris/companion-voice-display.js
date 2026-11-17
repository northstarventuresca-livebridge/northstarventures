
// Polaris Realtime phone → Live Display bridge. This is a sourced visualization,
// not an instruction executor; it cannot change project data or GitHub code.
function pcDisplayProject(question,answerProject){
 const named=polarisProjectName(String(question||""));
 const fromAnswer=String(answerProject||"").slice(0,100);
 return named||(/^(Monica's House|HOH HUB|LiveBridge|TapBin|Songwriters Compass|X32 AI Engineer|Great Church|Healing The Heart|North Star Ventures|Northstar Organizer|Polaris)$/.test(fromAnswer)?fromAnswer:"");
}
function pcDisplaySafe(value,length=400){
 return String(value==null?"":value)
  .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g,"[REDACTED]")
  .replace(/\b((?:password|access key|api key|private key|secret|bearer token)\s*(?::|=|is)\s*)\S+/gi,"$1[REDACTED]")
  .replace(/[\u0000-\u001f]+/g," ")
  .trim().slice(0,length);
}
async function pcPublishVoiceDisplay(env,question,answer) {
 if(!env.POLARIS_DB||!answer||!answer.reply)return {published:false,reason:"No answer or database"};
 const project=pcDisplayProject(question,answer.project);
 if(!project)return {published:false,reason:"Not a project question"};
 // Do not turn secret-management questions into television content.
 if(/\b(?:password|api\s*key|secret|credential|private\s*key|token)\b/i.test(question))
  return {published:false,reason:"Sensitive request"};
 const questionText=pcDisplaySafe(question,160);
 const spoken=pcDisplaySafe(answer.reply,1800);
 const source=String(answer.engine||"Polaris voice").slice(0,85);
 const data={metrics:[],items:[],details:[],progress:{label:"VOICE PROJECT QUESTION",percent:100,
  message:"Response delivered; data source stated below"}};
 let title=project.toUpperCase()+" · VOICE UPDATE";
 let subtitle=spoken.slice(0,360);
 let verified="Conversation answer; no live source verification asserted";
 let view="project";
 const monica=/\bmonica\b/i.test(project);
 if(monica){
  const intent=pgWorkIntent(question,project);
  if(intent){
   const facts=await pgGetWorkFacts(env,intent);
   if(!facts.error && Number.isInteger(facts.journalCount)){
    const mins=Math.max(0,Number(facts.sessionMinutes)||0);
    const time=mins>=60?Math.floor(mins/60)+"h "+(mins%60)+"m":mins+"m";
    title="MONICA'S HOUSE · "+(intent.period==="yesterday"?"YESTERDAY'S WORK":"WORK JOURNAL");
    subtitle=facts.journalCount+" saved work "+(facts.journalCount===1?"entry":"entries")+" for "+intent.start+
       (intent.end!==intent.start?" to "+intent.end:"")+". Recorded timer time: "+time+".";
    data.metrics=[
     {label:"SAVED WORK ENTRIES",value:String(facts.journalCount),note:"Requested dates · from synchronized journal"},
     {label:"TIMER TIME",value:time,note:"Recorded time; may include breaks"},
     {label:"TASKS MARKED DONE",value:String(facts.completedTaskCount),note:"Task completion dates in requested period"},
     {label:"SOURCE AGE",value:facts.snapshotAgeMinutes===null?"UNKNOWN":
       facts.snapshotAgeMinutes<60?Math.max(0,facts.snapshotAgeMinutes)+" MIN":
       Math.round(facts.snapshotAgeMinutes/60)+" HR",note:facts.snapshotMayBeStale?"Snapshot may be outdated":"Synced snapshot"}
    ];
    const rows=Array.isArray(facts.entries)?facts.entries:[];
    data.items=rows.filter(r=>r.title||r.notes).slice(-8).map((r,i)=>({
      title:pcDisplaySafe(r.title||("Recorded session "+(i+1)),100),
      detail:pcDisplaySafe((r.minutes?String(r.minutes)+" logged min · ":"")+(r.notes||"No notes entered"),420)
    }));
    if(!data.items.length)data.items=[{title:"No saved timed work for these dates",
      detail:"This is not proof that no work happened; only the current synchronized work journal was checked."}];
    data.details=[
      {title:"DATE RANGE",detail:intent.start+(intent.end!==intent.start?" — "+intent.end:"")},
      {title:"SOURCE",detail:"Monica's House synchronized journal · source updated "+pcDisplaySafe(facts.sourceUpdatedAt,35)},
      {title:"SYNC STATUS",detail:"Polaris last synchronized "+pcDisplaySafe(facts.lastSyncedAt,35)+(facts.snapshotMayBeStale?" · may be stale":"")},
      {title:"RESPONSE",detail:spoken}
    ];
    verified="Verified source-scoped Monica work journal; as of "+facts.sourceUpdatedAt;
    data.progress={label:"MONICA WORK JOURNAL · SYNCHRONIZED SOURCE",percent:100,message:"Read-only snapshot checked"};
   }else{
    verified="Could not verify Monica's records; television summary is not verified";
    data.items=[{title:"Records not verified",detail:pcDisplaySafe(facts.error||"No source available",180)}];
   }
  }
 }
 if(answer.livebridgeVocabulary){
  const info=answer.livebridgeVocabulary;
  title="LIVEBRIDGE · CUSTOM DICTIONARY";
  if(info.ok){
   subtitle="Feature developed on a protected test branch. Automated checks "+(info.ciPass?"PASSED":"not confirmed")+". Browser preview and live recognition testing remain.";
   data.metrics=[
    {label:"STATUS",value:info.isolated?"TEST BRANCH":"REVIEW",note:"Production rollout not verified"},
    {label:"COMMITS AHEAD",value:String(info.ahead),note:"Relative to main"},
    {label:"CI TESTS",value:info.ciPass?"PASS":"CHECK",note:"GitHub automated workflow"},
    {label:"LIVE DEPLOYMENT",value:"NOT VERIFIED",note:"Requires explicit review"}
   ];
   data.items=[
    {title:"BUILT: ORGANIZATION DICTIONARY",detail:"Correct spelling, pronunciation guide, commonly misheard forms, add/edit/remove UI, isolated per organization, maximum 100 terms."},
    {title:"NEXT: REAL-AUDIO TEST",detail:"Run browser preview and test spoken recognition of Jachin (Jake-in), mistaken as Jack in or Jacqueline, before release approval."}
   ];
   data.details=[
    {title:"SOURCE",detail:"GitHub "+info.repo+" · "+info.branch},
    {title:"BRANCH STATUS",detail:String(info.ahead)+" commits ahead of main, "+String(info.behind)+" behind"},
    {title:"CHECKED",detail:info.checkedAt},
    {title:"PRODUCTION",detail:"Isolated test work; no verified production deployment"}
   ];
   verified="Live GitHub comparison and automated workflow status, checked "+info.checkedAt;
  }else{
   subtitle="LiveBridge vocabulary source status could not be checked right now. Last documented work was on a test branch.";
   data.items=[{title:"LIVE STATUS UNAVAILABLE",detail:"GitHub source verification failed; no production claim made."}];
   verified="Live GitHub check unavailable · documented historical test work only";
  }
 }
 if(answer.sourceDiscovery?.ok && Array.isArray(answer.sourceDiscovery.matches)){
  const discovery=answer.sourceDiscovery;
  const match=discovery.matches.find(x=>!x.error);
  if(match){
   title=(project+" · "+String(match.branch||"").split("/").pop()).toUpperCase().slice(0,145);
   subtitle="Verified GitHub development branch: "+match.status+" compared with "+match.base+
    ". "+match.ahead+" commits ahead; deployment not confirmed.";
   const runs=Array.isArray(match.runs)?match.runs:[];
   const recent=runs[0];
   data.metrics=[
    {label:"SOURCE BRANCH",value:match.status==="ahead"?"UNMERGED":String(match.status||"UNKNOWN").toUpperCase(),note:"Compared with "+match.base},
    {label:"COMMITS AHEAD",value:String(match.ahead),note:match.behind+" behind default branch"},
    {label:"CI STATUS",value:recent?String(recent.result).toUpperCase():"NOT CHECKED",note:"Latest discovered workflow"},
    {label:"LIVE STATUS",value:"UNVERIFIED",note:"GitHub branches are not deployments"}
   ];
   data.items=(match.files||[]).slice(0,8).map(x=>({title:pcDisplaySafe(x.path,120),detail:pcDisplaySafe(x.status||"changed",60)}));
   if(!data.items.length)data.items=[{title:"SOURCE BRANCH FOUND",detail:match.repo+" · "+match.branch}];
   data.details=[
    {title:"REPOSITORY",detail:match.repo},
    {title:"BRANCH",detail:match.branch},
    {title:"LATEST COMMITS",detail:(match.commits||[]).map(c=>c.message).join(" · ").slice(0,600)},
    {title:"SOURCE CHECK",detail:discovery.checkedAt+" · "+discovery.repositoriesChecked+" repositories inspected"},
    {title:"NEXT STEPS",detail:spoken.slice(0,500)}
   ];
   verified="GitHub branch and CI data checked "+discovery.checkedAt+"; live deployment unverified";
  }else if(Array.isArray(discovery.commits)&&discovery.commits.length){
   data.items=discovery.commits.slice(0,7).map(x=>({title:x.repo,detail:x.message+" · "+x.date}));
   data.details=[{title:"SOURCE CHECK",detail:"Recent matching commits · "+discovery.checkedAt},
    {title:"SCOPE",detail:discovery.repositoriesChecked+" repositories scanned; older branches may not have been included"}];
   verified="Recent commit history checked "+discovery.checkedAt+"; no deployment conclusion";
  }
 }
 if(!data.items.length)data.items=[{title:"POLARIS ANSWER",detail:spoken.slice(0,540)}];
 if(!data.details.length)data.details=[
  {title:"YOU ASKED",detail:questionText},
  {title:"SOURCE STATUS",detail:"This visual summarizes the conversation; individual facts may require source verification."},
  {title:"POLARIS REPLIED",detail:spoken.slice(0,600)}
 ];
 data.details.push({title:"VISUAL UPDATE",detail:"Generated from the latest authenticated phone conversation. "+verified});
 const body=JSON.stringify(data);
 const updatedAt=new Date().toISOString();
 await env.POLARIS_DB.prepare(
  "INSERT INTO polaris_display_state(id,revision,view,project,title,subtitle,payload,updated_at) VALUES('main',1,?,?,?,?,?,?) "+
  "ON CONFLICT(id) DO UPDATE SET revision=polaris_display_state.revision+1,view=excluded.view,project=excluded.project,"+
  "title=excluded.title,subtitle=excluded.subtitle,payload=excluded.payload,updated_at=excluded.updated_at")
  .bind(view,project,title,subtitle,body,updatedAt).run();
 return {published:true,project,source:verified,updatedAt};
}
