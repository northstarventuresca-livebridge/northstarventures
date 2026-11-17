
// Verified project domains for Polaris TV QR links and owner-triggered site tab.
// Sites must be explicitly verified through their Cloudflare routes/subdomain.
// This list is never derived from arbitrary speech or a user-controlled URL.
const PC_SITE_DOMAINS=Object.freeze({
 "Monica's House":"https://monicas-house.rwyers.workers.dev/",
 "LiveBridge":"https://livebridge.ca/",
 "TapBin":"https://tapbin.ca/",
 "Great Church":"https://greatchurch.ca/",
 "Healing The Heart":"https://healingtheheart.ca/",
 "Songwriters Compass":"https://compass.northstarventures.ca/",
 "HOH HUB":"https://hohs.northstarventures.ca/",
 "North Star Ventures":"https://northstarventures.ca/",
 "Polaris":"https://polaris.northstarventures.ca/",
 "X32 AI Engineer":"https://greatchurch.ca/"
});
function pcProjectSite(project,question=""){
 const p=String(project||"").toLowerCase().trim(),q=String(question||"").toLowerCase();
 const values=[
  ["Monica's House",/monica/],
  ["LiveBridge",/live\s?bridge/],
  ["TapBin",/tap\s?bin|northstar.organizer/],
  ["Great Church",/great\s?church/],
  ["Healing The Heart",/healing\s?(the\s?)?heart|\bhth\b/],
  ["Songwriters Compass",/songwriter|compass/],
  ["HOH HUB",/home.of.hope|\bhoh\b|\bhohs\b/],
  ["Polaris",/polaris/],
  ["North Star Ventures",/north\s?star ventures|\bnsv\b/],
 ];
 for(const [name,pattern] of values)if(pattern.test(p))return {project:name,url:PC_SITE_DOMAINS[name]};
 for(const [name,pattern] of values)if(pattern.test(q))return {project:name,url:PC_SITE_DOMAINS[name]};
 return null;
}
function pcSiteSafeUrl(url){
 try{const u=new URL(url);return u.protocol==="https:"&&
  Object.values(PC_SITE_DOMAINS).some(x=>new URL(x).origin===u.origin)&&
  u.username===""&&u.password===""}catch{return false}
}
async function pcQueueWebsiteOnTv(env,project,question=""){
 const destination=pcProjectSite(project,question);
 if(!destination||!pcSiteSafeUrl(destination.url))return {ok:false,error:"I don't have a verified website for that project yet."};
 const id=crypto.randomUUID(),createdAt=new Date().toISOString();
 await env.POLARIS_DB.prepare("INSERT INTO polaris_tv_site_commands(id,project,url,created_at) VALUES(?,?,?,?)")
  .bind(id,destination.project,destination.url,createdAt).run();
 return {ok:true,project:destination.project,url:destination.url,commandId:id,createdAt,
  note:"The TV will show a website link and QR code. If its separate site tab is enabled, that tab will navigate to the website."};
}
async function pcWebsiteCommandApi(request,env,url){
 if(request.method!=="GET")return new Response("Method not allowed",{status:405});
 const rows=await env.POLARIS_DB.prepare("SELECT id,project,url,created_at FROM polaris_tv_site_commands ORDER BY created_at DESC LIMIT 1").all();
 const item=rows.results?.[0]||null;
 return new Response(JSON.stringify({ok:true,command:item&&pcSiteSafeUrl(item.url)?item:null}),{
  headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
