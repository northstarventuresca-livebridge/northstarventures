package ca.northstarventures.polaristracker;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.location.*;
import android.os.*;
import android.net.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public final class TrackerService extends Service implements LocationListener {
 static final Object LOCK=new Object();
 static volatile TrackerService active;
 SharedPreferences prefs;
 LocationManager locations;
 final ScheduledExecutorService executor=Executors.newSingleThreadScheduledExecutor();
 boolean running=false;
 long lastGps=0,lastMotion=0;
 String motion="";
 @Override public void onCreate(){
  super.onCreate();prefs=getSharedPreferences(MainActivity.PREF,MODE_PRIVATE);active=this;
  NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
  if(Build.VERSION.SDK_INT>=26){nm.createNotificationChannel(new NotificationChannel("polaris-gps","Polaris GPS tracking",NotificationManager.IMPORTANCE_LOW));nm.createNotificationChannel(new NotificationChannel("polaris-nudges","Polaris follow-ups",NotificationManager.IMPORTANCE_DEFAULT));}
  Notification foreground=notification("Polaris is tracking your location","polaris-gps",true);
  if(Build.VERSION.SDK_INT>=29)startForeground(3301,foreground,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
  else startForeground(3301,foreground);
 }
 @Override public int onStartCommand(Intent intent,int flags,int startId){
  if(running)return START_STICKY;
  if(!prefs.getBoolean("enabled",false)||token().isEmpty()){stopSelf();return START_NOT_STICKY;}
  if(Build.VERSION.SDK_INT>=23&&checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){stopSelf();return START_NOT_STICKY;}
  locations=(LocationManager)getSystemService(LOCATION_SERVICE);
  int count=0;
  for(String source:new String[]{LocationManager.GPS_PROVIDER,LocationManager.NETWORK_PROVIDER}){
   try{if(locations.isProviderEnabled(source)){locations.requestLocationUpdates(source,60000,40,this,Looper.getMainLooper());count++;}}catch(Exception ignored){}
  }
  if(count==0){prefs.edit().putString("last_status","GPS services unavailable").apply();stopSelf();return START_NOT_STICKY;}
  running=true;
  prefs.edit().putString("last_status","Tracking started").apply();
  executor.scheduleWithFixedDelay(()->{try{recordVitals();syncBatch(this,token());pollFollowups();}catch(Exception ignored){}},0,120,TimeUnit.SECONDS);
  return START_STICKY;
 }
 String token(){return prefs.getString("token","");}
 static JSONObject event(String kind,JSONObject details) throws Exception{return new JSONObject().put("id",UUID.randomUUID().toString()).put("kind",kind).put("observed_ms",System.currentTimeMillis()).put("details",details);}
 static void addEvent(Context ctx,JSONObject event){
  synchronized(LOCK){
   SharedPreferences p=ctx.getSharedPreferences(MainActivity.PREF,MODE_PRIVATE);
   JSONArray a;try{a=new JSONArray(p.getString("queue","[]"));}catch(Exception e){a=new JSONArray();}
   a.put(event);
   if(a.length()>400){JSONArray b=new JSONArray();for(int i=a.length()-400;i<a.length();i++)b.put(a.opt(i));a=b;}
   p.edit().putString("queue",a.toString()).commit();
  }
 }
 static void syncSoon(Context ctx){
  TrackerService s=active;
  if(s!=null&&s.running)s.executor.execute(()->syncBatch(ctx,s.token()));
  else new Thread(()->syncBatch(ctx,ctx.getSharedPreferences(MainActivity.PREF,MODE_PRIVATE).getString("token",""))).start();
 }
 static void syncBatch(Context ctx,String token){
  if(token.isEmpty())return;
  JSONArray pending;
  synchronized(LOCK){
   JSONArray all;
   try{all=new JSONArray(ctx.getSharedPreferences(MainActivity.PREF,MODE_PRIVATE).getString("queue","[]"));}catch(Exception e){return;}
   pending=new JSONArray();for(int i=0;i<Math.min(all.length(),25);i++)pending.put(all.opt(i));
  }
  if(pending.length()==0)return;
  try{
   JSONObject result=postJson(MainActivity.BASE+"/api/companion/events",new JSONObject().put("events",pending),token);
   if(!result.optBoolean("ok"))return;
   synchronized(LOCK){
    SharedPreferences p=ctx.getSharedPreferences(MainActivity.PREF,MODE_PRIVATE);
    JSONArray all=new JSONArray(p.getString("queue","[]")),left=new JSONArray();
    for(int i=pending.length();i<all.length();i++)left.put(all.opt(i));
    p.edit().putString("queue",left.toString()).commit();
   }
  }catch(Exception e){/* Offline observations stay queued */ }
 }
 @Override public void onLocationChanged(Location location){
  if(!running||location==null||!location.hasAccuracy()||location.getAccuracy()>150)return;
  long now=System.currentTimeMillis();if(now-lastGps<25000)return;lastGps=now;
  try{
   JSONObject d=new JSONObject().put("lat",location.getLatitude()).put("lon",location.getLongitude()).put("accuracy_m",location.getAccuracy()).put("provider",location.getProvider());
   if(location.hasSpeed())d.put("speed_mps",location.getSpeed());
   addEvent(this,event("gps_fix",d));
   String next=location.hasSpeed()?(location.getSpeed()>5?"vehicle":location.getSpeed()>1.3?"walking":"still"):"unknown";
   if(!next.equals(motion)||now-lastMotion>1800000){addEvent(this,event("activity",new JSONObject().put("estimate",next).put("confidence","speed_estimate_only")));motion=next;lastMotion=now;}
   prefs.edit().putString("last_status","GPS recorded "+new Date(now)).apply();
  }catch(Exception ignored){}
  executor.execute(()->{
   try{
    JSONObject ping=new JSONObject().put("lat",location.getLatitude()).put("lon",location.getLongitude()).put("accuracy_m",location.getAccuracy()).put("sampled_at_ms",now);
    postJson(MainActivity.BASE+"/api/companion/location",ping,token());
    prefs.edit().putString("last_status","GPS synced "+new Date(now)).apply();
   }catch(Exception e){prefs.edit().putString("last_status","GPS queued offline "+new Date(now)).apply();}
   syncBatch(this,token());
  });
 }
 void recordVitals(){
  try{
   BatteryManager b=(BatteryManager)getSystemService(BATTERY_SERVICE);
   int level=b.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY);
   if(level>=0&&level<=100)addEvent(this,event("battery",new JSONObject().put("percent",level)));
   ConnectivityManager cm=(ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
   String type="offline";
   if(Build.VERSION.SDK_INT>=23){NetworkCapabilities c=cm.getNetworkCapabilities(cm.getActiveNetwork());if(c!=null)type=c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)?"wifi":c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)?"cellular":"other";}
   addEvent(this,event("network",new JSONObject().put("type",type)));
   addEvent(this,event("device_status",new JSONObject().put("gps_running",running)));
  }catch(Exception ignored){}
 }
 void pollFollowups(){
  try{
   JSONObject r=getJson(MainActivity.BASE+"/api/geo/activity",token());
   JSONArray list=r.optJSONArray("nudges");if(list==null)return;
   Calendar c=Calendar.getInstance(TimeZone.getTimeZone("America/Edmonton"));
   int hour=c.get(Calendar.HOUR_OF_DAY);if(hour>=21||hour<7)return;
   NotificationManager mgr=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
   for(int i=0;i<Math.min(5,list.length());i++){
    JSONObject n=list.optJSONObject(i);if(n==null)continue;
    String id=n.optString("id");String key="notified_"+id;
    if(id.isEmpty()||prefs.getBoolean(key,false))continue;
    mgr.notify(Math.abs(id.hashCode()),notification(n.optString("message","Polaris follow-up"),"polaris-nudges",false));
    prefs.edit().putBoolean(key,true).apply();
   }
  }catch(Exception ignored){}
 }
 Notification notification(String text,String channel,boolean ongoing){
  Intent i=new Intent(this,MainActivity.class);
  int flags=PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0);
  PendingIntent pi=PendingIntent.getActivity(this,ongoing?33:34,i,flags);
  Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,channel):new Notification.Builder(this);
  return b.setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle(ongoing?"Polaris Background GPS":"Polaris reminder")
   .setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text)).setContentIntent(pi).setOngoing(ongoing).setAutoCancel(!ongoing).build();
 }
 @Override public void onDestroy(){
  running=false;active=null;
  try{if(locations!=null)locations.removeUpdates(this);}catch(Exception ignored){}
  executor.shutdownNow();super.onDestroy();
 }
 @Override public IBinder onBind(Intent intent){return null;}
 static JSONObject getJson(String endpoint,String token)throws Exception{return request(endpoint,null,token);}
 static JSONObject postJson(String endpoint,JSONObject input,String token)throws Exception{return request(endpoint,input,token);}
 static JSONObject request(String endpoint,JSONObject input,String token)throws Exception{
  HttpURLConnection conn=(HttpURLConnection)new URL(endpoint).openConnection();
  conn.setConnectTimeout(12000);conn.setReadTimeout(15000);conn.setRequestProperty("Accept","application/json");
  if(token!=null&&!token.isEmpty())conn.setRequestProperty("Authorization","Bearer "+token);
  if(input!=null){conn.setRequestMethod("POST");conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");try(OutputStream out=conn.getOutputStream()){out.write(input.toString().getBytes(StandardCharsets.UTF_8));}}
  int status=conn.getResponseCode();InputStream data=status>=400?conn.getErrorStream():conn.getInputStream();
  if(data==null){conn.disconnect();throw new Exception("HTTP "+status);}
  ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buf=new byte[2048];int n;
  try(InputStream stream=data){while((n=stream.read(buf))!=-1){out.write(buf,0,n);if(out.size()>200000)break;}}
  conn.disconnect();JSONObject json=new JSONObject(out.toString("UTF-8"));
  if(status>=400)throw new Exception(json.optString("error","HTTP "+status));
  return json;
 }
}
