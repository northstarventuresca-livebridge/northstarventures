
"use strict";
// Original, browser-synthesized musical references only; no copyrighted samples.
const chordRoots=["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];
const chordNotes={C:0,"C#":1,Db:1,D:2,"D#":3,Eb:3,E:4,F:5,"F#":6,Gb:6,G:7,"G#":8,Ab:8,A:9,"A#":10,Bb:10,B:11};
const chordIntervals={major:[0,4,7],minor:[0,3,7],dim:[0,3,6],aug:[0,4,8],sus2:[0,2,7],sus4:[0,5,7],major7:[0,4,7,11],dominant7:[0,4,7,10],minor7:[0,3,7,10],add9:[0,4,7,14]};
const rootSelect=document.getElementById("songKeyRoot"),modeSelect=document.getElementById("songKeyMode");
const chordControls=["songKeyRoot","songKeyMode","songBpm","songMeter","songInstrument","chordChart"];
for(const root of chordRoots){const o=document.createElement("option");o.value=root;o.textContent=root;rootSelect.append(o);}
const qualityMap={major:["","m","m","","","m","dim"],minor:["m","dim","","m","m","",""]};
let audioCtx=null;
function makeChordName(root,quality){return root+quality;}
function notesForChord(label){
 const m=/^([A-G](?:#|b)?)(maj7|m7|sus2|sus4|dim|aug|add9|m|7)?$/.exec(label);
 if(!m)return null;
 const root=chordNotes[m[1]];if(root===undefined)return null;
 const quality=({m:"minor",m7:"minor7",maj7:"major7",7:"dominant7",sus2:"sus2",sus4:"sus4",dim:"dim",aug:"aug",add9:"add9"})[m[2]]||"major";
 return chordIntervals[quality].map(x=>48+root+x); // C3 plus the chosen chord interval
}
function soundVoice(midi,at,mode,seconds=1.6){
 // These voices are synthesized from oscillators — piano-like and plucked-string-like reference sounds.
 const hz=440*Math.pow(2,(midi-69)/12);
 const gain=audioCtx.createGain();
 gain.connect(audioCtx.destination);
 const start=at,end=at+seconds;
 const isString=mode==="guitar";
 gain.gain.setValueAtTime(0.00001,start);
 gain.gain.exponentialRampToValueAtTime(isString?.12:.095,start+(isString?.008:.018));
 gain.gain.exponentialRampToValueAtTime(.00001,end);
 const frequencies=isString?[1,2,3]:[1,2,4];
 frequencies.forEach((f,i)=>{
  const osc=audioCtx.createOscillator();const partial=audioCtx.createGain();
  osc.type=isString?(i===0?"triangle":"sine"):"sine";osc.frequency.setValueAtTime(hz*f,start);
  partial.gain.value=i===0?1:(isString?.17:.24)/(i+1);
  osc.connect(partial);partial.connect(gain);osc.start(start);osc.stop(end+.01);
 });
}
async function auditionNotes(notes){
 if(document.getElementById("chordMute")?.checked)return;
 const Ctx=window.AudioContext||window.webkitAudioContext;
 if(!Ctx){notify("Your browser does not support audio preview.",true);return;}
 try{
 if(!audioCtx)audioCtx=new Ctx();
 if(audioCtx.state==="suspended")await audioCtx.resume();
 const instrument=document.getElementById("songInstrument").value;
 const t=audioCtx.currentTime+.025;
 notes.forEach((m,i)=>soundVoice(m,t+(instrument==="guitar"?i*.045:0),instrument,1.5));
 }catch(e){notify("Audio preview unavailable: "+e.message,true)}
}
function chordKeyRoot(){return rootSelect.value||"C"}
function currentKey(){return chordKeyRoot()+" "+modeSelect.value}
function renderChordRibbon(){
 const holder=document.getElementById("chordRibbon");holder.replaceChildren();
 const rootIndex=chordNotes[chordKeyRoot()]??0;
 const scales=modeSelect.value==="minor"?[0,2,3,5,7,8,10]:[0,2,4,5,7,9,11];
 const quality=qualityMap[modeSelect.value]||qualityMap.major;
 scales.forEach((offset,i)=>{
  const label=makeChordName(chordRoots[(rootIndex+offset)%12],quality[i]);
  const btn=document.createElement("button");btn.type="button";btn.className="chord-quick";
  btn.textContent=label;
  btn.title="Insert "+label+" into your lyrics, and preview its sound";
  btn.onclick=()=>insertChord(label);
  holder.append(btn);
 });
 const extra=document.getElementById("chordExtras");extra.replaceChildren();
 ["","m","7","maj7","m7","sus2","sus4","add9"].forEach(quality=>{
  const label=chordKeyRoot()+quality;
  const btn=document.createElement("button");btn.type="button";btn.className="chord-quick ghost";
  btn.textContent=label;btn.title="Insert "+label;
  btn.onclick=()=>insertChord(label);
  extra.append(btn);
 });
 document.getElementById("songKeyDisplay").textContent=currentKey();
}
function chordModeUI(){
 const enabled=document.getElementById("songChordEnabled").checked;
 document.getElementById("chordTools").classList.toggle("hidden",!enabled);
 document.getElementById("songChordPane").classList.toggle("hidden",!enabled);
 document.getElementById("chordToggleLabel").textContent=enabled?"Chords enabled":"Chords optional";
}
function insertChord(chord){
 const input=document.getElementById("songLyrics"),start=input.selectionStart??input.value.length,end=input.selectionEnd??start;
 const tag="["+chord+"]";input.value=input.value.slice(0,start)+tag+input.value.slice(end);
 input.focus();input.setSelectionRange(start+tag.length,start+tag.length);
 input.dispatchEvent(new Event("input",{bubbles:true}));
 auditionNotes(notesForChord(chord)||[]);
}
function previewKey(){
 const root=chordNotes[chordKeyRoot()]||0;
 const suffix=modeSelect.value==="minor"?"m":"";
 auditionNotes(notesForChord(chordKeyRoot()+suffix)||[48+root]);
}
function getChordState(){
 const [root,mode]=[chordKeyRoot(),modeSelect.value];
 return {chord_enabled:document.getElementById("songChordEnabled").checked?1:0,
 song_key:root+" "+mode,
 bpm:Number(document.getElementById("songBpm").value)||80,
 time_signature:document.getElementById("songMeter").value,
 preview_instrument:document.getElementById("songInstrument").value,
 chord_chart:document.getElementById("chordChart").value};
}
function showChordState(song){
 const key=String(song.song_key||"C major").split(" ");
 rootSelect.value=chordRoots.includes(key[0])?key[0]:"C";
 modeSelect.value=key[1]==="minor"?"minor":"major";
 document.getElementById("songChordEnabled").checked=!!song.chord_enabled;
 document.getElementById("songBpm").value=song.bpm||80;
 document.getElementById("songMeter").value=song.time_signature||"4/4";
 document.getElementById("songInstrument").value=song.preview_instrument||"piano";
 document.getElementById("chordChart").value=song.chord_chart||"";
 chordModeUI();renderChordRibbon();
}
function updateChordSong(){
 const s=currentSong();if(!s)return;
 Object.assign(s,getChordState());
 document.getElementById("songSaveState").textContent="Unsaved changes...";
 clearTimeout(state.songTimer);
 state.songTimer=setTimeout(()=>saveSong(false),1000);
 renderChordRibbon();
 chordModeUI();
}
const prevSelectSong=selectSong;
selectSong=function(id){
 if(state.songId===id){navigate("songs");return;}
 // The core selection function updates songId after its async save; refresh our controls afterwards.
 prevSelectSong(id);
 const target=id;
 const apply=()=>{if(state.songId===target){const s=currentSong();if(s)showChordState(s);}else requestAnimationFrame(apply);};
 requestAnimationFrame(apply);
};
const prevUpdateSong=updateSongLocal;
updateSongLocal=function(){
 const s=currentSong();if(s)Object.assign(s,getChordState());
 return prevUpdateSong();
};
const prevExport=document.getElementById("exportSong").onclick;
document.getElementById("exportSong").onclick=function(){
 const s=currentSong();if(s)Object.assign(s,getChordState());
 if(!s)return;
 const chords=s.chord_enabled?"\nKEY: "+s.song_key+"\nTEMPO: "+s.bpm+" BPM\nTIME SIGNATURE: "+s.time_signature+"\nPREFERRED SOUND: "+s.preview_instrument+"\n\nCHORD CHART\n"+(s.chord_chart||"Chords are shown inline in the lyrics.")+"\n":"";
 const txt=[s.title,chords,"\nLYRICS WITH CHORDS\n"+(s.lyrics||""),s.mission?"\nCREATIVE MISSION\n"+s.mission:"",s.scriptures?"\nSCRIPTURE NOTES\n"+s.scriptures:"",s.notes?"\nWORKING NOTES\n"+s.notes:"",s.style_prompt?"\nPRODUCTION NOTES\n"+s.style_prompt:""].join("\n");
 exportChordText(txt,s.title+"-musician-sheet.txt");notify("Musician sheet exported.");
};
function exportChordText(contents,name){
 const url=URL.createObjectURL(new Blob([contents],{type:"text/plain;charset=utf-8"}));
 const a=document.createElement("a");a.href=url;a.download=name.replace(/[^A-Za-z0-9_.-]/g,"-");document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
}
document.getElementById("sunoExport").onclick=function(){
 const s=currentSong();if(!s)return;
 Object.assign(s,getChordState());
 const cleanLyrics=(s.lyrics||"").replace(/\[([A-G](?:#|b)?)(?:maj7|m7|sus2|sus4|dim|aug|add9|m|7)?\]/g,"").replace(/ {2,}/g," ");
 const style=[s.style_prompt||"",s.chord_enabled?"Desired musical key: "+s.song_key+". Tempo: "+s.bpm+" BPM. Time signature: "+s.time_signature+". Arrangement instrument: "+s.preview_instrument+".":""].filter(Boolean).join(" ");
 const text=[s.title,"","STYLE / MUSICAL DIRECTION",style,"","LYRICS (without chord tokens)",cleanLyrics,"",s.chord_enabled?"OPTIONAL CHORD REFERENCE\n"+(s.chord_chart||"Inline chords recorded in musician sheet"):""].join("\n");
 exportChordText(text,s.title+"-music-ai-guide.txt");notify("AI music guide exported. Key and pitch are suggestions, not guaranteed.");
};
document.getElementById("previewSongKey").onclick=previewKey;
document.getElementById("songChordEnabled").addEventListener("change",updateChordSong);
for(const id of chordControls)document.getElementById(id).addEventListener("input",updateChordSong);
document.getElementById("chordInsert").onclick=()=>{
 const text=document.getElementById("chordManual").value.trim();
 if(notesForChord(text))insertChord(text);else notify("Try a chord like C, Am, G7, Fmaj7 or Dsus4.",true);
};
document.getElementById("chordManual").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();document.getElementById("chordInsert").click();}};
renderChordRibbon();
