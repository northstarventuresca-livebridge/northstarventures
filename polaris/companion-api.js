
const PC_COMPANION_ALPHABET="23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function pcReply(body,status=200){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"}})}
function pcOrigin(request,url){return request.headers.get("origin")===url.origin}
async function pcHash(env,category,raw){
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(env.POLARIS_AUTH_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(category+"|"+raw));
 return Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function pcGenerateCode(){
 const raw=crypto.getRandomValues(new Uint8Array(12));
 return Array.from(raw,b=>PC_COMPANION_ALPHABET[b%PC_COMPANION_ALPHABET.length]).join("");
}
async function pcDevice(request,env){
 const token=(request.headers.get("authorization")||"").replace(/^Bearer\s+/i,"");
 if(!/^[0-9a-f]{64}$/i.test(token))return null;
 const hash=await pcHash(env,"android-device",token);
 const row=await env.POLARIS_DB.prepare("SELECT id,label FROM polaris_companion_devices WHERE token_hash=? AND revoked_at IS NULL").bind(hash).first();
 if(row)await env.POLARIS_DB.prepare("UPDATE polaris_companion_devices SET last_seen_at=? WHERE id=?").bind(new Date().toISOString(),row.id).run();
 return row||null;
}
async function pcParseJson(request,max=2400){
 let raw;try{raw=await request.text()}catch{return null}
 if(raw.length>max)return null;
 try{return JSON.parse(raw)}catch{return null}
}
async function polarisCompanionHandle(request,env,url){
 const path=url.pathname;
 if(!env.POLARIS_DB||!env.POLARIS_AUTH_SECRET)return pcReply({error:"Companion database not configured"},503);
 if(path==="/api/companion/claim"){
  if(request.method!=="POST")return pcReply({error:"Method not allowed"},405);
  const input=await pcParseJson(request);
  if(!input)return pcReply({error:"Invalid request"},400);
  const code=String(input.code||"").toUpperCase().replace(/[\s-]/g,"").slice(0,20);
  if(!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{12}$/.test(code))return pcReply({error:"Check the 12-character pairing code."},400);
  const ip=String(request.headers.get("cf-connecting-ip")||"unknown").slice(0,90);
  const bucket=await pcHash(env,"claim-rate",ip);
  const limit=await env.POLARIS_DB.prepare("SELECT failures,window_start FROM polaris_companion_claim_limits WHERE bucket=?").bind(bucket).first();
  const elapsed=limit?Date.now()-Date.parse(limit.window_start):Infinity;
  if(limit&&elapsed<600000&&limit.failures>=15)return pcReply({error:"Too many pairing attempts. Try again later."},429);
  const hashed=await pcHash(env,"pair-code",code);
  const rec=await env.POLARIS_DB.prepare("SELECT code_hash,expires_at,used_at FROM polaris_companion_pairings WHERE code_hash=?").bind(hashed).first();
  if(!rec||rec.used_at||Date.parse(rec.expires_at)<Date.now()){
   const count=limit&&elapsed<600000?limit.failures+1:1;
   await env.POLARIS_DB.prepare("INSERT INTO polaris_companion_claim_limits(bucket,failures,window_start) VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET failures=excluded.failures, window_start=excluded.window_start").bind(bucket,count,limit&&elapsed<600000?limit.window_start:new Date().toISOString()).run();
   return pcReply({error:"That pairing code is invalid or expired."},401);
  }
  const changed=await env.POLARIS_DB.prepare("UPDATE polaris_companion_pairings SET used_at=? WHERE code_hash=? AND used_at IS NULL AND expires_at>?").bind(new Date().toISOString(),hashed,new Date().toISOString()).run();
  if(changed.meta?.changes!==1)return pcReply({error:"That code has already been used."},409);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
  const hash=await pcHash(env,"android-device",token);
  const label=String(input.label||"Polaris Android").trim().slice(0,70);
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await env.POLARIS_DB.prepare("INSERT INTO polaris_companion_devices(id,token_hash,label,created_at,last_seen_at) VALUES(?,?,?,?,?)").bind(id,hash,label,now,now).run();
  return pcReply({ok:true,token,device_id:id,server:"https://polaris.northstarventures.ca",scope:"personal-reminders"},201);
 }
 if(path==="/api/companion/pair"||path==="/api/companion/devices"||path==="/api/companion/revoke"){
  if(!await isAuth(request,env))return pcReply({error:"Sign in to Polaris first"},401);
  if(path==="/api/companion/devices"&&request.method==="GET"){
   const r=await env.POLARIS_DB.prepare("SELECT id,label,platform,created_at,last_seen_at FROM polaris_companion_devices WHERE revoked_at IS NULL ORDER BY created_at DESC LIMIT 20").all();
   return pcReply({ok:true,devices:r.results||[]});
  }
  if(!pcOrigin(request,url))return pcReply({error:"Same-origin request required"},403);
  if(path==="/api/companion/pair"&&request.method==="POST"){
   const input=await pcParseJson(request);
   if(input===null)return pcReply({error:"Invalid pairing request"},400);
   const active=await env.POLARIS_DB.prepare("SELECT COUNT(*) AS n FROM polaris_companion_devices WHERE revoked_at IS NULL").first();
   if(active?.n>=8)return pcReply({error:"Maximum eight devices reached. Revoke an old phone first."},409);
   const code=pcGenerateCode(),hash=await pcHash(env,"pair-code",code),now=new Date().toISOString();
   const expires=new Date(Date.now()+10*60*1000).toISOString();
   await env.POLARIS_DB.prepare("DELETE FROM polaris_companion_pairings WHERE expires_at<?").bind(now).run();
   await env.POLARIS_DB.prepare("INSERT INTO polaris_companion_pairings(code_hash,created_at,expires_at,label) VALUES(?,?,?,?)").bind(hash,now,expires,"Android phone").run();
   return pcReply({ok:true,code,expires_at:expires,steps:"Enter this code in the Polaris Companion Android app. Expires in 10 minutes."});
  }
  if(path==="/api/companion/revoke"&&request.method==="POST"){
   const input=await pcParseJson(request);
   if(!/^[0-9a-f-]{36}$/i.test(String(input?.id||"")))return pcReply({error:"Invalid device"},400);
   await env.POLARIS_DB.prepare("UPDATE polaris_companion_devices SET revoked_at=? WHERE id=?").bind(new Date().toISOString(),input.id).run();
   return pcReply({ok:true});
  }
  return pcReply({error:"Method not allowed"},405);
 }
 const device=await pcDevice(request,env);
 if(!device)return pcReply({error:"Device not paired, revoked or token expired"},401);
 if(path==="/api/companion/sync"&&request.method==="GET"){
  const r=await env.POLARIS_DB.prepare("SELECT id,kind,item,store,due_date,project_key,context,created_at FROM polaris_personal_memory WHERE status='open' ORDER BY created_at DESC LIMIT 350").all();
  const rows=r.results||[];
  return pcReply({ok:true,device_id:device.id,server_today:new Intl.DateTimeFormat("en-CA",{timeZone:"America/Edmonton",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()),entries:rows,refresh_after_minutes:30});
 }
 if(path==="/api/companion/defer"&&request.method==="POST"){
  const input=await pcParseJson(request,3000);
  const ids=Array.isArray(input?.ids)?Array.from(new Set(input.ids.filter(x=>/^[0-9a-f-]{36}$/i.test(String(x))))).slice(0,12):[];
  const days=Number(input?.days);
  if(!ids.length||!Number.isInteger(days)||days<1||days>30)return pcReply({error:"Choose one or more valid reminders and 1–30 days"},400);
  const now=new Date().toISOString();
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Edmonton",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const dateParts=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  const target=new Date(Date.UTC(Number(dateParts.year),Number(dateParts.month)-1,Number(dateParts.day)+days)).toISOString().slice(0,10);
  let changed=0;
  for(const id of ids){
   const result=await env.POLARIS_DB.prepare("UPDATE polaris_personal_memory SET due_date=?,updated_at=? WHERE id=? AND status='open'").bind(target,now,id).run();
   if(result.meta?.changes===1)changed++;
  }
  return pcReply({ok:true,changed,remind_on:target,reply:"Okay, I'll check back in "+days+" days."});
 }
 if(path==="/api/companion/complete"&&request.method==="POST"){
  const input=await pcParseJson(request);
  if(!/^[0-9a-f-]{36}$/i.test(String(input?.id||"")))return pcReply({error:"Invalid reminder"},400);
  const result=await env.POLARIS_DB.prepare("UPDATE polaris_personal_memory SET status='done',updated_at=? WHERE id=? AND status='open'").bind(new Date().toISOString(),input.id).run();
  return pcReply({ok:true,changed:result.meta?.changes===1});
 }
 return pcReply({error:"Companion endpoint not found"},404);
}
