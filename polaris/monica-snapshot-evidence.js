function pmWorkQuestion(raw,project){
 let text=String(raw||"").trim().replace(/^(?:(?:hey|okay|ok)\s+)*polaris[\s,:;.-]*/i,"").trim();
 if(/\b(?:hoh|home of hope|tapbin|livebridge|songwriters|compass|great church|northstar)\b/i.test(text))return null;
 const query=/\b(?:what|which|how|tell|show|list|summari[sz]e|summary|recap|review|report|give me|what's)\b/i.test(text);
 if(!query)return null;
 const journal=/\b(?:journal|time (?:entry|entries|journal)|work(?:ed|ing)?|accomplish(?:ed|ments)?|got done|get done|did today|did this week|finished|unfinished|outstanding|pending|still to do|left to do|completed|renovation)\b/i.test(text);
 if(!journal)return null;
 const hasSpecific=/\b(?:monica|house|project|journal|time entr|renovation|done|unfinished|outstanding|left to do|i (?:do|did|get|got|work))\b/i.test(text);
 if(!hasSpecific&&!/^(?:what did i|get me a summary)/i.test(text))return null;
 const unfinished=/\b(?:unfinished|outstanding|pending|left to do|still to do|not done|incomplete|what's left)\b/i.test(text);
 const lastWeek=/\blast week\b/i.test(text);
 const week=/\b(?:this week|week|last 7 days)\b/i.test(text);
 const yesterday=/\byesterday\b/i.test(text);
 const today=/\btoday\b/i.test(text);
 return {mode:unfinished?"unfinished":"summary",period:lastWeek?"last-week":week?"week":yesterday?"yesterday":today?"today":"last-7-days"};
}
function pmWorkDay(input){
 const x=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Edmonton",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(input));
 const p=Object.fromEntries(x.map(z=>[z.type,z.value]));return p.year+"-"+p.month+"-"+p.day;
}
function pmWorkStartOfWeek(today,last=false){
 const d=new Date(today+"T12:00:00Z"),weekday=d.getUTCDay(),delta=weekday===0?6:weekday-1;
 d.setUTCDate(d.getUTCDate()-delta-(last?7:0));
 return d.toISOString().slice(0,10);
}
function pmWorkPeriod(day,mode){
 const today=pmWorkDay(Date.now());
 if(mode==="today")return day===today;
 if(mode==="yesterday")return day===pmWorkDay(Date.now()-86400000);
 if(mode==="week")return day>=pmWorkStartOfWeek(today)&&day<=today;
 if(mode==="last-week"){
  const start=pmWorkStartOfWeek(today,true);
  const end=new Date(start+"T12:00:00Z");end.setUTCDate(end.getUTCDate()+6);
  return day>=start&&day<=end.toISOString().slice(0,10);
 }
 return day>=pmWorkDay(Date.now()-6*86400000)&&day<=today;
}

async function pmSnapshotEvidence(env,question,scope) {
 const row=await env.POLARIS_DB.prepare("SELECT source_updated_at,synced_at,snapshot_json FROM polaris_work_snapshots WHERE project_key='monicas-house'").first();
 if(!row)return {found:false,message:"No Monica project snapshot has been synced to Polaris. Do not invent a work summary."};
 let data;try{data=JSON.parse(row.snapshot_json)}catch{return {found:false,message:"The stored Monica project snapshot is invalid."}}
 const entries=Array.isArray(data.entries)?data.entries:[];
 const tasks=Array.isArray(data.tasks)?data.tasks:[];
 const filtered=entries.filter(x=>pmWorkPeriod(pmWorkDay(x.endedAt||x.startedAt),scope.period))
  .sort((a,b)=>Date.parse(a.startedAt||a.endedAt)-Date.parse(b.startedAt||b.endedAt)).slice(-22);
 const selected=filtered.map(x=>({
  endedOn:pmWorkDay(x.endedAt||x.startedAt),sessionTitle:String(x.title||"Work").slice(0,100),
  durationMinutes:Math.round(Number(x.seconds||0)/60),notes:String(x.notes||"").slice(0,2100)
 }));
 const completed=tasks.filter(x=>x.finishedAt&&pmWorkPeriod(pmWorkDay(x.finishedAt),scope.period));
 const open=tasks.filter(t=>t.status!=="done"&&t.status!=="completed"&&t.status!=="finished");
 const sourceAgeHours=Math.max(0,(Date.now()-Date.parse(row.source_updated_at))/3600000);
 const stale=sourceAgeHours>0.75;
 const facts={
  source:"Read-only Monica's House database snapshot copied into Polaris; NOT a live query.",
  sourceUpdatedAt:row.source_updated_at,lastSyncedAt:row.synced_at,
  stale,scope:scope.period,mode:scope.mode,
  journalCount:filtered.length,
  loggedTimerMinutes:selected.reduce((a,x)=>a+x.durationMinutes,0),
  journalEntries:selected,
  completedTaskRecords:completed.slice(0,16).map(x=>({name:x.title,area:x.area,room:x.room,status:x.status})),
  openTaskCount:open.length,
  openTaskRecords:open.slice(0,18).map(x=>({name:x.title,area:x.area,room:x.room,status:x.status}))
 };
 return {found:true,stale,facts};
}
