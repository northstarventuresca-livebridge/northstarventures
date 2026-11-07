// Polaris project knowledge v2.1 — read-only searchable snapshot of verified resources.
// Only a repository and Worker inventory plus selected readme snapshots currently exist.
// Live private resource access requires separate scoped read-only tokens.
// Verified descriptions only. These are background facts, not a claim about live deployment state.
const POLARIS_PROJECT_OVERVIEWS={
 "TapBin":"PRODUCT OVERVIEW FROM THE TAPBIN SOURCE README: TapBin is North Star Ventures' multi-tenant inventory, storage and resale management system (tapbin.ca), initially built for Great Church and expanded for churches, businesses and personal inventory. It organises items into areas/rooms, bins and nested storage; supports search, adding or relocating items, NFC label/tap access, protected viewer PINs, organization administrators and moderators, invite-only onboarding, AI-assisted inventory entry, inventory reconciliation/re-inventory, and optional store/resale workflows. The primary GitHub codebase is northstarventuresca-livebridge/northstar-organizer, even though that repository name does not include TapBin. Features and security permissions are documented in its README; current production state needs fresh verification. When someone asks what TapBin is or how it works, describe this product directly rather than saying you only have its name.",
 "X32 AI Engineer":"PROJECT OVERVIEW FROM VERIFIED DISCUSSIONS: A Behringer X32 mixer companion intended to analyze individual vocal microphones via Dante audio and offer/apply voice-specific EQ suggestions. Goals include recognizing singers or speakers by voiceprint, loading saved starting EQ per person, monitoring live voice, and checking mixer EQ through X32 OSC. Known deployed church Worker name: x32-ai-engineer-church, in the separate Global Connections Church Cloudflare account. A separate authorized church Cloudflare source connection is needed to inspect its live Worker, and status of the current mixer connection cannot be inferred from the project name.",
 "HOH HUB":"PROJECT OVERVIEW: Home of Hope sponsorship administration and public sponsorship platform; child and microloan sponsorships, directory controls, staff/volunteers, sponsors and financial records, reports, marketing and approvals. Details and status are subject to source verification.",
 "LiveBridge":"PROJECT OVERVIEW: North Star Ventures live voice translation, transcription and listener/broadcaster communications platform, with organizations, campuses and separate admin controls. Review actual LiveBridge repo and Worker state for implementation details.",
 "Songwriters Compass":"PROJECT OVERVIEW: North Star Ventures AI-assisted songwriting workspace with theological guardrails for songwriters; source and active feature details require verification."
};

const POLARIS_KNOWN_PROJECTS=[
 "North Star Ventures","HOH HUB","LiveBridge","TapBin","Songwriters Compass",
 "X32 AI Engineer","Great Church","Healing The Heart","Northstar Organizer",
 "Polaris","Other / Client Projects"
];
function polarisProjectName(text){
 const t=String(text||"").toLowerCase().replace(/^(?:hey|hi)\s+polaris[,\s]*/,"");
 if(/\b(?:hoh|home of hope|microloans?|sponsorships?)\b/.test(t))return "HOH HUB";
 if(t.includes("livebridge")||t.includes("live bridge"))return "LiveBridge";
 if(/\btap\s*(?:bin|been|bean|bend)\b/i.test(t)||t.includes("tapbin"))return "TapBin";
 if(t.includes("songwriters")||t.includes("songwriter")||t.includes("compass"))return "Songwriters Compass";
 if(/\bx32\b/.test(t)||t.includes("audio engineer"))return "X32 AI Engineer";
 if(t.includes("great church")||t.includes("greatchurch"))return "Great Church";
 if(t.includes("healing the heart")||t.includes("hth"))return "Healing The Heart";
 if(t.includes("northstar organizer")||t.includes("northstar-organizer"))return "Northstar Organizer";
 if(/\bpolaris\b/.test(t)&&/\b(?:app|project|dashboard|worker|code|files?|settings|website|hub)\b/.test(t))return "Polaris";
 if(t.includes("north star ventures")||t.includes("northstar ventures"))return "North Star Ventures";
 return "";
}
async function polarisProjectContext(env,project,query){
 if(!env.POLARIS_DB)return {name:"",notes:"Project registry unavailable"};
 const text=String(query||"");
 const named=polarisProjectName(text);
 const chosen=named||(POLARIS_KNOWN_PROJECTS.includes(project)?project:"");
 const listAll=/\b(?:all|every|list|which|what|show)\b.*\b(?:projects|repositories|repos|workers)\b|\b(?:my projects|project list)\b/i.test(text);
 try{
  if(!chosen&&listAll){
   const rows=await env.POLARIS_DB.prepare("SELECT project,source,count(*) AS count FROM project_registry GROUP BY project,source ORDER BY project,source LIMIT 50").all();
   const desc=(rows.results||[]).map(r=>r.project+" · "+r.source+": "+r.count).join("\n");
   return {name:"All tracked resources",notes:"Verified metadata snapshot (not live inventory); repo file contents are not indexed in full.\n"+desc.slice(0,6000)};
  }
  if(!chosen)return {name:"",notes:""};
  const detailed=/\b(?:how|why|code|source|readme|file|repository|repo|detail|architecture|implementation|features|changes|built|build|develop|docs|inspect|review|what did|last)\b/i.test(text);
  const maxDocSections=detailed?8:1;
  const [found,documents]=await Promise.all([
   env.POLARIS_DB.prepare("SELECT source,name,path,visibility,notes FROM project_registry WHERE project=? ORDER BY source,name LIMIT 45").bind(chosen).all(),
   env.POLARIS_DB.prepare("SELECT repository,path,chunk_number,body,captured_at FROM project_documents WHERE project=? ORDER BY repository,path,chunk_number LIMIT ?").bind(chosen,maxDocSections).all()
  ]);
  const resources=(found.results||[]).map(r=>r.source+": "+r.name+(r.visibility?" ["+r.visibility+"]":"")).join("\n");
  const refs=(documents.results||[]).map(r=>"[README snapshot "+r.repository+"/"+r.path+", section "+r.chunk_number+"]\n"+String(r.body).slice(0,1550)).join("\n\n");
  const notes="VERIFIED PROJECT OVERVIEW:\n"+(POLARIS_PROJECT_OVERVIEWS[chosen]||"Project identity is recognized; consult source excerpts for verified details.")+"\n\nPROJECT SOURCE INVENTORY (read-only snapshot, not live sync):\n"+resources.slice(0,detailed?5900:1700)+
   "\n\nPROJECT DOCUMENT EXCERPTS (limited README snapshots, not entire codebase):\n"+refs.slice(0,detailed?8000:900)+
   "\n\nIMPORTANT: Do not claim files have been read live or that these are current deployments. For deeper or current analysis of private GitHub code and Cloudflare source, a separately authorized scoped read-only connection must be added.";
  return {name:chosen,notes};
 }catch(e){return {name:chosen,notes:"Project registry could not be loaded at this time."}}
}
async function polarisProjectIndex(env){
 if(!env.POLARIS_DB)return {projects:[],error:"Project database unavailable"};
 try{
  const counts=await env.POLARIS_DB.prepare("SELECT project,source,count(*) AS count FROM project_registry GROUP BY project,source ORDER BY project,source").all();
  const docs=await env.POLARIS_DB.prepare("SELECT project,count(DISTINCT repository) AS repositories, count(*) AS sections FROM project_documents GROUP BY project").all();
  const groups=Object.create(null);
  for(const r of counts.results||[]){
   if(!groups[r.project])groups[r.project]={name:r.project,github:0,workers:0,documents:0};
   if(r.source==="github")groups[r.project].github+=r.count||0;
   else if(r.source==="cloudflare-worker")groups[r.project].workers+=r.count||0;
  }
  for(const r of docs.results||[])if(groups[r.project])groups[r.project].documents=r.sections||0;
  return {projects:Object.values(groups),source:"verified account snapshots",live_repo_content:Boolean(env.POLARIS_GITHUB_NSV_READ_TOKEN||env.POLARIS_GITHUB_CHURCH_READ_TOKEN||env.POLARIS_GITHUB_PERSONAL_READ_TOKEN),live_cloudflare_access:Boolean(env.POLARIS_CF_NSV_READ_TOKEN)};
 }catch(e){return {projects:[],error:"Unable to load project registry"}}
}
