// utils/crawls.ts
import { supabase } from '../lib/supabase';

type CreateSoloCrawlArgs = {
  routeId: string;
  userId?: string | null;
};

/**
 * Inserts a solo crawl row.
 * Matches schema:
 *   crawl_id (uuid PK), route_id (uuid), user_id (uuid|null),
 *   status text, start_time timestamptz, end_time timestamptz
 */
export async function createSoloCrawl({ routeId, userId }: CreateSoloCrawlArgs) {
  const payload = {
    route_id: routeId,
    user_id: userId ?? null,
    // Flip to 'active' immediately if you want; or keep default 'created'
    status: 'active',
    start_time: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('crawls')
    .insert(payload)
    .select('crawl_id')   // return the PK you navigate with
    .single();

  if (error) throw error;
  // data: { crawl_id: string }
  return data;
}

/**
 * Marks a crawl as ended by PK (crawl_id).
 */
export async function endCrawl(crawlId: string) {
  const { error } = await supabase
    .from('crawls')
    .update({
      end_time: new Date().toISOString(),
      status: 'completed',
    })
    .eq('crawl_id', crawlId);      // <-- update by PK, not route_id

  if (error) throw error;
}

/**
 * (Optional) Cancel/expire helper if you time out crawls.
 */
export async function expireCrawl(crawlId: string) {
  const { error } = await supabase
    .from('crawls')
    .update({ status: 'expired' })
    .eq('crawl_id', crawlId);
  if (error) throw error;
}
