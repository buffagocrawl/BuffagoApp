import { supabase } from '../supabase.js';
import { projectLegendaryFeed } from './legendaryProjection';

export async function fetchLegendaryFeed({ limit = 25 } = {}) {
  const boundedLimit = Math.min(50, Math.max(1, Number(limit) || 25));
  const { data, error } = await supabase
    .from('buffaverse_event_feed')
    .select(
      'id,event_type_id,event_type_version,lifecycle_status,geographic_scope,state_id,starts_at,ends_at,title,summary,display_metadata,updated_at'
    )
    .eq('event_type_id', 'legendary_restaurant')
    .in('lifecycle_status', ['active', 'scheduled'])
    .order('ends_at', { ascending: true })
    .limit(boundedLimit);

  if (error) throw error;
  return projectLegendaryFeed(data, boundedLimit);
}
