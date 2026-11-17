
// Polaris phone-to-TV sign-in. Short-lived QR ticket never grants access by itself.
// A freshly verified passkey on the owner's phone is required to approve.
// Existing login/passkey/voice paths remain unchanged.
const TV_SIGNIN_HOST="polaris.northstarventures.ca";
function tvResponse(value,status=200,cookies=[]){
 const headers=new Headers({"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"});
 for(const cookie of cookies)headers.append("set-cookie",cookie);
 return new Response(JSON.stringify(value),{status,headers});
}
function tvOrigin(req){
 const url=new URL(req.url);
 return url.protocol==="https:"&&url.hostname===TV_SIGNIN_HOST&&req.headers.get("origin")==="https://"+TV_SIGNIN_HOST;
}
function tvTicket(input){return typeof input==="string"&&/^[A-Za-z0-9_-]{43}$/.test(input)}
function tvId(input){return typeof input==="string"&&/^[0-9a-f-]{36}$/.test(input)}
async function tvHash(text){
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));
 return Array.from(bytes,v=>v.toString(16).padStart(2,"0")).join("");
}
function tvCookie(req,name){
 const cookie=req.headers.get("cookie")||"";
 const match=cookie.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));
 return match?match.slice(name.length+1):"";
}
function tvLabel(userAgent){
 const ua=String(userAgent||"").slice(0,400);
 if(/SmartTV|Tizen|Web0S|WebOS|HbbTV|Roku|AppleTV|CrKey|Android TV/i.test(ua))return "Smart TV";
 if(/Windows/i.test(ua))return "Windows computer";
 if(/Macintosh|Mac OS X/i.test(ua))return "Mac computer";
 if(/iPad/i.test(ua))return "iPad";
 if(/Android|iPhone/i.test(ua))return "Mobile browser";
 return "New web browser";
}
async function tvStart(req,env){
 if(req.method!=="POST"||!tvOrigin(req))return tvResponse({error:"Use the official Polaris login page"},403);
 let data={};try{const input=await req.text();if(input.length>500)return tvResponse({error:"Invalid request size"},413);data=JSON.parse(input)}catch{return tvResponse({error:"Invalid request"},400)}
 const target=["/","/command","/display","/assistant"].includes(data.target)?data.target:"/";
 const now=Date.now(),ip=String(req.headers.get("cf-connecting-ip")||"unknown").slice(0,100);
 const ipHash=await mac("polaris-tv-rate:"+ip,env.POLARIS_AUTH_SECRET);
 const rate=await env.POLARIS_DB.prepare("SELECT COUNT(*) AS n FROM polaris_tv_signins WHERE ip_hash=? AND created_ms>?").bind(ipHash,now-600000).first();
 if((rate?.n||0)>=9)return tvResponse({error:"Too many sign-in requests. Wait ten minutes."},429);
 const id=crypto.randomUUID(),ticket=pkEnc(crypto.getRandomValues(new Uint8Array(32)));
 const browserProof=pkEnc(crypto.getRandomValues(new Uint8Array(32))),verifyCode=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0"),until=now+300000;
 const label=tvLabel(req.headers.get("user-agent"));
 await env.POLARIS_DB.prepare("INSERT INTO polaris_tv_signins(id,ticket_hash,proof_hash,verify_code,created_ms,expires_ms,client_label,ip_hash,target) VALUES(?,?,?,?,?,?,?,?,?)")
  .bind(id,await tvHash(ticket),await tvHash(browserProof),verifyCode,now,until,label,ipHash,target).run();
 // Periodic cleanup avoids storing long-lived pairing tickets or approximate location history.
 if(Math.random()<0.08)try{await env.POLARIS_DB.prepare("DELETE FROM polaris_tv_signins WHERE expires_ms<?").bind(now-7200000).run()}catch(e){}
 const proofCookie="polaris_tv_proof="+browserProof+"; Max-Age=300; Path=/api/device-signin; HttpOnly; Secure; SameSite=Strict";
 return tvResponse({ok:true,id,ticket,verifyCode,expiresIn:300,approveUrl:"https://"+TV_SIGNIN_HOST+"/authorize-tv?ticket="+ticket,label,target},201,[proofCookie]);
}
async function tvInfo(req,env,url){
 if(req.method!=="GET"||url.hostname!==TV_SIGNIN_HOST)return tvResponse({error:"Invalid request"},403);
 const ticket=url.searchParams.get("ticket");
 if(!tvTicket(ticket))return tvResponse({error:"Invalid or expired pairing link"},400);
 const row=await env.POLARIS_DB.prepare("SELECT verify_code,client_label,status,expires_ms FROM polaris_tv_signins WHERE ticket_hash=?").bind(await tvHash(ticket)).first();
 if(!row||row.expires_ms<=Date.now()||row.status!=="pending")return tvResponse({error:"Pairing link is expired or already used"},410);
 return tvResponse({ok:true,verifyCode:row.verify_code,device:row.client_label,expiresIn:Math.max(0,Math.floor((row.expires_ms-Date.now())/1000))});
}
async function tvFreshPasskey(req,env){
 const value=tvCookie(req,"polaris_fresh_passkey").split(".");
 if(value.length!==2||!/^[0-9]{13}$/.test(value[0]))return false;
 const exp=Number(value[0]);
 if(exp<=Date.now()||exp>Date.now()+121000)return false;
 return eq(value[1],await mac("polaris:fresh-passkey:"+exp,env.POLARIS_AUTH_SECRET));
}
async function tvApprove(req,env){
 if(req.method!=="POST"||!tvOrigin(req)||req.headers.get("x-polaris-action")!=="1")return tvResponse({error:"Secure Polaris phone confirmation required"},403);
 if(!await isAuth(req,env)||!await tvFreshPasskey(req,env))return tvResponse({error:"Verify your phone passkey first, then approve the TV."},401);
 let data;try{data=await req.json()}catch{return tvResponse({error:"Invalid request"},400)}
 if(!tvTicket(data?.ticket)||typeof data?.verifyCode!=="string"||!/^[0-9]{6}$/.test(data.verifyCode))return tvResponse({error:"Invalid pairing details"},400);
 const hash=await tvHash(data.ticket),now=Date.now(),remember=data.remember===true?1:0;
 const changed=await env.POLARIS_DB.prepare("UPDATE polaris_tv_signins SET status='approved',remember=?,approved_ms=? WHERE ticket_hash=? AND verify_code=? AND status='pending' AND expires_ms>?")
  .bind(remember,now,hash,data.verifyCode,now).run();
 if(!changed.meta?.changes)return tvResponse({error:"This pairing request expired or is already approved."},410);
 return tvResponse({ok:true,status:"approved",duration:remember?"30 days":"2 hours"});
}
async function tvPoll(req,env){
 if(req.method!=="POST"||!tvOrigin(req))return tvResponse({error:"Invalid device login"},403);
 let data;try{data=await req.json()}catch{return tvResponse({error:"Invalid request"},400)}
 if(!tvId(data?.id))return tvResponse({error:"Invalid pairing ID"},400);
 const proof=tvCookie(req,"polaris_tv_proof");
 if(!tvTicket(proof))return tvResponse({error:"This browser no longer has its pairing proof. Restart sign-in."},401);
 const row=await env.POLARIS_DB.prepare("SELECT proof_hash,status,expires_ms,target,remember FROM polaris_tv_signins WHERE id=?").bind(data.id).first();
 if(!row||row.proof_hash!==await tvHash(proof))return tvResponse({error:"Pairing browser verification failed"},403);
 if(row.expires_ms<=Date.now())return tvResponse({ok:false,status:"expired"},410);
 if(row.status==="pending")return tvResponse({ok:true,status:"pending"});
 if(row.status!=="approved")return tvResponse({ok:false,status:"used"},410);
 const consumed=await env.POLARIS_DB.prepare("UPDATE polaris_tv_signins SET status='consumed',consumed_ms=? WHERE id=? AND status='approved'").bind(Date.now(),data.id).run();
 if(!consumed.meta?.changes)return tvResponse({ok:false,status:"already-used"},409);
 const duration=row.remember?30*86400000:2*3600000;
 const exp=Date.now()+duration,sig=await mac("polaris:"+exp,env.POLARIS_AUTH_SECRET);
 return tvResponse({ok:true,status:"authenticated",target:row.target},200,[
  "polaris_session="+exp+"."+sig+"; Max-Age="+Math.ceil(duration/1000)+"; Path=/; HttpOnly; Secure; SameSite=Strict",
  "polaris_tv_proof=; Max-Age=0; Path=/api/device-signin; HttpOnly; Secure; SameSite=Strict"
 ]);
}
async function tvSignInApi(req,env,url){
 if(!env.POLARIS_DB||!env.POLARIS_AUTH_SECRET)return tvResponse({error:"Polaris login unavailable"},503);
 try{
  if(url.pathname==="/api/device-signin/start")return await tvStart(req,env);
  if(url.pathname==="/api/device-signin/info")return await tvInfo(req,env,url);
  if(url.pathname==="/api/device-signin/approve")return await tvApprove(req,env);
  if(url.pathname==="/api/device-signin/poll")return await tvPoll(req,env);
  return tvResponse({error:"Unknown sign-in action"},404);
 }catch(e){return tvResponse({error:"Sign-in temporarily unavailable. Retry safely."},503)}
}
