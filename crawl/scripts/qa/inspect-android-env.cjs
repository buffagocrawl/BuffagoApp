const fs = require('node:fs');
const files = ['.env.development', '.env.production'];
const env = {};
for (const f of files) {
  env[f] = Object.fromEntries(fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, '')];
  }));
  console.log(f, JSON.stringify(Object.fromEntries(['EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'].map(k => [k, Boolean(env[f][k]?.trim())]))));
}
console.log('development and production same Supabase target', env[files[0]].EXPO_PUBLIC_SUPABASE_URL === env[files[1]].EXPO_PUBLIC_SUPABASE_URL);
for (const f of files) {
  try {
    const claims = JSON.parse(Buffer.from(env[f].EXPO_PUBLIC_SUPABASE_ANON_KEY.split('.')[1], 'base64url').toString());
    console.log(f + ' Supabase key role is anon', claims.role === 'anon');
    console.log(f + ' Supabase key expiry is future', Number(claims.exp) * 1000 > Date.now());
  } catch { console.log(f + ' Supabase key JWT claims unverified'); }
}
const m = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const match = m.match(/android:name="com.google.android.geo.API_KEY"[^>]*android:value="([^"]*)"/);
console.log('native Maps manifest key present', Boolean(match?.[1]));
console.log('native Maps matches configured development key', Boolean(match?.[1]) && match[1] === env[files[0]].EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY);
for (const p of ['expo', 'expo-network', 'expo-video', 'expo-router', 'expo-dev-client', 'react-native']) console.log(p, require(p + '/package.json').version);
