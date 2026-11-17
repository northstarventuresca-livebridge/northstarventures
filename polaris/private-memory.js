
// Polaris Private Memory v1 — persistent notes, bring-list items, store reminders, ideas.
// This is owned by Polaris's authenticated session and is independent of house task/timer data.
const PM_MEMORY_KINDS=["bring","store","shopping","idea","general"];
function pmMemJson(obj,status=200){return new Response(JSON.stringify(obj),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
function pmMemClean(v,n=300){return String(v??"").trim().slice(0,n)}
function pmMemLocalDate(offset=0){
 const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Edmonton",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const dict=Object.fromEntries(p.map(x=>[x.type,x.value]));const y=+dict.year,m=+dict.month,d=+dict.day;
 return new Date(Date.UTC(y,m-1,d+offset)).toISOString().slice(0,10);
}
function pmMemoryCandidate(text){
 const s=String(text||"").toLowerCase();
 return /\b(?:remember|remind|reminder|don't forget|dont forget|note to self|make a note|keep a note|write down|shopping list|bring list|things to bring|items to bring|next time|when i go to|when i'm at|when i am at|anything at|anything from|did i need|do i need to bring|need to bring|need to take|should bring|bring tomorrow|bring today|picked up|cross off|mark as done|mark off|what did i need|what was i supposed to|had an idea|have an idea)\b/i.test(s)||
  /\b(?:what|which|was there|anything)\b.{0,65}\b(?:bring|rona|home depot|lowe'?s|costco|store|reminder|list)\b/i.test(s)||
  /\b(?:idea for|thought about|wanted to get|wanted to buy)\b/i.test(s);
}
function pmMemorySchema(){
 const e={type:"object",additionalProperties:false,properties:{
  kind:{type:"string",enum:PM_MEMORY_KINDS},
  item:{type:"string"},store:{type:"string"},due_date:{type:"string"},
  project_key:{type:"string"},context:{type:"string"}
 },required:["kind","item","store","due_date","project_key","context"]};
 return {type:"object",additionalProperties:false,properties:{
  action:{type:"string",enum:["save","query","complete","none"]},
  entries:{type:"array",items:e},
  query:{type:"object",additionalProperties:false,properties:{
   kind:{type:"string",enum:["any",...PM_MEMORY_KINDS]},store:{type:"string"},
   due_date:{type:"string"},keywords:{type:"string"}
  },required:["kind","store","due_date","keywords"]},
  complete_items:{type:"array",items:{type:"string"}}
 },required:["action","entries","query","complete_items"]};
}
async function pmMemoryInterpret(env,message){
 const today=pmMemLocalDate(),tomorrow=pmMemLocalDate(1);
 if(!env.Polaris_open_ai)throw Error("Polaris AI key unavailable");
 const instructions=[
  "You are the intent parser for a private personal memory assistant named Polaris.",
  "Interpret the latest utterance, not the user's previous conversations. Return ONLY the structured schema.",
  "Local date in Alberta is "+today+". Tomorrow is "+tomorrow+".",
  "Classify action SAVE if the user wants Polaris to remember, bring, buy, consider, note, or remind. For combined lists, split each distinct item into its own entry.",
  "Classify QUERY if asking to recall what they previously said, needed, planned to bring, or look for at a store. Do not save a new entry for a query.",
  "Classify COMPLETE only when user explicitly confirms they brought, bought, did, or wishes to cross off an item. Put the names in complete_items.",
  "Classify NONE for unrelated questions or commands.",
  "Kinds: bring=things to carry to a location/job; store=something to inspect or remember at a named store; shopping=general things to buy; idea=uncommitted thoughts; general=other.",
  "For 'bring toilet paper, a mop and some light bulbs tomorrow': SAVE three bring entries with due_date "+tomorrow+".",
  "For 'next time at Rona remind me to look for a vanity on sale': SAVE one store entry with store RONA, item 'Look for a vanity on sale', no due date.",
  "For 'what did I need to bring today': QUERY kind bring with due_date "+today+". For 'was there anything at Rona': QUERY store RONA, kind any.",
  "Project_key is 'monicas-house' only when Monica's house is clearly specified; otherwise leave blank. Context captures location such as Monica's house when mentioned.",
  "Do not guess dates, stores, destinations, or facts not supplied. If no date, leave due_date empty. Never interpret a question as a new entry.",
  "Preserve concrete detail in item and context; keep item concise. The data is private and will be saved exactly as parsed. Never include fabricated items."
 ].join("\n");
 const response=await fetch("https://api.openai.com/v1/responses",{
  method:"POST",headers:{"authorization":"Bearer "+env.Polaris_open_ai,"content-type":"application/json"},
  body:JSON.stringify({model:POLARIS_OPENAI_MODEL,store:false,reasoning:{effort:"low"},max_output_tokens:1250,
   instructions,input:[{role:"user",content:message}],
   text:{format:{type:"json_schema",name:"polaris_personal_memory_intent",strict:true,schema:pmMemorySchema()}}})
 });
 if(!response.ok)throw Error("Polaris AI couldn't interpret this reminder (HTTP "+response.status+").");
 const data=await response.json();
 const txt=(data.output||[]).flatMap(o=>(o.content||[]).filter(c=>c.type==="output_text").map(c=>c.text||"")).join("")||data.output_text||"";
 if(!txt)throw Error("Polaris AI didn't return structured memory data.");
 const parsed=JSON.parse(txt);
 if(!["save","query","complete","none"].includes(parsed.action))throw Error("Invalid memory intent");
 return parsed;
}
function pmMemorySelect(rows,filters){
 const kind=filters.kind||"any",store=pmMemClean(filters.store,100).toLowerCase(),date=pmMemClean(filters.due_date,10);
 const keyword=pmMemClean(filters.keywords,130).toLowerCase();
 const words=keyword.split(/\s+/).filter(w=>w.length>=3&&!["today","tomorrow","what","were","did","need","bring","items","anything","some","list","rona","from","there","that","the","this","mine","have"].includes(w));
 let selected=rows.filter(row=>{
  if(kind!=="any"&&row.kind!==kind)return false;
  if(store&&!String(row.store||"").toLowerCase().includes(store)&&!String(row.item||"").toLowerCase().includes(store))return false;
  if(date && row.due_date!==date && row.due_date!=="")return false;
  return true;
 });
 if(words.length){
  const matched=selected.filter(row=>{
   const hay=[row.item,row.context,row.store,row.source_text].join(" ").toLowerCase();
   return words.some(w=>hay.includes(w));
  });
  if(matched.length)selected=matched;
 }
 return selected;
}
function pmMemoryReadAnswer(rows,filters){
 const store=pmMemClean(filters.store,90);
 if(!rows.length)return store?"I don't have any active reminders saved for "+store+".":"I don't have any matching reminders saved yet.";
 const names=rows.slice(0,12).map(x=>x.item);
 let lead=store?"At "+store+", you wanted to remember: ":
  filters.kind==="bring"?(filters.due_date?"For "+(filters.due_date===pmMemLocalDate()?"today":filters.due_date)+", you wanted to bring: ":"On your bring list: "):
  filters.kind==="idea"?"Here are the ideas you wanted to keep: ":
  filters.kind==="shopping"?"Your shopping items are: ":"Here's what you asked me to remember: ";
 const suffix=rows.length>12?" There are "+(rows.length-12)+" more.":"";
 return lead+names.join("; ")+". "+suffix;
}
async function pmMemoryRoute(request,env,url){
 if(!env.POLARIS_DB)return pmMemJson({error:"Private memory database unavailable"},503);
 if(request.method==="GET"){
  const r=await env.POLARIS_DB.prepare("SELECT id,kind,item,store,due_date,project_key,context,status,created_at,updated_at FROM polaris_personal_memory ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,created_at DESC LIMIT 350").all();
  return pmMemJson({ok:true,entries:r.results||[],today:pmMemLocalDate()});
 }
 if(request.method!=="POST")return pmMemJson({error:"Method not allowed"},405);
 if(request.headers.get("origin")!==url.origin)return pmMemJson({error:"A same-origin session is required"},403);
 let input;try{const raw=await request.text();if(raw.length>6400)return pmMemJson({error:"Request too large"},413);input=JSON.parse(raw)}catch{return pmMemJson({error:"Invalid memory request"},400)}
 const operation=pmMemClean(input?.operation,24);
 if(operation==="done"||operation==="reopen"){
  const id=pmMemClean(input.id,70);
  if(!/^[0-9a-f-]{36}$/i.test(id))return pmMemJson({error:"Invalid entry"},400);
  const status=operation==="done"?"done":"open";
  const rec=await env.POLARIS_DB.prepare("SELECT item FROM polaris_personal_memory WHERE id=?").bind(id).first();
  if(!rec)return pmMemJson({error:"Memory entry not found"},404);
  await env.POLARIS_DB.prepare("UPDATE polaris_personal_memory SET status=?,updated_at=? WHERE id=?").bind(status,new Date().toISOString(),id).run();
  return pmMemJson({ok:true,status,reply:(status==="done"?"Marked complete: ":"Put back on your list: ")+rec.item});
 }
 if(operation!=="interpret")return pmMemJson({error:"Unknown memory operation"},400);
 const message=pmMemClean(input.message,3300);
 if(message.length<4)return pmMemJson({error:"Please say what you want to remember"},400);
 if(!pmMemoryCandidate(message))return pmMemJson({ok:true,handled:false,action:"none"});
 let intent;
 try{intent=await pmMemoryInterpret(env,message)}catch(e){return pmMemJson({error:"I couldn't reliably process that memory. Nothing was saved. "+String(e.message||"").slice(0,140)},502)}
 if(intent.action==="none")return pmMemJson({ok:true,handled:false,action:"none"});
 if(intent.action==="save"){
  const entries=Array.isArray(intent.entries)?intent.entries.slice(0,25):[];
  if(!entries.length)return pmMemJson({error:"I couldn't identify any items to save. Nothing changed."},422);
  const id=/^[0-9a-f-]{36}$/i.test(String(input.requestId||""))?input.requestId:crypto.randomUUID();
  const now=new Date().toISOString(),results=[];
  for(let i=0;i<entries.length;i++){
   const x=entries[i],item=pmMemClean(x.item,420);
   if(!item)continue;
   const kind=PM_MEMORY_KINDS.includes(x.kind)?x.kind:"general";
   const store=pmMemClean(x.store,100),date=/^\d{4}-\d\d-\d\d$/.test(x.due_date||"")?x.due_date:"";
   const context=pmMemClean(x.context,220),project=/^[a-z0-9-]{2,60}$/.test(x.project_key||"")?x.project_key:"";
   const recordId=crypto.randomUUID();
   await env.POLARIS_DB.prepare("INSERT OR IGNORE INTO polaris_personal_memory (id,batch_id,sequence,kind,item,store,due_date,project_key,context,source_text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'open',?,?)")
    .bind(recordId,id,i,kind,item,store,date,project,context,message,now,now).run();
   results.push({kind,item,store,due_date:date,project_key:project});
  }
  if(!results.length)return pmMemJson({error:"No valid memory entries were saved"},422);
  const plural=results.length===1?"item":"items";
  const what=results.map(x=>x.item).join("; ");
  return pmMemJson({ok:true,handled:true,action:"save",saved:results,reply:"I've saved "+results.length+" "+plural+" to your private Polaris memory: "+what+". You can ask me about them later."});
 }
 const r=await env.POLARIS_DB.prepare("SELECT id,kind,item,store,due_date,project_key,context,source_text,status,created_at FROM polaris_personal_memory WHERE status='open' ORDER BY created_at DESC LIMIT 400").all();
 const all=r.results||[];
 if(intent.action==="query"){
  const filters=intent.query||{kind:"any",store:"",due_date:"",keywords:""};
  const rows=pmMemorySelect(all,filters);
  return pmMemJson({ok:true,handled:true,action:"query",count:rows.length,items:rows.slice(0,30).map(x=>({id:x.id,kind:x.kind,item:x.item,store:x.store,due_date:x.due_date})),reply:pmMemoryReadAnswer(rows,filters)});
 }
 if(intent.action==="complete"){
  const targets=Array.isArray(intent.complete_items)?intent.complete_items.slice(0,20).map(x=>pmMemClean(x,140)).filter(Boolean):[];
  if(!targets.length)return pmMemJson({error:"Which item should I mark complete?"},422);
  const matched=[];
  for(const key of targets){
   const candidates=all.filter(x=>x.item.toLowerCase().includes(key.toLowerCase())||key.toLowerCase().includes(x.item.toLowerCase()));
   if(candidates.length!==1)return pmMemJson({ok:true,handled:true,action:"complete",needsClarification:true,reply:"I couldn't uniquely identify '"+key+"'. Please name the exact item or mark it done in Memory."});
   if(!matched.includes(candidates[0]))matched.push(candidates[0]);
  }
  for(const x of matched)await env.POLARIS_DB.prepare("UPDATE polaris_personal_memory SET status='done',updated_at=? WHERE id=?").bind(new Date().toISOString(),x.id).run();
  return pmMemJson({ok:true,handled:true,action:"complete",count:matched.length,reply:"Marked complete: "+matched.map(x=>x.item).join("; ")+". They won't appear in your active reminders."});
 }
 return pmMemJson({ok:true,handled:false,action:"none"});
}
