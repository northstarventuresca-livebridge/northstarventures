// North Star Ventures centralized NFC card activity. Records web-link openings and completed logins separately.
// No GPS, street address, raw IP, full user-agent, passkey material or secrets are stored.
export const CARD_AUDIT_PREFIX="nsv-card-audit:v1:";
const MAX_AGE_DAYS=180;
function deviceFrom(ua) {return /iPhone|iPad/i.test(ua)?"iOS":/Android/i.test(ua)?"Android":/Windows/i.test(ua)?"Windows":/Macintosh|Mac OS X/i.test(ua)?"Mac":/Linux/i.test(ua)?"Linux":"Other"}
function browserFrom(ua) {return /Edg\//i.test(ua)?"Edge":/Firefox|FxiOS/i.test(ua)?"Firefox":/Chrome|CriOS/i.test(ua)?"Chrome":/Safari/i.test(ua)?"Safari":"Other"}
export async function writeCardAudit(env,request,card,type,source="northstar"){
 if(!env.REGISTRY||!card?.id||!/^[a-f0-9]{32}$/.test(card.id))return;
 if(!["card_opened","login_success","existing_session"].includes(type))return;
 const cf=request.cf||{},ua=request.headers.get("user-agent")||"";
 const event={
  id:crypto.randomUUID(),card_id:card.id,type,source,
  at:new Date().toISOString(),card_label:String(card.label||"").slice(0,90),
  account:String(card.tapbin_email||"").slice(0,180),owner:String(card.owner||"").slice(0,90),
  city:String(cf.city||"").slice(0,80),region:String(cf.region||cf.regionCode||"").slice(0,80),country:String(cf.country||"").slice(0,3),
  device:deviceFrom(ua),browser:browserFrom(ua)
 };
 // Descending sortable key, readable by central admin only, bounded TTL.
 const key=CARD_AUDIT_PREFIX+String(9999999999999-Date.now()).padStart(13,"0")+":"+card.id+":"+event.id;
 await env.REGISTRY.put(key,JSON.stringify(event),{expirationTtl:MAX_AGE_DAYS*86400});
}
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","referrer-policy":"no-referrer"}});
export async function cardAuditList(req,env,url,auth){
 if(url.pathname!=="/api/admin/access-card-events")return null;
 if(req.method!=="GET")return json({error:"Method not allowed"},405);
 if(!await auth(req,env))return json({error:"Unauthorized"},401);
 if(!env.REGISTRY)return json({error:"Card registry unavailable"},503);
 const id=url.searchParams.get("card_id")||"";
 if(id&&!/^[a-f0-9]{32}$/.test(id))return json({error:"Invalid card"},400);
 const limit=Math.min(200,Math.max(1,Number(url.searchParams.get("limit"))||100));
 const entries=[];let cursor;
 for(let i=0;i<10&&entries.length<limit;i++){
  const page=await env.REGISTRY.list({prefix:CARD_AUDIT_PREFIX,limit:200,...(cursor?{cursor}:{})});
  const matching=page.keys.filter(k=>!id||k.name.includes(":"+id+":"));
  const data=await Promise.all(matching.slice(0,limit-entries.length).map(k=>env.REGISTRY.get(k.name,"json")));
  entries.push(...data.filter(Boolean));
  if(page.list_complete||!page.cursor)break;cursor=page.cursor;
 }
 return json({events:entries,retention_days:MAX_AGE_DAYS,note:"Card opened indicates a web link visit, not proof that an NFC chip was physically tapped. City is approximate when supplied by Cloudflare."});
}
