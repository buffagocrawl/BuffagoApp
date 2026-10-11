declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

declare module 'https://deno.land/std@0.177.0/http/server.ts' {
  export function serve(handler: (request: Request) => Response | Promise<Response>): void;
}

declare module 'https://esm.sh/@supabase/supabase-js@2' {
  export function createClient(...args: unknown[]): any;
}

// Expo checks local source types; Deno verifies this exact remote URL and its
// complete dependency graph against deno.lock during release verification.
declare module 'https://esm.sh/@supabase/supabase-js@2.58.0' {
  export { createClient } from '@supabase/supabase-js';
}
