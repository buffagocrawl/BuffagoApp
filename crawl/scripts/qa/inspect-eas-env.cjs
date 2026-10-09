const { execFileSync } = require('node:child_process');
try {
  const output = execFileSync('cmd.exe', ['/d', '/c', 'eas env:list development --format short'], { encoding: 'utf8', timeout: 45000, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const name of ['EXPO_PUBLIC_GOOGLE_ANDROID_API_KEY', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY']) console.log(name + ' listed in EAS development: ' + output.includes(name));
  console.log('EAS development listing succeeded; values intentionally suppressed.');
} catch (error) {
  console.log('EAS development listing unavailable; status=' + error.status + '; timedOut=' + (error.code === 'ETIMEDOUT'));
}
