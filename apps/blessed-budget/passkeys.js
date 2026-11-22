// Blessed Budget — WebAuthn passkeys (ES256; device user verification required).
const RP="blessed.northstarventures.ca";
const ORIGIN="https://"+RP;
const now=()=>Math.floor(Date.now()/1000);
const response=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...headers}});
const error=(message,status=400)=>response({error:message},status);
const b64=(bytes)=>{let text="";for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")};
const fromB64=(s)=>{if(typeof s!=="string"||s.length>8192||!/^[A-Za-z0-9_-]+$/.test(s))throw Error("Invalid passkey encoding");const str=atob(s.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((s.length+3)%4));return Uint8Array.from(str,c=>c.charCodeAt(0))};
const utf8=(s)=>new TextEncoder().encode(s);
const eq=(a,b)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
const parse=(s)=>{try{return JSON.parse(new TextDecoder().decode(s))}catch{throw Error("Invalid passkey response")}};
const challenge=()=>b64(crypto.getRandomValues(new Uint8Array(32)));
const hex=(b)=>Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
async function verifyClient(type,client,expected){
 const c=parse(fromB64(client));
 if(c.type!==type||c.challenge!==expected||c.origin!==ORIGIN||c.crossOrigin===true)throw Error("Invalid passkey challenge or origin");
 return fromB64(client);
}
async function verifyAuthData(auth){
 const data=fromB64(auth);
 if(data.length<37)throw Error("Invalid authenticator data");
 const expected=new Uint8Array(await crypto.subtle.digest("SHA-256",utf8(RP)));
 if(!eq(data.subarray(0,32),expected))throw Error("Passkey site mismatch");
 if((data[32]&0x05)!==0x05)throw Error("Device unlock required");
 const count=new DataView(data.buffer,data.byteOffset,data.byteLength).getUint32(33,false);
 return {data,count};
}
function signatureToRaw(der){
 // Browser authenticator ES256 signatures use ASN.1 DER, WebCrypto verifies P1363 raw signatures.
 if(der.length===64)return der;
 let p=0;
 const read=()=>{if(p>=der.length)throw Error("Invalid passkey signature");return der[p++]};
 const readLen=()=>{let n=read();if(n<0x80)return n;const k=n&0x7f;if(k<1||k>2)throw Error("Invalid signature length");n=0;for(let i=0;i<k;i++)n=n*256+read();return n};
 if(read()!==0x30)throw Error("Invalid signature format");
 const seq=readLen();if(seq>der.length-p)throw Error("Invalid signature size");
 const out=new Uint8Array(64);
 for(let part=0;part<2;part++){
  if(read()!==0x02)throw Error("Invalid signature integer");
  const n=readLen();let val=der.subarray(p,p+n);p+=n;
  while(val.length>32&&val[0]===0)val=val.subarray(1);
  if(val.length>32||val.length===0)throw Error("Invalid signature integer size");
  out.set(val,(part*32)+(32-val.length));
 }
 return out;
}
const safeText=(x,n=60)=>String(x||"").replace(/[\u0000-\u001f]/g,"").slice(0,n);
async function readBody(req){try{return await req.json()}catch{throw Error("Invalid request body")}}
export async function passkeyRoute(req,env,u,url,helpers){
 const db=env.DB,method=req.method,path=url.pathname;
 try{
  if(path==="/api/passkeys/login/options"&&method==="POST"){
   const b=await readBody(req),mail=safeText(b.email,220).toLowerCase().trim();
   const owner=await db.prepare("SELECT id FROM users WHERE email=?").bind(mail).first();
   const creds=owner?(await db.prepare("SELECT credential_id FROM passkeys WHERE user_id=?").bind(owner.id).all()).results:[];
   if(!owner||!creds.length)return error("No device passkey is registered for this email. Sign in using your password first.",404);
   const id=crypto.randomUUID(),c=challenge();
   await db.prepare("INSERT INTO passkey_challenges(id,user_id,challenge,purpose,expires_at) VALUES(?,?,?,?,?)").bind(id,owner.id,c,"login",now()+300).run();
   return response({id,challenge:c,rpId:RP,allowCredentials:creds.map(x=>({id:x.credential_id,type:"public-key"})),timeout:60000,userVerification:"required"});
  }
  if(path==="/api/passkeys/login/verify"&&method==="POST"){
   const b=await readBody(req);
   const id=safeText(b.challenge_id,80),cid=safeText(b.credential_id,2000);
   const found=await db.prepare("DELETE FROM passkey_challenges WHERE id=? AND purpose='login' AND expires_at>? RETURNING user_id,challenge").bind(id,now()).first();
   if(!found)return error("Passkey request expired. Try again.",401);
   const key=await db.prepare("SELECT * FROM passkeys WHERE user_id=? AND credential_id=?").bind(found.user_id,cid).first();
   if(!key)return error("Passkey not recognized",401);
   const client=await verifyClient("webauthn.get",b.clientDataJSON,found.challenge);
   const auth=await verifyAuthData(b.authenticatorData);
   if(auth.count!==0&&key.sign_count!==0&&auth.count<=key.sign_count)return error("Passkey replay detection failed",401);
   const digest=new Uint8Array(await crypto.subtle.digest("SHA-256",client));
   const data=new Uint8Array(auth.data.length+digest.length);data.set(auth.data);data.set(digest,auth.data.length);
   const publicKey=await crypto.subtle.importKey("spki",fromB64(key.public_key_spki),{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
   const verified=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},publicKey,signatureToRaw(fromB64(b.signature)),data);
   if(!verified)return error("Passkey verification failed",401);
   await db.prepare("UPDATE passkeys SET sign_count=?,last_used_at=CURRENT_TIMESTAMP WHERE id=?").bind(Math.max(key.sign_count,auth.count),key.id).run();
   return response({ok:true},200,{"set-cookie":await helpers.session(db,key.user_id)});
  }
  if(!u)return error("Please sign in",401);
  if(path==="/api/passkeys/list"&&method==="GET"){
   const items=(await db.prepare("SELECT id,device_label,created_at,last_used_at FROM passkeys WHERE user_id=? ORDER BY created_at DESC").bind(u.id).all()).results;
   return response({passkeys:items});
  }
  if(path==="/api/passkeys/register/options"&&method==="POST"){
   const b=await readBody(req),password=String(b.password||"");
   const user=await db.prepare("SELECT salt,password_hash FROM users WHERE id=?").bind(u.id).first();
   const hash=await helpers.passwordHash(password,user.salt);
   if(hash!==user.password_hash)return error("Current account password is required to enable device sign-in",403);
   const keys=(await db.prepare("SELECT credential_id FROM passkeys WHERE user_id=?").bind(u.id).all()).results;
   if(keys.length>=8)return error("Maximum of eight saved passkeys reached");
   const id=crypto.randomUUID(),c=challenge();
   await db.prepare("INSERT INTO passkey_challenges(id,user_id,challenge,purpose,expires_at) VALUES(?,?,?,?,?)").bind(id,u.id,c,"register",now()+300).run();
   return response({id,challenge:c,rp:{id:RP,name:"Blessed Budget"},user:{id:b64(utf8(u.id)),name:u.email,displayName:u.display_name},pubKeyCredParams:[{type:"public-key",alg:-7}],timeout:60000,attestation:"none",authenticatorSelection:{residentKey:"preferred",userVerification:"required"},excludeCredentials:keys.map(x=>({type:"public-key",id:x.credential_id}))});
  }
  if(path==="/api/passkeys/register/verify"&&method==="POST"){
   const b=await readBody(req),id=safeText(b.challenge_id,80),credentialId=safeText(b.credential_id,2000);
   const found=await db.prepare("DELETE FROM passkey_challenges WHERE id=? AND purpose='register' AND user_id=? AND expires_at>? RETURNING challenge").bind(id,u.id,now()).first();
   if(!found)return error("Passkey setup expired. Try again.",401);
   await verifyClient("webauthn.create",b.clientDataJSON,found.challenge);
   await verifyAuthData(b.authenticatorData);
   if(b.algorithm!==-7)throw Error("Only ES256 device passkeys are supported");
   const pub=fromB64(b.publicKeySPKI);
   await crypto.subtle.importKey("spki",pub,{name:"ECDSA",namedCurve:"P-256"},false,["verify"]);
   if(!/^[A-Za-z0-9_-]{8,2000}$/.test(credentialId))throw Error("Invalid passkey identifier");
   const existing=await db.prepare("SELECT id FROM passkeys WHERE credential_id=?").bind(credentialId).first();
   if(existing)return error("Passkey already registered",409);
   await db.prepare("INSERT INTO passkeys(id,user_id,credential_id,public_key_spki,alg,device_label) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),u.id,credentialId,b64(pub),-7,safeText(b.label||"Phone passkey",70)).run();
   await helpers.audit(db,u,null,"passkey_registered");
   return response({ok:true});
  }
  if(path==="/api/passkeys/delete"&&method==="POST"){
   const b=await readBody(req);
   const existing=await db.prepare("SELECT id FROM passkeys WHERE id=? AND user_id=?").bind(b.id,u.id).first();
   if(!existing)return error("Passkey not found",404);
   await db.prepare("DELETE FROM passkeys WHERE id=? AND user_id=?").bind(b.id,u.id).run();
   await helpers.audit(db,u,null,"passkey_removed");
   return response({ok:true});
  }
  return error("Not found",404);
 }catch(e){return error(String(e.message||"Passkey verification failed").slice(0,160),400)}
}
