import { HTML } from "./ui.js";

const PRESETS=[
["Housing","house"],["Rent / Mortgage","house"],["Property Tax","house"],["Home Insurance","shield"],["Car Insurance","car"],["Health / Life Insurance","shield"],["Electricity","zap"],["Natural Gas / Heat","flame"],["Water / Sewer","droplets"],["Garbage / Recycling","trash"],["Cell Phone","smartphone"],["Internet","wifi"],["Streaming Services","play"],["Subscriptions","repeat"],["Groceries","basket"],["Restaurants / Coffee","coffee"],["Fuel","fuel"],["Car Payments","car"],["Vehicle Maintenance","wrench"],["Public Transit","bus"],["Clothing","shirt"],["Household Supplies","package"],["Medical / Dental","heart"],["Childcare / School","book"],["Gifts","gift"],["Entertainment","sparkles"],["Travel / Vacation","plane"],["Debt Payments","credit"],["Emergency Fund","piggy"],["Savings","piggy"],["Pets","paw"],["Charity / Other Giving","heart"],["Other","wallet"]];
const GIVE=[["tithe",10],["offering",0],["firstfruits",2.5],["poor",3.33],["future",6.7]];
const ID=()=>crypto.randomUUID();
const now=()=>Math.floor(Date.now()/1000);
const J=(x,status=200,headers={})=>new Response(JSON.stringify(x),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff",...headers}});
const bad=(message,status=400)=>J({error:message},status);
const cents=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>1e9)throw Error("Invalid amount");return Math.round(n*100)};
const pct=v=>{const n=Number(v);if(!Number.isFinite(n)||n<0||n>100)throw Error("Percentage must be 0–100");return n};
const date=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""))?String(v):new Date().toISOString().slice(0,10);
const email=v=>String(v||"").toLowerCase().trim();
const clean=(s,max=150)=>String(s||"").trim().slice(0,max);
const hex=b=>Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("");
const sha=async s=>hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)));
async function passwordHash(password,salt) {
 const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);
 return hex(await crypto.subtle.deriveBits({name:"PBKDF2",salt:new TextEncoder().encode(salt),iterations:100000,hash:"SHA-256"},k,256));
}
function randomString(){const b=crypto.getRandomValues(new Uint8Array(24));return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function addAccount(db,mail,pass,name,createdBy,role="user",change=0) {
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)||mail.length>200)throw Error("Enter a valid email");
 if(pass.length<10||!/[a-zA-Z]/.test(pass)||!/[0-9]/.test(pass))throw Error("Password needs 10+ characters, letters and numbers");
 const id=ID(),salt=randomString(),hash=await passwordHash(pass,salt);
 await db.prepare("INSERT INTO users(id,email,display_name,salt,password_hash,role,must_change,created_by) VALUES(?,?,?,?,?,?,?,?)").bind(id,mail,clean(name,90)||mail.split("@")[0],salt,hash,role,change,createdBy).run();
 return id;
}
async function addHouse(db,user,name,creator) {
 const id=ID();
 await db.prepare("INSERT INTO households(id,name,created_by) VALUES(?,?,?)").bind(id,clean(name,90)||"My blessed budget",creator).run();
 await db.prepare("INSERT INTO household_members(household_id,user_id,access) VALUES(?,?,?)").bind(id,user,"owner").run();
 await db.batch(PRESETS.map(([name,icon])=>db.prepare("INSERT INTO categories(id,household_id,name,icon) VALUES(?,?,?,?)").bind(ID(),id,name,icon)));
 return id;
}
async function session(db,user) {
 const token=randomString(),hash=await sha(token);
 await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(hash,user,now()+2592000).run();
 return "__Host-bless_session="+token+"; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000";
}
async function actor(req,db) {
 const match=(req.headers.get("cookie")||"").match(/(?:^|;\s*)__Host-bless_session=([a-f0-9]{48})/);
 if(!match)return null;
 const hash=await sha(match[1]);
 return db.prepare("SELECT u.id,u.email,u.display_name,u.role,u.must_change FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?").bind(hash,now()).first();
}
async function households(db,u) {
 if(u.role==="owner")return (await db.prepare("SELECT h.*,u.email AS owner_email FROM households h LEFT JOIN users u ON u.id=h.created_by ORDER BY h.created_at DESC").all()).results;
 return (await db.prepare("SELECT DISTINCT h.*,u.email AS owner_email FROM households h LEFT JOIN users u ON u.id=h.created_by LEFT JOIN household_members hm ON hm.household_id=h.id AND hm.user_id=? LEFT JOIN mentor_access ma ON ma.household_id=h.id AND ma.admin_id=? WHERE hm.user_id IS NOT NULL OR ( ?='admin' AND (ma.admin_id IS NOT NULL OR h.created_by=?)) ORDER BY h.created_at DESC").bind(u.id,u.id,u.role,u.id).all()).results;
}
async function inHouse(db,u,id) {
 if(!id)return false;
 if(u.role==="owner")return !!(await db.prepare("SELECT id FROM households WHERE id=?").bind(id).first());
 const a=await db.prepare("SELECT 1 ok FROM household_members WHERE user_id=? AND household_id=?").bind(u.id,id).first();
 if(a)return true;
 if(u.role==="admin")return !!(await db.prepare("SELECT 1 ok FROM households h LEFT JOIN mentor_access a ON a.household_id=h.id AND a.admin_id=? WHERE h.id=? AND (h.created_by=? OR a.admin_id IS NOT NULL)").bind(u.id,id,u.id).first());
 return false;
}
async function audit(db,u,h,action,detail="") {
 try{await db.prepare("INSERT INTO audit(id,actor_id,household_id,action,detail) VALUES(?,?,?,?,?)").bind(ID(),u?.id||"system",h||null,action,clean(detail,500)).run()}catch{}
}
function periodBounds(period,anchor){
 if(period==="all")return ["0000-01-01","9999-12-31",1];
 const a=new Date(date(anchor)+"T12:00:00Z");
 let start,end,scale=1;
 if(period==="month"){start=new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth(),1));end=new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+1,0));scale=1}
 else{const d=a.getUTCDay();start=new Date(a);start.setUTCDate(a.getUTCDate()-((d+6)%7));end=new Date(start);end.setUTCDate(start.getUTCDate()+(period==="biweek"?13:6));scale=period==="biweek"?14*12/365.2425:7*12/365.2425;}
 return [start.toISOString().slice(0,10),end.toISOString().slice(0,10),scale];
}
async function getDashboard(db,u,h,period,anchor) {
 const [start,end,scale]=periodBounds(period,anchor);
 const [incomes,expenses,categories,giving,members,house]=await Promise.all([
 db.prepare("SELECT * FROM income WHERE household_id=? AND paid_at BETWEEN ? AND ? ORDER BY paid_at DESC,created_at DESC").bind(h,start,end).all(),
 db.prepare("SELECT * FROM expenses WHERE household_id=? AND spent_at BETWEEN ? AND ? ORDER BY spent_at DESC,created_at DESC").bind(h,start,end).all(),
 db.prepare("SELECT * FROM categories WHERE household_id=? AND archived=0 ORDER BY name").bind(h).all(),
 db.prepare("SELECT g.* FROM giving g JOIN income i ON i.id=g.income_id WHERE g.household_id=? AND i.paid_at BETWEEN ? AND ? ORDER BY i.paid_at DESC,g.kind").bind(h,start,end).all(),
 db.prepare("SELECT u.id,u.email,u.display_name,hm.access FROM household_members hm JOIN users u ON u.id=hm.user_id WHERE hm.household_id=?").bind(h).all(),
 db.prepare("SELECT * FROM households WHERE id=?").bind(h).first()
 ]);
 return {house,range:{start,end,period,scale},income:incomes.results,expenses:expenses.results,categories:categories.results,giving:giving.results,members:members.results};
}
function normAI(out){const t=typeof out==="string"?out:(out.answer||out.response||out.result?.answer||out.result?.response||JSON.stringify(out));const match=t.match(/\{[\s\S]*\}/);if(!match)throw Error("Could not read details from image. Please enter manually.");return JSON.parse(match[0])}
async function scanPhoto(env,bytes,mime,type,categories){
 let b64="";for(let i=0;i<bytes.length;i+=32768)b64+=String.fromCharCode(...bytes.subarray(i,i+32768));
 const image="data:"+mime+";base64,"+btoa(b64);
 const instructions=type==="income"?"Read this pay stub. Return JSON ONLY: {\"source\":\"employer\", \"gross\":0, \"net\":0, \"date\":\"YYYY-MM-DD\"}. Gross is pre-deduction pay and net is take-home pay. Use only clearly readable numbers.":"Read this purchase receipt. Return JSON ONLY: {\"merchant\":\"store\", \"total\":0, \"date\":\"YYYY-MM-DD\", \"category\":\"exact available category name\", \"items\":[{\"name\":\"item\", \"qty\":1, \"price\":0}]}. Total includes tax, items price as shown. Available categories: "+categories.map(x=>x.name).join(", ")+". If category uncertain use Other. No invented data.";
 const response=await env.AI.run("@cf/moondream/moondream3.1-9B-A2B",{task:"query",image,question:instructions,max_tokens:1200,reasoning:false,temperature:0});
 return normAI(response);
}
async function bodyJSON(req){try{return await req.json()}catch{throw Error("Invalid request body")}}
async function route(req,env,u,url){
 const db=env.DB,p=url.pathname,method=req.method;
 if(p==="/api/me"&&method==="GET"){
  if(!u)return J({user:null,owner_setup_pending:!(await db.prepare("SELECT 1 ok FROM users WHERE role='owner'").first())});
  return J({user:u,households:await households(db,u)});
 }
 if(p==="/api/auth/signup"&&method==="POST"){
  const b=await bodyJSON(req),mail=email(b.email),pass=String(b.password||"");
  const setup=mail==="rwyers@gmail.com";
  if(setup){
   if(!env.OWNER_SETUP_CODE||String(b.setup_code||"")!==env.OWNER_SETUP_CODE)return bad("Administrator setup code required",403);
   if(await db.prepare("SELECT 1 ok FROM users WHERE role='owner'").first())return bad("Owner account already created",409);
  }
  if(await db.prepare("SELECT 1 ok FROM users WHERE email=?").bind(mail).first())return bad("Email already registered",409);
  const uid=await addAccount(db,mail,pass,b.name,null,setup?"owner":"user");
  const h=await addHouse(db,uid,(clean(b.name,70)||"My")+" household",uid);
  await audit(db,{id:uid},h,"signup");
  return J({ok:true},200,{"set-cookie":await session(db,uid)});
 }
 if(p==="/api/auth/login"&&method==="POST"){
  const b=await bodyJSON(req),mail=email(b.email),pass=String(b.password||"");
  const lock=await db.prepare("SELECT attempts,window_start FROM login_limits WHERE email=?").bind(mail).first();
  if(lock&&lock.attempts>=8&&now()-lock.window_start<900)return bad("Too many attempts. Try again after 15 minutes.",429);
  const user=await db.prepare("SELECT * FROM users WHERE email=?").bind(mail).first();
  if(!user&&mail==="rwyers@gmail.com"&&String(b.setup_code||"")){
   if(!env.OWNER_SETUP_CODE||String(b.setup_code)!==env.OWNER_SETUP_CODE)return bad("Administrator setup code is incorrect",403);
   if(await db.prepare("SELECT 1 ok FROM users WHERE role='owner'").first())return bad("Administrator account has already been initialized",409);
   const uid=await addAccount(db,mail,pass,"NorthStar Administrator",null,"owner");
   const householdId=await addHouse(db,uid,"My Blessed Budget",uid);
   await db.prepare("DELETE FROM login_limits WHERE email=?").bind(mail).run();
   await audit(db,{id:uid},householdId,"owner_initialized_at_login");
   return J({ok:true,created_owner:true},200,{"set-cookie":await session(db,uid)});
  }
  if(!user&&mail==="rwyers@gmail.com")return bad("Your administrator account is not created yet. Enter the administrator setup code with your new password to create it.",401);
  const good=user?((await passwordHash(pass,user.salt))===user.password_hash):false;
  if(!good){
   await db.prepare("INSERT INTO login_limits(email,attempts,window_start) VALUES(?,1,?) ON CONFLICT(email) DO UPDATE SET attempts=CASE WHEN ?-window_start>900 THEN 1 ELSE attempts+1 END,window_start=CASE WHEN ?-window_start>900 THEN ? ELSE window_start END").bind(mail,now(),now(),now(),now()).run();
   return bad("Email or password incorrect",401);
  }
  await db.prepare("DELETE FROM login_limits WHERE email=?").bind(mail).run();
  return J({ok:true},200,{"set-cookie":await session(db,user.id)});
 }
 if(p==="/api/auth/logout"&&method==="POST"){
  const m=(req.headers.get("cookie")||"").match(/(?:^|;\s*)__Host-bless_session=([a-f0-9]{48})/);
  if(m)await db.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha(m[1])).run();
  return J({ok:true},200,{"set-cookie":"__Host-bless_session=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0"});
 }
 if(!u)return bad("Please sign in",401);
 if(p==="/api/auth/change-password"&&method==="POST"){
  const b=await bodyJSON(req),old=await db.prepare("SELECT salt,password_hash FROM users WHERE id=?").bind(u.id).first();
  if((await passwordHash(String(b.current||""),old.salt))!==old.password_hash)return bad("Current password incorrect",403);
  const pass=String(b.password||"");if(pass.length<10||!/[A-Za-z]/.test(pass)||!/[0-9]/.test(pass))return bad("Use 10+ characters with letters and numbers");
  const salt=randomString(),hash=await passwordHash(pass,salt);
  await db.prepare("UPDATE users SET salt=?,password_hash=?,must_change=0 WHERE id=?").bind(salt,hash,u.id).run();
  await db.prepare("DELETE FROM sessions WHERE user_id=?").bind(u.id).run();
  return J({ok:true},200,{"set-cookie":await session(db,u.id)});
 }
 if(p==="/api/admin/people"&&method==="GET"){
  if(u.role==="user")return bad("Admin only",403);
  const all=await households(db,u);
  const ids=all.map(x=>x.id);
  const users=u.role==="owner"?(await db.prepare("SELECT id,email,display_name,role,created_by,must_change FROM users ORDER BY created_at DESC").all()).results:(await db.prepare("SELECT DISTINCT u.id,u.email,u.display_name,u.role,u.created_by,u.must_change FROM users u LEFT JOIN household_members hm ON hm.user_id=u.id WHERE u.created_by=? OR hm.household_id IN (SELECT id FROM households WHERE created_by=?) OR hm.household_id IN (SELECT household_id FROM mentor_access WHERE admin_id=?) ORDER BY u.created_at DESC").bind(u.id,u.id,u.id).all()).results;
  const grants=u.role==="owner"?(await db.prepare("SELECT admin_id,household_id FROM mentor_access").all()).results:[];
  return J({users,households:all,grants});
 }
 if(p==="/api/admin/create-user"&&method==="POST"){
  if(u.role==="user")return bad("Admin only",403);
  const b=await bodyJSON(req),mail=email(b.email);
  if(await db.prepare("SELECT 1 ok FROM users WHERE email=?").bind(mail).first())return bad("Email is already registered",409);
  const uid=await addAccount(db,mail,String(b.password||""),b.name,u.id,"user",1);
  const h=await addHouse(db,uid,clean(b.household,90)||clean(b.name,90)+" budget",u.id);
  await audit(db,u,h,"admin_created_user",mail);
  return J({ok:true,id:uid,household_id:h});
 }
 if(p==="/api/admin/reset-password"&&method==="POST"){
  if(u.role==="user")return bad("Admin only",403);
  const b=await bodyJSON(req);
  const target=await db.prepare("SELECT id,role,created_by FROM users WHERE id=?").bind(b.user_id).first();
  if(!target||target.role==="owner"||target.id===u.id)return bad("This password cannot be reset here",403);
  if(u.role!=="owner"&&target.created_by!==u.id)return bad("Only accounts you created can be reset by you",403);
  const pass=String(b.password||"");
  if(pass.length<10||!/[A-Za-z]/.test(pass)||!/[0-9]/.test(pass))return bad("Password needs 10+ characters, letters and numbers");
  const salt=randomString(),hash=await passwordHash(pass,salt);
  await db.batch([
   db.prepare("UPDATE users SET salt=?,password_hash=?,must_change=1 WHERE id=?").bind(salt,hash,target.id),
   db.prepare("DELETE FROM sessions WHERE user_id=?").bind(target.id)
  ]);
  await audit(db,u,null,"password_reset",target.id);
  return J({ok:true});
 }
 if(p==="/api/admin/role"&&method==="POST"){
  if(u.role!=="owner")return bad("Owner only",403);
  const b=await bodyJSON(req);
  if(b.user_id===u.id||!["user","admin"].includes(b.role))return bad("Not allowed");
  await db.prepare("UPDATE users SET role=? WHERE id=? AND role<>'owner'").bind(b.role,b.user_id).run();
  await audit(db,u,null,"role_change",b.user_id+" "+b.role);
  return J({ok:true});
 }
 if(p==="/api/admin/access"&&method==="POST"){
  if(u.role!=="owner")return bad("Owner only",403);
  const b=await bodyJSON(req),v=await db.prepare("SELECT role FROM users WHERE id=?").bind(b.admin_id).first();
  if(v?.role!=="admin")return bad("Choose an admin");
  if(!(await db.prepare("SELECT id FROM households WHERE id=?").bind(b.household_id).first()))return bad("Budget not found",404);
  if(b.grant)await db.prepare("INSERT OR REPLACE INTO mentor_access(admin_id,household_id,granted_by) VALUES(?,?,?)").bind(b.admin_id,b.household_id,u.id).run();
  else await db.prepare("DELETE FROM mentor_access WHERE admin_id=? AND household_id=?").bind(b.admin_id,b.household_id).run();
  await audit(db,u,b.household_id,b.grant?"grant_access":"revoke_access",b.admin_id);
  return J({ok:true});
 }
 const h=url.searchParams.get("household_id")||null;
 let b;
 if(method!=="GET"&&p.startsWith("/api/"))b=await bodyJSON(req).catch(e=>{if(p==="/api/scan")return null;throw e});
 const houseId=h||b?.household_id;
 if(!await inHouse(db,u,houseId))return bad("Budget access denied",403);
 if(p==="/api/dashboard"&&method==="GET")return J(await getDashboard(db,u,houseId,url.searchParams.get("period")||"week",url.searchParams.get("anchor")));
 if(p==="/api/household/settings"&&method==="POST"){
  const offer=pct(b.offering_pct);
  await db.prepare("UPDATE households SET offering_pct=?,name=? WHERE id=?").bind(offer,clean(b.name,90),houseId).run();
  // Only re-price unfinished offerings; completed gifts preserve their recorded amount.
  const undone=(await db.prepare("SELECT g.id,i.gross_cents FROM giving g JOIN income i ON i.id=g.income_id WHERE g.household_id=? AND g.kind='offering' AND g.completed=0").bind(houseId).all()).results;
  await db.batch(undone.map(x=>db.prepare("UPDATE giving SET pct=?,amount_cents=? WHERE id=?").bind(offer,Math.round(x.gross_cents*offer/100),x.id)));
  await audit(db,u,houseId,"settings");
  return J({ok:true});
 }
 if(p==="/api/income"&&method==="POST"){
  const gross=cents(b.gross),net=cents(b.net);
  const incomeId=ID();
  await db.prepare("INSERT INTO income(id,household_id,source,gross_cents,net_cents,paid_at,notes,created_by,attachment_key) VALUES(?,?,?,?,?,?,?,?,?)").bind(incomeId,houseId,clean(b.source,100)||"Income",gross,net,date(b.date),clean(b.notes,300),u.id,clean(b.attachment_key,300)||null).run();
  const house=await db.prepare("SELECT offering_pct FROM households WHERE id=?").bind(houseId).first();
  await db.batch(GIVE.map(([kind,defaultPct])=>{const percent=kind==="offering"?house.offering_pct:defaultPct;return db.prepare("INSERT INTO giving(id,household_id,income_id,kind,pct,amount_cents) VALUES(?,?,?,?,?,?)").bind(ID(),houseId,incomeId,kind,percent,Math.round(gross*percent/100))}));
  await audit(db,u,houseId,"add_income",incomeId);
  return J({ok:true,id:incomeId});
 }
 if(p==="/api/income/delete"&&method==="POST"){
  const row=await db.prepare("SELECT id FROM income WHERE id=? AND household_id=?").bind(b.id,houseId).first();
  if(!row)return bad("Income not found",404);
  await db.batch([db.prepare("DELETE FROM giving WHERE income_id=? AND household_id=?").bind(b.id,houseId),db.prepare("DELETE FROM income WHERE id=? AND household_id=?").bind(b.id,houseId)]);
  await audit(db,u,houseId,"delete_income",b.id);
  return J({ok:true});
 }
 if(p==="/api/giving/complete"&&method==="POST"){
  await db.prepare("UPDATE giving SET completed=?,completed_at=? WHERE id=? AND household_id=?").bind(b.completed?1:0,b.completed?new Date().toISOString():null,b.id,houseId).run();
  await audit(db,u,houseId,"giving_updated",String(b.id));
  return J({ok:true});
 }
 if(p==="/api/category"&&method==="POST"){
  const name=clean(b.name,80);if(!name)return bad("Name required");
  if(b.id){
   await db.prepare("UPDATE categories SET name=?,budget_monthly=? WHERE id=? AND household_id=?").bind(name,cents(b.monthly||0),b.id,houseId).run();
  } else await db.prepare("INSERT INTO categories(id,household_id,name,icon,budget_monthly) VALUES(?,?,?,?,?)").bind(ID(),houseId,name,clean(b.icon,25)||"wallet",cents(b.monthly||0)).run();
  await audit(db,u,houseId,"category_saved",name);
  return J({ok:true});
 }
 if(p==="/api/category/archive"&&method==="POST"){
  await db.prepare("UPDATE categories SET archived=1 WHERE id=? AND household_id=?").bind(b.id,houseId).run();
  await audit(db,u,houseId,"category_archived",b.id);
  return J({ok:true});
 }
 if(p==="/api/expense"&&method==="POST"){
  const id=ID();
  const cat=await db.prepare("SELECT id FROM categories WHERE id=? AND household_id=? AND archived=0").bind(b.category_id||"",houseId).first();
  const items=Array.isArray(b.items)?b.items.slice(0,100).map(x=>({name:clean(x.name,150),qty:Number(x.qty)||1,price:Number(x.price)||0})):[];
  await db.prepare("INSERT INTO expenses(id,household_id,merchant,total_cents,spent_at,category_id,status,items_json,attachment_key,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,houseId,clean(b.merchant,130)||"Expense",cents(b.total),date(b.date),cat?.id||null,b.status==="approved"?"approved":"pending",JSON.stringify(items),clean(b.attachment_key,300)||null,u.id).run();
  await audit(db,u,houseId,"add_expense",id);
  return J({ok:true,id});
 }
 if(p==="/api/expense/update"&&method==="POST"){
  const cat=await db.prepare("SELECT id FROM categories WHERE id=? AND household_id=? AND archived=0").bind(b.category_id||"",houseId).first();
  const ex=await db.prepare("SELECT id FROM expenses WHERE id=? AND household_id=?").bind(b.id,houseId).first();
  if(!ex)return bad("Expense not found",404);
  await db.prepare("UPDATE expenses SET category_id=?,status=?,merchant=COALESCE(?,merchant),total_cents=COALESCE(?,total_cents) WHERE id=? AND household_id=?").bind(cat?.id||null,b.status==="approved"?"approved":"pending",b.merchant===undefined?null:clean(b.merchant,130),b.total===undefined?null:cents(b.total),b.id,houseId).run();
  await audit(db,u,houseId,"expense_updated",b.id);
  return J({ok:true});
 }
 if(p==="/api/expense/delete"&&method==="POST"){
  await db.prepare("DELETE FROM expenses WHERE id=? AND household_id=?").bind(b.id,houseId).run();
  await audit(db,u,houseId,"expense_deleted",b.id);
  return J({ok:true});
 }
 if(p==="/api/household/member"&&method==="POST"){
  const mail=email(b.email);
  if(await db.prepare("SELECT id FROM users WHERE email=?").bind(mail).first())return bad("This email is already registered. Ask the person to create a separate household or contact an admin to arrange access.",409);
  const uid=await addAccount(db,mail,String(b.password||""),b.name,u.id,"user",1);
  await db.prepare("INSERT INTO household_members(household_id,user_id,access) VALUES(?,?,?)").bind(houseId,uid,"editor").run();
  await audit(db,u,houseId,"member_added",mail);
  return J({ok:true});
 }
 if(p==="/api/household/member/remove"&&method==="POST"){
  const m=await db.prepare("SELECT access FROM household_members WHERE household_id=? AND user_id=?").bind(houseId,b.user_id).first();
  if(!m||m.access==="owner")return bad("Cannot remove budget owner",403);
  await db.prepare("DELETE FROM household_members WHERE household_id=? AND user_id=?").bind(houseId,b.user_id).run();
  await audit(db,u,houseId,"member_removed",b.user_id);
  return J({ok:true});
 }
 if(p==="/api/scan"&&method==="POST"){
  return bad("Use multipart file upload",415);
 }
 return bad("Not found",404);
}
async function scan(req,env,u) {
 const db=env.DB,form=await req.formData(),h=String(form.get("household_id")||""),type=String(form.get("type")||"expense");
 if(!await inHouse(db,u,h))return bad("Budget access denied",403);
 if(!["income","expense"].includes(type))return bad("Invalid scan type");
 const file=form.get("file");
 if(!(file instanceof File))return bad("Select a photo");
 if(file.size>7*1024*1024||file.size<50)return bad("Use an image smaller than 7 MB");
 if(!["image/jpeg","image/png","image/webp"].includes(file.type))return bad("JPG, PNG or WebP only");
 const bytes=new Uint8Array(await file.arrayBuffer());
 const key=h+"/"+ID()+"."+(file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg");
 await env.RECEIPTS.put(key,bytes,{httpMetadata:{contentType:file.type}});
 const categories=(await db.prepare("SELECT id,name FROM categories WHERE household_id=? AND archived=0").bind(h).all()).results;
 try{
  const parsed=await scanPhoto(env,bytes,file.type,type,categories);
  if(type==="income"){
   return J({ok:true,attachment_key:key,parsed:{source:clean(parsed.source,100)||"Pay stub",gross:Number(parsed.gross)||0,net:Number(parsed.net)||0,date:date(parsed.date)}});
  }
  const suggested=categories.find(x=>x.name.toLowerCase()===String(parsed.category||"").toLowerCase())||categories.find(x=>x.name==="Other");
  const total=Number(parsed.total);
  if(!Number.isFinite(total)||total<=0)throw Error("Receipt total could not be read");
  const expId=ID();
  const items=Array.isArray(parsed.items)?parsed.items.slice(0,100).map(x=>({name:clean(x.name,150),price:Number(x.price)||0,qty:Number(x.qty)||1})):[];
  await db.prepare("INSERT INTO expenses(id,household_id,merchant,total_cents,spent_at,category_id,status,items_json,attachment_key,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(expId,h,clean(parsed.merchant,130)||"Scanned receipt",cents(total),date(parsed.date),suggested?.id||null,"pending",JSON.stringify(items),key,u.id).run();
  await audit(db,u,h,"receipt_scanned",expId);
  return J({ok:true,expense_id:expId,parsed});
 }catch(e){return J({ok:false,attachment_key:key,error:"Could not reliably scan this photo. Enter the details manually. "+String(e.message||"").slice(0,120)},422)}
}
export default {
 async fetch(req,env) {
  try{
   const url=new URL(req.url),method=req.method;
   if(method==="GET"&&!url.pathname.startsWith("/api/")&&url.pathname!=="/receipt")return new Response(HTML,{headers:{"content-type":"text/html; charset=utf-8","cache-control":"no-store","x-frame-options":"DENY","x-content-type-options":"nosniff","referrer-policy":"no-referrer","content-security-policy":"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'"}});
   const origin=req.headers.get("Origin");
   if(method!=="GET"&&origin&&origin!==url.origin)return bad("Cross-origin request blocked",403);
   if(method!=="GET"&&Number(req.headers.get("content-length")||0)>8000000)return bad("File too large",413);
   const u=await actor(req,env.DB);
   if(url.pathname==="/api/scan"&&method==="POST"){if(!u)return bad("Please sign in",401);return scan(req,env,u)}
   if(url.pathname==="/receipt"&&method==="GET"){
    if(!u)return bad("Sign in",401);
    const key=url.searchParams.get("key")||"";
    const h=key.split("/")[0];
    if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key)||!(await inHouse(env.DB,u,h)))return bad("Access denied",403);
    const obj=await env.RECEIPTS.get(key);if(!obj)return bad("Not found",404);
    return new Response(obj.body,{headers:{"content-type":obj.httpMetadata?.contentType||"image/jpeg","cache-control":"private, no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'none'"}});
   }
   return await route(req,env,u,url);
  }catch(e){return bad(String(e.message||"Unexpected error").slice(0,200),400)}
 }
};