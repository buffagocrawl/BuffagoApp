package com.buffago.polishqa;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;

/** Local emulator QA only. Injects two simultaneous touchscreen pointers.
 * No networking, storage reads, app API calls, or production operations. */
public class PinchInstrumentation extends Instrumentation {
  private Bundle arguments;
  private UiAutomation automation;
  private long downTime;
  @Override public void onCreate(Bundle args) { arguments=args; start(); }
  private void send(int action, int count, float centerX, float centerY, float span) {
    MotionEvent.PointerProperties[] properties=new MotionEvent.PointerProperties[count];
    MotionEvent.PointerCoords[] coords=new MotionEvent.PointerCoords[count];
    for(int i=0;i<count;i++) {
      properties[i]=new MotionEvent.PointerProperties();properties[i].id=i;properties[i].toolType=MotionEvent.TOOL_TYPE_FINGER;
      coords[i]=new MotionEvent.PointerCoords();coords[i].x=centerX+(i==0?-span/2:span/2);coords[i].y=centerY;
      coords[i].pressure=1;coords[i].size=1;
    }
    MotionEvent event=MotionEvent.obtain(downTime,SystemClock.uptimeMillis(),action,count,properties,coords,0,0,1,1,0,0,InputDevice.SOURCE_TOUCHSCREEN,0);
    boolean injected=automation.injectInputEvent(event,true);event.recycle();
    if(!injected) throw new IllegalStateException("Touch injection rejected");
  }
  @Override public void onStart() {
    Bundle result=new Bundle();
    try {
      automation=getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
      float x=Float.parseFloat(arguments.getString("x"));float y=Float.parseFloat(arguments.getString("y"));
      float from=Float.parseFloat(arguments.getString("from","180"));float to=Float.parseFloat(arguments.getString("to","540"));
      SystemClock.sleep(300);downTime=SystemClock.uptimeMillis();
      send(MotionEvent.ACTION_DOWN,1,x,y,from);SystemClock.sleep(50);
      send(MotionEvent.ACTION_POINTER_DOWN|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),2,x,y,from);
      for(int i=1;i<=30;i++){SystemClock.sleep(25);send(MotionEvent.ACTION_MOVE,2,x,y,from+(to-from)*i/30);}
      send(MotionEvent.ACTION_POINTER_UP|(1<<MotionEvent.ACTION_POINTER_INDEX_SHIFT),2,x,y,to);
      SystemClock.sleep(50);send(MotionEvent.ACTION_UP,1,x,y,to);
      result.putString("result","two-pointer pinch injected");finish(0,result);
    } catch(Throwable failure) {result.putString("error",failure.toString());finish(1,result);}
  }
}
