package ca.northstarventures.polariscompanion;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.*;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.security.keystore.*;
import android.util.Base64;
import android.widget.*;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.text.SimpleDateFormat;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

public final class Companion extends Activity {
 static final String SERVER="https://polaris.northstarventures.ca",KEY="polaris_companion_aes";
 private LinearLayout layout;private TextView status;private TextToSpeech tts;
 static android.content.SharedPreferences prefs(Context c){return c.getApplicationContext().getSharedPreferences("polaris_companion_private",0);}
 static SecretKey secret() throws Exception {
  KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
  if(!store.containsAlias(KEY)){
   KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
   gen.init(new KeyGenParameterSpec.Builder(KEY,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
   gen.generateKey();
  }
  return ((KeyStore.SecretKeyEntry)store.getEntry(KEY,null)).getSecretKey();
 }
 static void saveToken(Context c,String token)throws Exception{
  Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,secret());
  byte[] encrypted=cipher.doFinal(token.getBytes(StandardCharsets.UTF_8)),iv=cipher.getIV(),data=new byte[iv.length+encrypted.length];
  System.arraycopy(iv,0,data,0,iv.length);System.arraycopy(encrypted,0,data,iv.length,encrypted.length);
  prefs(c).edit().putString("token",Base64.encodeToString(data,Base64.NO_WRAP)).apply();
 }
 static String token(Context c){
  try{
   byte[] raw=Base64.decode(prefs(c).getString("token",""),Base64.NO_WRAP);
   if(raw.length<29)return "";
   Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,secret(),new GCMParameterSpec(128,Arrays.copyOf(raw,12)));
   return new String(cipher.doFinal(Arrays.copyOfRange(raw,12,raw.length)),StandardCharsets.UTF_8);
  }catch(Exception e){return "";}
 }
 static boolean enabled(Context c){return prefs(c).getBoolean("enabled",false);}
 static void enabled(Context c,boolean yes){prefs(c).edit().putBoolean("enabled",yes).apply();}
 static JSONObject api(String path,String token,JSONObject body)throws Exception{
  HttpURLConnection con=(HttpURLConnection)new URL(SERVER+path).openConnection();
  con.setConnectTimeout(6500);con.setReadTimeout(6500);con.setRequestMethod(body==null?"GET":"POST");
  con.setRequestProperty("Accept","application/json");
  if(!token.isEmpty())con.setRequestProperty("Authorization","Bearer "+token);
  if(body!=null){con.setDoOutput(true);con.setRequestProperty("Content-Type","application/json");try(OutputStream out=con.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}}
  int code=con.getResponseCode();InputStream input=code>=400?con.getErrorStream():con.getInputStream();if(input==null)throw new IOException("HTTP "+code);
  ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] bytes=new byte[4096];int n;
  try(input){while((n=input.read(bytes))>=0){if(out.size()>150000)throw new IOException("Response too large");out.write(bytes,0,n);}}
  con.disconnect();JSONObject result=new JSONObject(out.toString("UTF-8"));
  if(code>=400||!result.optBoolean("ok",false))throw new IOException(result.optString("error","Polaris HTTP "+code));
  return result;
 }
 static JSONArray memory(Context c){
  try{
   JSONArray x=api("/api/companion/sync",token(c),null).getJSONArray("entries");
   prefs(c).edit().putString("cache",x.toString()).apply();return x;
  }catch(Exception e){try{return new JSONArray(prefs(c).getString("cache","[]"));}catch(Exception ignored){return new JSONArray();}}
 }
 static String today(){return new SimpleDateFormat("yyyy-MM-dd",Locale.CANADA).format(new Date());}
 static final class Place {
  final String id,name,type;final double lat,lon;
  Place(String i,String n,String t,double a,double b){id=i;name=n;type=t;lat=a;lon=b;}
  static Place from(JSONObject o){return new Place(o.optString("id"),o.optString("name"),o.optString("type"),o.optDouble("lat"),o.optDouble("lon"));}
  JSONObject toJson() throws Exception{return new JSONObject().put("id",id).put("name",name).put("type",type).put("lat",lat).put("lon",lon);}
 }
 static List<Place> places(Context c){
  List<Place> list=new ArrayList<>();
  try{JSONArray arr=new JSONArray(prefs(c).getString("places","[]"));for(int i=0;i<arr.length();i++)list.add(Place.from(arr.getJSONObject(i)));}catch(Exception ignored){}
  return list;
 }
 static void updatePlaces(Context c,List<Place> list){
  JSONArray arr=new JSONArray();for(Place p:list)try{arr.put(p.toJson());}catch(Exception ignored){}
  prefs(c).edit().putString("places",arr.toString()).apply();
 }
 static void addPlace(Context c,String name,String type,double lat,double lon){
  List<Place> list=places(c);if(!type.equals("store"))list.removeIf(p->p.type.equals(type));
  list.add(new Place(UUID.randomUUID().toString(),name,type,lat,lon));updatePlaces(c,list);register(c);
 }
 static boolean permission(Context c){
  return ContextCompat.checkSelfPermission(c,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED &&
   (Build.VERSION.SDK_INT<29||ContextCompat.checkSelfPermission(c,Manifest.permission.ACCESS_BACKGROUND_LOCATION)==PackageManager.PERMISSION_GRANTED);
 }
 static PendingIntent fenceIntent(Context c){
  return PendingIntent.getBroadcast(c,1,new Intent(c,GeofenceReceiver.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_MUTABLE);
 }
 static void clearFences(Context c){try{LocationServices.getGeofencingClient(c).removeGeofences(fenceIntent(c));}catch(Exception ignored){}}
 static void register(Context c){
  if(!enabled(c)||token(c).isEmpty()||!permission(c))return;
  List<Geofence> fences=new ArrayList<>();
  for(Place p:places(c)){
   int type=p.type.equals("home")?Geofence.GEOFENCE_TRANSITION_EXIT:(p.type.equals("store")||p.type.equals("storage"))?Geofence.GEOFENCE_TRANSITION_DWELL:Geofence.GEOFENCE_TRANSITION_ENTER;
   try{fences.add(new Geofence.Builder().setRequestId(p.id).setCircularRegion(p.lat,p.lon,p.type.equals("store")?250:200)
    .setTransitionTypes(type).setLoiteringDelay(120000).setNotificationResponsiveness(120000).setExpirationDuration(Geofence.NEVER_EXPIRE).build());}catch(Exception ignored){}
  }
  try{
   GeofencingClient client=LocationServices.getGeofencingClient(c);
   client.removeGeofences(fenceIntent(c)).addOnCompleteListener(task->{
    if(fences.isEmpty()||!permission(c))return;
    GeofencingRequest request=new GeofencingRequest.Builder().setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER|GeofencingRequest.INITIAL_TRIGGER_DWELL).addGeofences(fences).build();
    try{client.addGeofences(request,fenceIntent(c));}catch(SecurityException ignored){}
   });
  }catch(SecurityException ignored){}
 }
 static void schedule(Context c){
  if(!enabled(c)||token(c).isEmpty()||!SmartContext.morning(c))return;
  Calendar date=Calendar.getInstance();date.set(Calendar.HOUR_OF_DAY,7);date.set(Calendar.MINUTE,0);date.set(Calendar.SECOND,0);date.set(Calendar.MILLISECOND,0);
  if(date.getTimeInMillis()<=System.currentTimeMillis())date.add(Calendar.DAY_OF_YEAR,1);
  AlarmManager alarm=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
  if(alarm!=null)alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,date.getTimeInMillis(),
   PendingIntent.getBroadcast(c,2,new Intent(c,MorningReceiver.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
 }
 static void notifyUser(Context c,String title,String message,String id){notifyUser(c,title,message,id,null);}
 static void notifyUser(Context c,String title,String message,String id,String idsJson){
  if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(c,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
  NotificationManager manager=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);if(manager==null)return;
  if(Build.VERSION.SDK_INT>=26)manager.createNotificationChannel(new NotificationChannel("polaris-reminder","Polaris Reminders",NotificationManager.IMPORTANCE_HIGH));
  Intent open=new Intent(c,Companion.class).putExtra("say",message).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
  NotificationCompat.Builder builder=new NotificationCompat.Builder(c,"polaris-reminder").setSmallIcon(android.R.drawable.ic_popup_reminder)
   .setContentTitle(title).setContentText(message).setStyle(new NotificationCompat.BigTextStyle().bigText(message))
   .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_REMINDER).setAutoCancel(true)
   .setContentIntent(PendingIntent.getActivity(c,5,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
  int unique=message.hashCode();
  Intent talk=new Intent(Intent.ACTION_VIEW,Uri.parse(SERVER+"/")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
  builder.addAction(0,"Talk to Polaris",PendingIntent.getActivity(c,unique^6,talk,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
  if(idsJson!=null&&!idsJson.isEmpty()){
   Intent later=new Intent(c,ActionReceiver.class).setAction("defer").setData(Uri.parse("polaris://defer/"+Integer.toHexString(unique))).putExtra("ids",idsJson);
   builder.addAction(0,"Check again in 3 days",PendingIntent.getBroadcast(c,unique^7,later,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
  }
  if(id!=null){
   Intent done=new Intent(c,ActionReceiver.class).setAction("done").putExtra("id",id);
   builder.addAction(0,"Done",PendingIntent.getBroadcast(c,Math.abs(id.hashCode()),done,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
  }
  manager.notify((int)(System.currentTimeMillis()%300000),builder.build());
 }
 static void fire(Context c,String event,String place){
  if(!enabled(c)||token(c).isEmpty()||!SmartContext.smart(c))return;
  JSONArray records=memory(c);List<JSONObject> hits=new ArrayList<>();
  for(int i=0;i<records.length();i++){
   JSONObject row=records.optJSONObject(i);if(row==null)continue;
   String kind=row.optString("kind"),due=row.optString("due_date"),store=row.optString("store");
   boolean relevant=false;
   if(event.equals("morning")&&kind.equals("bring"))relevant=SmartContext.morning(c)&&due.equals(today());
   if((event.equals("home")||event.equals("jobsite"))&&kind.equals("bring"))relevant=SmartContext.due(row,today());
   if(event.equals("store")&&kind.equals("store")&&!store.isEmpty()){
    String a=store.toLowerCase(Locale.ROOT),b=place.toLowerCase(Locale.ROOT);relevant=(due.isEmpty()||due.compareTo(today())<=0)&&(a.contains(b)||b.contains(a));
   }
   if(event.equals("storage")){
    String a=(store+" "+row.optString("context")+" "+row.optString("item")).toLowerCase(Locale.ROOT);
    relevant=a.contains("storage")||a.contains(place.toLowerCase(Locale.ROOT));
   }
   if(relevant)hits.add(row);
  }
  if(hits.isEmpty()&&event.equals("storage")){SmartContext.storagePrompt(c,place);return;}
  SmartContext.deliver(c,event.equals("storage")?"store":event,place,hits);
 }
 static void doAsync(BroadcastReceiver receiver,Context c,String reason,String place){
  final BroadcastReceiver.PendingResult pending=receiver.goAsync();
  new Thread(()->{try{fire(c,reason,place);}catch(Exception ignored){}finally{pending.finish();}}).start();
 }
 public static final class GeofenceReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context c,Intent intent){
   GeofencingEvent event=GeofencingEvent.fromIntent(intent);
   if(event==null||event.hasError()||event.getTriggeringGeofences()==null)return;
   for(Geofence fence:event.getTriggeringGeofences()){
    for(Place p:places(c))if(p.id.equals(fence.getRequestId())){
     String reason=p.type.equals("store")&&event.getGeofenceTransition()==Geofence.GEOFENCE_TRANSITION_DWELL?"store":
      p.type.equals("storage")&&event.getGeofenceTransition()==Geofence.GEOFENCE_TRANSITION_DWELL?"storage":
      p.type.equals("home")&&event.getGeofenceTransition()==Geofence.GEOFENCE_TRANSITION_EXIT?"home":
      p.type.equals("jobsite")&&event.getGeofenceTransition()==Geofence.GEOFENCE_TRANSITION_ENTER?"jobsite":null;
     if(reason!=null)doAsync(this,c,reason,p.name);
    }
   }
  }
 }
 public static final class MorningReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context c,Intent i){schedule(c);doAsync(this,c,"morning","");}
 }
 public static final class BootReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context c,Intent i){if(enabled(c)){register(c);schedule(c);}}
 }
 public static final class ActionReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context c,Intent i){
   if("done".equals(i.getAction())){
    final BroadcastReceiver.PendingResult pending=goAsync();String id=i.getStringExtra("id");
    new Thread(()->{try{api("/api/companion/complete",token(c),new JSONObject().put("id",id));}catch(Exception ignored){}finally{pending.finish();}}).start();
   }else if("defer".equals(i.getAction())){
    final BroadcastReceiver.PendingResult pending=goAsync();
    String ids=i.getStringExtra("ids");
    new Thread(()->{try{
     JSONArray items=new JSONArray(ids==null?"[]":ids);
     api("/api/companion/defer",token(c),new JSONObject().put("ids",items).put("days",3));
     memory(c);
    }catch(Exception ignored){}finally{pending.finish();}},"PolarisLater").start();
   }else if("snooze".equals(i.getAction())){
    Intent later=new Intent(c,ActionReceiver.class).setAction("show").putExtra("message",i.getStringExtra("message"));
    AlarmManager alarm=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
    if(alarm!=null)alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,SystemClock.elapsedRealtime()+15*60000,
      PendingIntent.getBroadcast(c,7,later,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));
   }else if("show".equals(i.getAction()))notifyUser(c,"Polaris • Reminder",i.getStringExtra("message"),null);
  }
 }
 @Override public void onCreate(Bundle b){
  super.onCreate(b);
  // Start in live conversation by default for paired devices.
  // Only the small gear in VoiceCall opens the existing settings screen.
  boolean openSettings=getIntent()!=null&&getIntent().getBooleanExtra("open_settings",false);
  boolean reminderNotice=getIntent()!=null&&getIntent().hasExtra("say");
  if(!openSettings&&!reminderNotice&&!token(this).isEmpty()){
   startActivity(new Intent(this,VoiceCall.class));
   finish();
   return;
  }
  draw();
  String say=getIntent().getStringExtra("say");
  if(say!=null&&!say.isEmpty())tts=new TextToSpeech(this,ok->{if(ok==TextToSpeech.SUCCESS&&tts!=null){
   tts.setLanguage(Locale.CANADA);tts.setSpeechRate(1.1f);tts.speak(say,TextToSpeech.QUEUE_FLUSH,null,"alert");}});
 }
 TextView text(String words,int size){
  TextView t=new TextView(this);t.setText(words);t.setTextSize(size);t.setTextColor(Color.WHITE);t.setPadding(0,10,0,10);layout.addView(t);return t;
 }
 Button button(String words,Runnable action){Button b=new Button(this);b.setText(words);b.setAllCaps(false);layout.addView(b);b.setOnClickListener(v->action.run());return b;}
 void message(String s){status.setText(s);}
 void draw(){
  ScrollView sc=new ScrollView(this);layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);
  layout.setPadding(25,25,25,30);layout.setBackgroundColor(Color.rgb(8,29,47));sc.addView(layout);setContentView(sc);
  if(!token(this).isEmpty()){
   button("← Back to Polaris conversation",()->{
    startActivity(new Intent(this,VoiceCall.class));
    finish();
   });
  }
  text("✦ Polaris Settings",24);text("Location reminders • Private to this phone",13);
  status=text("",13);status.setTextColor(Color.rgb(125,225,210));
  if(token(this).isEmpty()){
   text("Open Polaris Memory and create a 12-character pairing code.",15);
   EditText entry=new EditText(this);entry.setHint("Pairing code");entry.setHintTextColor(Color.LTGRAY);entry.setTextColor(Color.WHITE);layout.addView(entry);
   button("Pair phone",()->{
    message("Pairing securely…");
    new Thread(()->{
     try{JSONObject body=new JSONObject().put("code",entry.getText().toString().trim()).put("label","Polaris Android");
      JSONObject response=api("/api/companion/claim","",body);saveToken(this,response.getString("token"));
      runOnUiThread(()->{startActivity(new Intent(this,VoiceCall.class));finish();});
     }catch(Exception e){runOnUiThread(()->message("Pairing failed: "+e.getMessage()));}
    }).start();
   });
   button("Open Polaris Memory",()->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(SERVER+"/memory"))));
   return;
  }
  text("✓ Linked to Polaris Memory",15);
  CheckBox on=new CheckBox(this);on.setText("Enable background reminders");on.setTextColor(Color.WHITE);
  on.setChecked(enabled(this));layout.addView(on);
  on.setOnCheckedChangeListener((view,checked)->{enabled(this,checked);if(checked){permissions();register(this);schedule(this);}else clearFences(this);});
  button("Grant / check permissions",this::permissions);
  text("Assistant behaviour",17);
  CheckBox followups=new CheckBox(this);followups.setText("Helpful check-ins (one follow-up, not repeated nags)");followups.setTextColor(Color.WHITE);
  followups.setChecked(SmartContext.smart(this));layout.addView(followups);
  followups.setOnCheckedChangeListener((view,yes)->prefs(this).edit().putBoolean("smart_followups",yes).apply());
  CheckBox storageCheck=new CheckBox(this);storageCheck.setText("Storage: occasionally ask what I need (max weekly)");storageCheck.setTextColor(Color.WHITE);
  storageCheck.setChecked(SmartContext.storage(this));layout.addView(storageCheck);
  storageCheck.setOnCheckedChangeListener((view,yes)->prefs(this).edit().putBoolean("smart_storage",yes).apply());
  CheckBox mornings=new CheckBox(this);mornings.setText("Morning checklist (only items due today)");mornings.setTextColor(Color.WHITE);
  mornings.setChecked(SmartContext.morning(this));layout.addView(mornings);
  mornings.setOnCheckedChangeListener((view,yes)->{
   prefs(this).edit().putBoolean("smart_mornings",yes).apply();
   if(yes)schedule(this);
   else {AlarmManager alarm=(AlarmManager)getSystemService(Context.ALARM_SERVICE);
    if(alarm!=null)alarm.cancel(PendingIntent.getBroadcast(this,2,new Intent(this,MorningReceiver.class),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE));}
  });
  text("Quiet 9 PM–7 AM • Max two proactive prompts daily • No access to texts or cameras.",12);
  text("Saved places (only on this phone)",17);
  List<Place> list=places(this);
  if(list.isEmpty())text("No places yet. Set these when you are physically at each place.",12);
  for(Place p:list)button("📍 "+p.name+" • Remove",()->new AlertDialog.Builder(this).setTitle("Remove "+p.name+"?")
   .setPositiveButton("Remove",(a,b)->{List<Place> all=places(this);all.removeIf(x->x.id.equals(p.id));updatePlaces(this,all);register(this);draw();})
   .setNegativeButton("Cancel",null).show());
  button("Set HOME using current location",()->saveHere("Home","home"));
  button("Set MONICA'S HOUSE using current location",()->saveHere("Monica's House","jobsite"));
  button("Set STORAGE UNIT using current location",()->saveHere("My Storage Unit","storage"));
  EditText name=new EditText(this);name.setHint("Store name e.g. RONA");name.setHintTextColor(Color.LTGRAY);name.setTextColor(Color.WHITE);layout.addView(name);
  button("Set STORE using current location",()->{
   String value=name.getText().toString().trim();if(value.length()<2){message("Enter a store name first.");return;}saveHere(value,"store");
  });
  text("🎙 Polaris Voice Calling",17);
  button("Start a live Polaris conversation",()->startActivity(new Intent(this,VoiceCall.class)));
  button("TEST incoming Polaris call",()->VoiceCall.ring(this,"Would you like to talk now?"));
  text("Answer / Call back in 5 min / Ignore. For this beta, incoming calls can be simulated here; instant remote calls need push notification setup.",12);
  button("TEST notification",()->notifyUser(this,"Polaris • Test","Hey, your Polaris reminders are working.",null));
  button("Sync reminder list",()->new Thread(()->{
   try{JSONArray arr=api("/api/companion/sync",token(this),null).getJSONArray("entries");
     prefs(this).edit().putString("cache",arr.toString()).apply();runOnUiThread(()->message("Synced "+arr.length()+" active reminders."));}
   catch(Exception e){runOnUiThread(()->message("Sync failed: "+e.getMessage()));}
  }).start());
  button("Open Polaris Memory",()->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(SERVER+"/memory"))));
  button("Disconnect phone",()->new AlertDialog.Builder(this).setTitle("Disconnect Polaris?")
   .setPositiveButton("Disconnect",(a,b)->{enabled(this,false);clearFences(this);prefs(this).edit().remove("token").apply();draw();})
   .setNegativeButton("Cancel",null).show());
  message(enabled(this)?"Alerts enabled • morning check around 7 AM":"Enable reminders to register saved places.");
 }
 void saveHere(String name,String type){
  if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){permissions();return;}
  message("Reading GPS location…");
  try{LocationServices.getFusedLocationProviderClient(this).getCurrentLocation(Priority.PRIORITY_HIGH_ACCURACY,null)
    .addOnSuccessListener(loc->{
     if(loc==null||loc.getAccuracy()>150){message("Location not accurate. Try again outside.");return;}
     addPlace(this,name,type,loc.getLatitude(),loc.getLongitude());draw();message("Saved "+name+" locally.");
    }).addOnFailureListener(e->message("Location unavailable."));}
  catch(SecurityException e){message("Location permission is required.");}
 }
 void permissions(){
  if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
   ActivityCompat.requestPermissions(this,new String[]{Manifest.permission.POST_NOTIFICATIONS},10);return;
  }
  if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
   ActivityCompat.requestPermissions(this,new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},11);return;
  }
  if(Build.VERSION.SDK_INT>=29&&ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_BACKGROUND_LOCATION)!=PackageManager.PERMISSION_GRANTED){
   message("Settings → Permissions → Location → Allow all the time; then return to this app.");
   startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName())));return;
  }
  register(this);schedule(this);message("Permissions checked; saved places can trigger alerts.");
 }
 @Override public void onRequestPermissionsResult(int code,String[] perms,int[] grants){
  super.onRequestPermissionsResult(code,perms,grants);
  if(grants.length>0&&grants[0]==PackageManager.PERMISSION_GRANTED)permissions();
  else message("Permission denied; background alerts require your approval.");
 }
 @Override protected void onResume(){super.onResume();if(enabled(this)){register(this);schedule(this);}}
 @Override protected void onDestroy(){if(tts!=null)tts.shutdown();super.onDestroy();}
}
