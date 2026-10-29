// North Star Ventures admin email recovery. No customer-supplied recovery addresses.
const TO="northstarventures.ca@gmail.com",FROM="website-updates@northstarventures.ca";
const CRED="nsv:admin:credentials:v2",EPOCH="nsv:admin:session-epoch",ACTIVE="nsv:admin:reset:active",TOKEN="nsv:admin:reset:token:";
const ENC=new TextEncoder();
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}});
const rand=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,"0")).join("");
async function digest(s){return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",ENC.encode(s))),v=>v.toString(16).padStart(2,"0")).join("")}
const binary=h=>Uint8Array.from(h.match(/../g)||[],x=>parseInt(x,16));
function equal(a,b){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0}
async function passwordHash(password,salt){
 const key=await crypto.subtle.importKey("raw",ENC.encode(password),"PBKDF2",false,["deriveBits"]);
 return new Uint8Array(await crypto.subtle.deriveBits({name:"PBKDF2",salt:binary(salt),iterations:210000,hash:"SHA-256"},key,256));
}
export async function adminPasswordMatches(env,password,originalCheck){
 const stored=await env.INBOX.get(CRED,"json");
 if(!stored)return await originalCheck(password);
 if(stored.v!==2||!(/^[a-f0-9]{32}$/.test(stored.salt||""))||!(/^[a-f0-9]{64}$/.test(stored.hash||"")))return false;
 return equal(await passwordHash(password,stored.salt),binary(stored.hash));
}
export async function adminSessionEpoch(env){return (await env.INBOX.get(EPOCH))||"1"}
const css="<style>body{font:16px system-ui;background:#f4f1ea;color:#152a3d;margin:0;min-height:100vh;display:grid;place-items:center;padding:18px;box-sizing:border-box}.box{background:#fff;padding:30px;width:min(420px,100%);border-radius:16px;box-shadow:0 22px 66px #0001;box-sizing:border-box}h1{font:30px Georgia,serif}p{color:#516476;line-height:1.5}input{font:inherit;padding:12px;width:100%;box-sizing:border-box;margin:12px 0;border:1px solid #ccc;border-radius:9px}button{font:700 15px system-ui;color:white;background:#10263b;border:0;border-radius:9px;padding:13px;width:100%;cursor:pointer}button:disabled{opacity:.6}a{color:#10263b}#msg{font-size:13px}</style>";
const page='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Reset North Star Admin Password</title>'+css+'</head><body><main class="box"><strong>✦ NORTH STAR VENTURES</strong><h1>Reset admin password</h1><p id="info">We will send a secure reset link to your verified North Star Ventures email inbox.</p><form id="request"><button>Send reset email</button></form><form id="finish" hidden><input id="newpass" type="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="New password (12+ characters)" required><input id="confirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" placeholder="Confirm new password" required><button>Save new password</button></form><p id="msg" role="status"></p><a href="/admin">Back to admin login</a></main><script src="/admin/reset-password.js"></script></body></html>';
const client="(function(){\nconst el=id=>document.getElementById(id);\nconst token=new URLSearchParams(location.hash.slice(1)).get('token')||new URLSearchParams(location.search).get('token')||'';\nhistory.replaceState({},'',location.pathname);\nel('request').hidden=!!token;el('finish').hidden=!token;\nif(token)el('info').textContent='Choose your new admin password. This one-time link expires after 15 minutes.';\nasync function post(path,body){\n const r=await fetch(path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});\n const x=await r.json().catch(()=>({}));if(!r.ok)throw Error(x.error||'Request failed');return x;\n}\nel('request').onsubmit=async function(e){\n e.preventDefault();const b=this.querySelector('button');b.disabled=true;el('msg').textContent='Sending...';\n try{await post('/api/admin/password/forgot',{});el('msg').textContent='Reset email requested. Please check northstarventures.ca@gmail.com, including spam.';}\n catch(err){el('msg').textContent=err.message}finally{b.disabled=false}\n};\nel('finish').onsubmit=async function(e){\n e.preventDefault();const p=el('newpass').value;if(p!==el('confirm').value){el('msg').textContent='Passwords do not match';return;}\n const b=this.querySelector('button');b.disabled=true;el('msg').textContent='Updating...';\n try{await post('/api/admin/password/reset',{token,password:p});el('newpass').value='';el('confirm').value='';el('finish').hidden=true;el('msg').textContent='Your password has been changed. You can now sign in to North Star Ventures Admin.';}\n catch(err){el('msg').textContent=err.message}finally{b.disabled=false}\n};\n})();";
const noCache={"cache-control":"no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff"};
export async function handleAdminPasswordRecovery(req,env,url){
 const path=url.pathname,method=req.method;
 if(path==="/admin/reset-password"&&(method==="GET"||method==="HEAD"))return new Response(method==="HEAD"?null:page,{headers:{...noCache,"content-type":"text/html; charset=utf-8","content-security-policy":"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
 if(path==="/admin/reset-password.js"&&method==="GET")return new Response(client,{headers:{...noCache,"content-type":"application/javascript; charset=utf-8"}});
 if(!["/api/admin/password/forgot","/api/admin/password/reset"].includes(path))return null;
 if(method!=="POST")return json({error:"Method not allowed"},405);
 if(url.origin!=="https://northstarventures.ca"||req.headers.get("origin")!==url.origin)return json({error:"Invalid request origin."},403);
 if(!(req.headers.get("content-type")||"").startsWith("application/json"))return json({error:"JSON required"},415);
 if(!env.INBOX)return json({error:"Reset storage unavailable"},503);
 let data;try{data=await req.json()}catch{return json({error:"Invalid request"},400)}
 if(path==="/api/admin/password/forgot"){
  if(!env.ADMIN_RESET_EMAIL?.send)return json({error:"Admin reset email service not configured"},503);
  const hour=Math.floor(Date.now()/3600000);
  const ip=await digest(req.headers.get("cf-connecting-ip")||"unknown");
  const key="nsv:reset:ip:"+ip+":"+hour,global="nsv:reset:global:"+hour;
  const [n,g]=await Promise.all([env.INBOX.get(key),env.INBOX.get(global)]);
  if(Number(n||0)>=3||Number(g||0)>=12)return json({error:"Too many reset requests. Try again later."},429);
  await Promise.all([env.INBOX.put(key,String(Number(n||0)+1),{expirationTtl:3800}),env.INBOX.put(global,String(Number(g||0)+1),{expirationTtl:3800})]);
  const t=rand(32),hash=await digest(t);
  await env.INBOX.put(TOKEN+hash,String(Date.now()+900000),{expirationTtl:900});
  await env.INBOX.put(ACTIVE,hash,{expirationTtl:900});
  const link="https://northstarventures.ca/admin/reset-password#token="+t;
  const message="A North Star Ventures admin password reset was requested.\n\nChoose a new password here:\n"+link+"\n\nThis link expires after 15 minutes. If you did not request it, ignore this email.";
  try{await env.ADMIN_RESET_EMAIL.send({to:TO,from:FROM,subject:"Reset your North Star Ventures admin password",text:message})}
  catch{await Promise.all([env.INBOX.delete(TOKEN+hash),env.INBOX.delete(ACTIVE)]);return json({error:"Unable to deliver reset email. Please try again later."},503)}
  return json({ok:true});
 }
 const token=String(data.token||""),password=String(data.password||"");
 if(!/^[0-9a-f]{64}$/.test(token))return json({error:"Reset link invalid or expired."},400);
 if(password.length<12||password.length>128||password.trim()!==password)return json({error:"Use 12–128 characters without spaces at the ends."},400);
 const hash=await digest(token);
 const [expiry,active]=await Promise.all([env.INBOX.get(TOKEN+hash),env.INBOX.get(ACTIVE)]);
 if(!expiry||active!==hash||Number(expiry)<Date.now())return json({error:"Reset link invalid or expired."},400);
 const salt=rand(16);
 const passwordDigest=Array.from(await passwordHash(password,salt),x=>x.toString(16).padStart(2,"0")).join("");
 await env.INBOX.put(CRED,JSON.stringify({v:2,salt,hash:passwordDigest,updated_at:new Date().toISOString()}));
 await env.INBOX.put(EPOCH,rand(16));
 await Promise.all([env.INBOX.delete(TOKEN+hash),env.INBOX.delete(ACTIVE)]);
 return json({ok:true});
}
export const ADMIN_PASSWORD_RESET_LINK='<p style="text-align:center;margin:12px 0"><a href="/admin/reset-password" style="font-size:13px;color:#294f75">Forgot password?</a></p>';
