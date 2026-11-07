// Polaris v2.0 OpenAI streaming text UX; injected after dictation mode.
(function(){
"use strict";
var queue=[],isRendering=false,activeStream=null;
var openaiBadge=document.createElement("span");
openaiBadge.id="openaiEngineBadge";
openaiBadge.textContent="GPT-6.1 SOL · OPENAI";
openaiBadge.style.cssText="display:inline-block;font-size:10px;font-weight:750;letter-spacing:.08em;color:#89fce4;border:1px solid #34b7a87a;border-radius:7px;padding:6px 10px;margin-top:8px;background:#073d3b66";
var voice=document.getElementById("voiceCenter");
if(voice)voice.appendChild(openaiBadge);
var submit=el("commandForm").querySelector('button[type="submit"]');
if(submit)submit.textContent="SEND ↗";
el("aiStat").textContent="OPENAI";
el("aiDetail").textContent="GPT-6.1 Sol · streaming replies";
var lastRequestText="";
function addLocalChat(role,content){
 var items=document.getElementById("polarisThreadItems");if(!items)return null;
 if(items.textContent==="Your recent conversation will appear here.")items.replaceChildren();
 var box=document.createElement("div");box.style.cssText="padding:10px 0;border-top:1px solid #234d6b7a;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5";
 var label=document.createElement("strong");label.style.color=role==="user"?"#7cbfeb":"#77fbd0";label.textContent=role==="user"?"YOU · ":"POLARIS · ";
 var contentNode=document.createElement("span");contentNode.textContent=content;
 box.append(label,contentNode);items.appendChild(box);
 box.scrollIntoView({block:"nearest"});
 return contentNode;
}
function newId(){return crypto.randomUUID?crypto.randomUUID():"polaris-"+Date.now()+"-"+Math.random().toString(36).slice(2,14)}
async function sendToOpenAI(question,source){
 if(requestBusy){queue.push({question,source});notify("Message queued until Polaris finishes answering.");return}
 requestBusy=true;
 if(window.polarisAutoSpeech)window.polarisAutoSpeech.start();
 lastRequestText=question;
 var id=newId();
 var label=el("aiDetail"),state=el("aiStat"),output=el("replyText");
 var userText=addLocalChat("user",question),answerText=addLocalChat("assistant","");
 state.textContent="THINKING";label.textContent="Connecting to OpenAI...";
 output.textContent="Polaris is thinking...";
 var reply="";
 var gotDone=false;
 try{
  var res=await fetch("/api/ask-stream",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({request_id:id,message:question,source:source||"typed",project:window.polarisProjectSelection||"",projects:projects.slice(0,12).map(function(p){return {name:p.name,status:p.status,progress:p.progress}})})
  });
  if(!res.ok){
   var bad={};try{bad=await res.json()}catch(e){}
   throw Error(bad.error||"OpenAI connection failed ("+res.status+")");
  }
  if(!res.body)throw Error("Streaming was not enabled by the browser.");
  var reader=res.body.getReader(),decoder=new TextDecoder(),buffer="";
  activeStream=reader;
  var processEvent=function(part){
   var raw=part.split(/\r?\n/).filter(function(line){return line.startsWith("data:")}).map(function(line){return line.slice(5).trim()}).join("\n");
   if(!raw)return;
   var evt;try{evt=JSON.parse(raw)}catch(e){return}
   if(evt.type==="delta"){
    reply+=evt.text||"";
    if(window.polarisAutoSpeech)window.polarisAutoSpeech.delta(evt.text||"");
    output.textContent=reply;
    if(answerText)answerText.textContent=reply;
    state.textContent="ANSWERING";label.textContent="GPT-6.1 Sol · writing live";
   }else if(evt.type==="done"){
    gotDone=true;reply=evt.reply||reply;
    if(window.polarisAutoSpeech)window.polarisAutoSpeech.done(reply);
    output.textContent=reply;
    if(answerText)answerText.textContent=reply;
    state.textContent="OPENAI";label.textContent=evt.engine||"GPT-6.1 Sol";
    if(!evt.logged)record("Conversation reply received, but private history could not be saved.");
    conversation.push({role:"user",content:question},{role:"assistant",content:reply});
    conversation=conversation.slice(-24);
    record("OpenAI replied to: "+question.slice(0,120));
   }else if(evt.type==="error"){throw Error(evt.error||"AI streaming stopped")}
  };
  while(true){
   var chunk=await reader.read();
   if(chunk.done)break;
   buffer+=decoder.decode(chunk.value,{stream:true});
   var m;
   while((m=buffer.match(/\r?\n\r?\n/))){
    var at=buffer.indexOf(m[0]),part=buffer.slice(0,at);
    buffer=buffer.slice(at+m[0].length);processEvent(part);
   }
  }
  if(buffer.trim())processEvent(buffer);
  if(!gotDone)throw Error("Response ended before completion. Please retry.");
 }catch(e){
  if(window.polarisAutoSpeech)window.polarisAutoSpeech.fail();
  var msg=String(e.message||e);
  if(!reply){output.textContent="OpenAI connection issue: "+msg;if(answerText)answerText.textContent="OpenAI connection issue: "+msg}
  else{output.textContent=reply+"\n\n[The connection ended early]";if(answerText)answerText.textContent=reply+"\n\n[The connection ended early]"}
  label.textContent="Connection issue";state.textContent="ERROR";notify(msg);
 }finally{
  activeStream=null;requestBusy=false;
  if(queue.length){var next=queue.shift();sendToOpenAI(next.question,next.source)}
 }
}
askAI=function(question,source){sendToOpenAI(question,source||(lastInputWasVoice?"microphone":"typed"))};
var headline=document.querySelector(".eyebrow");if(headline)headline.textContent="PERSONAL INTELLIGENCE NETWORK / V2.3";
var footer=document.querySelector(".footer");if(footer)footer.innerHTML='<span>✦ POLARIS</span> · NORTH STAR VENTURES · OPENAI GPT-6.1 SOL v2.3';
})();
