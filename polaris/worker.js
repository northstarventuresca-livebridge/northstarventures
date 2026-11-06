const LOGIN = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><meta name=\"robots\" content=\"noindex,nofollow\"><meta name=\"theme-color\" content=\"#050d1b\"><title>POLARIS · Secure Access</title><style>*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:22px;color:#e7f8ff;background:radial-gradient(circle at 50% 30%,#16365c 0%,#070e20 45%,#030711 100%);font:14px system-ui,-apple-system,sans-serif}body:before{content:\"\";position:fixed;inset:0;z-index:-1;background-image:linear-gradient(#6cb6ff0b 1px,transparent 1px),linear-gradient(90deg,#6cb6ff0b 1px,transparent 1px);background-size:40px 40px}.card{width:min(100%,390px);border:1px solid #61c3ff5c;border-radius:22px;background:#081a30e8;padding:32px 23px 27px;text-align:center;box-shadow:0 0 90px #1886eb28,inset 0 0 35px #174c7c2c}.logo{font-size:43px;color:#82f0ff;text-shadow:0 0 25px #43c8ff}.eyebrow{font-size:9px;letter-spacing:.24em;color:#87bdde;margin-top:12px}.title{font-size:29px;font-weight:800;letter-spacing:.3em;margin-top:5px}.divider{height:1px;background:linear-gradient(90deg,transparent,#45b9f9,transparent);margin:25px 0}p{color:#91abc4;line-height:1.6;font-size:12px;margin:0 0 19px}label{display:block;text-align:left;font-size:11px;color:#8eb2d1;margin:0 0 7px;letter-spacing:.1em}input{width:100%;background:#061122;border:1px solid #477da8;border-radius:9px;color:white;padding:15px;font-size:16px;outline:none}input:focus{border-color:#5bddff}button{width:100%;background:linear-gradient(110deg,#188fc9,#485be5);border:1px solid #66dfff;border-radius:10px;color:white;padding:15px;margin-top:13px;font-weight:800;letter-spacing:.1em;cursor:pointer}#msg{min-height:22px;color:#ffc18d;font-size:12px;margin-top:15px}.foot{color:#62839f;font-size:9px;letter-spacing:.12em;margin-top:20px}</style></head><body><main class=\"card\"><div class=\"logo\">✦</div><div class=\"title\">POLARIS</div><div class=\"eyebrow\">NORTH STAR VENTURES · PRIVATE AI COMMAND</div><div class=\"divider\"></div><p>Private command center. Enter your Polaris access key to activate this device.</p><form id=\"unlock\"><label for=\"code\">PRIVATE ACCESS KEY</label><input id=\"code\" type=\"password\" required autocomplete=\"current-password\" spellcheck=\"false\" autofocus placeholder=\"Enter access key\"><button id=\"submit\" type=\"submit\">UNLOCK COMMAND CENTER →</button><div id=\"msg\" role=\"status\"></div></form><div class=\"foot\">ENCRYPTED CONNECTION · PRIVATE SESSION</div></main><script>document.getElementById(\"unlock\").onsubmit=async function(e){e.preventDefault();var btn=document.getElementById(\"submit\"),msg=document.getElementById(\"msg\");btn.disabled=true;msg.textContent=\"Authenticating...\";try{var r=await fetch(\"/api/unlock\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({code:document.getElementById(\"code\").value})});if(!r.ok)throw new Error(\"Access key incorrect. Try again.\");location.replace(\"/\")}catch(x){msg.textContent=x.message;btn.disabled=false;document.getElementById(\"code\").value=\"\"}};</script></body></html>";
const RAW_URL = "https://raw.githubusercontent.com/northstarventuresca-livebridge/northstarventures/1777eb9e37a64865320b5443983e78fcb544ef9a/polaris/index.html";
const VOICE_UPGRADE = "// Polaris Voice v1.7 runtime patch.\n// This code is inserted inside the existing Polaris IIFE by the Worker,\n// so the original login, project cards, voice permissions, and UI remain intact.\nvar polaris17Recent=[],polaris17LastGreeting=0,polaris17LastReply=\"\",polaris17LastReplyAt=0;\n\nfunction polaris17Normalize(text){\n return String(text||\"\").toLowerCase().replace(/[^a-z0-9 ]/g,\" \").replace(/\\s+/g,\" \").trim();\n}\nfunction polaris17DuplicateVoice(text){\n var key=polaris17Normalize(text).replace(/^(hey )?polaris ?/,\"\"),now=Date.now();\n if(!key)return false;\n polaris17Recent=polaris17Recent.filter(function(c){return now-c.at<12000});\n for(var i=0;i<polaris17Recent.length;i++){\n  var old=polaris17Recent[i];\n  if(key===old.key&&now-old.at<12000)return true;\n  if(now-old.at<4000&&key.length>18&&Math.abs(key.length-old.key.length)<=3){\n   var words=key.split(\" \"),prev=old.key.split(\" \"),common=0;\n   words.forEach(function(word){if(prev.includes(word))common++});\n   if(common/Math.max(words.length,prev.length)>.92)return true;\n  }\n }\n polaris17Recent.push({key:key,at:now});\n return false;\n}\nvar polaris17OriginalCommand=command;\ncommand=function(raw,fromVoice){\n if(fromVoice&&polaris17DuplicateVoice(raw))return;\n return polaris17OriginalCommand(raw,fromVoice);\n};\nvar polaris17OriginalActivate=activate;\nactivate=function(){\n if(active&&Date.now()-polaris17LastGreeting<15000){\n  armedUntil=Date.now()+60000;\n  showReply(\"I'm listening.\");\n  return;\n }\n polaris17LastGreeting=Date.now();\n return polaris17OriginalActivate();\n};\nvar polaris17OriginalTalk=talk;\ntalk=function(message){\n var key=polaris17Normalize(message),now=Date.now();\n if(key&&key===polaris17LastReply&&now-polaris17LastReplyAt<9000)return voiceQueue;\n polaris17LastReply=key;polaris17LastReplyAt=now;\n return polaris17OriginalTalk(message);\n};\n\nfunction polaris17Stretch(input,speed,ctx){\n if(Math.abs(speed-1)<.015||input.length<input.sampleRate*.12)return input;\n var sampleRate=input.sampleRate,sourceLength=input.length,outLength=Math.max(1,Math.round(sourceLength/speed));\n var grain=Math.max(512,Math.round(sampleRate*.048)),hop=Math.max(128,Math.round(grain*.24)),overlap=grain-hop;\n var search=Math.round(sampleRate*.008),searchStep=Math.max(8,Math.round(sampleRate/4000)),scanStep=Math.max(10,Math.round(sampleRate/4000));\n var raw=[],acc=[],weights=new Float32Array(outLength);\n for(var ch=0;ch<input.numberOfChannels;ch++){raw.push(input.getChannelData(ch));acc.push(new Float32Array(outLength))}\n var window=new Float32Array(grain);\n for(var j=0;j<grain;j++)window[j]=.5-.5*Math.cos(2*Math.PI*j/(grain-1));\n for(var pos=0,frame=0;pos<outLength;pos+=hop,frame++){\n  var predicted=Math.max(0,Math.min(sourceLength-grain,Math.round(pos*speed))),read=predicted;\n  if(frame&&predicted>0&&predicted<sourceLength-grain){\n   var best=-Infinity;\n   for(var shift=-search;shift<=search;shift+=searchStep){\n    var trial=predicted+shift;\n    if(trial<0||trial+grain>=sourceLength)continue;\n    var dot=0,a2=0,b2=0;\n    for(var k=0;k<overlap;k+=scanStep){\n     var w=weights[pos+k];\n     if(w<.01)continue;\n     var a=acc[0][pos+k]/w,b=raw[0][trial+k];\n     dot+=a*b;a2+=a*a;b2+=b*b;\n    }\n    if(a2<.00001||b2<.00001)continue;\n    var score=dot/Math.sqrt(a2*b2)-Math.abs(shift)/sampleRate*.25;\n    if(score>best){best=score;read=trial}\n   }\n  }\n  for(var j=0;j<grain&&pos+j<outLength;j++){\n   var at=pos+j,wt=window[j];weights[at]+=wt;\n   for(var ch=0;ch<acc.length;ch++)acc[ch][at]+=raw[ch][read+j]*wt;\n  }\n }\n var out=ctx.createBuffer(input.numberOfChannels,outLength,sampleRate);\n for(var ch=0;ch<acc.length;ch++){\n  var result=out.getChannelData(ch),values=acc[ch];\n  for(var i=0;i<outLength;i++)result[i]=weights[i]>.00001?values[i]/weights[i]:0;\n }\n return out;\n}\n\n// Replace the old Android playback chain. PCM time-stretch preserves pitch\n// at the requested speaking speed and uses the already-unlocked WebAudio path.\nplayPcmAudio=function(data){\n if(!audioContext||audioContext.state!==\"running\")return Promise.reject(new Error(\"Tap ENABLE AUDIO to unlock the phone speaker.\"));\n return audioContext.decodeAudioData(data.slice(0)).then(async function(buffer){\n  if(listenWanted&&bargeWanted)await ensureBargeMicrophone().catch(function(){return false});\n  return new Promise(function(resolve,reject){\n   if(!buffer||!buffer.length){reject(new Error(\"Speech audio was empty.\"));return}\n   var processed=buffer,applied=1;\n   try{\n    processed=polaris17Stretch(buffer,speechRate,audioContext);\n    applied=processed===buffer?1:speechRate;\n   }catch(e){\n    processed=buffer;\n    applied=1;\n    record(\"Audio time-stretch fallback: \"+String(e.message).slice(0,90));\n   }\n   var source=audioContext.createBufferSource(),finished=false,timer;\n   source.buffer=processed;source.playbackRate.value=1;\n   source.connect(audioContext.destination);activeAudio=source;\n   function end(){\n    if(finished)return;finished=true;clearTimeout(timer);activeAudio=null;\n    resumeMicrophoneAfterSpeaker();resolve();\n   }\n   source.onended=end;\n   holdMicrophoneForSpeaker();\n   try{source.start()}catch(e){resumeMicrophoneAfterSpeaker();reject(e);return}\n   setAudioStatus(\"POLARIS SPEAKING · \"+applied.toFixed(2)+\"× · ORIGINAL PITCH\",\"ready\");\n   timer=setTimeout(end,Math.ceil(processed.duration*1000)+1500);\n  });\n });\n};\n\nel(\"speedSlider\").addEventListener(\"input\",function(){\n if(!speaking)setAudioStatus(\"NEXT REPLY \"+speechRate.toFixed(2)+\"× · PITCH UNCHANGED\",audioReady?\"ready\":\"\");\n});\nel(\"speedSlider\").setAttribute(\"title\",\"Applies to the next spoken reply. Use TEST VOICE to hear the new speed.\");\n\n// Convey the actual microphone/typing context and local project names to the model.\naskAI=async function(query){\n if(requestBusy)return;\n requestBusy=true;showReply(\"Thinking...\");el(\"aiStat\").textContent=\"THINKING\";el(\"aiDetail\").textContent=\"Understanding your request\";\n var inputSource=lastInputWasVoice?\"microphone\":\"typed\";\n try{\n  var response=await fetch(\"/api/ask\",{\n   method:\"POST\",\n   headers:{\"content-type\":\"application/json\"},\n   body:JSON.stringify({\n    message:query,source:inputSource,history:conversation.slice(-12),\n    projects:projects.slice(0,12).map(function(p){return {name:p.name,status:p.status,progress:p.progress}})\n   })\n  });\n  if(!response.ok)throw new Error(\"AI service returned \"+response.status);\n  var data=await response.json();\n  if(!data.reply)throw new Error(\"No answer received\");\n  conversation.push({role:\"user\",content:query},{role:\"assistant\",content:data.reply});\n  conversation=conversation.slice(-14);\n  record(\"AI replied: \"+data.reply.slice(0,100));\n  el(\"aiStat\").textContent=\"ONLINE\";\n  el(\"aiDetail\").textContent=data.engine||\"AI ready\";\n  talk(data.reply);\n }catch(e){\n  var note=\"Your words were received, but AI processing was unavailable: \"+e.message;\n  showReply(note);notify(note);el(\"aiStat\").textContent=\"ERROR\";el(\"aiDetail\").textContent=\"Check AI service\";\n }finally{requestBusy=false}\n};\ndocument.querySelector(\".eyebrow\").textContent=\"PERSONAL INTELLIGENCE NETWORK / V1.7\";\nvar foot=document.querySelector(\".footer\");\nif(foot)foot.innerHTML='<span>✦ POLARIS</span> · POWERED BY NORTH STAR VENTURES · MOBILE FOUNDATION v1.7';\n";
const encoder = new TextEncoder();
const baseHeaders = {"x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"no-referrer","cache-control":"no-store","x-robots-tag":"noindex, nofollow","content-security-policy":"default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"};
function reply(s, type, status=200, extra={}){return new Response(s,{status,headers:{...baseHeaders,"content-type":type,...extra}})}
function json(data,status=200,extra={}){return reply(JSON.stringify(data),"application/json; charset=utf-8",status,extra)}
function eq(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
async function mac(value,secret){const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const raw=new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(value)));return Array.from(raw).map(v=>v.toString(16).padStart(2,"0")).join("")}
async function isAuth(req,env){const cookie=(req.headers.get("cookie")||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("polaris_session="));if(!cookie)return false;const val=cookie.slice(16).split(".");if(val.length!==2)return false;const exp=Number(val[0]);if(!Number.isSafeInteger(exp)||Date.now()>exp||exp-Date.now()>31*86400000)return false;return eq(await mac("polaris:"+exp,env.POLARIS_AUTH_SECRET),val[1])}
export default {async fetch(request,env){try{const url=new URL(request.url);const path=url.pathname;if(path==="/health")return json({service:"polaris-mobile",online:true,version:"1.8",aiConnected:Boolean(env.AI),visionConnected:false});if(path==="/manifest.webmanifest")return reply(JSON.stringify({name:"Polaris · North Star Ventures",short_name:"Polaris",id:"/",start_url:"/",scope:"/",display:"standalone",background_color:"#030915",theme_color:"#060e1c",icons:[{src:"/favicon.svg",sizes:"any",type:"image/svg+xml",purpose:"any maskable"}]}),"application/manifest+json; charset=utf-8");if(path==="/favicon.svg")return reply('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill="#091a31"/><path d="M32 5l7 20 20 7-20 7-7 20-7-20L5 32l20-7z" fill="#71e9ff"/><circle cx="32" cy="32" r="7" fill="#122344"/></svg>',"image/svg+xml");if(!env.POLARIS_ACCESS_CODE||!env.POLARIS_AUTH_SECRET)return reply("Polaris authentication not configured","text/plain",503);if(path==="/api/unlock"&&request.method==="POST"){if(Number(request.headers.get("content-length")||"0")>1024)return json({error:"Invalid request"},413);let body;try{body=await request.json()}catch(e){return json({error:"Invalid request"},400)}if(!eq(body?.code,env.POLARIS_ACCESS_CODE))return json({error:"Invalid access code"},401);const exp=Date.now()+30*86400000;const sig=await mac("polaris:"+exp,env.POLARIS_AUTH_SECRET);return json({ok:true},200,{"set-cookie":"polaris_session="+exp+"."+sig+"; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Strict"})}if(path==="/api/logout"&&request.method==="POST")return json({ok:true},200,{"set-cookie":"polaris_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict"});const ok=await isAuth(request,env);if(!ok){if(path==="/"||path==="/index.html")return reply(LOGIN,"text/html; charset=utf-8");return json({error:"Authentication required"},401)}if(path==="/api/tts"&&request.method==="POST"){
 if(!env.AI)return json({error:"AI connection unavailable"},503);
 if(Number(request.headers.get("content-length")||0)>3500)return json({error:"Message too long"},413);
 let data;try{data=await request.json()}catch(e){return json({error:"Invalid JSON"},400)}
 const content=typeof data?.text==="string"?data.text.trim():"";
 if(content.length<1||content.length>700)return json({error:"Text must be 1-700 characters"},400);
 try{
  const speech=await env.AI.run("@cf/deepgram/aura-2-en",{speaker:"draco",encoding:"mp3",text:content},{returnRawResponse:true});
  if(!speech)return json({error:"AI voice returned no audio"},502);
  const body=speech instanceof Response?(speech.ok?speech.body:null):speech;
  if(!body)return json({error:"AI speech service failed"},502);
  if(!(body instanceof ReadableStream)&&!(body instanceof ArrayBuffer)&&!ArrayBuffer.isView(body))return json({error:"AI speech returned an unexpected format"},502);
  return new Response(body,{status:200,headers:{...baseHeaders,"content-type":"audio/mpeg","x-polaris-voice":"draco-british-ai","cache-control":"no-store"}});
 }catch(e){return json({error:"AI voice service is not available"},502)}
}
if(path==="/api/transcribe"&&request.method==="POST"){
 if(!env.AI)return json({error:"Speech recognition unavailable"},503);
 const mime=(request.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
 if(mime!=="audio/wav"&&mime!=="audio/wave"&&mime!=="audio/x-wav")return json({error:"Expected WAV audio"},415);
 const len=Number(request.headers.get("content-length")||0);
 if(len>1500000)return json({error:"Audio too large"},413);
 try{
  const buf=await request.arrayBuffer();
  if(buf.byteLength<1000||buf.byteLength>1500000)return json({error:"Audio length out of range"},413);
  const view=new DataView(buf);
  if(view.getUint32(0,false)!==0x52494646||view.getUint32(8,false)!==0x57415645)return json({error:"Invalid WAV header"},400);
  const arr=new Uint8Array(buf);
  const segments=[];
  for(let i=0;i<arr.byteLength;i+=8192)segments.push(String.fromCharCode(...arr.subarray(i,i+8192)));
  const audio=btoa(segments.join(""));
  const output=await env.AI.run("@cf/openai/whisper-large-v3-turbo",{audio,language:"en",task:"transcribe",vad_filter:true});
  const transcript=typeof output?.text==="string"?output.text.trim():"";
  return json({text:transcript.slice(0,1500),source:"buffered-microphone",model:"whisper-large-v3-turbo"});
 }catch(e){
  return json({error:"Speech transcription service unavailable"},502);
 }
}

if(path==="/api/history"&&request.method==="GET"){
 if(!env.POLARIS_DB)return json({error:"Conversation journal not connected"},503);
 const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit")||80)||80));
 try{
  await env.POLARIS_DB.prepare("DELETE FROM dialogue_turns WHERE created_at < datetime('now', '-30 days')").run();
  const r=await env.POLARIS_DB.prepare("SELECT id,kind,source,user_text,assistant_text,model,latency_ms,feedback,feedback_notes,created_at FROM dialogue_turns ORDER BY created_at DESC,id DESC LIMIT ?").bind(limit).all();
  return json({turns:r.results||[],retention_days:30,raw_audio_saved:false});
 }catch(e){return json({error:"Could not read conversation journal"},502)}
}
if(path==="/api/clear-history"&&request.method==="POST"){
 if(!env.POLARIS_DB)return json({error:"Conversation journal not connected"},503);
 try{await env.POLARIS_DB.prepare("DELETE FROM dialogue_turns").run();return json({ok:true,deleted:true})}
 catch(e){return json({error:"Could not delete conversation journal"},502)}
}
if(path==="/api/feedback"&&request.method==="POST"){
 if(!env.POLARIS_DB)return json({error:"Conversation journal not connected"},503);
 const raw=await request.text();if(raw.length>1500)return json({error:"Too much feedback"},413);
 let d;try{d=JSON.parse(raw)}catch(e){return json({error:"Invalid JSON"},400)}
 if(typeof d?.id!=="string"||!/^[A-Za-z0-9-]{16,75}$/.test(d.id)||!["wrong","helpful",""].includes(d.feedback))return json({error:"Invalid feedback"},400);
 const notes=typeof d.notes==="string"?d.notes.slice(0,400):"";
 try{await env.POLARIS_DB.prepare("UPDATE dialogue_turns SET feedback=?,feedback_notes=? WHERE id=?").bind(d.feedback,notes,d.id).run();return json({ok:true})}
 catch(e){return json({error:"Feedback update failed"},502)}
}
if(path==="/api/log"&&request.method==="POST"){
 if(!env.POLARIS_DB)return json({error:"Conversation journal not connected"},503);
 const raw=await request.text();if(raw.length>3800)return json({error:"Too much text"},413);
 let d;try{d=JSON.parse(raw)}catch(e){return json({error:"Invalid JSON"},400)}
 if(typeof d?.message!=="string"||typeof d?.reply!=="string")return json({error:"Invalid action log"},400);
 const clean=s=>String(s).slice(0,2300).replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{20,})\b/g,"[REDACTED KEY]").replace(/(\b(?:password|secret|token|api key|access key|access code)\b\s*(?:is|:|=)\s*)\S+/gi,"$1[REDACTED]");
 const id=typeof d.request_id==="string"&&/^[A-Za-z0-9-]{16,75}$/.test(d.request_id)?d.request_id:crypto.randomUUID();
 const source=d.source==="microphone"?"microphone":"typed";
 try{
  await env.POLARIS_DB.prepare("INSERT OR IGNORE INTO dialogue_turns(id,kind,source,user_text,assistant_text,model) VALUES(?,?,?,?,?,?)").bind(id,"command",source,clean(d.message),clean(d.reply),"Local command").run();
  return json({ok:true,id});
 }catch(e){return json({error:"Action logging failed"},502)}
}
if(path==="/api/ask"&&request.method==="POST"){
 if(!env.AI)return json({error:"AI connection unavailable"},503);
 if(!env.POLARIS_DB)return json({error:"Conversation memory unavailable"},503);
 const raw=await request.text();if(raw.length>14500)return json({error:"Request too large"},413);
 let d;try{d=JSON.parse(raw)}catch(e){return json({error:"Invalid JSON"},400)}
 const message=typeof d?.message==="string"?d.message.trim():"";
 if(!message||message.length>2200)return json({error:"Message must be 1-2200 characters"},400);
 const id=typeof d.request_id==="string"&&/^[A-Za-z0-9-]{16,75}$/.test(d.request_id)?d.request_id:crypto.randomUUID();
 const source=d.source==="microphone"?"microphone":"typed";
 const clean=s=>String(s).slice(0,3500).replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9_]{20,})\b/g,"[REDACTED KEY]").replace(/(\b(?:password|secret|token|api key|access key|access code)\b\s*(?:is|:|=)\s*)\S+/gi,"$1[REDACTED]");
 const began=Date.now();
 try{
  const saved=await env.POLARIS_DB.prepare("SELECT assistant_text,model FROM dialogue_turns WHERE id=? LIMIT 1").bind(id).first();
  if(saved&&saved.assistant_text)return json({reply:saved.assistant_text,engine:saved.model,replayed:true,request_id:id});
 }catch(e){}
 let history=[];
 try{
  const q=await env.POLARIS_DB.prepare("SELECT user_text,assistant_text FROM dialogue_turns WHERE kind='ai' ORDER BY created_at DESC,id DESC LIMIT 22").all();
  for(const item of (q.results||[]).reverse()){
   if(item.user_text)history.push({role:"user",content:String(item.user_text).slice(0,2000)});
   if(item.assistant_text)history.push({role:"assistant",content:String(item.assistant_text).slice(0,2200)});
  }
 }catch(e){}
 const system="You are Polaris, a thoughtful, capable, conversational AI assistant for the owner of North Star Ventures. You have a natural polished British tone. Actually satisfy requests and address their intent. When asked to recite the alphabet, recite it. Do not list projects unless asked. For simple requests, answer directly and briefly. For brainstorming, design discussions and problem-solving, collaborate deeply, explore tradeoffs, build on previous ideas, and ask one thoughtful follow-up when useful. Be as helpful and insightful as possible, never generic or robotic. Do not say 'I am here to help' or repeat a menu of abilities.\nThe input can be a phone MICROPHONE TRANSCRIPT, not typing. For voice checks, note the phone recognized the spoken words; you cannot directly hear raw audio or see camera video. Minor transcription mistakes happen, use context to infer intended meaning. You receive recent real conversation turns, so reference them and maintain continuity, including brainstorming context.\nNorth Star Ventures owns several projects: HOH HUB (sponsorship and administration), LiveBridge (live transcription and communication), TapBin (inventory and NFC), Songwriters Compass (songwriting AI), X32 AI Engineer (audio EQ) and Polaris. Those are broad background topics, not current project statuses. The only project cards available, if present, are manually entered and not live data. Never invent actual project milestones, current work, account connections or deployments.\nYou currently cannot access other ChatGPT conversations or memories, Cloudflare account resources, GitHub repositories, Gmail, camera or phone screen, or take real-world actions. You are not GPT-6 and are not connected to the ChatGPT session. You can brainstorm and give advice, but don't pretend to have run code or changed sites. Answers are read aloud, so no markdown headings or bullet lists unless explicitly requested. Private 30-day dialogue logs store transcribed text and AI replies, not microphone recordings.";
 const wantsProjects=/\b(?:project|projects|hoh|livebridge|tapbin|compass|x32|nsv)\b|home of hope|north star ventures/i.test(message);
 const cards=Array.isArray(d.projects)&&wantsProjects?d.projects.slice(0,12).filter(p=>p&&typeof p.name==="string").map(p=>({name:p.name.slice(0,80),status:typeof p.status==="string"?p.status.slice(0,40):"unknown",progress:typeof p.progress==="number"?p.progress:null})):[];
 const userText="[INPUT: "+(source==="microphone"?"MICROPHONE TRANSCRIPT":"TYPED TEXT")+"]\n"+(cards.length?"[LOCAL PROJECT CARDS (not live): "+JSON.stringify(cards)+"]\n":"")+message;
 const messages=[{role:"system",content:system},...history,{role:"user",content:userText}];
 let answer="",engine="";
 try{
  const r=await env.AI.run("@cf/deepseek-ai/deepseek-v4-pro-0813",{messages,max_tokens:900,reasoning:{effort:"low"}});
  answer=typeof r?.choices?.[0]?.message?.content==="string"?r.choices[0].message.content.trim():typeof r?.response==="string"?r.response.trim():"";
  if(!answer)throw new Error("No answer");
  engine="DeepSeek V4 Pro · Cloudflare";
 }catch(e){
  try{
   const r=await env.AI.run("@cf/openai/gpt-oss-120b",{messages,max_tokens:850,reasoning:{effort:"low"}});
   answer=typeof r?.choices?.[0]?.message?.content==="string"?r.choices[0].message.content.trim():typeof r?.response==="string"?r.response.trim():"";
   if(!answer)throw new Error("No fallback answer");
   engine="OpenAI gpt-oss-120b · fallback";
  }catch(e){return json({error:"AI conversation unavailable"},502)}
 }
 answer=answer.slice(0,3500);
 const duration=Date.now()-began;
 let logged=false;
 try{
  await env.POLARIS_DB.prepare("DELETE FROM dialogue_turns WHERE created_at < datetime('now', '-30 days')").run();
  const saved=await env.POLARIS_DB.prepare("INSERT OR IGNORE INTO dialogue_turns(id,kind,source,user_text,assistant_text,model,latency_ms) VALUES(?,?,?,?,?,?,?)").bind(id,"ai",source,clean(message),clean(answer),engine,duration).run();
  logged=!!saved.success;
 }catch(e){}
 return json({reply:answer,engine,source,request_id:id,logged,latency_ms:duration,history_turns:history.length/2});
}
if(path==="/api/session")return json({authenticated:true});if(request.method==="GET"&&(path==="/"||path==="/index.html")){const r=await fetch(RAW_URL,{cf:{cacheTtl:60}});if(!r.ok)return reply("Polaris dashboard temporarily unavailable","text/plain",502);const html=await r.text(),target="\n})();\n</script>";if(!html.includes(target))return reply("Polaris frontend version is incompatible","text/plain",502);return reply(html.replace(target,"\n"+VOICE_UPGRADE+target),"text/html; charset=utf-8")}return reply("Not found","text/plain",404)}catch(e){return reply("Polaris server error","text/plain",500)}}};