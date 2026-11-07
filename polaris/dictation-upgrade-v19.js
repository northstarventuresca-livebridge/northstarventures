// Polaris v1.9: ChatGPT-style dictate → review → send; text-first, optional read aloud.
(function(){
"use strict";
var Dictate=window.SpeechRecognition||window.webkitSpeechRecognition;
var dictation=null,dictating=false,draftBefore="",lastReply="",useNativeMic=false;
var originalSpeech=talk;
// Default to quiet text answers; a button can still read the complete reply aloud.
talk=function(message){showReply(String(message||""));return Promise.resolve()};
try{
 if(recognition)recognition.abort();
 listenWanted=false;micEnabled=false;displayVoice();
}catch(e){}
active=true;
el("orb").classList.add("activated");
el("coreState").textContent="CHAT READY";
var header=document.querySelector(".hero h1");
if(header)header.textContent="Your Polaris command centre";
var subtitle=document.querySelector(".hero p");
if(subtitle)subtitle.textContent="Speak into your phone, review your words, then press Send. Polaris will reply in text.";
var hint=el("voiceHint");
hint.textContent="Tap DICTATE or use your phone keyboard microphone, then press SEND. Nothing sends automatically.";
var audioState=el("audioState");
if(audioState)audioState.style.display="none";
var row=document.querySelector(".primary-row");
var oldMic=el("micBtn");
var micButton=oldMic.cloneNode(true);
micButton.id="micBtn";
micButton.textContent="🎙 DICTATE";
oldMic.replaceWith(micButton);
var oldActivate=el("activateBtn");if(oldActivate)oldActivate.style.display="none";
var oldSpeaker=el("speakerBtn");if(oldSpeaker)oldSpeaker.style.display="none";
var oldTest=el("voiceTestBtn");if(oldTest)oldTest.style.display="none";
var speed= document.querySelector(".voice-settings");if(speed)speed.style.display="none";
var readButton=document.createElement("button");
readButton.type="button";readButton.className="btn ghost";readButton.id="polarisReadReply";
readButton.textContent="▶ READ REPLY";
row.insertBefore(readButton,el("logoutBtn"));
var commandForm=el("commandForm"),oldInput=el("commandText");
var input=document.createElement("textarea");
input.id="commandText";input.name="message";input.rows=3;
input.setAttribute("aria-label","Message to Polaris");
input.setAttribute("autocomplete","off");
input.setAttribute("spellcheck","true");
input.placeholder="Ask Polaris anything... Tap DICTATE or use your phone's keyboard microphone.";
input.value=oldInput.value||"";
oldInput.replaceWith(input);
var css=document.createElement("style");
css.textContent=".command{align-items:flex-end}.command textarea{background:transparent;color:#e9f7ff;width:100%;flex:1;min-height:78px;max-height:180px;border:0;outline:0;font-size:14px;padding:10px;min-width:0;resize:vertical;font-family:inherit;line-height:1.5}.command textarea::placeholder{color:#6085a5}.command button{min-height:46px}.voice-hint{font-size:12px}.reply-panel{margin-top:15px}.primary-row{margin-top:13px}.dictatingNow{border-color:#43fdc1!important;color:#73ffde!important;box-shadow:0 0 20px #1ceaab38!important}";
document.head.append(css);
function dictationStatus(message){hint.textContent=message;el("voiceDetail").textContent=message}
function endDictation(){
 dictating=false;micButton.classList.remove("dictatingNow");micButton.textContent="🎙 DICTATE";
 if(input.value.trim())dictationStatus("Your words are ready. Edit them if needed, then tap SEND.");
 else dictationStatus("Tap DICTATE or the keyboard microphone, then tap SEND.");
}
function startDictation(){
 if(!Dictate){input.focus();dictationStatus("Use your phone keyboard's microphone to dictate into this box.");return}
 if(dictating){try{dictation.stop()}catch(e){}return}
 if(!dictation){
  dictation=new Dictate();
  dictation.lang="en-CA";dictation.continuous=true;dictation.interimResults=true;dictation.maxAlternatives=1;
  dictation.onstart=function(){dictating=true;micButton.classList.add("dictatingNow");micButton.textContent="■ STOP DICTATING";dictationStatus("Listening to you. Tap STOP when finished, then SEND.")};
  dictation.onresult=function(evt){
   var finals=[],interim=[];
   for(var i=0;i<evt.results.length;i++){
    var text=evt.results[i][0].transcript||"";
    if(evt.results[i].isFinal)finals.push(text);else interim.push(text);
   }
   var transcript=finals.concat(interim).join(" ").trim();
   var joined=[draftBefore,transcript].filter(Boolean).join(" ").trim();
   input.value=joined;
   showHeard(joined||"Listening...");
   input.scrollTop=input.scrollHeight;
  };
  dictation.onerror=function(evt){
   if(evt.error!=="no-speech"&&evt.error!=="aborted")dictationStatus("Dictation issue: "+evt.error+". You can use the keyboard microphone instead.");
  };
  dictation.onend=function(){
   if(dictating){endDictation()}
  };
 }
 draftBefore=input.value.trim();
 try{dictation.start()}catch(e){endDictation();dictationStatus("Microphone unavailable here. Use the keyboard microphone to dictate.")}
}
micButton.addEventListener("click",startDictation);
readButton.addEventListener("click",function(){
 var reply=el("replyText").textContent||"";
 if(!reply.trim()||reply==="Awaiting your command."){notify("No reply to read yet.");return}
 primeAudio(false).then(function(){originalSpeech(reply)}).catch(function(){notify("Tap SPEAKER READY or check phone volume to enable read aloud.")});
});
input.addEventListener("keydown",function(e){
 if(e.key==="Enter"&&!e.shiftKey){
  e.preventDefault();
  commandForm.requestSubmit();
 }
});
commandForm.addEventListener("submit",function(){
 if(dictating&&dictation)try{dictation.stop()}catch(e){}
 draftBefore="";
});
// One conversation area that retains recent user and assistant text, not just the last answer.
// The server journal is still the long-term source of truth.
var chat=document.createElement("section");
chat.id="polarisThread";chat.style.cssText="max-width:760px;margin:16px auto 0;text-align:left;background:#081a2bd9;border:1px solid #37789d70;border-radius:12px;padding:14px;max-height:380px;overflow-y:auto";
chat.innerHTML='<div style="display:flex;align-items:center;justify-content:space-between"><b style="font-size:12px;letter-spacing:.09em;color:#79dfff">CONVERSATION</b><span style="font-size:10px;color:#8eabc5">Saved to your private Polaris journal</span></div><div id="polarisThreadItems" style="margin-top:10px;color:#acc7dc;font-size:12px">Your recent conversation will appear here.</div>';
commandForm.parentNode.insertBefore(chat,commandForm.nextSibling);
var items=document.getElementById("polarisThreadItems");
function threadRow(role,text){
 var container=document.createElement("div");
 container.style.cssText="border-top:1px solid #25476470;padding:10px 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5";
 var tag=document.createElement("strong");tag.textContent=role==="user"?"YOU · ":"POLARIS · ";tag.style.color=role==="user"?"#73d1fa":"#83f9d9";
 container.appendChild(tag);container.appendChild(document.createTextNode(text));
 return container;
}
async function refreshThread(){
 try{
  var r=await fetch("/api/history?limit=14",{cache:"no-store"});if(!r.ok)return;
  var data=await r.json(),records=(data.turns||[]).filter(function(x){return x.kind==="ai"}).reverse();
  items.replaceChildren();
  if(!records.length){items.textContent="Your recent conversation will appear here.";return}
  records.forEach(function(x){items.append(threadRow("user",x.user_text),threadRow("assistant",x.assistant_text))});
  chat.scrollTop=chat.scrollHeight;
 }catch(e){}
}
refreshThread();
var lastVisible="";
var observer=new MutationObserver(function(){
 var text=el("replyText").textContent||"";
 if(text===lastVisible)return;
 lastVisible=text;
 if(!text.trim()||/^Thinking|^Awaiting|^Unable to/.test(text))return;
 setTimeout(refreshThread,550);
});
observer.observe(el("replyText"),{childList:true,characterData:true,subtree:true});
// Do not automatically start microphone on reload.
el("voiceStat").textContent="DICTATION";
el("voiceDetail").textContent="Tap to dictate, then Send";
var mod=el("moduleVoice");if(mod)mod.textContent="Dictate → review → Send";
var eyebrow=document.querySelector(".eyebrow");if(eyebrow)eyebrow.textContent="PERSONAL INTELLIGENCE NETWORK / V1.9";
var footer=document.querySelector(".footer");if(footer)footer.innerHTML='<span>✦ POLARIS</span> · NORTH STAR VENTURES · DICTATION MODE v1.9';
})();
