
// Polaris source-grounded LiveBridge vocabulary feature status.
// Read-only GitHub App checks on the isolated feature branch and its CI.
// Never conclude deployed merely because a branch or test run exists.
const PK_LB_VOCAB_REPO="northstarventuresca-livebridge/livebridge-allinone";
const PK_LB_VOCAB_BRANCH="feature/organization-vocabulary-2026-11-12";
function pkLiveBridgeVocabQuestion(question, selected=""){
 const q=String(question||"").toLowerCase(),sel=String(selected||"").toLowerCase();
 return /\b(?:dictionary|dictionaries|vocabulary|pronunciation|custom words?|correct spelling|personal (?:words|terms)|custom terms)\b/.test(q)&&
  (/\blive\s*bridge\b/.test(q)||/\blivebridge\b/.test(q)||sel.includes("livebridge"));
}
async function pkLiveBridgeVocabStatus(env){
 const checkedAt=new Date().toISOString();
 const [compare,workflow]=await Promise.allSettled([
  paGithubRepoRequest(env,PK_LB_VOCAB_REPO,"/compare/main..."+PK_LB_VOCAB_BRANCH),
  paGithubRepoRequest(env,PK_LB_VOCAB_REPO,"/actions/runs?branch="+encodeURIComponent(PK_LB_VOCAB_BRANCH)+"&per_page=8")
 ]);
 if(compare.status!=="fulfilled")return {ok:false,checkedAt,
  error:"The LiveBridge GitHub branch could not be verified right now. Last documented stage: isolated branch with automated tests; do not assume a deployment."};
 const diff=compare.value,files=(diff.files||[]).map(x=>x.filename);
 const expected=["backend/organization-vocabulary.mjs","backend/worker.js","frontend/public/account/vocabulary.js","tests/organization-vocabulary.test.mjs"];
 const sourceFiles=expected.filter(x=>files.includes(x));
 const greenRuns=workflow.status==="fulfilled"?(workflow.value.workflow_runs||[]).filter(x=>
  x.head_branch===PK_LB_VOCAB_BRANCH&&x.conclusion==="success"&&x.status==="completed"):[];
 const recentRun=workflow.status==="fulfilled"?(workflow.value.workflow_runs||[]).find(x=>x.head_branch===PK_LB_VOCAB_BRANCH):null;
 const ciPass=greenRuns.length>0&&recentRun?.conclusion==="success";
 const ahead=Number(diff.ahead_by||0),behind=Number(diff.behind_by||0);
 const isolated=diff.status==="ahead"&&ahead>0;
 const status=isolated?"Test branch built · awaiting end-to-end validation":
  diff.status==="identical"?"Branch matches main; verify production deployment separately":
  "Needs branch comparison review";
 const statusDetails=[
  "Verified GitHub repo: "+PK_LB_VOCAB_REPO,
  "Branch: "+PK_LB_VOCAB_BRANCH,
  "Compared to main: "+ahead+" commits ahead, "+behind+" behind; status "+diff.status,
  "Feature source files in diff: "+sourceFiles.join(", "),
  "Automated branch checks: "+(ciPass?"latest completed run PASSED":recentRun?.status==="in_progress"?"currently running":recentRun?.conclusion||"not confirmed"),
  "Production deployment: NOT VERIFIED; a successful test branch is not a live rollout.",
  "Remaining planned work: isolated browser preview; real spoken-audio checks (including Jachin / Jake-in / Jack in / Jacqueline); review and approval before any production merge.",
  "Source checked at "+checkedAt
 ].join("\n");
 return {ok:true,checkedAt,repo:PK_LB_VOCAB_REPO,branch:PK_LB_VOCAB_BRANCH,
  ahead,behind,status,sourceFiles,ciPass,ciRunUrl:recentRun?.html_url||null,isolated,
  source:statusDetails};
}
function pkLiveBridgeVocabReply(facts){
 if(!facts.ok)return "I found the earlier LiveBridge dictionary development, but I can't verify GitHub's current state right now. "+
  "The last documented stage was an isolated test branch with automated checks; I won't claim it is live.";
 if(facts.isolated){
  return "The LiveBridge custom dictionary is already built on a separate test branch; it is NOT confirmed live. "+
   "GitHub shows "+facts.ahead+" commits ahead of production's main branch, and the latest automated test "+(facts.ciPass?"passed":"is not confirmed as passing")+". "+
   "It includes organization-specific vocabulary, correct spelling, pronunciation and commonly misheard alternatives, plus the account page editor. "+
   "We left off at browser preview and real-audio testing, especially the name Jachin (Jake-in), before approving a production rollout.";
 }
 return "The LiveBridge vocabulary branch currently compares to main as: "+facts.status+". "+
  "I can't infer the feature's live deployment from this comparison alone. The next step is deployment verification and audio testing.";
}
