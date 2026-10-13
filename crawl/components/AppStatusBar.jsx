import { useEffect, useState } from 'react';
import { AppState, StatusBar as NativeStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { bindStatusBarPolicy, currentStatusBarStyle } from '../lib/statusBarPolicy';
export default function AppStatusBar(){
  const [barStyle,setBarStyle]=useState(currentStatusBarStyle);
  useEffect(()=>bindStatusBarPolicy({appState:AppState,apply:style=>{
    setBarStyle(style);NativeStatusBar.setBarStyle(style,false);
  }}),[]);
  return <StatusBar style={barStyle==='dark-content'?'dark':'light'} />;
}
