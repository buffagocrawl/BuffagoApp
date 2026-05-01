// polyfills/clipboard.ts
import * as ExpoClipboard from 'expo-clipboard';
import { Platform } from 'react-native';

// Guard: only patch if something tries to use the old API
// Some libs check `global.Clipboard` or `require('react-native').Clipboard`
try {
  // Old pattern some libs look for:
  // @ts-ignore
  if (!global.Clipboard) {
    // @ts-ignore
    global.Clipboard = {
      setString: (s: string) => ExpoClipboard.setStringAsync(String(s)),
      getString: () => ExpoClipboard.getStringAsync(),
      // Optional helpers:
      hasString: () => ExpoClipboard.hasStringAsync?.(),
      getStringAsync: () => ExpoClipboard.getStringAsync(),
      setStringAsync: (s: string) => ExpoClipboard.setStringAsync(String(s)),
    };
  }
} catch {}
