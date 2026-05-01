// utils/funFacts.js
import { supabase } from '../lib/supabase';

/**
 * Returns a RANDOM fun-fact string (not an object).
 */
export async function fetchRandomFunFact() {
  // 1. Get count of active facts
  const { count, error: countError } = await supabase
    .from('fun_facts')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  if (countError || !count || count < 1) {
    return 'Classic Buffalo sauce = cayenne pepper hot sauce + melted butter.';
  }

  // 2. Pick random row
  const offset = Math.floor(Math.random() * count);

  const { data, error } = await supabase
    .from('fun_facts')
    .select('text')
    .eq('is_active', true)
    .range(offset, offset);

  if (error || !data?.length) {
    return 'Classic Buffalo sauce = cayenne pepper hot sauce + melted butter.';
  }

  return data[0]?.text || 'Classic Buffalo sauce = cayenne pepper hot sauce + melted butter.';
}