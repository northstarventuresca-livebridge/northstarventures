
/* Polaris Android Voice Companion: device-scoped realtime voice credentials and
   routed general-purpose Polaris questions. Never exposes the long-lived API key. */
const PC_VOICE_MODEL="gpt-realtime-2.1";
function pcVoiceReply(value,status=200){
 return new Response(JSON.stringify(value),{status,headers:{"content-type":"application/json;charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
async function pcVoiceApi(request,env,url){
 const path=url.pathname;
 if(path==="/api/companion/voice/speak"){
  if(request.method!=="POST")return pcVoiceReply({error:"POST required"},405);
  const device=await pcDevice(request,env);
  if(!device)return pcVoiceReply({error:"Polaris phone pairing required"},401);
  if(!env.AI)return pcVoiceReply({error:"Draco voice service is unavailable"},503);
  let data;try{const raw=await request.text();if(raw.length>1100)throw Error("Too much text");data=JSON.parse(raw)}catch{return pcVoiceReply({error:"Invalid speech request"},400)}
  const text=String(data?.text||"").trim().slice(0,550);
  if(text.length<1||text.length>500)return pcVoiceReply({error:"Speech text must be 1–500 characters"},400);
  try{
   const session=await env.POLARIS_DB.prepare("SELECT id FROM polaris_voice_sessions WHERE device_id=? AND created_at>? LIMIT 1")
    .bind(device.id,new Date(Date.now()-6*3600000).toISOString()).first();
   if(!session)return pcVoiceReply({error:"Start a Polaris phone conversation first"},401);
   const result=await env.AI.run("@cf/deepgram/aura-2-en",{speaker:"draco",encoding:"mp3",text},{returnRawResponse:true});
   const body=result instanceof Response?(result.ok?result.body:null):result;
   if(!body)return pcVoiceReply({error:"Draco voice synthesis temporarily unavailable"},503);
   return new Response(body,{status:200,headers:{"content-type":"audio/mpeg","cache-control":"private, no-store","x-content-type-options":"nosniff","x-polaris-voice":"aura-2-draco"}});
  }catch(e){
   console.error("Polaris Draco TTS unavailable",String(e?.name||"error").slice(0,45));
   return pcVoiceReply({error:"Draco voice synthesis temporarily unavailable"},503);
  }
 }
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
    "Talk naturally and concisely, with warm British conversational phrasing. You generate TEXT only and the Polaris client renders that text using its selected British Draco voice at 1.25x speed; never narrate technical voice details. You are NOT the ChatGPT app session; do not claim to inherit its private connected-app permissions.",
    "You are in a live audio conversation with the owner. Listen, let the owner interrupt, and respond conversationally.",
    "For ANY factual question about the owner's real projects, plans, shopping notes, saved reminders, Github/Cloudflare files or past work, ALWAYS use ask_polaris BEFORE answering.",
    "When calling ask_polaris, pass the owner's actual words as closely as possible. Do not rewrite as 'the owner asked' or invent search instructions: the question itself is the query.",
    "The Polaris backend can retrieve real Monica's House time journals, current indexed project context and authorized GitHub activity. Use tool-returned facts rather than old conversation guesses.",
    "If the tool gives a specific record count/date/time, use it; if a requested date has no entries, distinguish that from other dated entries or unconnected sources. Never insist a saved entry doesn't exist without a successful lookup.",
    "ask_polaris connects to the existing Polaris text reasoning, project snapshots, and personal memory. Its result might be stale or limited: say so when appropriate.",
    "This phone IS connected to Polaris's TV Live Display. When you use ask_polaris for a project update, the backend automatically sends verified source-scoped visuals to the screen when successful. Never tell the owner you cannot update the dashboard without checking the tool's display status.",
    "The owner mainly interacts with you by phone; the TV is a read-only visual companion, refreshed automatically. If the tool confirms displayUpdated=true, say the display is updated. If false, do not claim success.",

    "For a request to save personal memories, use ask_polaris and describe what it actually confirmed. Do not claim an action succeeded without confirmation.",
    "For a specific request to modify website CODE, design, UI or server implementation, ALWAYS use queue_change_request instead of ask_polaris. It only saves a request for owner review. Never say it was deployed, committed, or completed.",
    "For a user request like call me back in 5 minutes, invoke the schedule_callback tool. It arranges a local Android notification, not a telephone call over the carrier network.",
    "This conversation should not sound like a formal morning announcement. Start with a short greeting and ask how you can help.",
    "Never read access tokens or secrets aloud. If tool returns an error, explain concisely."
   ].join("\n");
   const data={
    expires_after:{anchor:"created_at",seconds:90},
    session:{type:"realtime",model:PC_VOICE_MODEL,instructions,output_modalities:["text"],
     audio:{input:{turn_detection:{type:"server_vad",create_response:true,interrupt_response:true}}},
     tools:[{type:"function",name:"ask_polaris",
      description:"Search verified Polaris project knowledge, Monaco renovation journal snapshots, authorized live GitHub code/commits and personal memory. Pass the user's original question verbatim; do not paraphrase or wrap it as 'the owner asked'. Use for any factual question about their projects, tasks, repositories, Cloudflare, or history. Results are source-scoped, and unavailable connections must not be invented.",
      parameters:{type:"object",properties:{question:{type:"string",description:"User's precise request or question, retaining relevant detail."}},required:["question"],additionalProperties:false}},
      {type:"function",name:"schedule_callback",description:"Schedule the Polaris Android companion to ring again after the requested number of minutes; requires the owner to have the companion installed. Use for 'call me back in 5 minutes'.",parameters:{type:"object",properties:{minutes:{type:"integer",minimum:1,maximum:60}},required:["minutes"],additionalProperties:false}},
      {type:"function",name:"queue_change_request",description:"When the owner wants Polaris to modify a real website or project code, save a review request in Polaris. This does NOT edit, deploy, or commit any code. Require a clear project and request details. The owner reviews requested changes separately.",parameters:{type:"object",properties:{project:{type:"string"},instructions:{type:"string"}},required:["project","instructions"],additionalProperties:false}}],
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

  let display={updated:false};
  try{
    const result=await pcPublishVoiceDisplay(env,message,answer);
    display={updated:result.published===true,project:result.project||null,source:result.source||null,updatedAt:result.updatedAt||null};
  }catch(e){
    console.error("Voice display publish failed:",String(e?.name||"error").slice(0,70));
    display={updated:false,error:"Display update unavailable; conversation answer is still valid"};
  }
  return pcVoiceReply({ok:true,reply:String(answer.reply).slice(0,4800),engine:answer.engine||"Polaris",project:answer.project||null,display});
 }
 return pcVoiceReply({error:"Unknown voice endpoint"},404);
}
