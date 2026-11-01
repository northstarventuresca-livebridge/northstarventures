// Owner-only Home of Hope launch from North Star's existing admin dashboard.
// A link or NTAG215 tag is NOT proof of identity. North Star admin authentication
// is required, and the private HOH Worker RPC creates the one-use ticket.
const PATH="/api/admin/launch/hoh";
const DEST="https://hoh.northstarventures.ca/sso#ticket=";
function reply(body,status=200){
 return new Response(JSON.stringify(body),{status,headers:{
  "content-type":"application/json; charset=utf-8",
  "cache-control":"private, no-store",
  "referrer-policy":"no-referrer",
  "x-content-type-options":"nosniff"
 }});
}
export async function handleHomeOfHopeLaunch(request,env,url,authorize){
 if(url.pathname!==PATH)return null;
 if(request.method!=="POST")return reply({error:"Method not allowed"},405);
 if(request.headers.get("origin")!==url.origin)return reply({error:"Invalid request origin"},403);
 if(!await authorize(request,env))return reply({error:"Sign in to North Star first"},401);
 // Existing North Star admin is single-owner. Before partners are enabled,
 // identity and app-scoped permissions MUST be enforced here.
 if(!env.HOH_SSO_RPC||!env.INBOX)return reply({error:"Home of Hope sign-in is not configured"},503);
 // Best-effort per-session throttling; future production admission controls
 // should use a strongly consistent rate limiter rather than KV alone.
 const bucket=Math.floor(Date.now()/60000);
 const h=request.headers.get("authorization")||request.headers.get("cookie")||"";
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(h))),
  b=>b.toString(16).padStart(2,"0")).join("");
 const key="nsv:sso:hoh:rate:"+bucket+":"+digest;
 const count=Number(await env.INBOX.get(key)||0);
 if(count>=6)return reply({error:"Too many sign-in attempts; please try again shortly"},429);
 await env.INBOX.put(key,String(count+1),{expirationTtl:120});
 let result;
 try{result=await env.HOH_SSO_RPC.issueOwnerTicket()}
 catch{return reply({error:"Home of Hope sign-in isn't ready yet"},503)}
 if(!result||typeof result.ticket!=="string"||!/^[0-9a-f]{64}$/.test(result.ticket))
  return reply({error:"Invalid sign-in ticket received"},502);
 // URL fragment is not sent by the browser in HTTP requests. HOH consumes
 // it once, erases it from history, and sets its own HttpOnly HOH session cookie.
 return reply({launch_url:DEST+encodeURIComponent(result.ticket)});
}
