// hooks/useRoutes.js
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/* ---------- Utilities ---------- */

/** Sorts items by descending creation date. */
const byCreatedDesc = (a, b) =>
  (b.created_at ?? '').localeCompare(a.created_at ?? '');

/** Coerce nullable numeric fields safely. */
const toNumOrNull = (v) =>
  v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;

/* ---------- Data Fetchers ---------- */

/**
 * Fetch ordered stops for a route, supporting both schemas:
 * 1) route_ordered_destinations (preferred)
 * 2) legacy routes.stop1_id..stop5_id (fallback)
 *
 * Returns: Array<{ ord:number, destination:{ id, name, address, lat, lng, city } }>
 */
async function fetchRouteStops(routeId) {
  if (!routeId) return [];

  // --- Try the ordered mapping table first (no FK join required) ---
  const { data: mappedIds, error: mapErr } = await supabase
    .from('route_ordered_destinations')
    .select('ord, destination_id')
    .eq('route_id', routeId)
    .order('ord', { ascending: true });

  if (mapErr) {
    // Non-fatal; we’ll fall back to legacy below.
    // console.warn('route_ordered_destinations error', mapErr.message);
  }

  if (mappedIds && mappedIds.length > 0) {
    const destIds = mappedIds.map((r) => r.destination_id).filter(Boolean);
    let byId = new Map();

    if (destIds.length > 0) {
      const { data: dests, error: destErr } = await supabase
        .from('destinations')
        .select('id, name, address, lat, lng, city')
        .in('id', destIds);

      if (!destErr && dests) {
        byId = new Map(dests.map((d) => [d.id, d]));
      }
    }

    return mappedIds
      .map((row) => {
        const d = byId.get(row.destination_id);
        if (!d) return null;
        return {
          ord: Number(row.ord) || 0,
          destination: {
            id: d.id,
            name: d.name,
            address: d.address,
            lat: toNumOrNull(d.lat),
            lng: toNumOrNull(d.lng),
            city: d.city ?? null,
          },
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.ord - b.ord);
  }

  // --- Fallback: legacy stops on routes row ---
  const { data: routeRow, error: routeErr } = await supabase
    .from('routes')
    .select('id, stop1_id, stop2_id, stop3_id, stop4_id, stop5_id')
    .eq('id', routeId)
    .maybeSingle();

  if (routeErr) {
    throw routeErr;
  }

  if (!routeRow) return [];

  const orderedIds = [
    routeRow.stop1_id,
    routeRow.stop2_id,
    routeRow.stop3_id,
    routeRow.stop4_id,
    routeRow.stop5_id,
  ].filter(Boolean);

  if (orderedIds.length === 0) return [];

  const { data: dests, error: destErr } = await supabase
    .from('destinations')
    .select('id, name, address, lat, lng, city')
    .in('id', orderedIds);

  if (destErr) throw destErr;

  const byId = new Map((dests || []).map((d) => [d.id, d]));
  return orderedIds
    .map((id, idx) => {
      const d = byId.get(id);
      if (!d) return null;
      return {
        ord: idx + 1,
        destination: {
          id: d.id,
          name: d.name,
          address: d.address,
          lat: toNumOrNull(d.lat),
          lng: toNumOrNull(d.lng),
          city: d.city ?? null,
        },
      };
    })
    .filter(Boolean);
}

/* ---------- Hooks ---------- */

/**
 * List public routes in a city.
 * You can pass React Query options to tweak staleTime, retry, etc.
 */
export function useRoutesByCity(city = 'Hartford, CT', options = {}) {
  return useQuery({
    queryKey: ['routes', city],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .eq('city', city)
        .is('is_public', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data ?? []).sort(byCreatedDesc);
    },
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
    ...options,
  });
}

/**
 * Ordered stops for a route (destination + ord). Disabled until routeId is truthy.
 */
export function useRouteStops(routeId, options = {}) {
  return useQuery({
    enabled: !!routeId,
    queryKey: ['route-stops', routeId],
    queryFn: () => fetchRouteStops(routeId),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 2,
    ...options,
  });
}
