const LOGIN = "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"><meta name=\"robots\" content=\"noindex,nofollow\"><meta name=\"theme-color\" content=\"#050d1b\"><title>POLARIS · Secure Access</title><style>*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:22px;color:#e7f8ff;background:radial-gradient(circle at 50% 30%,#16365c 0%,#070e20 45%,#030711 100%);font:14px system-ui,-apple-system,sans-serif}body:before{content:\"\";position:fixed;inset:0;z-index:-1;background-image:linear-gradient(#6cb6ff0b 1px,transparent 1px),linear-gradient(90deg,#6cb6ff0b 1px,transparent 1px);background-size:40px 40px}.card{width:min(100%,390px);border:1px solid #61c3ff5c;border-radius:22px;background:#081a30e8;padding:32px 23px 27px;text-align:center;box-shadow:0 0 90px #1886eb28,inset 0 0 35px #174c7c2c}.logo{font-size:43px;color:#82f0ff;text-shadow:0 0 25px #43c8ff}.eyebrow{font-size:9px;letter-spacing:.24em;color:#87bdde;margin-top:12px}.title{font-size:29px;font-weight:800;letter-spacing:.3em;margin-top:5px}.divider{height:1px;background:linear-gradient(90deg,transparent,#45b9f9,transparent);margin:25px 0}p{color:#91abc4;line-height:1.6;font-size:12px;margin:0 0 19px}label{display:block;text-align:left;font-size:11px;color:#8eb2d1;margin:0 0 7px;letter-spacing:.1em}input{width:100%;background:#061122;border:1px solid #477da8;border-radius:9px;color:white;padding:15px;font-size:16px;outline:none}input:focus{border-color:#5bddff}button{width:100%;background:linear-gradient(110deg,#188fc9,#485be5);border:1px solid #66dfff;border-radius:10px;color:white;padding:15px;margin-top:13px;font-weight:800;letter-spacing:.1em;cursor:pointer}#msg{min-height:22px;color:#ffc18d;font-size:12px;margin-top:15px}.foot{color:#62839f;font-size:9px;letter-spacing:.12em;margin-top:20px}</style></head><body><main class=\"card\"><div class=\"logo\">✦</div><div class=\"title\">POLARIS</div><div class=\"eyebrow\">NORTH STAR VENTURES · PRIVATE AI COMMAND</div><div class=\"divider\"></div><p>Private command center. Enter your Polaris access key to activate this device.</p><form id=\"unlock\"><label for=\"code\">PRIVATE ACCESS KEY</label><input id=\"code\" type=\"password\" required autocomplete=\"current-password\" spellcheck=\"false\" autofocus placeholder=\"Enter access key\"><button id=\"submit\" type=\"submit\">UNLOCK COMMAND CENTER →</button><div id=\"msg\" role=\"status\"></div></form><div class=\"foot\">ENCRYPTED CONNECTION · PRIVATE SESSION</div></main><script>document.getElementById(\"unlock\").onsubmit=async function(e){e.preventDefault();var btn=document.getElementById(\"submit\"),msg=document.getElementById(\"msg\");btn.disabled=true;msg.textContent=\"Authenticating...\";try{var r=await fetch(\"/api/unlock\",{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({code:document.getElementById(\"code\").value})});if(!r.ok)throw new Error(\"Access key incorrect. Try again.\");location.replace(\"/\")}catch(x){msg.textContent=x.message;btn.disabled=false;document.getElementById(\"code\").value=\"\"}};</script></body></html>";
const RAW_URL = "https://raw.githubusercontent.com/northstarventuresca-livebridge/northstarventures/93b6289c02b6f849d4bd2a5cf4be196640ffc05c/polaris/index.html";
const encoder = new TextEncoder();
const baseHeaders = {"x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"no-referrer","cache-control":"no-store","x-robots-tag":"noindex, nofollow","content-security-policy":"default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; form-action 'self'; img-src 'self' data:; connect-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"};
function reply(s, type, status=200, extra={}){return new Response(s,{status,headers:{...baseHeaders,"content-type":type,...extra}})}
function json(data,status=200,extra={}){return reply(JSON.stringify(data),"application/json; charset=utf-8",status,extra)}
function eq(a,b){if(typeof a!=="string"||typeof b!=="string"||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
async function mac(value,secret){const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const raw=new Uint8Array(await crypto.subtle.sign("HMAC",key,encoder.encode(value)));return Array.from(raw).map(v=>v.toString(16).padStart(2,"0")).join("")}
async function isAuth(req,env){const cookie=(req.headers.get("cookie")||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("polaris_session="));if(!cookie)return false;const val=cookie.slice(16).split(".");if(val.length!==2)return false;const exp=Number(val[0]);if(!Number.isSafeInteger(exp)||Date.now()>exp||exp-Date.now()>31*86400000)return false;return eq(await mac("polaris:"+exp,env.POLARIS_AUTH_SECRET),val[1])}
export default {async fetch(request,env){try{const url=new URL(request.url);const path=url.pathname;if(path==="/health")return json({service:"polaris-mobile",online:true,version:"1.4",aiConnected:Boolean(env.AI),visionConnected:false});if(path==="/manifest.webmanifest")return reply(JSON.stringify({name:"Polaris · North Star Ventures",short_name:"Polaris",id:"/",start_url:"/",scope:"/",display:"standalone",background_color:"#030915",theme_color:"#060e1c",icons:[{src:"/favicon.svg",sizes:"any",type:"image/svg+xml",purpose:"any maskable"}]}),"application/manifest+json; charset=utf-8");if(path==="/favicon.svg")return reply('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="13" fill="#091a31"/><path d="M32 5l7 20 20 7-20 7-7 20-7-20L5 32l20-7z" fill="#71e9ff"/><circle cx="32" cy="32" r="7" fill="#122344"/></svg>',"image/svg+xml");if(!env.POLARIS_ACCESS_CODE||!env.POLARIS_AUTH_SECRET)return reply("Polaris authentication not configured","text/plain",503);if(path==="/api/unlock"&&request.method==="POST"){if(Number(request.headers.get("content-length")||"0")>1024)return json({error:"Invalid request"},413);let body;try{body=await request.json()}catch(e){return json({error:"Invalid request"},400)}if(!eq(body?.code,env.POLARIS_ACCESS_CODE))return json({error:"Invalid access code"},401);const exp=Date.now()+30*86400000;const sig=await mac("polaris:"+exp,env.POLARIS_AUTH_SECRET);return json({ok:true},200,{"set-cookie":"polaris_session="+exp+"."+sig+"; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Strict"})}if(path==="/api/logout"&&request.method==="POST")return json({ok:true},200,{"set-cookie":"polaris_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict"});const ok=await isAuth(request,env);if(!ok){if(path==="/"||path==="/index.html")return reply(LOGIN,"text/html; charset=utf-8");return json({error:"Authentication required"},401)}if(path==="/api/tts"&&request.method==="POST"){
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
if(path==="/api/ask"&&request.method==="POST"){
 if(!env.AI)return json({error:"AI connection unavailable"},503);
 if(Number(request.headers.get("content-length")||0)>11000)return json({error:"Request too long"},413);
 let data;try{data=await request.json()}catch(e){return json({error:"Invalid JSON"},400)}
 const message=typeof data?.message==="string"?data.message.trim():"";
 if(!message||message.length>1400)return json({error:"Message must be 1-1400 characters"},400);
 const history=Array.isArray(data?.history)?data.history.slice(-8).filter(m=>m&&["user","assistant"].includes(m.role)&&typeof m.content==="string").map(m=>({role:m.role,content:m.content.slice(0,800)})):[];
 const system="You are Polaris, an intelligent concise personal assistant for North Star Ventures. You communicate in a calm polished British manner, warmly and confidently without excessive theatrics. Use no more than 2-4 concise sentences for simple spoken responses. You are in an early mobile web prototype; you currently have conversational AI, manually entered project cards, website shortcuts, voice commands, and voice synthesis. You CANNOT access Gmail, Cloudflare account data, GitHub repositories, control the device beyond local shortcuts, send messages or change/deploy websites. Do not pretend to execute actions, browse or read current data. For requests that need capabilities not yet connected, say so and suggest the intended integration. You are not the user's existing ChatGPT account. Avoid giving secret or account access instructions unless asked. Be clear about uncertainty.";
 try{
  const output=await env.AI.run("@cf/meta/llama-3.3-70b-instruct-fp8-fast",{messages:[{role:"system",content:system},...history,{role:"user",content:message}],max_tokens:235,temperature:0.4});
  const answer=typeof output?.response==="string"?output.response.trim():"";
  if(!answer)return json({error:"AI did not provide a response"},502);
  return json({reply:answer.slice(0,1000),engine:"Cloudflare Workers AI",voice:"draco"});
 }catch(e){return json({error:"AI conversation unavailable"},502)}
}
if(path==="/api/session")return json({authenticated:true});if(request.method==="GET"&&(path==="/"||path==="/index.html")){const r=await fetch(RAW_URL,{cf:{cacheTtl:60}});if(!r.ok)return reply("Polaris dashboard temporarily unavailable","text/plain",502);return reply(await r.text(),"text/html; charset=utf-8")}return reply("Not found","text/plain",404)}catch(e){return reply("Polaris server error","text/plain",500)}}};