// Read-only public gallery sample; never prints keys or signed image URLs.
import { readFileSync, writeFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
const value = name => env.match(new RegExp(`^${name}\\s*=\\s*["']?([^\\r\\n"']+)`, 'm'))?.[1]?.trim();
const url = value('EXPO_PUBLIC_SUPABASE_URL');
const key = value('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const headers = { apikey:key, Authorization:`Bearer ${key}`, 'Content-Type':'application/json' };
const response = await fetch(`${url}/rest/v1/destinations?select=id,name,city,address,lat,lng,state_id&name=ilike.*Timothy*&limit=5`, {headers});
if (!response.ok) throw new Error(`Public restaurant read failed (${response.status})`);
for (const restaurant of await response.json()) {
  const gallery = await fetch(`${url}/functions/v1/wing-public-gallery`, {method:'POST', headers, body:JSON.stringify({destination_ids:[String(restaurant.id)],include_images:true})});
  if (!gallery.ok) continue;
  const row = (await gallery.json()).restaurants?.[0];
  if (!row?.images?.[0]?.signed_url) continue;
  writeFileSync('tests/fixtures/native-visual/approvedPhoto.local.json', JSON.stringify({restaurant, gallery:row}));
  console.log('Read-only approved community sample available; restaurant association retained.');
  process.exit(0);
}
throw new Error('No public approved sample available');
