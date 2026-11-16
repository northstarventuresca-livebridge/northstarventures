// v2.8 mobile push-to-talk for Polaris + Monica.
// This source is inserted inside the existing Polaris page closure, so it
// intentionally uses the existing command(), setListen(), and primeAudio() helpers.
(function () {
  "use strict";
  var existing = document.getElementById("polarisPhoneTalk");
  if (existing) return;
  var host = document.getElementById("micBtn");
  if (!host || !host.parentNode) return;

  var button = document.createElement("button");
  button.type = "button";
  button.id = "polarisPhoneTalk";
  button.className = "btn primary";
  button.textContent = "🎙 TAP TO TALK";
  button.style.cssText = "border:1px solid #4ce9f8;box-shadow:0 0 18px #42a8ff40;font-weight:800;min-height:45px";
  button.title = "Tap, speak one request, then Polaris responds";
  host.parentNode.insertBefore(button, host);

  var recognitionOnce = null;
  var busy = false;
  function setLabel(label) {
    button.textContent = label;
    button.setAttribute("aria-label", label);
  }
  function sendSpoken(heard) {
    var phrase = String(heard || "").trim().replace(/^(?:hey\s+)?polaris[\s,:-]*/i, "");
    if (!phrase) return;
    // The generic timer commands belong to Monica; everything else retains
    // Polaris's ordinary project/conversation router.
    if (/^(?:start|resume|pause|stop|end|check|show)(?:\s+(?:the|my))?\s+timer\b/i.test(phrase)) {
      phrase = phrase.replace(/^(start|resume|pause|stop|end|check|show)(?:\s+(?:the|my))?\s+timer\b/i,
        function(all, verb) { return verb + " Monica timer"; });
    } else if (/^how long (?:have i been working|is (?:the|my) timer running|on (?:the|my) timer)/i.test(phrase)) {
      phrase = "how long is Monica's timer";
    }
    if (/\bmonica(?:'s)?\b/i.test(phrase)) window.polarisProjectSelection = "Monica's House";
    setLabel("✓ SENT TO POLARIS");
    showHeard(phrase);
    command("Hey Polaris, " + phrase, true);
  }

  button.addEventListener("click", function () {
    if (busy && recognitionOnce) {
      try { recognitionOnce.stop(); } catch (e) {}
      return;
    }
    var Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Speech) {
      notify("One-tap speech needs Chrome on Android. You can type a command below.");
      return;
    }
    if (listenWanted) setListen(false); // Avoid two microphone owners.
    primeAudio(false).catch(function () {});
    try {
      recognitionOnce = new Speech();
      recognitionOnce.lang = "en-CA";
      recognitionOnce.continuous = false;
      recognitionOnce.interimResults = false;
      recognitionOnce.maxAlternatives = 1;
      var sent = false;
      busy = true;
      setLabel("🔴 LISTENING · TAP TO FINISH");
      recognitionOnce.onresult = function (event) {
        if (sent || !event.results || !event.results.length) return;
        var heard = event.results[event.results.length - 1][0]?.transcript || "";
        if (!heard.trim()) return;
        sent = true;
        sendSpoken(heard);
      };
      recognitionOnce.onerror = function (event) {
        if (sent) return;
        var kind = event?.error || "unknown";
        if (kind !== "no-speech" && kind !== "aborted") {
          notify("Phone microphone: " + kind);
          showReply("Could not hear that. Tap Talk and try again.");
        }
      };
      recognitionOnce.onend = function () {
        busy = false;
        recognitionOnce = null;
        setTimeout(function () { if (!busy) setLabel("🎙 TAP TO TALK"); }, sent ? 1800 : 0);
      };
      recognitionOnce.start();
    } catch (e) {
      busy = false;
      recognitionOnce = null;
      setLabel("🎙 TAP TO TALK");
      notify("Microphone could not start. Check your phone's microphone permission.");
    }
  });
})();
