// polyfills/clipboard.ts
import * as ExpoClipboard from 'expo-clipboard';
type LegacyClipboard = {
  setString: (value: string) => Promise<void | boolean>;
  getString: () => Promise<string>;
  hasString?: () => Promise<boolean>;
  getStringAsync: () => Promise<string>;
  setStringAsync: (value: string) => Promise<void | boolean>;
};

// Guard: only patch if something tries to use the old API
// Some libs check `global.Clipboard` or `require('react-native').Clipboard`
try {
  // Old pattern some libs look for:
  // @ts-ignore
  const globalWithClipboard = globalThis as typeof globalThis & { Clipboard?: LegacyClipboard };
  if (!globalWithClipboard.Clipboard) {
    // @ts-ignore
    globalWithClipboard.Clipboard = {
      setString: (s: string) => ExpoClipboard.setStringAsync(String(s)),
      getString: () => ExpoClipboard.getStringAsync(),
      // Optional helpers:
      hasString: () => ExpoClipboard.hasStringAsync?.(),
      getStringAsync: () => ExpoClipboard.getStringAsync(),
      setStringAsync: (s: string) => ExpoClipboard.setStringAsync(String(s)),
    };
  }
} catch {}
