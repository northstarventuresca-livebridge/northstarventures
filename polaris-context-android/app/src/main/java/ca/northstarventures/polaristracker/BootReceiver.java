package ca.northstarventures.polaristracker;

import android.Manifest;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Build;

public final class BootReceiver extends BroadcastReceiver {
 @Override public void onReceive(Context context, Intent intent){
  if(!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction()))return;
  SharedPreferences prefs=context.getSharedPreferences(MainActivity.PREF,Context.MODE_PRIVATE);
  if(!prefs.getBoolean("enabled",false)||prefs.getString("token","").isEmpty())return;
  try{
   if(Build.VERSION.SDK_INT>=23&&context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED)return;
   if(Build.VERSION.SDK_INT>=29&&context.checkSelfPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)!=PackageManager.PERMISSION_GRANTED){
    prefs.edit().putString("last_status","After reboot, open Polaris Context and resume tracking (Allow all the time location permission first)").apply();return;
   }
   Intent service=new Intent(context,TrackerService.class);
   if(Build.VERSION.SDK_INT>=26)context.startForegroundService(service);else context.startService(service);
  }catch(Exception e){
   prefs.edit().putString("last_status","After reboot, open Polaris Context to resume tracking").apply();
  }
 }
}
