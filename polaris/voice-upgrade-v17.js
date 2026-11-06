// Polaris Voice v1.7 runtime patch.
// This code is inserted inside the existing Polaris IIFE by the Worker,
// so the original login, project cards, voice permissions, and UI remain intact.
var polaris17Recent=[],polaris17LastGreeting=0,polaris17LastReply="",polaris17LastReplyAt=0;

function polaris17Normalize(text){
 return String(text||"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
}
function polaris17DuplicateVoice(text){
 var key=polaris17Normalize(text).replace(/^(hey )?polaris ?/,""),now=Date.now();
 if(!key)return false;
 polaris17Recent=polaris17Recent.filter(function(c){return now-c.at<12000});
 for(var i=0;i<polaris17Recent.length;i++){
  var old=polaris17Recent[i];
  if(key===old.key&&now-old.at<12000)return true;
  if(now-old.at<4000&&key.length>18&&Math.abs(key.length-old.key.length)<=3){
   var words=key.split(" "),prev=old.key.split(" "),common=0;
   words.forEach(function(word){if(prev.includes(word))common++});
   if(common/Math.max(words.length,prev.length)>.92)return true;
  }
 }
 polaris17Recent.push({key:key,at:now});
 return false;
}
var polaris17OriginalCommand=command;
command=function(raw,fromVoice){
 if(fromVoice&&polaris17DuplicateVoice(raw))return;
 return polaris17OriginalCommand(raw,fromVoice);
};
var polaris17OriginalActivate=activate;
activate=function(){
 if(active&&Date.now()-polaris17LastGreeting<15000){
  armedUntil=Date.now()+60000;
  showReply("I'm listening.");
  return;
 }
 polaris17LastGreeting=Date.now();
 return polaris17OriginalActivate();
};
var polaris17OriginalTalk=talk;
talk=function(message){
 var key=polaris17Normalize(message),now=Date.now();
 if(key&&key===polaris17LastReply&&now-polaris17LastReplyAt<9000)return voiceQueue;
 polaris17LastReply=key;polaris17LastReplyAt=now;
 return polaris17OriginalTalk(message);
};

function polaris17Stretch(input,speed,ctx){
 if(Math.abs(speed-1)<.015||input.length<input.sampleRate*.12)return input;
 var sampleRate=input.sampleRate,sourceLength=input.length,outLength=Math.max(1,Math.round(sourceLength/speed));
 var grain=Math.max(512,Math.round(sampleRate*.048)),hop=Math.max(128,Math.round(grain*.24)),overlap=grain-hop;
 var search=Math.round(sampleRate*.008),searchStep=Math.max(8,Math.round(sampleRate/4000)),scanStep=Math.max(10,Math.round(sampleRate/4000));
 var raw=[],acc=[],weights=new Float32Array(outLength);
 for(var ch=0;ch<input.numberOfChannels;ch++){raw.push(input.getChannelData(ch));acc.push(new Float32Array(outLength))}
 var window=new Float32Array(grain);
 for(var j=0;j<grain;j++)window[j]=.5-.5*Math.cos(2*Math.PI*j/(grain-1));
 for(var pos=0,frame=0;pos<outLength;pos+=hop,frame++){
  var predicted=Math.max(0,Math.min(sourceLength-grain,Math.round(pos*speed))),read=predicted;
  if(frame&&predicted>0&&predicted<sourceLength-grain){
   var best=-Infinity;
   for(var shift=-search;shift<=search;shift+=searchStep){
    var trial=predicted+shift;
    if(trial<0||trial+grain>=sourceLength)continue;
    var dot=0,a2=0,b2=0;
    for(var k=0;k<overlap;k+=scanStep){
     var w=weights[pos+k];
     if(w<.01)continue;
     var a=acc[0][pos+k]/w,b=raw[0][trial+k];
     dot+=a*b;a2+=a*a;b2+=b*b;
    }
    if(a2<.00001||b2<.00001)continue;
    var score=dot/Math.sqrt(a2*b2)-Math.abs(shift)/sampleRate*.25;
    if(score>best){best=score;read=trial}
   }
  }
  for(var j=0;j<grain&&pos+j<outLength;j++){
   var at=pos+j,wt=window[j];weights[at]+=wt;
   for(var ch=0;ch<acc.length;ch++)acc[ch][at]+=raw[ch][read+j]*wt;
  }
 }
 var out=ctx.createBuffer(input.numberOfChannels,outLength,sampleRate);
 for(var ch=0;ch<acc.length;ch++){
  var result=out.getChannelData(ch),values=acc[ch];
  for(var i=0;i<outLength;i++)result[i]=weights[i]>.00001?values[i]/weights[i]:0;
 }
 return out;
}

// Replace the old Android playback chain. PCM time-stretch preserves pitch
// at the requested speaking speed and uses the already-unlocked WebAudio path.
playPcmAudio=function(data){
 if(!audioContext||audioContext.state!=="running")return Promise.reject(new Error("Tap ENABLE AUDIO to unlock the phone speaker."));
 return audioContext.decodeAudioData(data.slice(0)).then(async function(buffer){
  if(listenWanted&&bargeWanted)await ensureBargeMicrophone().catch(function(){return false});
  return new Promise(function(resolve,reject){
   if(!buffer||!buffer.length){reject(new Error("Speech audio was empty."));return}
   var processed=buffer,applied=1;
   try{
    processed=polaris17Stretch(buffer,speechRate,audioContext);
    applied=processed===buffer?1:speechRate;
   }catch(e){
    processed=buffer;
    applied=1;
    record("Audio time-stretch fallback: "+String(e.message).slice(0,90));
   }
   var source=audioContext.createBufferSource(),finished=false,timer;
   source.buffer=processed;source.playbackRate.value=1;
   source.connect(audioContext.destination);activeAudio=source;
   function end(){
    if(finished)return;finished=true;clearTimeout(timer);activeAudio=null;
    resumeMicrophoneAfterSpeaker();resolve();
   }
   source.onended=end;
   holdMicrophoneForSpeaker();
   try{source.start()}catch(e){resumeMicrophoneAfterSpeaker();reject(e);return}
   setAudioStatus("POLARIS SPEAKING · "+applied.toFixed(2)+"× · ORIGINAL PITCH","ready");
   timer=setTimeout(end,Math.ceil(processed.duration*1000)+1500);
  });
 });
};

el("speedSlider").addEventListener("input",function(){
 if(!speaking)setAudioStatus("NEXT REPLY "+speechRate.toFixed(2)+"× · PITCH UNCHANGED",audioReady?"ready":"");
});
el("speedSlider").setAttribute("title","Applies to the next spoken reply. Use TEST VOICE to hear the new speed.");

// Convey the actual microphone/typing context and local project names to the model.
askAI=async function(query){
 if(requestBusy)return;
 requestBusy=true;showReply("Thinking...");el("aiStat").textContent="THINKING";el("aiDetail").textContent="Understanding your request";
 var inputSource=lastInputWasVoice?"microphone":"typed";
 try{
  var response=await fetch("/api/ask",{
   method:"POST",
   headers:{"content-type":"application/json"},
   body:JSON.stringify({
    message:query,source:inputSource,history:conversation.slice(-12),
    projects:projects.slice(0,12).map(function(p){return {name:p.name,status:p.status,progress:p.progress}})
   })
  });
  if(!response.ok)throw new Error("AI service returned "+response.status);
  var data=await response.json();
  if(!data.reply)throw new Error("No answer received");
  conversation.push({role:"user",content:query},{role:"assistant",content:data.reply});
  conversation=conversation.slice(-14);
  record("AI replied: "+data.reply.slice(0,100));
  el("aiStat").textContent="ONLINE";
  el("aiDetail").textContent=data.engine||"AI ready";
  talk(data.reply);
 }catch(e){
  var note="Your words were received, but AI processing was unavailable: "+e.message;
  showReply(note);notify(note);el("aiStat").textContent="ERROR";el("aiDetail").textContent="Check AI service";
 }finally{requestBusy=false}
};
document.querySelector(".eyebrow").textContent="PERSONAL INTELLIGENCE NETWORK / V1.7";
var foot=document.querySelector(".footer");
if(foot)foot.innerHTML='<span>✦ POLARIS</span> · POWERED BY NORTH STAR VENTURES · MOBILE FOUNDATION v1.7';
