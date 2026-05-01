// src/lib/crawl.ts
import { supabase } from '../../lib/supabase-hard'; // or your unified client path
import { customAlphabet } from 'nanoid';

// short, readable code: ABCD12
const nano = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

/**
 * Creates a crawl row.
 * NOTE: schema elsewhere showed columns: crawl_id (PK), route_id, user_id/host_user_id?, status, start_time, end_time.
 * Adjust `host_user_id` -> `user_id` if your table doesn’t have host_user_id.
 */
export async function createCrawl({
  routeId,
  hostUserId,
}: {
  routeId: string;
  hostUserId: string;
}) {
  const join_code = nano();

  const { data, error } = await supabase
    .from('crawls')
    .insert({
      route_id: routeId,
      // If your table uses user_id (most of your code references user_id), use that instead:
      user_id: hostUserId,
      // host_user_id: hostUserId, // <- only if this column exists
      join_code,
      status: 'active',
      start_time: new Date().toISOString(),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function addMember({
  crawlId,
  userId,
  role,
}: {
  crawlId: string;
  userId: string;
  role: 'host' | 'taster';
}) {
  const { data, error } = await supabase
    .from('crawl_members')
    .insert({ crawl_id: crawlId, user_id: userId, role })
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

export async function findCrawlByCode(code: string) {
  // if join_code stored uppercase, we can normalize here:
  const norm = code.trim().toUpperCase();

  const { data, error } = await supabase
    .from('crawls')
    .select('*')
    .eq('join_code', norm)
    .maybeSingle();

  if (error) throw error;
  return data; // null if not found
}

export async function startCrawl(crawlId: string) {
  const { error } = await supabase
    .from('crawls')
    .update({ status: 'active', start_time: new Date().toISOString() })
    .eq('crawl_id', crawlId); // <- use crawl_id (not id)

  if (error) throw error;
}

export async function endCrawl(crawlId: string) {
  const { error } = await supabase
    .from('crawls')
    .update({ status: 'completed', end_time: new Date().toISOString() })
    .eq('crawl_id', crawlId); // <- use crawl_id

  if (error) throw error;
}

export async function partyCount(crawlId: string) {
  const { count, error } = await supabase
    .from('crawl_members')
    .select('id', { count: 'exact', head: true })
    .eq('crawl_id', crawlId);

  if (error) throw error;
  return count ?? 0;
}
