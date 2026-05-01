// hooks/useCreateCrawl.js
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';

/**
 * Generate a 6-character join code using uppercase letters and numbers.
 */
function genJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

/**
 * Mutation hook to create a new crawl and assign the current user as host.
 */
export function useCreateCrawl() {
  return useMutation({
    mutationFn: async (input) => {
      const route_id = input.route_id;

      // Step 1: Create crawl
      const { data: crawl, error } = await supabase
        .from('crawls')
        .insert({ route_id, status: 'created' })
        .select('*')
        .single();

      if (error) throw error;

      let finalCrawl = crawl;

      // Step 2: Assign join code if missing
      if (!finalCrawl.join_code) {
        const code = genJoinCode();
        const { data: updated, error: updateError } = await supabase
          .from('crawls')
          .update({ join_code: code })
          .eq('id', finalCrawl.id)
          .select('*')
          .single();

        if (updateError) throw updateError;
        finalCrawl = updated;
      }

      // Step 3: Ensure host membership
      const userResult = await supabase.auth.getUser();
      const me = userResult && userResult.data ? userResult.data.user : null;

      if (me && me.id) {
        const { error: memberError } = await supabase
          .from('crawl_members')
          .insert({ crawl_id: finalCrawl.id, user_id: me.id, role: 'host' });

        if (memberError && !String(memberError.message).toLowerCase().includes('duplicate')) {
          console.warn(memberError.message);
        }
      }

      return finalCrawl;
    },
  });
}
