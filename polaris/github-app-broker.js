
// Polaris GitHub App authentication broker — read-only connectivity check.
// Private key never leaves the Worker. No GitHub write actions are exposed.
function paBytesFromPem(pem) {
  const normalized=String(pem||"").replace(/\\n/g,"\n").trim();
  const match=/-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (?:RSA )?PRIVATE KEY-----/.exec(normalized);
  if(!match)throw new Error("GitHub App private key is not a valid PEM");
  const clean=match[2].replace(/\s+/g,"");
  if(!/^[A-Za-z0-9+/=]+$/.test(clean))throw new Error("Private key encoding is invalid");
  const binary=atob(clean);
  const bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return {bytes,pkcs1:!!match[1]};
}
function paAsn1Length(length) {
  if(length<128)return new Uint8Array([length]);
  let n=length,parts=[];while(n>0){parts.unshift(n&255);n=Math.floor(n/256)}
  return new Uint8Array([128+parts.length,...parts]);
}
function paConcat(...parts){const length=parts.reduce((n,p)=>n+p.length,0),all=new Uint8Array(length);let at=0;for(const p of parts){all.set(p,at);at+=p.length}return all}
function paDer(tag,bytes){return paConcat(new Uint8Array([tag]),paAsn1Length(bytes.length),bytes)}
function paPkcs1ToPkcs8(pkcs1){
  // PrivateKeyInfo ::= SEQUENCE { version 0, rsaEncryption, OCTET STRING PKCS#1 }
  const version=new Uint8Array([2,1,0]);
  const algorithm=new Uint8Array([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00]);
  return paDer(0x30,paConcat(version,algorithm,paDer(0x04,pkcs1)));
}
function paBase64url(bytes) {
 const buffer=typeof bytes==="string"?new TextEncoder().encode(bytes):bytes;
 let raw="";for(let i=0;i<buffer.length;i+=256)raw+=String.fromCharCode(...buffer.subarray(i,i+256));
 return btoa(raw).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
async function paAppJwt(env){
 const appId=String(env.POLARIS_GITHUB_APP_ID||"").trim();
 if(!/^\d{5,20}$/.test(appId))throw new Error("GitHub App ID is missing or malformed");
 const {bytes,pkcs1}=paBytesFromPem(env.POLARIS_GITHUB_APP_PRIVATE_KEY);
 const privateKey=await crypto.subtle.importKey(
  "pkcs8",pkcs1?paPkcs1ToPkcs8(bytes):bytes,
  {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]
 );
 const now=Math.floor(Date.now()/1000);
 const head=paBase64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
 const body=paBase64url(JSON.stringify({iat:now-60,exp:now+540,iss:appId}));
 const signed=head+"."+body;
 const signature=new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5",privateKey,new TextEncoder().encode(signed)));
 return signed+"."+paBase64url(signature);
}
async function paStatus(env) {
 if(!env.POLARIS_GITHUB_APP_PRIVATE_KEY||!env.POLARIS_GITHUB_APP_ID) {
  return {ok:false,error:"App ID or GitHub private key is not configured"};
 }
 let jwt;
 try{jwt=await paAppJwt(env)}catch(e){
  return {ok:false,error:"Private key import/signing failed: "+String(e.message||"Unknown signing issue").slice(0,145)};
 }
 let response;
 try {
  response=await fetch("https://api.github.com/app/installations",{
   headers:{"Authorization":"Bearer "+jwt,"Accept":"application/vnd.github+json",
    "X-GitHub-Api-Version":"2022-11-28","User-Agent":"Polaris-Northstarventures-Integration"},
   signal:AbortSignal.timeout(9000)
  });
 }catch(e){return {ok:false,error:"GitHub API is unavailable; retry in a moment"}}
 if(!response.ok)return {ok:false,error:"GitHub rejected app authentication (HTTP "+response.status+"). Confirm key and App ID."};
 let installs;try{installs=await response.json()}catch{return {ok:false,error:"GitHub installation response could not be parsed"}}
 if(!Array.isArray(installs))return {ok:false,error:"GitHub returned unexpected installation data"};
 const accountNames=installs.map(i=>({account:i.account?.login||"Unknown account",installationId:i.id,
  repositorySelection:i.repository_selection,permissions:{contents:i.permissions?.contents||"none",pull_requests:i.permissions?.pull_requests||"none",actions:i.permissions?.actions||"none"}}));
 return {ok:true,appId:String(env.POLARIS_GITHUB_APP_ID),installations:accountNames,readTest:true,
  writeOperations:"Disabled until approval workflow is configured"};
}
async function paStatusRequest(request,env){
 if(request.method!=="GET")return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers:{"content-type":"application/json"}});
 const result=await paStatus(env);
 return new Response(JSON.stringify(result),{status:result.ok?200:503,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
