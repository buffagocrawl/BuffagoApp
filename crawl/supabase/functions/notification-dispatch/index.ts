/* eslint-disable import/no-unresolved */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
const client = createClient(supabaseUrl, serviceKey);

const copy = {
  streak_at_risk: { title: 'Your wing streak is still alive', body: 'One rating, battle vote, or crawl stop keeps it going.' },
  friend_rating: { title: 'Fresh wing intel from a friend', body: 'A friend rated a wing spot. See what made the plate.' },
  crawl_proximity: { title: 'Your next crawl stop is nearby', body: 'Continue your Buffalo Wing Crawl when you’re ready.' },
};

async function expoSend(messages: unknown[]) {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(expoAccessToken ? { Authorization: `Bearer ${expoAccessToken}` } : {}) },
    body: JSON.stringify(messages),
  });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  const secret = Deno.env.get('NOTIFICATION_DISPATCH_SECRET');
  if (secret && request.headers.get('x-dispatch-secret') !== secret) return new Response('unauthorized', { status: 401 });

  await client.rpc('queue_streak_at_risk_notifications');
  const { data: events, error } = await client.from('notification_outbox').select('id,user_id,event_type,deep_link,copy_data').in('status', ['queued', 'retry']).lte('next_attempt_at', new Date().toISOString()).limit(100) as { data: any[] | null, error: unknown };
  if (error) return Response.json({ ok: false, error: 'outbox_read_failed' }, { status: 500 });

  const results = [];
  for (const event of events ?? []) {
    const { data: eligibility, error: eligibilityError } = await client.rpc('notification_delivery_eligibility', { p_outbox_id: event.id });
    if (eligibilityError || !eligibility?.eligible) {
      await client.from('notification_outbox').update({ status: 'suppressed', suppression_reason: eligibility?.reason ?? 'eligibility_error' }).eq('id', event.id);
      results.push({ id: event.id, status: 'suppressed', reason: eligibility?.reason ?? 'eligibility_error' });
      continue;
    }
    const { data: installations } = await client.from('push_installations').select('id,expo_push_token').eq('user_id', event.user_id).in('permission_status', ['granted', 'provisional']).is('invalidated_at', null).is('disabled_at', null);
    const tokens = (installations ?? []).map((x: any) => x.expo_push_token).filter(Boolean);
    if (!tokens.length) { await client.from('notification_outbox').update({ status: 'suppressed', suppression_reason: 'no_valid_installation' }).eq('id', event.id); results.push({ id: event.id, status: 'suppressed', reason: 'no_valid_installation' }); continue; }
    const message = copy[event.event_type as keyof typeof copy];
    const provider = await expoSend(tokens.map((to: string) => ({ to, title: message?.title ?? 'BuffaGo', body: message?.body ?? 'Open BuffaGo for your next wing move.', data: { deepLink: event.deep_link, eventType: event.event_type }, sound: 'default' })));
    await client.from('notification_delivery_attempts').insert((installations ?? []).map((x: any, _i: number) => ({ outbox_id: event.id, installation_id: x.id, attempt_number: 1, provider: 'expo', status: provider.ok ? 'submitted' : 'retryable_failure', failure_code: provider.ok ? null : `http_${provider.status}` })));
    await client.from('notification_outbox').update({ status: provider.ok ? 'sent' : 'retry', sent_at: provider.ok ? new Date().toISOString() : null, retry_count: provider.ok ? 0 : 1 }).eq('id', event.id);
    results.push({ id: event.id, status: provider.ok ? 'sent' : 'retry', provider_status: provider.status });
  }
  return Response.json({ ok: true, processed: results.length, results });
});
