package ca.northstarventures.polariscompanion;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.media.AudioManager;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.graphics.Color;
import android.widget.*;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;

public final class VoiceCall extends Activity {
 private static final String PAGE="https://polaris.northstarventures.ca/companion/voice";
 private static final String CHANNEL="polaris-voice-invites";
 private static final int CALL_NOTICE=48920;
 private static final int AUDIO_PERMISSION=45;
 private WebView web;
 private AudioManager audioManager;
 private int previousMode=AudioManager.MODE_NORMAL;
 private TextView status;

 /** A local incoming VoIP-style invitation; actual remote push requires FCM. */
 public static void ring(Context context,String subject) {
  if(Companion.token(context).isEmpty())return;
  if(Build.VERSION.SDK_INT>=33 && ContextCompat.checkSelfPermission(context,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
  NotificationManager manager=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
  if(manager==null)return;
  if(Build.VERSION.SDK_INT>=26){
   NotificationChannel channel=new NotificationChannel(CHANNEL,"Polaris voice invitations",NotificationManager.IMPORTANCE_HIGH);
   channel.setDescription("Incoming voice chat requests from Polaris");
   channel.enableVibration(true);
   manager.createNotificationChannel(channel);
  }
  Intent answer=new Intent(context,VoiceCall.class).setAction("ANSWER").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
  PendingIntent answerIntent=PendingIntent.getActivity(context,718,answer,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Intent later=new Intent(context,ActionReceiver.class).setAction("REMIND_5");
  PendingIntent laterIntent=PendingIntent.getBroadcast(context,719,later,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Intent ignore=new Intent(context,ActionReceiver.class).setAction("IGNORE");
  PendingIntent ignoreIntent=PendingIntent.getBroadcast(context,720,ignore,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  NotificationCompat.Builder notification=new NotificationCompat.Builder(context,CHANNEL)
    .setSmallIcon(android.R.drawable.sym_action_call)
    .setContentTitle("Polaris is calling")
    .setContentText(subject==null||subject.isEmpty()?"Available for a quick voice conversation?":subject)
    .setStyle(new NotificationCompat.BigTextStyle().bigText("Polaris would like to talk. Answer to start a live AI voice conversation."))
    .setPriority(NotificationCompat.PRIORITY_HIGH)
    .setCategory(NotificationCompat.CATEGORY_CALL)
    .setAutoCancel(true)
    .setContentIntent(answerIntent)
    .addAction(0,"Answer",answerIntent)
    .addAction(0,"Call back in 5 min",laterIntent)
    .addAction(0,"Ignore",ignoreIntent);
  manager.notify(CALL_NOTICE,notification.build());
 }
 public static void schedule(Context context,int minutes){
  int delay=Math.max(1,Math.min(60,minutes));
  AlarmManager alarm=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
  if(alarm==null)return;
  Intent followup=new Intent(context,ActionReceiver.class).setAction("RING_AGAIN");
  PendingIntent pending=PendingIntent.getBroadcast(context,721,followup,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  alarm.setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP,android.os.SystemClock.elapsedRealtime()+delay*60000L,pending);
  NotificationManager nm=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
  if(nm!=null)nm.cancel(CALL_NOTICE);
 }
 public static final class ActionReceiver extends BroadcastReceiver {
  @Override public void onReceive(Context context,Intent intent){
   String action=intent.getAction();
   if("REMIND_5".equals(action))schedule(context,5);
   else if("IGNORE".equals(action)){
    NotificationManager nm=(NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
    if(nm!=null)nm.cancel(CALL_NOTICE);
   }
   else if("RING_AGAIN".equals(action))ring(context,"You asked Polaris to call back.");
  }
 }
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  audioManager=(AudioManager)getSystemService(Context.AUDIO_SERVICE);
  if(audioManager!=null){previousMode=audioManager.getMode();audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);}
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(Color.rgb(5,25,40));
  status=new TextView(this);status.setTextColor(Color.rgb(176,240,224));status.setPadding(16,16,16,12);
  status.setText("Polaris • Voice connection");root.addView(status);
  Button end=new Button(this);end.setText("Hang up");end.setAllCaps(false);
  end.setOnClickListener(v->finish());
  root.addView(end);
  web=new WebView(this);
  LinearLayout.LayoutParams params=new LinearLayout.LayoutParams(-1,0,1);root.addView(web,params);
  setContentView(root);
  if(Companion.token(this).isEmpty()){
   status.setText("This phone isn't paired. Open Polaris Companion first.");return;
  }
  if(ContextCompat.checkSelfPermission(this,Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
   status.setText("Allow the microphone to begin a private conversation.");
   ActivityCompat.requestPermissions(this,new String[]{Manifest.permission.RECORD_AUDIO},AUDIO_PERMISSION);
  }else initWeb();
 }
 private boolean permittedOrigin(Uri uri){
  return uri!=null && "https".equalsIgnoreCase(uri.getScheme())
   && "polaris.northstarventures.ca".equalsIgnoreCase(uri.getHost());
 }
 private void initWeb(){
  WebSettings settings=web.getSettings();
  settings.setJavaScriptEnabled(true);
  settings.setDomStorageEnabled(false);
  settings.setAllowFileAccess(false);
  settings.setAllowContentAccess(false);
  settings.setMediaPlaybackRequiresUserGesture(false);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setSupportMultipleWindows(false);
  if(Build.VERSION.SDK_INT>=26)settings.setSafeBrowsingEnabled(true);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onPermissionRequest(PermissionRequest request){
    if(permittedOrigin(request.getOrigin()) &&
       ContextCompat.checkSelfPermission(VoiceCall.this,Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED){
     for(String resource:request.getResources())
      if(PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)){
       runOnUiThread(()->request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}));return;
      }
    }
    request.deny();
   }
  });
  web.setWebViewClient(new WebViewClient(){
   @Override public void onPageFinished(WebView view,String url){
    Uri uri=Uri.parse(url);
    if(!permittedOrigin(uri)||!"/companion/voice".equals(uri.getPath()))return;
    String token=Companion.token(VoiceCall.this);
    if(token.isEmpty())return;
    view.evaluateJavascript("window.PolarisPhone && window.PolarisPhone.setDeviceToken("+JSONObject.quote(token)+")",null);
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
    Uri uri=request.getUrl();
    if("polarisvoice".equals(uri.getScheme()) && "callback".equals(uri.getHost())){
     int minutes=5;try{minutes=Integer.parseInt(uri.getQueryParameter("minutes"));}catch(Exception ignored){}
     schedule(VoiceCall.this,minutes);
     status.setText("Polaris callback scheduled in "+minutes+" minutes.");
     return true;
    }
    return !permittedOrigin(uri)||!"/companion/voice".equals(uri.getPath());
   }
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error){
    if(request.isForMainFrame())status.setText("Unable to load Polaris voice. Check your connection.");
   }
  });
  status.setText("Connecting to Polaris…");
  web.loadUrl(PAGE);
 }
 @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){
  super.onRequestPermissionsResult(requestCode,permissions,results);
  if(requestCode==AUDIO_PERMISSION){
   if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED)initWeb();
   else status.setText("Microphone permission denied. You can enable it in Android app settings.");
  }
 }
 @Override protected void onDestroy(){
  if(web!=null){
   try{web.evaluateJavascript("window.PolarisPhone && window.PolarisPhone.hangUp()",null);}catch(Exception ignored){}
   web.stopLoading();web.destroy();web=null;
  }
  if(audioManager!=null)audioManager.setMode(previousMode);
  getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  super.onDestroy();
 }
}
