// North Star Ventures project control center; admin only.
// Each card is editable and persisted to the existing REGISTRY KV. Never changes other apps.
export const HUB_PREFIX="nsv:project-hub:v1:";
const HUB_SEED=HUB_PREFIX+"_seeded";
const CATEGORIES=["Software Products","Church & Ministry","Client Websites","Internal Tools","Research & Experiments","Property & Operations"];
const STATUSES=["Live","Building","Planning","Needs review","Paused","Complete","Archived"];
const PRIORITIES=["Focus","Normal","Later"];
const INITIAL_PROJECTS=[{"id":"seed-01","name":"Great Church Website","category":"Church & Ministry","status":"Live","priority":"Normal","description":"Great Church public website, messages, ministry information and online presence.","website":"https://greatchurch.ca","admin":"","repo":"https://github.com/northstarventuresca-livebridge/greatchurch","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-02","name":"Healing the Heart Website","category":"Church & Ministry","status":"Live","priority":"Normal","description":"Healing the Heart Canada public site, ministry information and contact inquiries.","website":"https://healingtheheart.ca","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-03","name":"Home of Hope — HOH Platform","category":"Church & Ministry","status":"Building","priority":"Normal","description":"Internal organization system for sponsorships, staff, communications, missions, records and reports.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-04","name":"Home of Hope — HOHS Website","category":"Church & Ministry","status":"Building","priority":"Normal","description":"Public-facing Home of Hope child sponsorship website and profile listings.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-05","name":"TapBin","category":"Software Products","status":"Live","priority":"Normal","description":"Inventory platform: areas, bins, items, team access, AI assistance, sales and NFC login cards.","website":"https://tapbin.ca","admin":"https://tapbin.ca/admin","repo":"https://github.com/northstarventuresca-livebridge/northstar-organizer","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-06","name":"LiveBridge","category":"Software Products","status":"Live","priority":"Normal","description":"Live speech transcription, translation, listeners, broadcasting and LiveBridge Anywhere.","website":"https://livebridge.ca","admin":"","repo":"https://github.com/northstarventuresca-livebridge/livebridge-production","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-07","name":"North Star Ventures Website","category":"Internal Tools","status":"Live","priority":"Normal","description":"Company portfolio, inquiries, administration, website operations and access-card control.","website":"https://northstarventures.ca","admin":"https://northstarventures.ca/admin","repo":"https://github.com/northstarventuresca-livebridge/northstarventures","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-08","name":"Website Studio & Client Builder","category":"Internal Tools","status":"Live","priority":"Normal","description":"Client discovery, website leads, pitches, demos, previews and website-building workflow.","website":"https://northstarventures.ca","admin":"https://northstarventures.ca/admin/websites","repo":"https://github.com/rwyers/nsw5","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-09","name":"Monica's House — Renovation Tracker","category":"Property & Operations","status":"Building","priority":"Normal","description":"Property renovation project, tasks, rooms, shopping list, progress and costs.","website":"","admin":"","repo":"https://github.com/rwyers/monicas-house","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-10","name":"X32 AI Audio Engineer (Auto AI)","category":"Research & Experiments","status":"Building","priority":"Normal","description":"Audio engineer dashboard for X32: channel EQ suggestions, live listening and approved changes.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-11","name":"Spectra Sensing Lab","category":"Research & Experiments","status":"Building","priority":"Normal","description":"Camera and radio sensing, people-presence mapping, auditorium and outdoor monitoring prototypes.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-12","name":"MTI Database Project","category":"Internal Tools","status":"Needs review","priority":"Normal","description":"MTI database and data-management project; record its latest scope and working link.","website":"","admin":"","repo":"https://github.com/rwyers/mti","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-13","name":"ProPresenter Files Project","category":"Church & Ministry","status":"Building","priority":"Normal","description":"Great Church sermon, scripture and offering slide generation with validated ProPresenter 6 files.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-14","name":"BrainDump","category":"Internal Tools","status":"Needs review","priority":"Normal","description":"Personal ideas, tasks and project capture workspace.","website":"","admin":"","repo":"https://github.com/rwyers/brain-dump","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-15","name":"AudioPassport","category":"Software Products","status":"Live","priority":"Normal","description":"AudioPassport software product and public website.","website":"https://audiopassport.ca","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-16","name":"Home of Hope — Microloans","category":"Church & Ministry","status":"Needs review","priority":"Normal","description":"Potential mission microloan management for participants, repayments, reporting and staff access.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-17","name":"Property Deal Watch","category":"Property & Operations","status":"Building","priority":"Normal","description":"Searches for investment opportunities in Spruce Grove and Stony Plain with deal analysis.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-18","name":"Say It With Flours","category":"Client Websites","status":"Live","priority":"Normal","description":"Bakery client website built and hosted through North Star Ventures.","website":"https://sayitwithflours.ca","admin":"","repo":"https://github.com/northstarventuresca-livebridge/sayitwithflours","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-19","name":"Brad's Property Solutions","category":"Client Websites","status":"Building","priority":"Normal","description":"Property-services website and design project.","website":"","admin":"","repo":"https://github.com/rwyers/brads-property-solutions","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-20","name":"Sun & Patio","category":"Client Websites","status":"Needs review","priority":"Normal","description":"Retail and outdoor-products website project, connected with product listings.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-21","name":"Craftopia Customs","category":"Client Websites","status":"Needs review","priority":"Normal","description":"Custom products business website and redesign.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-22","name":"Interiors Website","category":"Client Websites","status":"Needs review","priority":"Normal","description":"Distinctive interiors and design client website concept.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-23","name":"Legal Website Concept","category":"Client Websites","status":"Needs review","priority":"Normal","description":"Legal-services website design concept and client presentation.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-24","name":"Family Dinner RSVP","category":"Internal Tools","status":"Needs review","priority":"Normal","description":"Family event RSVP website with guest list, attendance and comments.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-25","name":"Hunting Trips & Packing Planner","category":"Internal Tools","status":"Needs review","priority":"Normal","description":"Trip calendar, participant filters, camp meals, packing and weather planning.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"},{"id":"seed-26","name":"North Star BAS Marketplace","category":"Property & Operations","status":"Building","priority":"Normal","description":"Resale, refurbishment and asset operations of North Star BAS Marketplace Ltd.","website":"","admin":"","repo":"","reference":"","next_action":"","notes":"","owner":"","pinned":false,"created_at":"2026-10-29T00:00:00.000Z","updated_at":"2026-10-29T00:00:00.000Z"}];
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"private,no-store","x-content-type-options":"nosniff"}});
function invalid(error,status=400){return json({error},status)}
function clean(value,max){return String(value||"").trim().slice(0,max)}
function validUrl(value){
 const s=clean(value,500);if(!s)return "";
 try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password&&!/^(localhost|127\.|0\.0\.0\.0)/i.test(u.hostname)?u.href:null}catch{return null}
}
function normalize(raw,existing){
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return {error:"Invalid project details"};
 const obj=existing?{...existing}:{};
 for(const f of ["name","description","next_action","notes","owner"])if(Object.hasOwn(raw,f))obj[f]=clean(raw[f],f==="name"?100:f==="description"?450:f==="notes"?2000:f==="next_action"?250:80);
 for(const f of ["category","status","priority"]){if(Object.hasOwn(raw,f)){const allowed=f==="category"?CATEGORIES:f==="status"?STATUSES:PRIORITIES;if(!allowed.includes(raw[f]))return {error:"Invalid "+f};obj[f]=raw[f]}}
 if(Object.hasOwn(raw,"pinned")){if(typeof raw.pinned!=="boolean")return{error:"Invalid pin value"};obj.pinned=raw.pinned}
 for(const f of ["website","admin","repo","reference"])if(Object.hasOwn(raw,f)){const link=validUrl(raw[f]);if(link===null)return{error:"Use valid HTTPS links only"};obj[f]=link}
 if(!obj.name||obj.name.length<2)return{error:"Enter a project name (2 characters or more)"};
 return {project:obj};
}
let started;
async function seedProjects(env){
 if(!env.REGISTRY)throw Error("Project registry missing");
 if(!started)started=(async()=>{
  if(await env.REGISTRY.get(HUB_SEED))return;
  for(const project of INITIAL_PROJECTS){
   const key=HUB_PREFIX+project.id;
   if(!(await env.REGISTRY.get(key)))await env.REGISTRY.put(key,JSON.stringify(project));
  }
  await env.REGISTRY.put(HUB_SEED,new Date().toISOString());
 })().catch(err=>{started=null;throw err});
 return started;
}
async function allProjects(env){
 await seedProjects(env);
 let out=[],cursor;
 for(let page=0;page<8;page++){
  const list=await env.REGISTRY.list({prefix:HUB_PREFIX,limit:100,...(cursor?{cursor}:{})});
  const keys=list.keys.filter(k=>k.name!==HUB_SEED);
  out.push(...(await Promise.all(keys.map(k=>env.REGISTRY.get(k.name,"json")))).filter(x=>x&&x.id&&x.name));
  if(list.list_complete||!list.cursor)break;
  cursor=list.cursor;
 }
 return out.sort((a,b)=>(Number(!!b.pinned)-Number(!!a.pinned))||String(a.name).localeCompare(String(b.name)));
}
export async function handleProjects(request,env,url,authorize){
 const path=url.pathname,method=request.method;
 const listPath="/api/admin/projects";
 const match=/^\/api\/admin\/projects\/(seed-\d{2}|[0-9a-f]{32})$/.exec(path);
 if(path!==listPath&&!match)return null;
 if(!(await authorize(request,env)))return invalid("Not authorized",401);
 if(!env.REGISTRY)return invalid("Project storage unavailable",503);
 if(method==="GET"&&path===listPath)return json({projects:await allProjects(env),categories:CATEGORIES,statuses:STATUSES,priorities:PRIORITIES});
 if(request.headers.get("origin")!==url.origin)return invalid("Invalid request origin",403);
 if(!(request.headers.get("content-type")||"").includes("application/json"))return invalid("JSON required",415);
 let body;try{body=await request.json()}catch{return invalid("Invalid JSON",400)}
 await seedProjects(env);
 if(path===listPath&&method==="POST"){
  const count=(await allProjects(env)).length;
  if(count>=200)return invalid("Project limit reached",409);
  const normalized=normalize(body);if(normalized.error)return invalid(normalized.error);
  const now=new Date().toISOString();
  const project={id:crypto.randomUUID().replace(/-/g,""),category:"Internal Tools",status:"Needs review",priority:"Normal",description:"",website:"",admin:"",repo:"",reference:"",next_action:"",notes:"",owner:"",pinned:false,...normalized.project,created_at:now,updated_at:now};
  await env.REGISTRY.put(HUB_PREFIX+project.id,JSON.stringify(project));
  return json({ok:true,project},201);
 }
 if(match&&method==="PATCH"){
  const old=await env.REGISTRY.get(HUB_PREFIX+match[1],"json");
  if(!old)return invalid("Project not found",404);
  const normalized=normalize(body,old);if(normalized.error)return invalid(normalized.error);
  const project={...normalized.project,id:old.id,created_at:old.created_at,updated_at:new Date().toISOString()};
  await env.REGISTRY.put(HUB_PREFIX+project.id,JSON.stringify(project));
  return json({ok:true,project});
 }
 if(match&&method==="DELETE"){
  const old=await env.REGISTRY.get(HUB_PREFIX+match[1],"json");
  if(!old)return invalid("Project not found",404);
  old.status="Archived";old.updated_at=new Date().toISOString();
  await env.REGISTRY.put(HUB_PREFIX+old.id,JSON.stringify(old));
  return json({ok:true,project:old});
 }
 return invalid("Method not allowed",405);
}
