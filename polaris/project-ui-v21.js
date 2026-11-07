// Polaris v2.1 — mobile project selection backed by verified GitHub / Cloudflare inventory snapshots.
(function(){
"use strict";
var key="polaris.activeProject.v21";
var current="";try{current=localStorage.getItem(key)||""}catch(e){}
var wrap=document.createElement("div");wrap.id="polarisProjectContextRow";
wrap.style.cssText="margin:14px auto 10px;max-width:760px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 14px;border:1px solid #256a8e90;border-radius:10px;background:#081c2bbf";
var label=document.createElement("label");label.textContent="PROJECT CONTEXT";label.htmlFor="polarisProjectSelection";
label.style.cssText="font-size:11px;font-weight:700;letter-spacing:.07em;color:#77ccef";
var selector=document.createElement("select");selector.id="polarisProjectSelection";
selector.style.cssText="flex:1;min-width:170px;color:#d8f6ff;background:#102e46;border:1px solid #4382a8;padding:8px;border-radius:7px;font-size:12px;outline:0";
var status=document.createElement("span");status.id="polarisProjectSnapshotStatus";
status.style.cssText="font-size:10px;color:#90b4d0;line-height:1.3";
wrap.append(label,selector,status);
var form=el("commandForm");form.parentNode.insertBefore(wrap,form);
function updateOptions(projects){
 selector.replaceChildren();
 var auto=document.createElement("option");auto.value="";auto.textContent="Automatic · detect from question";selector.append(auto);
 projects.forEach(function(p){var op=document.createElement("option");op.value=p.name;op.textContent=p.name+" · "+(p.github||0)+" repos · "+(p.workers||0)+" Workers";selector.appendChild(op)});
 if(Array.from(selector.options).some(function(x){return x.value===current}))selector.value=current;
 else{current="";selector.value=""}
 window.polarisProjectSelection=current;
 status.textContent="Verified repository/Worker inventory; limited README snapshots";
}
var fallback=["HOH HUB","LiveBridge","TapBin","Songwriters Compass","X32 AI Engineer","Great Church","Healing The Heart","North Star Ventures","Polaris"].map(function(n){return{name:n,github:0,workers:0}});
updateOptions(fallback);
fetch("/api/project-index",{cache:"no-store"}).then(function(r){if(!r.ok)throw Error("Unavailable");return r.json()}).then(function(data){
 if(Array.isArray(data.projects))updateOptions(data.projects);
}).catch(function(){status.textContent="Cached project options · live registry unavailable"});
function setProject(name){
 current=name;
 selector.value=name;
 try{localStorage.setItem(key,name)}catch(e){}
 window.polarisProjectSelection=name;
 status.textContent=name?"Selected: "+name+" · verified inventory, not live code":"Automatic · detect project from question";
}
selector.addEventListener("change",function(){setProject(selector.value)});
var previousCommand=command;
command=function(raw,fromVoice){
 var x=String(raw||"").trim();
 var match=x.match(/^(?:(?:hey|hi)\s+)?polaris[,\s]*/i);
 var noWake=match?x.slice(match[0].length):x;
 if(/^(?:open|switch to|go to|start|work on|pull up)\s+(?:my |the )?/i.test(noWake)){
  var phrase=noWake.toLowerCase(),target="";
  if(/\b(?:hoh|home of hope)\b/.test(phrase))target="HOH HUB";
  else if(/\b(?:livebridge|live bridge)\b/.test(phrase))target="LiveBridge";
  else if(/\b(?:x32|audio engineer)\b/.test(phrase))target="X32 AI Engineer";
  else if(/\b(?:tapbin|tap bin)\b/.test(phrase))target="TapBin";
  else if(/\b(?:songwriters|compass)\b/.test(phrase))target="Songwriters Compass";
  else if(/\b(?:great church|greatchurch)\b/.test(phrase))target="Great Church";
  else if(/\b(?:healing the heart|hth)\b/.test(phrase))target="Healing The Heart";
  else if(/\b(?:polaris)\b/.test(phrase))target="Polaris";
  else if(/\b(?:north star ventures|northstar ventures)\b/.test(phrase))target="North Star Ventures";
  if(target){
   setProject(target);showHeard(raw);
   showReply("Switched to "+target+" project context. I can answer from the source inventory and indexed README snapshots. Original ChatGPT project conversations and private live code still require separate connections.");
   record("Selected project context: "+target);
   return;
  }
 }
 return previousCommand(raw,fromVoice);
};
var eyebrow=document.querySelector(".eyebrow");if(eyebrow)eyebrow.textContent="PERSONAL INTELLIGENCE NETWORK / V2.1";
})();
