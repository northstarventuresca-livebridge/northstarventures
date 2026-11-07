// Polaris v1.8 conversational command routing, complete-utterance capture and private review journal.
// Runs inside the existing authenticated mobile app IIFE, after the v1.7 voice/audio foundation.
(function(){
"use strict";
var pendingWords="",pendingTimer=null,pendingLast=0,inflightQueue=[],lastSubmitted="",lastSubmittedAt=0;
var logEntries=[],logModal=null,logOpen=false,restoredVoice=false;
function uuid(){return typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():"p"+Date.now()+"-"+Math.random().toString(36).slice(2,20)}
function normalized(s){return String(s||"").toLowerCase().replace(/[^\w ]+/g," ").replace(/\s+/g," ").trim()}
function localLog(question,reply,source){
 fetch("/api/log",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({request_id:uuid(),message:question,reply,source:source||"typed"})}).catch(function(){});
}
function speakAction(question,reply,source,announce){
 record((source==="microphone"?"Voice":"Typed")+" action: "+question);
 localLog(question,reply,source);
 if(announce!==false)talk(reply);else showReply(reply);
}
function statusLine(msg){el("voiceHint").textContent=msg}
function runPolarisCommand(raw,fromVoice){
 var original=String(raw||"").trim();if(!original)return;
 var source=fromVoice?"microphone":"typed",text=original.replace(/[!?.,]+/g," ").replace(/\s+/g," ").trim();
 var hasWake=/^(?:hey\s+)?polaris\b/i.test(text);
 if(fromVoice&&hasWake)armedUntil=Date.now()+90000;
 if(fromVoice&&!hasWake&&Date.now()>armedUntil){
  showHeard(original);showReply("Say Hey Polaris to begin.");return;
 }
 if(hasWake)text=text.replace(/^(?:hey\s+)?polaris\b/i,"").trim();
 if(!text){
  if(!active)activate();
  else{armedUntil=Date.now()+90000;showReply("I'm listening.");statusLine("Polaris is listening. Continue speaking.");}
  return;
 }
 var key=normalized(text),now=Date.now();
 if(fromVoice){
  if(key===lastSubmitted&&now-lastSubmittedAt<14000)return;
  if(typeof polaris17DuplicateVoice==="function"&&polaris17DuplicateVoice(text))return;
 }
 lastSubmitted=key;lastSubmittedAt=now;
 lastInputWasVoice=!!fromVoice;
 showHeard(original);
 if(/^(activate|wake up|go online|turn on|start)$/i.test(key)){
  activate();localLog(original,"Polaris activated.",source);return;
 }
 if(/^(?:please )?(?:show|display|list|open)(?: me)?(?: all)?(?: my| the)? projects?$/i.test(key)||/^show project network$/i.test(key)){
  el("projects").scrollIntoView({behavior:"smooth"});
  speakAction(original,"Here are your tracked projects.",source);return;
 }
 if(/^(?:show|open|go to|return to)(?: the)?(?: main)?(?: home|dashboard|command center)(?: screen| page)?$/i.test(key)){
  window.scrollTo({top:0,behavior:"smooth"});
  speakAction(original,"Opening the command centre.",source);return;
 }
 if(/^(?:refresh|reload)(?: the)?(?: page| dashboard| polaris)?$/i.test(key)){
  localLog(original,"Dashboard refreshed.",source);
  location.reload();return;
 }
 if(/^(?:system status|status report|what is your status|how are your systems)$/i.test(key)){
  speakAction(original,"My interface and AI are online. Project data isn't connected to live services yet.",source);return;
 }
 var faster=/^(?:please )?(?:speak|talk|go|talk to me|speak to me)? ?(?:a little |much |slightly )?(?:faster|quicker|speed up)(?: please)?$/i;
 var slower=/^(?:please )?(?:speak|talk|go|talk to me|speak to me)? ?(?:a little |much |slightly )?(?:slower|slow down)(?: please)?$/i;
 var normal=/^(?:please )?(?:speak |talk )?(?:normal speed|regular speed|default speed|reset speed)(?: please)?$/i;
 if(faster.test(key)||slower.test(key)||normal.test(key)){
  var rate=normal.test(key)?1:speechRate+(faster.test(key)?.15:-.15);
  setSpeechRate(rate,false);
  speakAction(original,"Speech speed set to "+speechRate.toFixed(2)+" times normal. My pitch stays the same.",source);return;
 }
 var match=key.match(/^(?:open|go to|launch|take me to) (?:the )?(.*)$/i);
 if(match){
  var target=match[1].replace(/ (?:website|project|dashboard|site|app)$/,"");
  var candidate=projects.find(function(p){
   var name=normalized(p.name),aliases=[name];
   if(p.id==="nsv")aliases.push("north star ventures","northstar ventures","nsv");
   if(p.id==="hoh")aliases.push("hoh","hoh hub","home of hope");
   if(p.id==="x32")aliases.push("x32","x32 ai engineer","audio engineer");
   return aliases.includes(target);
  });
  if(candidate){
   if(candidate.url){
    localLog(original,"Opening "+candidate.name+".",source);
    talk("Opening "+candidate.name+".");setTimeout(function(){openProject(candidate)},650);
   }else{speakAction(original,candidate.name+" has no website link configured yet.",source)}
   return;
  }
 }
 // General requests—including reciting, teaching, planning and brainstorming—go straight to AI.
 record((fromVoice?"Voice":"Typed")+" question: "+original);
 askAI(text,source);
}
command=runPolarisCommand;

async function sendAI(message,source){
 if(requestBusy){inflightQueue.push({message,source});return}
 requestBusy=true;
 showReply("Thinking about what you said...");
 el("aiStat").textContent="THINKING";el("aiDetail").textContent="Conversational reasoning";
 try{
  var id=uuid();
  var body={request_id:id,message,source,projects:projects.slice(0,12).map(function(p){return{name:p.name,status:p.status,progress:p.progress}})};
  var resp=await fetch("/api/ask",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  var data=await resp.json();
  if(!resp.ok||typeof data.reply!=="string")throw new Error(data.error||"AI service returned "+resp.status);
  conversation.push({role:"user",content:message},{role:"assistant",content:data.reply});
  conversation=conversation.slice(-36);
  showReply(data.reply);
  el("aiStat").textContent="ONLINE";el("aiDetail").textContent=data.engine||"Conversation ready";
  record("Polaris replied: "+data.reply.slice(0,135));
  if(!data.logged)record("Warning: this reply was not saved to the private Cloudflare journal");
  talk(data.reply);
 }catch(e){
  var messageForLog="Unable to reply: "+String(e.message||e);
  showReply(messageForLog);notify(messageForLog);record(messageForLog);el("aiStat").textContent="ERROR";el("aiDetail").textContent="Service unavailable";
  localLog(message,messageForLog,source);
 }finally{
  requestBusy=false;
  if(inflightQueue.length){var next=inflightQueue.shift();sendAI(next.message,next.source)}
 }
}
askAI=function(message,source){sendAI(message,source|| (lastInputWasVoice?"microphone":"typed"))};

// Buffer final recognizer phrases and wait for an utterance pause before sending one question.
// Android may provide "say the", "say the alphabet", "say the alphabet to me" as separate final events.
function aggregateFinal(phrase){
 var next=String(phrase||"").trim();if(!next)return;
 if(!pendingWords)pendingWords=next;
 else{
  var a=normalized(pendingWords),b=normalized(next);
  if(a===b||a.startsWith(b)){}
  else if(b.startsWith(a)){pendingWords=next}
  else{pendingWords=pendingWords+" "+next}
 }
 pendingLast=Date.now();
 if(pendingTimer)clearTimeout(pendingTimer);
 pendingTimer=setTimeout(flushSpeech,1250);
 showHeard(pendingWords);
 statusLine("Listening... "+pendingWords);
}
function flushSpeech(){
 if(pendingTimer){clearTimeout(pendingTimer);pendingTimer=null}
 var message=pendingWords.trim();pendingWords="";
 if(!message||!listenWanted||echoGuard||speaking)return;
 runPolarisCommand(message,true);
}
function installUtteranceBuffer(){
 if(!recognition||recognition.__polaris18)return;
 recognition.__polaris18=true;
 recognition.onresult=function(evt){
  if(echoGuard||speaking||!listenWanted)return;
  showVoiceDiagnostic("Speech recognised");
  for(var i=evt.resultIndex;i<evt.results.length;i++){
   var result=evt.results[i],phrase=result[0]?.transcript||"";
   if(!phrase)continue;
   if(result.isFinal)aggregateFinal(phrase);
   else{showHeard(pendingWords?pendingWords+" "+phrase:phrase);statusLine("Hearing: "+phrase)}
  }
 };
}
var previousSetListen=setListen;
setListen=function(on){previousSetListen(on);installUtteranceBuffer();if(!on){pendingWords="";if(pendingTimer)clearTimeout(pendingTimer)}};
installUtteranceBuffer();

// Review journal UI: owner-authenticated and directly backed by Cloudflare D1.
var style=document.createElement("style");
style.textContent=".p18-mask{position:fixed;z-index:300;inset:0;background:#030b17ea;backdrop-filter:blur(10px);display:none;align-items:center;justify-content:center;padding:12px}.p18-mask.visible{display:flex}.p18-panel{width:min(98vw,840px);max-height:90vh;display:flex;flex-direction:column;background:linear-gradient(140deg,#10263e,#081425);border:1px solid #4a9dc785;border-radius:15px;box-shadow:0 30px 90px #000a;padding:17px}.p18-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.p18-head strong{font-size:14px;letter-spacing:.07em}.p18-actions{display:flex;gap:5px;flex-wrap:wrap;margin:10px 0 14px}.p18-actions button,.p18-entry button{border:1px solid #357ba4;background:#123d5c;color:#e0faff;border-radius:7px;padding:8px 10px;font-size:11px;cursor:pointer}.p18-entry button.chosen{background:#0e5d54;border-color:#4de9c1}.p18-body{overflow-y:auto;min-height:100px;flex:1}.p18-entry{border:1px solid #31587666;border-radius:11px;padding:12px;margin-bottom:9px;background:#091b2ed9}.p18-meta{color:#83a9c7;font-size:10px;margin-bottom:9px}.p18-entry p{font-size:12px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;margin:5px 0 10px}.p18-entry p strong{color:#70dfff}.p18-note{color:#8fb6cf;font-size:11px;line-height:1.5}.p18-entry .p18-rating{display:flex;gap:6px}.p18-close{color:#d2faff}.p18-privacy{color:#7ea6c3;font-size:10px;line-height:1.5;margin-bottom:9px}";
document.head.appendChild(style);
var logButton=document.createElement("button");
logButton.className="btn ghost";logButton.id="dialogueLogBtn";logButton.type="button";
logButton.textContent="▤ CONVERSATION LOG";
var controls=document.querySelector(".primary-row");if(controls)controls.insertBefore(logButton,el("logoutBtn"));
var mask=document.createElement("div");mask.className="p18-mask";mask.id="polarisLogMask";
mask.innerHTML='<section class="p18-panel" role="dialog" aria-modal="true" aria-label="Polaris dialogue journal"><div class="p18-head"><strong>▤ POLARIS · CONVERSATION JOURNAL</strong><button class="btn tiny ghost p18-close" id="p18Close">CLOSE ✕</button></div><div class="p18-privacy">Private authenticated log · spoken transcripts + Polaris replies only · no audio recordings · automatically expires after 30 days</div><div class="p18-actions"><button id="p18Refresh">REFRESH</button><button id="p18Export">EXPORT LOG</button><button id="p18Clear">DELETE LOG</button></div><div class="p18-body" id="p18Entries">Loading journal...</div></section>';
document.body.appendChild(mask);
function showJournal(){mask.classList.add("visible");logOpen=true;loadJournal()}
function closeJournal(){mask.classList.remove("visible");logOpen=false}
logButton.addEventListener("click",showJournal);
el("p18Close").addEventListener("click",closeJournal);
mask.addEventListener("click",function(evt){if(evt.target===mask)closeJournal()});
document.addEventListener("keydown",function(evt){if(evt.key==="Escape"&&logOpen)closeJournal()});
el("p18Refresh").addEventListener("click",loadJournal);
async function loadJournal(){
 var body=el("p18Entries");body.textContent="Loading private conversation log...";
 try{
  var r=await fetch("/api/history?limit=150",{cache:"no-store"}),data=await r.json();
  if(!r.ok)throw new Error(data.error||r.status);
  logEntries=data.turns||[];body.replaceChildren();
  if(!logEntries.length){body.textContent="No conversations saved yet. Start talking to Polaris.";return}
  logEntries.forEach(function(entry){
   var card=document.createElement("article");card.className="p18-entry";
   var meta=document.createElement("div");meta.className="p18-meta";
   meta.textContent=(entry.created_at||"").replace("T"," ").replace("Z"," UTC")+" · "+(entry.source||"")+" · "+(entry.model||entry.kind||"command");
   var you=document.createElement("p"),polaris=document.createElement("p");
   var yLabel=document.createElement("strong");yLabel.textContent="YOU: ";you.append(yLabel,document.createTextNode(entry.user_text||""));
   var pLabel=document.createElement("strong");pLabel.textContent="POLARIS: ";polaris.append(pLabel,document.createTextNode(entry.assistant_text||""));
   card.append(meta,you,polaris);
   if(entry.kind==="ai"){
    var rating=document.createElement("div");rating.className="p18-rating";
    ["wrong","helpful"].forEach(function(feedback){
     var b=document.createElement("button");b.type="button";b.textContent=feedback==="wrong"?"✕ WRONG REPLY":"✓ HELPFUL";
     if(entry.feedback===feedback)b.classList.add("chosen");
     b.addEventListener("click",async function(){
      var detail="";
      if(feedback==="wrong"){detail=window.prompt("Optional: what should Polaris have understood?",entry.feedback_notes||"");if(detail===null)return}
      try{
       var resp=await fetch("/api/feedback",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id:entry.id,feedback,notes:detail})});
       if(!resp.ok)throw new Error("Feedback couldn't be saved");
       entry.feedback=feedback;entry.feedback_notes=detail;
       rating.querySelectorAll("button").forEach(function(child){child.classList.toggle("chosen",child===b)});
       notify("Feedback saved in the private journal.");
      }catch(e){notify(e.message)}
     });
     rating.appendChild(b);
    });card.appendChild(rating);
   }body.appendChild(card);
  });
 }catch(e){body.textContent="Journal unavailable: "+e.message}
}
el("p18Export").addEventListener("click",function(){
 var blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),turns:logEntries},null,2)],{type:"application/json"});
 var url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="polaris-conversation-log.json";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url)},3000);
});
el("p18Clear").addEventListener("click",async function(){
 if(!window.confirm("Permanently delete all Polaris conversation logs and conversation memory? This cannot be undone."))return;
 try{
  var r=await fetch("/api/clear-history",{method:"POST"});
  if(!r.ok)throw Error("Clear request failed");
  logEntries=[];conversation=[];await loadJournal();notify("Polaris conversation journal deleted.");
 }catch(e){notify(e.message)}
});
})();
