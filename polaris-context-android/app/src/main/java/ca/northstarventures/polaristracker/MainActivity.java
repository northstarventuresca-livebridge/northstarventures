package ca.northstarventures.polaristracker;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.graphics.Color;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONObject;
import org.json.JSONArray;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public final class MainActivity extends Activity {
 static final String PREF="polaris_context_private";
 static final String BASE="https://polaris.northstarventures.ca";
 SharedPreferences prefs;
 TextView status;
 EditText code, note;
 @Override public void onCreate(Bundle b){
  super.onCreate(b);prefs=getSharedPreferences(PREF,MODE_PRIVATE);
  ScrollView scroll=new ScrollView(this);
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);
  root.setPadding(38,42,38,40);root.setBackgroundColor(Color.rgb(5,22,37));
  scroll.addView(root);setContentView(scroll);
  addText(root,"POLARIS CONTEXT",27,Color.rgb(101,238,202));
  addText(root,"Private background GPS and daily activity awareness",17,Color.WHITE);
  addText(root,"Runs separately from your existing Polaris voice app. GPS tracking starts only when you press Start. Location events go to your private Polaris database.",14,0xffbbd2df);
  status=addText(root,"",15,0xff88dfca);
  addText(root,"Step 1 · Pair this phone",19,Color.WHITE);
  addText(root,"In Polaris, open Memory and create a 10-minute companion pairing code. Enter that code here once.",14,0xffbbd2df);
  code=new EditText(this);code.setSingleLine(true);code.setHint("12-character pairing code");code.setTextColor(Color.WHITE);code.setHintTextColor(0xff7e9cb0);root.addView(code);
  addButton(root,"Pair with Polaris",()->pair());
  addText(root,"Step 2 · Enable tracking",19,Color.WHITE);
  addButton(root,"Start background GPS",()->startTracking());
  addButton(root,"Stop tracking",()->stopTracking());
  addButton(root,"Allow location all the time (Android settings)",()->{
   Intent i=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:"+getPackageName()));startActivity(i);
  });
  addText(root,"Quick manual note",19,Color.WHITE);
  note=new EditText(this);note.setHint("What did you just work on or remember?");note.setTextColor(Color.WHITE);note.setHintTextColor(0xff7e9cb0);root.addView(note);
  addButton(root,"Save observation to Polaris",()->saveNote());
  addButton(root,"Refresh status",()->refresh());
  addButton(root,"Open Polaris Places",()->startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(BASE+"/places"))));
  addText(root,"Collected signals: places visited, GPS fixes, basic movement estimates, battery level, network type and notes you explicitly add. No background microphone or camera recording. GPS events expire after 30 days, other events after 365 days.",13,0xff9cb9c9);
  refresh();
 }
 TextView addText(LinearLayout layout,String s,int sp,int color){
  TextView t=new TextView(this);t.setText(s);t.setTextSize(sp);t.setTextColor(color);t.setPadding(0,12,0,14);layout.addView(t);return t;
 }
 void addButton(LinearLayout layout,String s,Runnable fn){
  Button b=new Button(this);b.setText(s);b.setAllCaps(false);layout.addView(b);b.setOnClickListener(v->fn.run());
 }
 void pair(){
  final String pairing=code.getText().toString().replace("-","").replace(" ","").toUpperCase().trim();
  if(pairing.length()!=12){status.setText("Enter a valid 12-character pairing code.");return;}
  status.setText("Pairing...");
  new Thread(()->{
   try{
    JSONObject req=new JSONObject().put("code",pairing).put("label","Polaris Context GPS · Android");
    JSONObject result=TrackerService.postJson(BASE+"/api/companion/claim",req,null);
    String token=result.optString("token","");
    if(token.length()<32)throw new Exception(result.optString("error","Pairing failed"));
    prefs.edit().putString("token",token).apply();
    runOnUiThread(()->{code.setText("");refresh();status.setText("Paired. You can now start GPS tracking.");});
   }catch(Exception e){runOnUiThread(()->status.setText("Pairing failed: "+e.getMessage()));}
  }).start();
 }
 void startTracking(){
  if(prefs.getString("token","").isEmpty()){status.setText("Pair this device first.");return;}
  if(Build.VERSION.SDK_INT>=23 && checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
   requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},71);return;
  }
  if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)
   requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},72);
  prefs.edit().putBoolean("enabled",true).apply();
  Intent intent=new Intent(this,TrackerService.class);
  try{
   if(Build.VERSION.SDK_INT>=26)startForegroundService(intent);else startService(intent);
   status.setText("Starting background tracking…");
  }catch(Exception e){prefs.edit().putBoolean("enabled",false).apply();status.setText("Unable to start tracking: "+e.getMessage());}
 }
 void stopTracking(){
  prefs.edit().putBoolean("enabled",false).apply();
  stopService(new Intent(this,TrackerService.class));refresh();
 }
 @Override public void onRequestPermissionsResult(int request,String[] names,int[] granted){
  super.onRequestPermissionsResult(request,names,granted);
  if(request==71){
   if(granted.length>0&&granted[0]==PackageManager.PERMISSION_GRANTED)startTracking();
   else status.setText("Precise location permission is needed for background GPS.");
  }
 }
 void saveNote(){
  if(prefs.getString("token","").isEmpty()){status.setText("Pair first.");return;}
  String text=note.getText().toString().trim();
  if(text.isEmpty())return;
  try{
   JSONObject e=new JSONObject().put("id",UUID.randomUUID().toString()).put("kind","manual_note").put("observed_ms",System.currentTimeMillis()).put("details",new JSONObject().put("text",text));
   TrackerService.addEvent(this,e);note.setText("");status.setText("Note stored locally; syncing when connected.");
   TrackerService.syncSoon(this);
  }catch(Exception e){status.setText("Could not save note: "+e.getMessage());}
 }
 void refresh(){
  String token=prefs.getString("token","");
  String last=prefs.getString("last_status","No location updates received yet");
  String queue=prefs.getString("queue","[]");
  int pending=0;try{pending=new JSONArray(queue).length();}catch(Exception ignored){}
  status.setText("Paired: "+(!token.isEmpty()?"yes":"no")+" · Tracking requested: "+prefs.getBoolean("enabled",false)
   +"\nLast activity: "+last+"\nPending offline events: "+pending);
 }
 @Override protected void onResume(){super.onResume();if(status!=null)refresh();}
}
