// Polaris v2.3 — automatic, low-latency British voice for streamed GPT replies.
// Prefetch TTS as sentences arrive; preserve the existing pitch-safe speed slider.
// User Send gesture unlocks Android audio; STOP REPLY interrupts immediately.
(function(){
"use strict";
var AUTO_VOICE_KEY="polaris.voice.autoReplies.v23";
var autoEnabled=true;
try{autoEnabled=localStorage.getItem(AUTO_VOICE_KEY)!=="off"}catch(e){}
var readButton=document.getElementById("polarisReadReply"),form=el("commandForm");
var options=document.querySelector(".voice-settings");
var toggleWrap=document.createElement("label");
toggleWrap.id="polarisAutoVoiceControl";
toggleWrap.style.cssText="display:inline-flex;align-items:center;gap:7px;white-space:nowrap;color:#a9f2e8;font-size:11px;font-weight:700;letter-spacing:.02em;cursor:pointer";
var toggle=document.createElement("input");toggle.type="checkbox";toggle.checked=autoEnabled;toggle.id="polarisAutoVoiceToggle";
toggle.style.cssText="width:16px;height:16px;accent-color:#49d8b7";
var toggleText=document.createElement("span");toggleText.textContent="AUTO SPEAK "+(autoEnabled?"ON":"OFF");
toggleWrap.append(toggle,toggleText);
if(options){options.style.flexWrap="wrap";options.style.rowGap="8px";options.append(toggleWrap)}
var gen=0,active=null;
function announce(message){
 var hint=el("voiceHint");if(hint)hint.textContent=message;
}
function setReadButton(busy){if(readButton)readButton.textContent=busy?"■ STOP REPLY":"▶ READ REPLY"}
function wakePending(c){var fn=c.wake;c.wake=null;if(fn)fn()}
function cancelCurrent(){
 var c=active;gen++;active=null;
 if(c){
  c.alive=false;c.ended=true;
  for(var i=0;i<c.chunks.length;i++)if(c.chunks[i].controller)try{c.chunks[i].controller.abort()}catch(e){}
  wakePending(c);
 }
 if(activeAudio)try{
  if(typeof activeAudio.polarisStop==="function")activeAudio.polarisStop();
  else if(typeof activeAudio.stop==="function")activeAudio.stop();
  else if(typeof activeAudio.pause==="function")activeAudio.pause();
 }catch(e){}
 speaking=false;setReadButton(false);
}
toggle.addEventListener("change",function(){
 autoEnabled=toggle.checked;toggleText.textContent="AUTO SPEAK "+(autoEnabled?"ON":"OFF");
 try{localStorage.setItem(AUTO_VOICE_KEY,autoEnabled?"on":"off")}catch(e){}
 if(!autoEnabled)cancelCurrent();
 announce(autoEnabled?"Auto Speak enabled. Polaris will read new replies automatically.":"Auto Speak disabled. Use READ REPLY whenever you want.");
});
// Capture the actual Send gesture before the asynchronous OpenAI request.
// Browsers require that an AudioContext be unlocked by direct user interaction.
form.addEventListener("submit",function(){
 if(active)cancelCurrent();
 if(autoEnabled)primeAudio(false).catch(function(){
  announce("Tap READ REPLY if your phone blocks automatic audio.");
 });
},{capture:true});
if(readButton)readButton.addEventListener("click",function(e){
 if(active&&active.alive){
  e.preventDefault();e.stopImmediatePropagation();
  cancelCurrent();announce("Speech stopped. You can continue reading the reply.");
 }
},{capture:true});
function cleanSpeechText(s){
 return String(s||"").replace(/\x60{3}[\s\S]*?\x60{3}/g," Code sample available on screen. ")
  .replace(/\*\*/g,"").replace(/\x60/g,"").replace(/(^|\s)[#*_-]{1,3}\s+/g,"$1").replace(/[\u2022]/g,", ")
  .replace(/\[([^\]]+)\]\([^)]+\)/g,"$1")
  .replace(/\s+/g," ").trim();
}
function nextSentenceSize(str,first,complete){
 var limit=first?155:250,min=first?28:75,match,regex=/[.!?;:](?=\s|$)/g;
 while((match=regex.exec(str))){
  var at=match.index+1;
  if(at>=min&&at<=limit)return at;
  if(at>limit)break;
 }
 if(str.length>=limit){
  var pos=str.lastIndexOf(" ",limit);
  return pos>=min?pos:limit;
 }
 return complete?str.length:0;
}
function queueSpeech(c,part){
 var text=cleanSpeechText(part);
 if(!text)return;
 c.chunks.push({text,controller:null,promise:null,error:null});
 prefetch(c);wakePending(c);pump(c);
}
function flushSentences(c,complete){
 var iterations=0;
 while(c.alive&&c.buffer.trim()&&iterations++<80){
  var offset=nextSentenceSize(c.buffer,c.chunks.length===0,complete);
  if(offset<=0)break;
  var part=c.buffer.slice(0,offset);
  c.buffer=c.buffer.slice(offset).replace(/^\s+/,"");
  queueSpeech(c,part);
 }
}
function prefetch(c){
 if(!c.alive)return;
 while(c.fetching<2){
  let item=c.chunks.find(function(x){return !x.promise});
  if(!item)break;
  c.fetching++;
  var ctrl=new AbortController();item.controller=ctrl;
  item.promise=fetch("/api/tts",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({text:item.text}),signal:ctrl.signal
  }).then(async function(r){
   if(!r.ok)throw Error("Voice synthesis returned "+r.status);
   var buf=await r.arrayBuffer();
   if(buf.byteLength<1000)throw Error("Voice audio was empty");
   return buf;
  }).catch(function(e){item.error=e;return null}).finally(function(){
   c.fetching=Math.max(0,c.fetching-1);if(c.alive){prefetch(c);wakePending(c)}
  });
 }
}
async function pump(c){
 if(c.playing||!c.alive)return;
 c.playing=true;
 try{
  while(c.alive&&active===c){
   if(c.index>=c.chunks.length){
    if(c.ended)break;
    await new Promise(function(resolve){c.wake=resolve});continue;
   }
   prefetch(c);
   var item=c.chunks[c.index];
   if(!item.promise){await new Promise(function(resolve){c.wake=resolve});continue}
   var audio=await item.promise;
   if(!c.alive||active!==c)return;
   if(!audio)throw item.error||Error("Voice service unavailable.");
   if(audioContext&&audioContext.state!=="running")await audioContext.resume();
   if(!audioContext||audioContext.state!=="running")throw Error("Audio requires a tap to unlock.");
   announce("Polaris speaking · "+speechRate.toFixed(2)+"× · part "+(c.index+1));
   speaking=true;
   if(c.index===0)record("Auto Speak first audio prepared after "+(Date.now()-c.started)+" ms");
   await playPcmAudio(audio);
   speaking=false;
   c.index++;prefetch(c);
  }
  if(c.alive&&active===c){
   announce("Read aloud complete. Tap DICTATE for your next question.");
   setAudioStatus("SPEAKER READY · "+speechRate.toFixed(2)+"×","ready");
  }
 }catch(e){
  if(c.alive){announce("Auto Speak unavailable · tap READ REPLY to retry.");record("Auto Speak: "+String(e.message||e).slice(0,120))}
 }finally{
  c.playing=false;
  if(active===c){speaking=false;active=null;setReadButton(false)}
 }
}
function start(){
 cancelCurrent();
 if(!autoEnabled)return;
 var c={id:++gen,alive:true,buffer:"",received:"",chunks:[],index:0,ended:false,
  fetching:0,playing:false,wake:null,started:Date.now()};
 active=c;setReadButton(true);
 announce("Polaris is preparing to speak as the answer arrives...");
 return c.id;
}
function delta(text){
 var c=active;
 if(!c||!c.alive||typeof text!=="string"||!text)return;
 c.received+=text;c.buffer+=text;flushSentences(c,false);
}
function done(full){
 var c=active;if(!c||!c.alive)return;
 var final=String(full||"");
 if(final&&final.startsWith(c.received)){
  var missing=final.slice(c.received.length);
  if(missing){c.received+=missing;c.buffer+=missing}
 }else if(!c.received&&final){c.received=final;c.buffer=final}
 flushSentences(c,true);c.ended=true;wakePending(c);pump(c);
}
function fail(){cancelCurrent()}
window.polarisAutoSpeech={start,delta,done,fail,stop:cancelCurrent,enabled:function(){return autoEnabled}};
})();
