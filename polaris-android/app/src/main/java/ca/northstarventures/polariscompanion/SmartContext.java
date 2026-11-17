package ca.northstarventures.polariscompanion;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;
import java.util.StringJoiner;
import java.util.UUID;

/**
 * A conservative, opt-in context layer on top of the existing location reminders.
 * No raw GPS, text messages, health data or camera imagery is transmitted here.
 */
public final class SmartContext {
 private SmartContext() {}
 static boolean smart(Context c){return Companion.prefs(c).getBoolean("smart_followups",true);}
 static boolean morning(Context c){return Companion.prefs(c).getBoolean("smart_mornings",false);}
 static boolean storage(Context c){return Companion.prefs(c).getBoolean("smart_storage",false);}
 static boolean quiet(){
  Calendar c=Calendar.getInstance();
  int hour=c.get(Calendar.HOUR_OF_DAY);
  return hour<7||hour>=21;
 }
 static String day(){return Companion.today();}
 static String key(String text){return text.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]","").substring(0,Math.min(50,text.replaceAll("[^a-z0-9]","").length()));}
 static boolean notifiedToday(Context c,String id){
  long last=Companion.prefs(c).getLong("smart_item_time_"+id,0);
  return last>0&&System.currentTimeMillis()-last<3L*24*60*60*1000;
 }
 static void markNotified(Context c,List<JSONObject> rows){
  android.content.SharedPreferences.Editor edit=Companion.prefs(c).edit();
  for(JSONObject row:rows)edit.putLong("smart_item_time_"+row.optString("id"),System.currentTimeMillis());
  int total=Companion.prefs(c).getInt("smart_count_"+day(),0);
  edit.putInt("smart_count_"+day(),total+1).apply();
 }
 static boolean hasQuota(Context c){
  return Companion.prefs(c).getInt("smart_count_"+day(),0)<2;
 }
 static boolean due(JSONObject item,String today){
  String date=item.optString("due_date");
  return !date.isEmpty()&&date.compareTo(today)<=0;
 }
 static void deliver(Context c,String event,String place,List<JSONObject> found){
  if(!Companion.enabled(c)||!smart(c)||quiet()||!hasQuota(c))return;
  if(event.equals("morning")&&!morning(c))return;
  List<JSONObject> active=new ArrayList<>();
  for(JSONObject item:found){
   String id=item.optString("id");
   if(!id.isEmpty()&&!notifiedToday(c,id))active.add(item);
  }
  if(active.isEmpty())return;
  StringJoiner details=new StringJoiner("; ");
  JSONArray idList=new JSONArray();
  for(JSONObject item:active){
   details.add(item.optString("item"));
   idList.put(item.optString("id"));
  }
  String title=event.equals("store")?"Polaris • "+place:
   event.equals("home")?"Polaris • Before you leave":
   event.equals("jobsite")?"Polaris • At the job site":"Polaris • Today's plan";
  String content=event.equals("store")?"While you're at "+place+", you wanted to: "+details+"."
   :event.equals("home")?"Before you head out, did you remember: "+details+"?"
   :event.equals("jobsite")?"While you're here, remember: "+details+"."
   :"Your bring list for today: "+details+".";
  Companion.notifyUser(c,title,content,active.size()==1?active.get(0).optString("id"):null,idList.toString());
  markNotified(c,active);
  if(event.equals("morning")||event.equals("home")||event.equals("jobsite"))
   scheduleOneCheckIn(c,idList,details.toString());
 }
 static void storagePrompt(Context c,String label){
  if(!Companion.enabled(c)||!smart(c)||!storage(c)||quiet()||!hasQuota(c))return;
  String id=key(label),k="smart_storage_prompt_"+id;
  long last=Companion.prefs(c).getLong(k,0);
  if(System.currentTimeMillis()-last<7L*24*60*60*1000)return;
  Companion.notifyUser(c,"Polaris • Storage visit",
   "You're at "+label+". Anything you meant to pick up for the church or Monica's House?",null,null);
  Companion.prefs(c).edit().putLong(k,System.currentTimeMillis()).putInt("smart_count_"+day(),Companion.prefs(c).getInt("smart_count_"+day(),0)+1).apply();
 }
 static void scheduleOneCheckIn(Context c,JSONArray ids,String description){
  if(ids.length()==0)return;
  String uuid=UUID.randomUUID().toString();
  Intent intent=new Intent(c,CheckInReceiver.class).setAction("CHECK_IN").setData(android.net.Uri.parse("polaris://checkin/"+uuid));
  intent.putExtra("ids",ids.toString());
  intent.putExtra("description",description);
  PendingIntent pending=PendingIntent.getBroadcast(c,uuid.hashCode(),intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  AlarmManager alarms=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
  if(alarms!=null)alarms.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,SystemClock.elapsedRealtime()+3L*60*60*1000,pending);
 }
 static void checkIn(Context c,String idsJson){
  if(!Companion.enabled(c)||!smart(c))return;
  try{
   JSONArray list=new JSONArray(idsJson==null?"[]":idsJson);
   if(list.length()==0)return;
   JSONArray live;
   try{
    JSONObject latest=Companion.api("/api/companion/sync",Companion.token(c),null);
    live=latest.getJSONArray("entries");
    Companion.prefs(c).edit().putString("cache",live.toString()).apply();
   }catch(Exception offline){return;} // Don't claim a task is unfinished without current server confirmation.
   List<JSONObject> remaining=new ArrayList<>();
   for(int i=0;i<live.length();i++){
    JSONObject item=live.optJSONObject(i);if(item==null)continue;
    for(int j=0;j<list.length();j++)if(item.optString("id").equals(list.optString(j))&&
      (item.optString("due_date").isEmpty()||item.optString("due_date").compareTo(day())<=0))remaining.add(item);
   }
   if(remaining.isEmpty())return; // A done item is no longer in the active Polaris list.
   if(quiet())return; // No waking users at night for a casual check-in.
   String batchKey="smart_checkin_"+day()+"_"+list.toString().hashCode();
   if(Companion.prefs(c).getBoolean(batchKey,false))return;
   StringJoiner names=new StringJoiner("; ");
   JSONArray remainingIds=new JSONArray();
   for(JSONObject item:remaining){names.add(item.optString("item"));remainingIds.put(item.optString("id"));}
   String message="Quick check: did you get "+names+"? I haven't heard whether "+(remaining.size()==1?"it's":"they're")+" done. Tap Done, or ask me again in three days.";
   Companion.notifyUser(c,"Polaris • Quick check-in",message,remaining.size()==1?remaining.get(0).optString("id"):null,remainingIds.toString());
   Companion.prefs(c).edit().putBoolean(batchKey,true).apply();
  }catch(Exception ignored){}
 }
 public static final class CheckInReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context c,Intent i){
   final PendingResult finish=goAsync();
   String ids=i.getStringExtra("ids");
   new Thread(()->{try{checkIn(c,ids);}finally{finish.finish();}},"PolarisFollowup").start();
  }
 }
}
