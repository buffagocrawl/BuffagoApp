// lib/polyfills.js
import * as Clipboard from 'expo-clipboard';

// Make sure navigator exists
if (typeof global.navigator === 'undefined') {
  global.navigator = {};
}

// Polyfill the web Clipboard API Supabase expects
if (!global.navigator.clipboard) {
  global.navigator.clipboard = {
    writeText: async (text) => Clipboard.setStringAsync(String(text ?? '')),
    readText: async () => Clipboard.getStringAsync(),
  };
}
