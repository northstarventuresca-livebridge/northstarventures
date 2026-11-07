// Polaris v1.9: ChatGPT-style dictate → review → send; text-first, optional read aloud.
(function(){
"use strict";
var Dictate=window.SpeechRecognition||window.webkitSpeechRecognition;
var dictation=null,dictating=false,acceptDictation=false,draftBefore="",lastReply="",useNativeMic=false;
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
var speed=document.querySelector(".voice-settings");
if(speed){
 speed.style.display="flex";
 var speedLabel=speed.querySelector('label[for="speedSlider"]');
 if(speedLabel)speedLabel.textContent="READ-ALOUD SPEED";
 var interruptions=speed.querySelector(".echo-label");
 if(interruptions)interruptions.style.display="none";
 var speedHint=document.createElement("small");
 speedHint.textContent="Faster speech · natural voice pitch";
 speedHint.style.cssText="color:#7dcddc;font-size:10px;line-height:1.4";
 speed.appendChild(speedHint);
}
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
 acceptDictation=false;dictating=false;micButton.classList.remove("dictatingNow");micButton.textContent="🎙 DICTATE";
 if(input.value.trim())dictationStatus("Your words are ready. Edit them if needed, then tap SEND.");
 else dictationStatus("Tap DICTATE or the keyboard microphone, then tap SEND.");
}

function cleanSpeechText(s){return String(s||"").replace(/\s+/g," ").trim()}
function speechWordKey(s){return String(s||"").toLowerCase().replace(/[.,?!:;'"“”‘’]/g,"")}
function stitchSpeechFragments(fragments){
 var full=[];
 fragments.forEach(function(fragment){
  var phrase=cleanSpeechText(fragment);
  if(!phrase)return;
  var incoming=phrase.split(" "),keys=incoming.map(speechWordKey),
      existing=full.map(speechWordKey),na=existing.length,nb=keys.length;
  if(!na){full=incoming;return}
  var equalAt=function(a,b,count){for(var k=0;k<count;k++)if(existing[a+k]!==keys[b+k])return false;return true};
  // Chrome/Android may emit the growing sentence as several successive final results.
  // Replace a prefix hypothesis with its fuller successor, not append it.
  if(nb>=na&&equalAt(0,0,na)){full=incoming;return}
  if(na>=nb&&equalAt(0,0,nb))return;
  // Some Android recognizers resend an expanded FINAL with one corrected word.
  // Replace the earlier incomplete hypothesis; do not concatenate near-duplicates.
  var shared=0;while(shared<Math.min(na,nb)&&existing[shared]===keys[shared])shared++;
  var previousEnded=/[.!?]$/.test(full.join(" ").trim());
  if(!previousEnded&&shared>=5&&shared/Math.min(na,nb)>=.45&&nb>=na-2){full=incoming;return}
  for(var start=0;start<=na-nb;start++)if(equalAt(start,0,nb))return;
  var overlap=0;
  for(var n=Math.min(na,nb);n>=2;n--)if(equalAt(na-n,0,n)){overlap=n;break}
  full=full.concat(incoming.slice(overlap));
 });
 return full.join(" ").replace(/\s+([,.!?;:])/g,"").replace(/\btap\s+(?:been|bin|bean)\b/gi,"TapBin").trim();
}

function startDictation(){
 if(!Dictate){input.focus();dictationStatus("Use your phone keyboard's microphone to dictate into this box.");return}
 if(dictating){try{dictation.stop()}catch(e){}return}
 if(!dictation){
  dictation=new Dictate();
  dictation.lang="en-CA";dictation.continuous=true;dictation.interimResults=true;dictation.maxAlternatives=1;
  dictation.onstart=function(){acceptDictation=true;dictating=true;micButton.classList.add("dictatingNow");micButton.textContent="■ STOP DICTATING";dictationStatus("Listening to you. Tap STOP when finished, then SEND.")};
  dictation.onresult=function(evt){
   if(!acceptDictation)return;
   var finals=[],interim=[];
   for(var i=0;i<evt.results.length;i++){
    var item=evt.results[i],phrase=item&&item[0]&&item[0].transcript||"";
    if(!phrase.trim())continue;
    if(item.isFinal)finals.push(phrase);else interim.push(phrase);
   }
   var transcript=stitchSpeechFragments(finals.concat(interim));
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
 draftBefore=input.value.trim();acceptDictation=true;
 try{dictation.start()}catch(e){endDictation();dictationStatus("Microphone unavailable here. Use the keyboard microphone to dictate.")}
}
micButton.addEventListener("click",startDictation);
var fastReadId=0,fastReadBusy=false,readAudioStart=0;
function splitVoiceReply(content){
 var value=String(content||"").replace(/\*\*/g,"").replace(/\u0060/g,"").replace(/^\s*[-#*]\s+/gm,"").replace(/\s+/g," ").trim();
 var parts=[];
 while(value.length){
  var threshold=parts.length===0?185:380;
  if(value.length<=threshold){parts.push(value);break}
  var cut=-1;
  for(var k=Math.min(threshold,value.length-1);k>=Math.round(threshold*.45);k--){
   if(/[.!?;:]/.test(value[k])&&/\s/.test(value[k+1]||"")){cut=k+1;break}
  }
  if(cut<0){cut=value.lastIndexOf(" ",threshold);if(cut<threshold*.55)cut=threshold}
  parts.push(value.slice(0,cut).trim());value=value.slice(cut).trim();
 }
 return parts;
}
function stopReadAloud(){
 fastReadId++;
 if(activeAudio){try{
  if(typeof activeAudio.stop==="function")activeAudio.stop();
  else if(typeof activeAudio.polarisStop==="function")activeAudio.polarisStop();
  else if(typeof activeAudio.pause==="function")activeAudio.pause();
 }catch(e){}}
 fastReadBusy=false;readButton.textContent="▶ READ REPLY";
}
readButton.addEventListener("click",async function(){
 if(fastReadBusy){stopReadAloud();return}
 var reply=el("replyText").textContent||"";
 if(!reply.trim()||reply==="Awaiting your command."||/^Polaris is thinking/.test(reply)){
  notify("No finished reply to read.");return;
 }
 fastReadBusy=true;var run=++fastReadId,parts=splitVoiceReply(reply);
 readButton.textContent="■ STOP READING";
 var pending={};
 function load(index){
  if(index>=parts.length)return Promise.resolve(null);
  if(pending[index])return pending[index];
  pending[index]=(async function(){
   var response=await fetch("/api/tts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:parts[index]})});
   if(!response.ok)throw new Error("Voice service returned "+response.status);
   var buf=await response.arrayBuffer();
   if(buf.byteLength<1000)throw new Error("Voice audio was empty");
   return buf;
  })();
  return pending[index];
 }
 try{
  // Prepare the first short sentence and the next passage at the same time.
  var unlock=primeAudio(false);
  var first=load(0);if(parts.length>1)load(1);
  await unlock;await first;
  if(run!==fastReadId)return;
  for(var i=0;i<parts.length&&run===fastReadId;i++){
   if(i+2<parts.length)load(i+2);
   el("voiceHint").textContent="Reading reply · part "+(i+1)+" of "+parts.length+" · "+speechRate.toFixed(2)+"×";
   var buffer=await load(i);
   if(run!==fastReadId)break;
   readAudioStart=Date.now();
   speaking=true;await playPcmAudio(buffer);speaking=false;
  }
  if(run===fastReadId){
   setAudioStatus("SPEAKER READY · "+speechRate.toFixed(2)+"× NATURAL PITCH","ready");
   el("voiceHint").textContent="Read aloud complete. Tap DICTATE for your next message.";
  }
 }catch(e){
  if(run===fastReadId){notify("Read aloud: "+String(e.message||e));record("Fast speech error: "+String(e.message||e));}
 }finally{
  if(run===fastReadId){speaking=false;fastReadBusy=false;readButton.textContent="▶ READ REPLY";}
 }
});
input.addEventListener("keydown",function(e){
 if(e.key==="Enter"&&!e.shiftKey){
  e.preventDefault();
  commandForm.requestSubmit();
 }
});
commandForm.addEventListener("submit",function(){
 acceptDictation=false;
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
var refreshTimer=null;
var observer=new MutationObserver(function(){
 var text=el("replyText").textContent||"";
 if(text===lastVisible)return;
 lastVisible=text;
 if(!text.trim()||/^Thinking|^Awaiting|^Unable to|^Polaris is thinking/.test(text))return;
 if(refreshTimer)clearTimeout(refreshTimer);
 refreshTimer=setTimeout(refreshThread,1600);
});
observer.observe(el("replyText"),{childList:true,characterData:true,subtree:true});
// Do not automatically start microphone on reload.
el("voiceStat").textContent="DICTATION";
el("voiceDetail").textContent="Tap to dictate, then Send";
var mod=el("moduleVoice");if(mod)mod.textContent="Dictate → review → Send";
var eyebrow=document.querySelector(".eyebrow");if(eyebrow)eyebrow.textContent="PERSONAL INTELLIGENCE NETWORK / V1.9";
var footer=document.querySelector(".footer");if(footer)footer.innerHTML='<span>✦ POLARIS</span> · NORTH STAR VENTURES · DICTATION MODE v1.9';
})();
