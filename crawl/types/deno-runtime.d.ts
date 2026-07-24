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
