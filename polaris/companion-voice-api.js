
/* Polaris Android Voice Companion: device-scoped realtime voice credentials and
   routed general-purpose Polaris questions. Never exposes the long-lived API key. */
const PC_VOICE_MODEL="gpt-realtime-2.1";
function pcVoiceReply(value,status=200){
 return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json;charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
async function pcVoiceApi(request,env,url){
 const path=url.pathname;
 if(path==="/api/companion/voice/session"||path==="/api/companion/voice/ask"){
  if(request.method!=="POST")return pcVoiceReply({error:"POST required"},405);
  const device=await pcDevice(request,env);
  if(!device)return pcVoiceReply({error:"This phone is not paired with Polaris."},401);
  if(path==="/api/companion/voice/session"){
   if(!env.Polaris_open_ai)return pcVoiceReply({error:"OpenAI API credentials are not configured"},503);
   const past=await env.POLARIS_DB.prepare(
    "SELECT COUNT(*) AS n FROM polaris_voice_sessions WHERE device_id=? AND created_at >= ?"
   ).bind(device.id,new Date(Date.now()-24*3600000).toISOString()).first();
   if((past?.n||0)>=24)return pcVoiceReply({error:"Daily voice session limit reached (24)."},429);
   const instructions=[
    "You are Polaris, the same named personal-assistant persona used in Polaris's project dashboard and chat.",
    "Talk naturally and concisely, with warm British conversational phrasing. You are NOT the ChatGPT app session; do not claim to inherit its private connected-app permissions.",
    "You are in a live audio conversation with the owner. Listen, let the owner interrupt, and respond conversationally.",
    "For ANY factual question about the owner's real projects, plans, shopping notes, saved reminders or past work, ALWAYS use the ask_polaris tool before answering.",
    "ask_polaris connects to the existing Polaris text reasoning, project snapshots, and personal memory. Its result might be stale or limited: say so when appropriate.",
    "For a request to save or change real project data, use ask_polaris and describe what it actually confirmed. Do not claim an action succeeded without confirmation.",
    "If asked to call back later, ask the person to use the Call back button while ending the call; don't falsely promise to schedule a call yourself.",
    "This conversation should not sound like a formal morning announcement. Start with a short greeting and ask how you can help.",
    "Never read access tokens or secrets aloud. If tool returns an error, explain concisely."
   ].join("\n");
   const data={
    expires_after:{anchor:"created_at",seconds:90},
    session:{type:"realtime",model:PC_VOICE_MODEL,instructions,
     audio:{output:{voice:"cedar"},input:{turn_detection:{type:"server_vad",create_response:true,interrupt_response:true}}},
     tools:[{type:"function",name:"ask_polaris",
      description:"Consult Polaris's real project and personal memory backend. Required for questions about the owner's history, plans, tasks, reminders, or anything that must be verified. May save a simple personal memory instruction through the existing Polaris memory handler.",
      parameters:{type:"object",properties:{question:{type:"string",description:"User's precise request or question, retaining relevant detail."}},required:["question"],additionalProperties:false}}],
     tool_choice:"auto"}
   };
   let upstream;
   try{
    upstream=await fetch("https://api.openai.com/v1/realtime/client_secrets",{
     method:"POST",headers:{"Authorization":"Bearer "+env.Polaris_open_ai,
      "Content-Type":"application/json","OpenAI-Safety-Identifier":"polaris-"+device.id.replace(/-/g,"")},
     body:JSON.stringify(data)
    });
   }catch{return pcVoiceReply({error:"Could not connect to voice provider"},502)}
   if(!upstream.ok){
    const detail=(await upstream.text()).slice(0,350);
    console.error("Realtime client secret error",upstream.status,detail);
    return pcVoiceReply({error:"Voice session initialization failed (HTTP "+upstream.status+")."},502);
   }
   const value=await upstream.json();
   if(typeof value.value!=="string")return pcVoiceReply({error:"Voice session token missing"},502);
   await env.POLARIS_DB.prepare("INSERT INTO polaris_voice_sessions(id,device_id,created_at) VALUES(?,?,?)")
    .bind(crypto.randomUUID(),device.id,new Date().toISOString()).run();
   return pcVoiceReply({ok:true,value:value.value,model:PC_VOICE_MODEL});
  }
  let data;
  try{const text=await request.text();if(text.length>3500)return pcVoiceReply({error:"Question too long"},413);data=JSON.parse(text)}
  catch{return pcVoiceReply({error:"Invalid question"},400)}
  const message=String(data?.question||"").trim().slice(0,1500);
  if(message.length<3)return pcVoiceReply({error:"Please provide a question"},400);
  const normalized=new Request(url.origin+"/api/ask",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({message,source:"microphone",request_id:crypto.randomUUID()})
  });
  const response=await polarisOpenAIAnswer(normalized,env,false);
  let answer;try{answer=await response.json()}catch{return pcVoiceReply({error:"Polaris's reasoning service returned an invalid response"},502)}
  if(!response.ok||!answer.reply)return pcVoiceReply({error:answer.error||"Polaris could not answer"},response.status>=400?response.status:502);
  return pcVoiceReply({ok:true,reply:String(answer.reply).slice(0,4800),engine:answer.engine||"Polaris",project:answer.project||null});
 }
 return pcVoiceReply({error:"Unknown voice endpoint"},404);
}
