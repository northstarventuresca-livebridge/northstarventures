
"use strict";
// Preserve the exact workspace, selection and scroll position when the page is refreshed.
// Navigation is recorded in the URL. Scroll position is browser-session-local and user-scoped.
const compassNavViews=new Set(["home","songs","journal","achievements","messages","admin","settings"]);
const compassAdminPanes=new Set(["overview","accounts","tiers","milestones"]);
const compassSongTabs=new Set(["lyrics","mission","scriptures","notes","style_prompt","companion"]);
const compassId=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
let compassSelectedAccountId=null;
function compassScrollKey(){return "compass-scroll:"+state.user?.id;}
function compassPosition(){
 const value=window.scrollY||document.documentElement.scrollTop||0;
 return Number.isFinite(value)?Math.max(0,Math.round(value)):0;
}
function saveCompassScroll(){
 if(!state.user)return;
 try{
  sessionStorage.setItem(compassScrollKey(),JSON.stringify({
    path:location.pathname+location.search,y:compassPosition(),at:Date.now()
  }));
 }catch(_){}
}
addEventListener("pagehide",saveCompassScroll);
function rememberCompassLocation(){
 if(!state.user||window.__compassRestoring)return;
 const u=new URL(location.href),p=u.searchParams;
 for(const k of ["view","pane","account","song","songTab","lyricsTab","entry","thread"])p.delete(k);
 const view=compassNavViews.has(state.view)?state.view:"home";
 p.set("view",view);
 if(view==="admin"&&state.user.role==="admin"){
  p.set("pane",compassAdminPanes.has(cState.adminPane)?cState.adminPane:"overview");
  if(cState.adminPane==="accounts"&&compassId.test(compassSelectedAccountId||""))
    p.set("account",compassSelectedAccountId);
 }else if(view==="songs"){
  if(compassId.test(state.songId||""))p.set("song",state.songId);
  if(state.songId){
    const tab=document.querySelector(".editor-tabs [data-tab].active")?.dataset.tab;
    if(compassSongTabs.has(tab))p.set("songTab",tab);
    const sub=document.querySelector("[data-lyrics-sub].active")?.dataset.lyricsSub;
    if(sub==="chords")p.set("lyricsTab","chords");
  }
 }else if(view==="journal"){
  if(compassId.test(state.entryId||""))p.set("entry",state.entryId);
 }else if(view==="messages"){
  if(compassId.test(cState.threadId||""))p.set("thread",cState.threadId);
 }
 const updated=u.pathname+(p.toString()?"?"+p.toString():"")+u.hash;
 if(updated!==location.pathname+location.search+location.hash)
   history.replaceState(history.state,"",updated);
}
const compassPrevNavigate=navigate;
navigate=function(view){
 compassPrevNavigate(view);
 rememberCompassLocation();
};
const compassPrevSwitchAdminPane=switchAdminPane;
switchAdminPane=async function(pane){
 if(pane!=="accounts")compassSelectedAccountId=null;
 await compassPrevSwitchAdminPane(pane);
 rememberCompassLocation();
};
const compassPrevOpenAdminAccount=openAdminAccount;
openAdminAccount=async function(id){
 if(compassId.test(id||""))compassSelectedAccountId=id;
 await compassPrevOpenAdminAccount(id);
 rememberCompassLocation();
};
const compassPrevSelectSong=selectSong;
selectSong=function(id){
 compassPrevSelectSong(id);
 if(!window.__compassRestoring)rememberCompassLocation();
};
const compassPrevSelectEntry=selectEntry;
selectEntry=function(id){
 compassPrevSelectEntry(id);
 if(!window.__compassRestoring)rememberCompassLocation();
};
const compassPrevOpenThread=openThread;
openThread=async function(id){
 const result=await compassPrevOpenThread(id);
 rememberCompassLocation();
 return result;
};
const compassPrevSwitchTab=switchTab;
switchTab=function(tab){
 compassPrevSwitchTab(tab);rememberCompassLocation();
};
const compassPrevLyricsSub=setLyricsSubPane;
setLyricsSubPane=function(tab){
 compassPrevLyricsSub(tab);rememberCompassLocation();
};
async function restoreCompassLocation(params,username){
 const viewParam=params.get("view");
 const view=compassNavViews.has(viewParam)?viewParam:
   location.pathname==="/admin"?"admin":"home";
 const allowed=view==="admin"?state.user?.role==="admin":true;
 const target=allowed?view:"home";
 // Use actual account authorization, not the presence of an admin query parameter.
 if(target==="admin"){
   const pane=compassAdminPanes.has(params.get("pane"))?params.get("pane"):"overview";
   cState.adminPane=pane;
   navigate("admin");
   await switchAdminPane(pane);
   const account=params.get("account");
   if(pane==="accounts"&&compassId.test(account||"")){
     // Re-fetch the account directly: always show its latest statistics.
     await openAdminAccount(account);
   }
 }else if(target==="songs"){
   navigate("songs");
   const song=params.get("song");
   if(compassId.test(song||"")&&state.songs.some(s=>s.id===song)){
     selectSong(song);
     await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
     const tab=params.get("songTab");
     if(compassSongTabs.has(tab))switchTab(tab);
     if(params.get("lyricsTab")==="chords")setLyricsSubPane("chords");
   }
 }else if(target==="journal"){
   navigate("journal");
   const id=params.get("entry");
   if(compassId.test(id||"")&&state.entries.some(e=>e.id===id)){
     selectEntry(id);
     await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
   }
 }else if(target==="messages"){
   navigate("messages");
   const thread=params.get("thread");
   if(compassId.test(thread||"")){
     await loadThreads();
     if(cState.threads.some(t=>t.id===thread))await openThread(thread);
   }
 }else{
   navigate(target);
 }
 // Only restore a prior scroll position from this browser, exact user and same URL.
 let y=0;
 try{
  const scroll=JSON.parse(sessionStorage.getItem("compass-scroll:"+username)||"null");
  if(scroll && scroll.path===location.pathname+location.search &&
     Date.now()-scroll.at<10*60*1000 && Number.isFinite(scroll.y))y=Math.max(0,scroll.y);
 }catch(_){}
 requestAnimationFrame(()=>setTimeout(()=>window.scrollTo({top:y,behavior:"instant"}),90));
}
const compassPrevOpenWorkspace=openWorkspace;
openWorkspace=async function(user){
 const originalParams=new URLSearchParams(location.search);
 window.__compassRestoring=true;
 try{
  await compassPrevOpenWorkspace(user);
  if(state.user?.id===user.id)await restoreCompassLocation(originalParams,user.id);
 }finally{
  window.__compassRestoring=false;
  rememberCompassLocation();
 }
};
const compassPrevLogout=logout;
logout=async function(){
 try{sessionStorage.removeItem(compassScrollKey())}catch(_){}
 history.replaceState(history.state,"",location.pathname);
 return compassPrevLogout();
};
