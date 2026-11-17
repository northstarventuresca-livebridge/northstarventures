// Polaris Android dashboard voice controls and extended Monica journal dictation.
// Inject inside the existing authenticated / dashboard document.
(function(){
 if(document.getElementById("pmMobileControl"))return;
 const panel=document.createElement("section");
 panel.id="pmMobileControl";
 panel.setAttribute("aria-label","Polaris mobile voice control");
 panel.style.cssText="position:fixed;bottom:calc(16px + env(safe-area-inset-bottom));right:14px;width:min(360px,calc(100vw - 28px));z-index:99998;background:#071d31f5;color:#e8faff;border:1px solid #51bfe88e;border-radius:14px;padding:12px;box-shadow:0 12px 36px #0009;font:14px system-ui,sans-serif";
 panel.innerHTML='<div style="display:flex;gap:10px;align-items:center;justify-content:space-between"><button id="pmDashTalk" type="button" style="border:1px solid #68e9ff;border-radius:10px;min-height:43px;padding:9px 16px;background:#11598b;color:white;font-weight:800;cursor:pointer">🎙 TAP TO TALK</button><a href="/assistant" style="font-size:12px;color:#9addff">Assistant</a><button id="pmDashClose" type="button" style="background:transparent;color:#a8c7df;border:0;font-size:20px;cursor:pointer" aria-label="Hide Talk button">×</button></div><div id="pmDashStatus" role="status" aria-live="polite" style="color:#aed5ed;font-size:12px;line-height:1.4;margin-top:8px">Tap once, speak, then Polaris answers.</div><div id="pmDashReply" aria-live="polite" style="display:none;margin-top:8px;color:#e5fcff;font-size:14px;max-height:130px;overflow:auto"></div>';
 document.body.appendChild(panel);
 const button=panel.querySelector("#pmDashTalk"),status=panel.querySelector("#pmDashStatus"),reply=panel.querySelector("#pmDashReply");
 panel.querySelector("#pmDashClose").addEventListener("click",()=>{if(journalMode==="recording")journalPause();panel.remove();});
 let rec=null,sent=false,last="",voiceInFlight=false;

 let soundContext=null,soundNode=null,lastSpoken="",speechToken=0;
 const replay=document.createElement("button");
 replay.type="button";replay.id="pmDashReplay";
 replay.textContent="🔊 REPLAY";replay.disabled=true;
 replay.style.cssText="border:1px solid #4da9cc;border-radius:8px;padding:7px 8px;background:#0b3550;color:#d6f5ff;font-size:12px;cursor:pointer";
 panel.querySelector("#pmDashClose").parentNode.insertBefore(replay,panel.querySelector("#pmDashClose"));
 function audioReadyFromTap(){
  try{
   const Ctor=window.AudioContext||window.webkitAudioContext;
   if(!Ctor)throw Error("This phone browser does not support audio playback.");
   if(!soundContext||soundContext.state==="closed")soundContext=new Ctor({latencyHint:"interactive"});
   if(soundContext.state!=="running")
    Promise.resolve(soundContext.resume()).catch(e=>setStatus("Speaker blocked: "+e.message+" · tap Replay"));
   return true;
  }catch(e){setStatus("Speaker unavailable: "+e.message);return false}
 }
 function stopSpeaking(){
  speechToken++;
  if(soundNode){try{soundNode.onended=null;soundNode.stop()}catch(e){}soundNode=null}
 }
 async function sayAnswer(answer){
  lastSpoken=String(answer||"").trim();
  replay.disabled=!lastSpoken;
  if(!lastSpoken)return;
  const ticket=++speechToken;
  if(soundNode){try{soundNode.onended=null;soundNode.stop()}catch(e){}soundNode=null}
  setStatus("Polaris preparing British voice…");
  try{
   const response=await fetch("/api/tts",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({text:lastSpoken.slice(0,650)})
   });
   if(!response.ok){
    let error;try{error=await response.json()}catch{}
    throw Error(error?.error||"Speech service returned HTTP "+response.status);
   }
   const bytes=await response.arrayBuffer();
   if(bytes.byteLength<1000)throw Error("The voice service returned empty audio.");
   if(ticket!==speechToken)return;
   if(!soundContext)throw Error("Phone speaker was not initialized. Tap Replay.");
   const decoded=await soundContext.decodeAudioData(bytes.slice(0));
   if(ticket!==speechToken)return;
   if(soundContext.state!=="running")throw Error("Audio locked. Tap Replay to unlock sound.");
   const node=soundContext.createBufferSource();
   node.buffer=decoded;node.playbackRate.value=1.2;
   node.connect(soundContext.destination);soundNode=node;
   node.onended=()=>{
    if(ticket!==speechToken)return;
    if(soundNode===node)soundNode=null;
    if(journalMode==="intro"){journalStartMic();return;}
   setStatus("Polaris finished speaking · tap to ask another question");
   };
   node.start(0);
   setStatus("🔊 Polaris speaking · Bluetooth or phone speaker");
  }catch(e){
   if(ticket!==speechToken)return;
   setStatus("Voice playback failed: "+e.message+" · tap Replay");
  }
 }
 replay.addEventListener("click",()=>{
  if(!lastSpoken)return;
  audioReadyFromTap();sayAnswer(lastSpoken);
 });


 const JOURNAL_KEY="polaris.monica.journal.draft.v1";
 let journalMode=null,journalRec=null,journalPaused=false,journalRetry=0,journalSaving=false;
 const journalButton=document.createElement("button");
 journalButton.type="button";journalButton.textContent="📝 JOURNAL";journalButton.id="pmJournalStart";
 journalButton.style.cssText="border:1px solid #51b1c8;border-radius:8px;padding:7px 9px;background:#0d3b54;color:#d9f5ff;font-weight:700;cursor:pointer;font-size:12px";
 const journalControls=document.createElement("div");
 journalControls.style.cssText="display:flex;gap:8px;margin-top:8px;align-items:center;flex-wrap:wrap";
 panel.insertBefore(journalControls,status);
 journalControls.append(journalButton,replay);
 const journalPane=document.createElement("div");
 journalPane.id="pmJournalPane";
 journalPane.style.cssText="display:none;margin-top:10px;padding:11px;background:#041929;border:1px solid #467e99;border-radius:12px;max-height:min(61vh,540px);overflow-y:auto";
 journalPane.innerHTML='<strong style="font-size:14px">📝 MONICA WORK JOURNAL</strong><div id="pmJournalIndicator" style="font-size:12px;color:#9eeaff;margin:6px 0">Ready to dictate</div><textarea id="pmJournalText" rows="7" placeholder="Your words will appear here. You can edit the notes before saving." style="width:100%;box-sizing:border-box;color:#e9faff;background:#08263b;border:1px solid #427995;border-radius:8px;padding:8px;font:13px/1.5 system-ui;resize:vertical"></textarea><div id="pmJournalCount" style="font-size:11px;color:#a7d7e8;margin:3px 0">Draft saved on this phone</div><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px"><button type="button" id="pmJournalResume">🎙 Resume</button><button type="button" id="pmJournalDone">✓ I’m finished</button><button type="button" id="pmJournalSave">✓ Confirm · Stop &amp; Save</button><button type="button" id="pmJournalCancel">Discard draft</button></div>';
 panel.appendChild(journalPane);
 const jText=journalPane.querySelector("#pmJournalText"),
       jIndicator=journalPane.querySelector("#pmJournalIndicator"),
       jCount=journalPane.querySelector("#pmJournalCount");
 const jResume=journalPane.querySelector("#pmJournalResume"),
       jDone=journalPane.querySelector("#pmJournalDone"),
       jSave=journalPane.querySelector("#pmJournalSave"),
       jCancel=journalPane.querySelector("#pmJournalCancel");
 for(const b of [jResume,jDone,jSave,jCancel])
   b.style.cssText="border:1px solid #43859f;border-radius:8px;padding:8px;background:#0c3853;color:#e6fbff;cursor:pointer;font-size:12px";
 jSave.style.background="#086b67";
 function journalState(message){jIndicator.textContent=message}
 function persistJournal(){
  if(!journalMode)return;
  try{localStorage.setItem(JOURNAL_KEY,JSON.stringify({text:jText.value,updatedAt:new Date().toISOString()}))}catch(e){}
  const size=jText.value.length;
  jCount.textContent=size.toLocaleString()+" / 5,000 characters for one journal entry · draft saved locally";
  jCount.style.color=size>5000?"#ffab91":"#a7d7e8";
  jSave.disabled=size===0||size>5000||journalSaving||journalMode!=="review";
  jResume.disabled=journalSaving;
  jDone.disabled=journalSaving;
 }
 function clearJournalDraft(){try{localStorage.removeItem(JOURNAL_KEY)}catch(e){}}
 function journalDisplay(){journalPane.style.display=journalMode?"block":"none";persistJournal();ready()}
 jText.addEventListener("input",persistJournal);
 function journalTrigger(s){
  const t=String(s||"").toLowerCase().replace(/^(?:(?:hey|okay|ok)\s+)*polaris[\s,:;.-]*/,"").trim();
  if(/^(?:what|why|when|where|how|which|was|were|did|do|can you|could you|would you|tell me|give me|show me|summari[sz]e|review|list)\b/.test(t))return false;
  return /^(?:start|begin|open|create|record|take|dictate|journal)\b[\s\S]{0,90}\b(?:journal|dictation|work log|work journal|entry|what i did today)\b/.test(t)||
    /^(?:journal|dictation|work log|work journal)$/.test(t);
 }
 function journalEndMarker(s){
  const text=String(s||"");
  const match=/(?:\b(?:hey\s+)?polaris[\s,:;.!-]*)?(?:i['’]?m\s+(?:done|finished)|i am\s+(?:done|finished)|that['’]?s\s+(?:all|it)|that is\s+(?:all|it))\s*[.!?]*$/i.exec(text);
  if(!match)return null;
  return text.slice(0,match.index).trim().replace(/[\s,;.!]+$/,"").trim();
 }
 function journalAdd(s){
  const line=String(s||"").trim();
  if(!line)return;
  const previous=jText.value.trimEnd();
  if(previous.split("\n").slice(-1)[0]?.toLowerCase()===("- "+line).toLowerCase())return;
  jText.value=previous+(previous?"\n":"")+"- "+line;
  persistJournal();journalState("Captured · "+jText.value.split("\n").filter(Boolean).length+" spoken sections");
 }
 function journalStartRequest(){
  if(journalMode&&journalMode!=="review"){journalDisplay();return}
  if(journalMode==="review"&&jText.value.trim()){journalDisplay();journalState("Your previous draft is ready. Resume or confirm to save.");return}
  journalMode="intro";journalPaused=false;journalRetry=0;
  jText.value="";journalDisplay();
  journalState("Polaris is introducing long dictation…");
  sayAnswer("Okay Ryan, long dictation mode. Go ahead with your entry. I'm listening, and I'll keep listening until you say Polaris, I'm finished, Polaris, I'm done, or Polaris, that's all.");
  journalCheckSecure();
 }
 async function journalCheckSecure(){
  try{
   const signed=await fetch("/api/monica/sign",{method:"POST",credentials:"same-origin",
     headers:{"content-type":"application/json"},body:JSON.stringify({action:"status"})});
   const auth=await signed.json();
   if(!signed.ok||!auth.ok||!auth.token)throw Error("Polaris could not authorize a read-only check");
   const response=await fetch("https://monicas-house.rwyers.workers.dev/api/polaris/timer",{
     method:"POST",mode:"cors",credentials:"omit",
     headers:{"authorization":"Bearer "+auth.token,"content-type":"application/json"},
     body:JSON.stringify(auth.command)
   });
   const status=await response.json();
   if(!response.ok||!status.ok)throw Error(status.error||"Monica could not verify Polaris");
  }catch(e){
   if(journalMode&&journalMode!=="saving"){
    journalState("⚠ Secure journal-save connection not verified. Your spoken notes will be preserved here until we fix it. "+String(e.message).slice(0,105));
   }
  }
 }
 function journalStartMic(){
  if(!journalMode||journalMode==="saving"||journalMode==="review")return;
  if(journalRec)return;
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){journalMode="paused";journalState("Speech recognition requires Chrome on Android. Your draft is safe.");journalDisplay();return}
  journalMode="recording";journalPaused=false;
  const mic=new Speech();
  mic.lang="en-CA";mic.continuous=true;mic.interimResults=true;mic.maxAlternatives=1;
  journalRec=mic;
  const completed=new Set();
  mic.onstart=()=>{
   if(journalRec!==mic)return;
   journalRetry=0;journalState("🔴 Recording · pause as long as needed · say 'Polaris, I'm done' to finish");
   setStatus("Long dictation recording · the timer is still running");ready();
  };
  mic.onresult=e=>{
   if(journalRec!==mic||journalMode!=="recording")return;
   for(let i=e.resultIndex;i<e.results.length;i++){
    const result=e.results[i],spoken=String(result[0]?.transcript||"").trim();
    if(!spoken)continue;
    if(!result.isFinal){journalState("Hearing: "+spoken.slice(0,150));continue}
    if(completed.has(i))continue;completed.add(i);
    const lastWords=journalEndMarker(spoken);
    if(lastWords!==null){
     if(lastWords)journalAdd(lastWords);
     journalFinish();
     break;
    }
    journalAdd(spoken);
   }
  };
  mic.onerror=e=>{
   if(journalRec!==mic)return;
   const error=String(e.error||"unknown");
   if(error==="not-allowed"||error==="service-not-allowed"||error==="audio-capture"){
    journalPaused=true;journalMode="paused";
    journalState("Microphone needs permission or reconnection. Draft saved. Tap Resume.");
   }else if(error==="network"){
    journalRetry++;
    if(journalRetry>2){
     journalPaused=true;journalMode="paused";
     journalState("Speech network unavailable. Draft saved. Tap Resume later.");
    }
   }else if(error!=="no-speech"&&error!=="aborted"){
    journalState("Microphone: "+error+" · draft preserved");
   }
  };
  mic.onend=()=>{
   if(journalRec!==mic)return;
   journalRec=null;ready();
   if(journalMode==="recording"&&!journalPaused){
    journalState("Pause detected · reconnecting listening, draft preserved…");
    setTimeout(()=>{if(journalMode==="recording"&&!journalPaused&&!journalRec)journalStartMic()},450);
   }
  };
  journalDisplay();
  try{mic.start()}catch(e){
   journalRec=null;journalPaused=true;journalMode="paused";
   journalState("Tap Resume to reconnect your microphone. Draft preserved.");
   journalDisplay();
  }
 }
 function journalPause(){
  if(journalMode!=="recording")return;
  journalPaused=true;journalMode="paused";
  if(journalRec){try{journalRec.stop()}catch(e){}journalRec=null}
  journalState("Paused · take as long as you need. Tap Resume when ready.");journalDisplay();
 }
 function journalFinish(){
  if(!journalMode||journalMode==="review"||journalMode==="saving")return;
  journalPaused=true;journalMode="review";
  if(journalRec){try{journalRec.stop()}catch(e){}journalRec=null}
  journalDisplay();
  const lines=jText.value.split(/\n/).map(s=>s.trim()).filter(Boolean);
  if(!lines.length){
   journalState("Nothing recorded yet. Tap Resume and start describing your work.");
   sayAnswer("I didn't capture any work notes yet. Tap resume and tell me what you did.");
   return;
  }
  journalState("Review the notes. Nothing has been saved or stopped yet.");
  const sample=lines.slice(0,2).map(s=>s.replace(/^[-*]\s*/,"")).join(". ").slice(0,170);
  sayAnswer("I captured "+lines.length+" parts of your work journal. "+(sample?"It begins with: "+sample+". ":"")+"Please check the notes, then tap confirm, stop and save, or resume dictation to add more.");
 }
 function journalReviewVoice(s){
  const t=String(s||"").toLowerCase().replace(/^(?:(?:hey|a|uh|ah)\s+)*polaris[\s,:;.-]*/,"").trim();
  if(/\b(?:no|don't|do not|not yet|wait|cancel)\b/.test(t)){
   journalState("Nothing saved or stopped. Review or resume whenever you're ready.");
   sayAnswer("Okay, I haven't saved anything. Your notes and timer are unchanged.");return;
  }
  if(/^(?:yes|yeah|yep|confirm|save(?:\s+it)?|that's correct|looks good)\b/.test(t)){journalSave();return}
  if(/\b(?:continue|resume|more|add)\b/.test(t)){journalStartMic();return}
  journalState("Say 'save it' or 'continue', or use the buttons below.");
  sayAnswer("Please say save it to stop the timer and save these notes, or continue to add more.");
 }
 async function journalSave(){
  if(journalMode!=="review"||journalSaving)return;
  const notes=jText.value.trim();
  if(!notes){journalState("Add a note before saving.");return}
  if(notes.length>5000){journalState("The journal exceeds 5,000 characters. Split or shorten it before saving; no text was deleted.");return}
  journalSaving=true;journalMode="saving";journalDisplay();
  journalState("Saving notes and stopping Monica's timer…");
  try{
   const response=await fetch("/api/monica/sign",{
    method:"POST",credentials:"same-origin",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({action:"stop",notes})
   });
   const auth=await response.json();
   if(!response.ok||!auth.ok||!auth.token||auth.command?.notes!==notes)
    throw Error(auth.error||"Polaris couldn't authorize the complete journal entry");
   const stop=await fetch("https://monicas-house.rwyers.workers.dev/api/polaris/timer",{
    method:"POST",mode:"cors",credentials:"omit",
    headers:{"authorization":"Bearer "+auth.token,"content-type":"application/json"},
    body:JSON.stringify(auth.command)
   });
   const data=await stop.json();
   if(!stop.ok||!data.ok)throw Error(data.error||"Monica didn't save the journal");
   if(data.unchanged)throw Error("Monica reported no active timer to stop. Draft preserved.");
   clearJournalDraft();jText.value="";journalMode=null;journalSaving=false;journalDisplay();
   reply.style.display="block";
   reply.textContent="Monica's timer stopped. Your work notes were saved to the project time journal.";
   sayAnswer("Your journal entry has been saved, and Monica's timer has stopped.");
  }catch(e){
   journalSaving=false;journalMode="review";
   journalState("Could not confirm the save: "+e.message+". Your draft is preserved; check Monica's journal before retrying.");
   journalDisplay();
  }
 }
 jResume.addEventListener("click",()=>{
  if(journalMode==="saving")return;
  audioReadyFromTap();stopSpeaking();journalStartMic();
 });
 jDone.addEventListener("click",journalFinish);
 jSave.addEventListener("click",()=>{audioReadyFromTap();journalSave()});
 jCancel.addEventListener("click",()=>{
  if(journalSaving)return;
  if(!window.confirm("Discard the journal draft? Monica's timer will keep running."))return;
  journalPaused=true;if(journalRec){try{journalRec.stop()}catch(e){}journalRec=null}
  clearJournalDraft();jText.value="";journalMode=null;journalDisplay();
  setStatus("Draft discarded. Monica's timer was not changed.");
 });
 journalButton.addEventListener("click",()=>{audioReadyFromTap();journalStartRequest()});
 document.addEventListener("visibilitychange",()=>{
  if(document.hidden&&journalMode==="recording")journalPause();
 });
 try{
  const draft=JSON.parse(localStorage.getItem(JOURNAL_KEY)||"null");
  if(draft?.text){
   jText.value=String(draft.text);journalMode="review";journalPaused=true;journalDisplay();
   journalState("Recovered your unfinished journal draft. Tap Resume or review and confirm.");
  }
 }catch(e){}

 function setStatus(x){status.textContent=x}
 function ready(){
  if(journalMode==="recording"){button.textContent="⏸ PAUSE DICTATION";return}
  if(journalMode==="paused"||journalMode==="intro"){button.textContent="🎙 RESUME DICTATION";return}
  if(journalMode==="review"){button.textContent="🎙 VOICE CONFIRM";return}
  button.textContent="🎙 TAP TO TALK";
 }
 function finishSpeech(message){
  const raw=String(message||"").trim();
  if(!raw){setStatus("No speech detected. Tap to try again.");return}
  if(sent)return;
  sent=true;
  if(journalMode==="review"){journalReviewVoice(raw);return}
  if(journalTrigger(raw)){
   if(rec){try{rec.stop()}catch(e){}}
   journalStartRequest();return;
  }
  let phrase=raw.replace(/^(?:hey\s+)?polaris[\s,:-]*/i,"").trim();
  if(/^(?:start|resume|pause|stop|end|check|show)\s+(?:the\s+|my\s+)?timer\b/i.test(phrase)){
   phrase=phrase.replace(/^(start|resume|pause|stop|end|check|show)\s+(?:the\s+|my\s+)?timer\b/i,(_,v)=>v+" Monica timer");
  }
  if(/^how long (?:have i been working|is (?:the|my) timer)/i.test(phrase))phrase="how long is Monica's timer";
  if(!phrase)return;
  setStatus("Heard: "+phrase+" · asking Polaris");
  reply.style.display="block";reply.textContent="Working…";
  voiceInFlight=true;
  const readMonica=/\btimer\b/i.test(phrase)&&!/\b(?:start|resume|pause|stop|end)\b/i.test(phrase);
  const trimmed=phrase.replace(/^(?:(?:a|ah|uh|hey|okay|ok)\s+)*(?:hey\s+)?polaris\b[\s,:.-]*/i,"").trim();
  const actionMatch=trimmed.match(/^(?:(?:please|can you|could you)\s+)*(start|resume|pause|stop|end)\b/i);
  const timerAction=actionMatch&&/\btimer\b/i.test(trimmed)
   ?(/^(start|resume)$/i.test(actionMatch[1])?"start":actionMatch[1].toLowerCase()==="pause"?"pause":"stop"):null;
  if(timerAction&&/\b(?:task|item|job)\b/i.test(trimmed)){
   reply.textContent="Please choose the exact Monica task before starting its timer.";
   setStatus("Task-specific timer needs a task selection.");voiceInFlight=false;ready();return;
  }
  const taskAdd=!timerAction && !/^(?:what|why|how|where|when|is|are|do)\b/i.test(trimmed) &&
   /\b(?:upstairs|main floor|basement|downstairs|lower level|outside|backyard|frontyard)\b/i.test(trimmed) &&
   /\b(?:bathroom|washroom|kitchen|bedroom|hallway|living room|dining room|entrance|laundry|furnace room|yard)\b/i.test(trimmed) &&
   /\b(?:i want to|i would like to|i'd like to|we need to|i need to|add|install|replace|repair|paint|fix|consider|put in|we should|plan to)\b/i.test(trimmed);
  const request=taskAdd
   ?fetch("/api/monica/sign",{method:"POST",credentials:"same-origin",
     headers:{"content-type":"application/json"},
     body:JSON.stringify({action:"task-add",notes:trimmed.slice(0,4000)})})
    .then(async r=>{
     const signed=await r.json();
     if(!r.ok||!signed.ok||!signed.token)throw Error(signed.error||"Could not authorize Monaco task");
     return fetch("https://monicas-house.rwyers.workers.dev/api/polaris/task",{
      method:"POST",mode:"cors",credentials:"omit",
      headers:{"authorization":"Bearer "+signed.token,"content-type":"application/json"},
      body:JSON.stringify(signed.command)});
    })
   :timerAction
   ?fetch("/api/monica/sign",{method:"POST",credentials:"same-origin",
     headers:{"content-type":"application/json"},body:JSON.stringify({action:timerAction})})
     .then(async r=>{
      const d=await r.json();
      if(!r.ok||!d.ok||!d.token)throw Error(d.error||"Polaris could not authorize the timer command");
      return fetch("https://monicas-house.rwyers.workers.dev/api/polaris/timer",{
       method:"POST",mode:"cors",credentials:"omit",
       headers:{"content-type":"application/json","authorization":"Bearer "+d.token},
       body:JSON.stringify(d.command)
      });
     })
   :readMonica
    ?fetch("https://monicas-house.rwyers.workers.dev/api/polaris/timer-status",{method:"GET",mode:"cors",credentials:"omit",cache:"no-store"})
    :fetch("/api/ask",{
      method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
      body:JSON.stringify({message:phrase,project:"Monica's House",source:"microphone"})
     });
  request.then(async r=>{
   let d;try{d=await r.json()}catch{throw Error("Could not read the timer response")}
   if(!r.ok)throw Error(d.error||"Could not read Monica's timer");
   if(taskAdd){
    if(!d.ok)throw Error(d.error||"Monica did not add the task");
    return (d.unchanged?"Already saved":"Added")+" under Monica's House, "+d.areaLabel+", "+d.roomLabel+
      ": "+String(d.title||"Potential renovation task")+
      ". The full spoken instructions"+(d.measurements?.length?" and "+d.measurements.length+" measurements":"")+" are in the task notes.";
   }
   if(timerAction){
    if(!d.ok)throw Error(d.error||"Monica timer action failed");
    if(d.unchanged)return "Monica's timer was already in that state. Nothing changed.";
    if(timerAction==="start")return "Monica's house timer is now running.";
    if(timerAction==="pause")return "Monica's timer has been paused.";
    return "Monica's timer has stopped, and the work session was added to the journal.";
   }
   if(readMonica){
    if(!d.ok)throw Error(d.error||"Timer data is unavailable");
    const minutes=Math.round(Number(d.activeSeconds||0)/60);
    if(d.running)return "Monica's "+d.running.label+" timer is running. Time tracked: "+minutes+" minutes.";
    if(d.paused)return "Monica's timer is paused. Time tracked: "+minutes+" minutes.";
    return "Monica's timer is stopped. Time tracked: "+minutes+" minutes.";
   }
   return String(d.reply||"No response received.");
  }).then(answer=>{
   reply.textContent=answer;setStatus("Polaris responded · tap to ask another question");
   sayAnswer(answer);
  }).catch(err=>{reply.textContent="Error: "+err.message;setStatus("You can try again.");}).finally(()=>{voiceInFlight=false;ready();});
 }
 button.addEventListener("click",function(){
  if(journalMode==="recording"){journalPause();return}
  if(journalMode==="paused"||journalMode==="intro"){
   audioReadyFromTap();stopSpeaking();journalStartMic();return;
  }
  if(rec){try{rec.stop()}catch(e){};return}
  if(voiceInFlight)return;
  const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!Speech){setStatus("Voice recognition needs Chrome on Android. Open this page directly in Chrome.");return}
  stopSpeaking();
  audioReadyFromTap();
  rec=new Speech();rec.lang="en-CA";rec.continuous=false;rec.interimResults=true;rec.maxAlternatives=1;
  sent=false;last="";reply.style.display="none";
  rec.onstart=()=>{button.textContent="🔴 LISTENING · TAP TO FINISH";setStatus("Microphone active. Speak now.")};
  rec.onresult=event=>{
   for(let i=event.resultIndex;i<event.results.length;i++){
    const s=String(event.results[i][0]?.transcript||"").trim();
    if(!s)continue;last=s;
    setStatus((event.results[i].isFinal?"Heard: ":"Hearing: ")+s);
    if(event.results[i].isFinal)finishSpeech(s);
   }
  };
  rec.onerror=event=>{
   const e=String(event.error||"unknown");
   if(e==="not-allowed"||e==="service-not-allowed")setStatus("Microphone permission blocked: allow Polaris in Chrome's site settings.");
   else if(e==="audio-capture")setStatus("Microphone not found. Try disconnecting the headset and using the phone microphone.");
   else if(e==="network")setStatus("Speech network service failed. Check Chrome and your data connection.");
   else if(e==="no-speech")setStatus("I didn't hear anything. Try again.");
   else if(e!=="aborted")setStatus("Microphone error: "+e);
  };
  rec.onend=()=>{rec=null;if(!sent&&last)finishSpeech(last);if(!voiceInFlight)ready()};
  try{rec.start()}catch(e){rec=null;ready();setStatus("Microphone unavailable: "+e.message)}
 });
})();