
"use strict";
// Songwriter's Compass community and administration UI. All untrusted text is rendered with textContent.
const cState={progress:null,threads:[],threadId:null,lastMessageId:null,adminUsers:[],tiers:[],achievements:[],achFilter:"all",adminPane:"overview",poll:null,badgeTimers:0};
const $c=id=>document.getElementById(id);
const vDate=t=>t?new Date(t>1e11?t:t*1000).toLocaleString():"Never";
const usd=n=>"$"+Number(n||0).toFixed(5);
const escText=s=>String(s==null?"":s);
const button=(text,fn,kind="light")=>{let b=document.createElement("button");b.type="button";b.className="btn small "+kind;b.textContent=text;b.onclick=fn;return b;};
const div=(cls,text)=>{const d=document.createElement("div");d.className=cls||"";if(text!==undefined)d.textContent=escText(text);return d;};
const clear=el=>el.replaceChildren();
const elInput=(value,type="text")=>{let x=document.createElement("input");x.type=type;x.value=escText(value);return x;};
const metricsList=["songs_started","songs_finished","journal_entries","ai_sessions","messages_sent","songs_shared","lyric_words","missions_written","scriptures_added","days_active"];
const metricLabels={songs_started:"Songs started",songs_finished:"Songs finished",journal_entries:"Journal entries",ai_sessions:"AI conversations",messages_sent:"Messages sent",songs_shared:"Songs shared",lyric_words:"Lyric words",missions_written:"Creative missions",scriptures_added:"Scripture notes",days_active:"Active days"};
function milestoneToast(text){const t=$c("achievementToast");$c("achievementToastTitle").textContent=text;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),6500);}
async function loadProgress(showUnlock=false){
 if(!state.user)return;
 try{
 const d=await api("/api/progression");
 const previous=cState.progress?.tier?.id;
 cState.progress=d;
 $c("memberTier").textContent=d.tier.name;
 $c("memberTier").style.color=d.tier.accent;
 $c("avatar").style.background=d.tier.accent;
 $c("rankName").textContent=d.tier.name;
 $c("rankDesc").textContent=d.tier.description||"Keep exploring what God has placed on your heart.";
 $c("rankPoints").textContent=d.xp+" Compass points";
 $c("rankBadgeCount").textContent=d.earnedCount+" / "+d.totalAchievements+" achievements";
 const percent=d.nextTier?Math.max(0,Math.min(100,(d.xp-d.tier.threshold)/(d.nextTier.threshold-d.tier.threshold)*100)):100;
 $c("rankProgress").style.width=percent+"%";
 $c("rankNext").textContent=d.nextTier?(d.nextTier.threshold-d.xp)+" points to "+d.nextTier.name:"Highest milestone reached";
 $c("rankingTheme").style.borderColor=d.tier.accent;
 if(showUnlock){
   if(previous&&previous!==d.tier.id)milestoneToast("New level: "+d.tier.name);
   else if(d.newAwards?.length)milestoneToast("Achievement unlocked: "+d.newAwards[0]);
 }
 renderAchievements();
 }catch(e){notify(e.message,true)}
}
function renderAchievements(){
 const d=cState.progress;if(!d)return;
 const cards=$c("badgeGrid");clear(cards);
 const filter=$c("achievementFilter").value;
 const show=$c("achievementStatus").value;
 let list=d.achievements.filter(a=>(filter==="all"||a.metric===filter)&&(show==="all"||(show==="earned"&&a.unlocked)||(show==="locked"&&!a.unlocked)));
 $c("badgeCount").textContent=list.length+" achievements shown";
 if(!list.length)cards.append(div("empty","No achievements match these filters."));
 for(const a of list){
   const item=div("achievement"+(a.unlocked?"":" locked"));
   const ico=div("awardicon",a.unlocked?a.icon:"♢");
   const title=document.createElement("b");title.textContent=a.title;
   const desc=document.createElement("small");desc.textContent=a.description;
   const progress=div("ach-state",a.unlocked?"✓ Unlocked":a.progress+" / "+a.threshold);
   item.append(ico,title,desc,progress);cards.append(item);
 }
}
async function pollUnread(){
 if(!state.user)return;
 try{const d=await api("/api/messages/unread");const n=Number(d.count)||0;$c("unreadBubble").textContent=n>99?"99+":n;$c("unreadBubble").classList.toggle("hidden",n===0);$c("messagesNav").classList.toggle("has-unread",n>0);}catch(_){}
}
function messageCard(t){
 let item=record(t.other_name,t.last_body||"Start a conversation","journal",t.id===cState.threadId,()=>openThread(t.id),t.unread?t.unread+" new":null);
 item.setAttribute("aria-label","Conversation with "+t.other_name);
 return item;
}
async function loadThreads(){
 if(!state.user)return;
 try{const d=await api("/api/messages/threads");cState.threads=d.threads||[];let holder=$c("threadList");clear(holder);if(!d.threads.length)holder.append(div("muted","No conversations yet. Add a songwriter by their email to get started."));else d.threads.forEach(t=>holder.append(messageCard(t)));await pollUnread();}catch(e){notify(e.message,true)}
}
async function openThread(id){
 cState.threadId=id;cState.lastMessageId=null;const t=cState.threads.find(x=>x.id===id);$c("chatWith").textContent=t?.other_name||"Conversation";$c("chatTo").textContent=t?.other_email||"";$c("chatComposer").classList.remove("hidden");await loadThreadMessages();renderConversationActive();
}
function renderConversationActive(){for(const n of $c("threadList").children){n.classList.remove("current")}const t=cState.threads.find(x=>x.id===cState.threadId);if(t){$c("chatWith").textContent=t.other_name;}}
async function loadThreadMessages(){
 if(!cState.threadId||!state.user)return;
 try{
 const res=await api("/api/messages/threads/"+cState.threadId+"/messages");
 const msgs=res.messages||[];const latest=msgs[msgs.length-1]?.id||"";
 if(latest===cState.lastMessageId)return;
 cState.lastMessageId=latest;
 const holder=$c("chatMessages");const nearBottom=holder.scrollHeight-holder.scrollTop-holder.clientHeight<90;clear(holder);
 if(!msgs.length)holder.append(div("muted","Say hello. Encourage one another, share a thought, or send a song."));
 for(const m of msgs){
  const bubble=div("msg"+(m.sender_id===state.user.id?" mine":""));
  if(m.body){bubble.append(document.createTextNode(m.body));}
  if(m.shared_title){
    const share=div("shared-preview");const label=document.createElement("b");label.textContent="♫ Shared song: "+m.shared_title;
    share.append(label,document.createTextNode(m.shared_lyrics||"(No lyrics yet)"));bubble.append(share);
  }
  const time=document.createElement("small");time.textContent=vDate(m.created_at);bubble.append(time);holder.append(bubble);
 }
 if(nearBottom||!cState.lastMessageId)holder.scrollTop=holder.scrollHeight;
 await pollUnread();
 }catch(e){notify(e.message,true)}
}
async function createThread(email){
 const d=await api("/api/messages/threads","POST",{email});
 await loadThreads();await openThread(d.thread_id);
 return d;
}
$c("startChat").onsubmit=async e=>{
 e.preventDefault();const input=$c("findEmail"),btn=$c("startChatButton");btn.disabled=true;
 try{await createThread(input.value.trim());input.value="";notify("Conversation ready")}catch(err){notify(err.message,true)}finally{btn.disabled=false}
};
$c("sendMessage").onsubmit=async e=>{
 e.preventDefault();
 if(!cState.threadId)return;
 const input=$c("messageText"),share=$c("shareSongPick"),body=input.value.trim(),songId=share.value;
 if(!body&&!songId)return notify("Write a message or choose a song.",true);
 const btn=$c("sendMsgButton");btn.disabled=true;
 try{await api("/api/messages/threads/"+cState.threadId+"/messages","POST",{body,songId});input.value="";share.value="";cState.lastMessageId=null;await loadThreadMessages();await loadThreads();await loadProgress(true);}catch(err){notify(err.message,true)}finally{btn.disabled=false}
};
function fillShareSelect(){
 const el=$c("shareSongPick"),old=el.value;clear(el);
 let start=document.createElement("option");start.value="";start.textContent="No song attached";el.append(start);
 state.songs.forEach(s=>{const opt=document.createElement("option");opt.value=s.id;opt.textContent=s.title;el.append(opt)});
 if([...el.options].some(o=>o.value===old))el.value=old;
}
$c("shareThisSong").onclick=()=>{const s=currentSong();if(!s)return;fillShareSelect();$c("shareSongPick").value=s.id;navigate("messages");notify("Choose a conversation to share your song.")};
function stat(label,value){const d=div("stat");d.append(div("label",label),div("value",value));return d}
async function loadAdminOverview(){
 try{
 const d=await api("/api/admin/overview");
 const row=$c("adminStatRow");clear(row);
 row.append(stat("Accounts",d.users),stat("Online now",d.active),stat("AI cost (USD estimate)",usd(d.ai.estimated_usd)),stat("AI requests",d.ai.calls),stat("Songs",d.songs),stat("Input / output tokens",d.ai.in_tokens+" / "+d.ai.out_tokens));
 $c("adminCostNote").textContent=d.costNote;
 }catch(e){notify(e.message,true)}
}
async function loadAdminAccounts(){
 try{
 const d=await api("/api/admin/accounts");cState.adminUsers=d.users||[];renderAdminAccounts();
 }catch(e){notify(e.message,true)}
}
function renderAdminAccounts(){
 const holder=$c("adminAccountList"),q=$c("accountSearch").value.toLowerCase().trim();clear(holder);
 const filtered=cState.adminUsers.filter(u=>!q||[u.email,u.display_name].join(" ").toLowerCase().includes(q));
 if(!filtered.length)holder.append(div("empty","No accounts match your search."));
 for(const u of filtered){
   const row=div("accountrow");
   const info=div("");const title=document.createElement("b");title.textContent=u.display_name;info.append(title,div("",""+u.email));
   info.lastChild.className="muted";info.lastChild.style.fontSize="10px";
   if(u.suspended)info.append(div("error","Suspended"));
   row.append(info,div("mini-stat",u.songs+" songs"),div("mini-stat",u.calls+" AI calls"),div("hide-tablet mini-stat",usd(u.cost_usd)),button("View",()=>openAdminAccount(u.id)));
   holder.append(row);
 }
}
$c("accountSearch").addEventListener("input",renderAdminAccounts);
function makeInfo(label,value){const box=div("");const name=document.createElement("b");name.textContent=label;const details=div("muted",value);details.style.fontSize="12px";box.append(name,details);return box}
async function openAdminAccount(id){
 try{
   const d=await api("/api/admin/accounts/"+id),u=d.user,detail=$c("adminAccountDetail");clear(detail);detail.classList.remove("hidden");
   const headline=document.createElement("h3");headline.textContent=u.display_name+" — "+u.email;detail.append(headline);
   const statgrid=div("keyval");
   const ai=d.ai_calls||[],prompt=ai.reduce((s,x)=>s+Number(x.prompt_tokens),0),output=ai.reduce((s,x)=>s+Number(x.completion_tokens),0),cost=ai.reduce((s,x)=>s+Number(x.cost_usd),0);
   const live=d.sessions.filter(x=>!x.ended_at&&x.last_seen>Date.now()/1000-300);
   const duration=d.sessions.reduce((sum,s)=>sum+Math.max(0,(s.ended_at||s.last_seen)-s.started_at),0);
   [["Member since",vDate(u.created_at)],["Level",d.progress.tier.name],["Compass points",d.progress.xp],["Total sessions shown",d.sessions.length],["Online now",live.length?"Yes":"No"],["Tracked session time",Math.round(duration/60)+" min"],["AI calls (recent)",ai.length],["Prompt tokens (recent)",prompt],["Completion tokens (recent)",output],["Estimated recent AI cost",usd(cost)],["Songs",d.progress.stats.songs_started],["Achievements",d.progress.earnedCount]].forEach(x=>statgrid.append(makeInfo(x[0],x[1])));
   detail.append(statgrid);
   const ctrl=div("compose-row");
   const tierSelect=document.createElement("select");tierSelect.style.width="min(230px,100%)";
   const manual=document.createElement("option");manual.value="";manual.textContent="Automatic level";tierSelect.append(manual);
   (cState.tiers||[]).forEach(t=>{const o=document.createElement("option");o.value=t.id;o.textContent=t.name;tierSelect.append(o)});
   tierSelect.value=u.tier_override||"";
   const save=button("Save level",async()=>{try{await api("/api/admin/accounts/"+id,"PATCH",{tier_override:tierSelect.value?Number(tierSelect.value):null});notify("Level updated");await openAdminAccount(id);await loadAdminAccounts();}catch(e){notify(e.message,true)}});
   const suspended=button(u.suspended?"Restore account":"Suspend account",async()=>{if(!confirm((u.suspended?"Restore":"Suspend")+" this account?"))return;try{await api("/api/admin/accounts/"+id,"PATCH",{suspended:!u.suspended});notify("Account updated");await openAdminAccount(id);await loadAdminAccounts()}catch(e){notify(e.message,true)}},u.suspended?"light":"danger");
   const message=button("Message songwriter",async()=>{try{await createThread(u.email);navigate("messages")}catch(e){notify(e.message,true)}});
   ctrl.append(tierSelect,save,suspended,message);detail.append(ctrl);
   const subtitle=document.createElement("h4");subtitle.textContent="Recent account sessions & activity";detail.append(subtitle);
   for(const s of d.sessions.slice(0,10)){detail.append(div("record",vDate(s.started_at)+" → "+(s.ended_at?vDate(s.ended_at):"Last active "+vDate(s.last_seen))+" ("+Math.max(0,Math.round(((s.ended_at||s.last_seen)-s.started_at)/60))+" min)"));}
   const activity=document.createElement("h4");activity.textContent="Recent events";detail.append(activity);
   for(const e of d.activity.slice(0,15))detail.append(div("record",metricLabels[e.kind]||e.kind.replaceAll("_"," ")+" · "+vDate(e.created_at)));
 }catch(e){notify(e.message,true)}
}
async function loadTiers(){
 try{const d=await api("/api/admin/tiers");cState.tiers=d.tiers||[];renderTierEditor();}catch(e){notify(e.message,true)}
}
function renderTierEditor(){
 const holder=$c("tiersList");clear(holder);
 for(const t of cState.tiers){
  const row=div("tieredit");
  const number=div("",String(t.id));
  const name=elInput(t.name),limit=elInput(t.threshold,"number");limit.min="0";
  const color=elInput(t.accent,"color");
  const save=button("Save",async()=>{try{await api("/api/admin/tiers/"+t.id,"PATCH",{name:name.value,threshold:Number(limit.value),accent:color.value,description:t.description});notify("Tier updated");await loadTiers()}catch(e){notify(e.message,true)}});
  row.append(number,name,limit,color,save);holder.append(row);
 }
}
$c("newTierForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/admin/tiers","POST",{name:$c("newTierName").value,threshold:Number($c("newTierGoal").value),accent:"#d7b477",description:""});e.target.reset();await loadTiers();notify("New tier created")}catch(err){notify(err.message,true)}};
async function loadAdminAchievements(){
 try{const d=await api("/api/admin/achievements");cState.achievements=d.achievements||[];renderAdminAchievements();}catch(e){notify(e.message,true)}
}
function renderAdminAchievements(){
 const holder=$c("adminAchievementList");clear(holder);
 const q=$c("adminAchievementSearch").value.toLowerCase().trim();
 const shown=cState.achievements.filter(a=>!q||[a.title,a.metric].join(" ").toLowerCase().includes(q)).slice(0,60);
 $c("adminAchievementCount").textContent=cState.achievements.length+" total milestones · showing "+shown.length;
 for(const a of shown){
   const row=div("ach-edit");
   const name=elInput(a.title);const selector=document.createElement("select");
   for(const m of metricsList){const o=document.createElement("option");o.value=m;o.textContent=metricLabels[m];selector.append(o)}selector.value=a.metric;
   const goal=elInput(a.threshold,"number");goal.min="1";const icon=elInput(a.icon);
   const save=button("Save",async()=>{try{await api("/api/admin/achievements/"+a.id,"PATCH",{title:name.value,description:a.description,metric:selector.value,threshold:Number(goal.value),icon:icon.value,enabled:!!a.enabled});notify("Achievement saved")}catch(e){notify(e.message,true)}});
   row.append(name,selector,goal,icon,save);holder.append(row);
 }
}
$c("adminAchievementSearch").addEventListener("input",renderAdminAchievements);
$c("newAchievementForm").onsubmit=async e=>{e.preventDefault();try{await api("/api/admin/achievements","POST",{title:$c("newAchievementName").value,description:$c("newAchievementDesc").value,metric:$c("newAchievementMetric").value,threshold:Number($c("newAchievementGoal").value),icon:"✦"});e.target.reset();await loadAdminAchievements();notify("Achievement created")}catch(err){notify(err.message,true)}};
async function switchAdminPane(pane){
 cState.adminPane=pane;
 document.querySelectorAll("[data-adminpane]").forEach(el=>el.classList.toggle("active",el.dataset.adminpane===pane));
 document.querySelectorAll(".adminpane").forEach(el=>el.classList.toggle("active",el.id==="admin-"+pane));
 if(pane==="overview")await loadAdminOverview();
 else if(pane==="accounts"){await Promise.all([loadAdminAccounts(),loadTiers()])}
 else if(pane==="tiers")await loadTiers();
 else if(pane==="milestones")await loadAdminAchievements();
}
document.querySelectorAll("[data-adminpane]").forEach(el=>el.addEventListener("click",()=>switchAdminPane(el.dataset.adminpane)));
$c("achievementFilter").onchange=renderAchievements;$c("achievementStatus").onchange=renderAchievements;
$c("refreshMessages").onclick=async()=>{await loadThreads();if(cState.threadId)await loadThreadMessages()};
let progressTimer=null;function scheduleProgress(){clearTimeout(progressTimer);progressTimer=setTimeout(()=>loadProgress(true),1800)}
const origNavigate=navigate;
navigate=function(view){
 origNavigate(view);
 const labels={messages:"Messages",achievements:"Achievements",admin:"NorthStar Admin"};
 if(labels[view])$c("crumb").textContent=labels[view];
 if(view==="achievements")loadProgress(true);
 if(view==="messages"){fillShareSelect();loadThreads();if(cState.threadId)loadThreadMessages()}
 if(view==="admin"&&state.user?.role==="admin")switchAdminPane(cState.adminPane);
};
const origOpenWorkspace=openWorkspace;
function revealAdmin(role){
 const admin=role==="admin";
 for(const id of ["adminNav","topAdmin","homeAdminBanner"])$c(id).classList.toggle("hidden",!admin);
}
$c("topAdmin").onclick=()=>navigate("admin");
$c("homeAdmin").onclick=()=>navigate("admin");
openWorkspace=async function(user){
 // Reveal privileged navigation immediately; it is not dependent on other dashboard API calls.
 revealAdmin(user.role);
 await origOpenWorkspace(user);
 // /api/me is authoritative when the app resumes an already-signed-in session.
 try{const fresh=await api("/api/me");if(fresh.user?.id===state.user.id){state.user.role=fresh.user.role;revealAdmin(fresh.user.role);}}catch(_){ }
 if(new URLSearchParams(location.search).get("view")==="admin"&&state.user.role==="admin")navigate("admin");
 await api("/api/heartbeat","POST",{});
 await Promise.all([loadProgress(false),pollUnread()]);
 if(cState.poll)clearInterval(cState.poll);
 cState.poll=setInterval(async()=>{
   if(!state.user)return;
   try{await api("/api/heartbeat","POST",{});await pollUnread();
      if(state.view==="messages"){await loadThreads();if(cState.threadId)await loadThreadMessages();}
   }catch(_){}
 },12000);
};
const origLogout=logout;
logout=async function(){if(cState.poll)clearInterval(cState.poll);cState.poll=null;await origLogout();};
