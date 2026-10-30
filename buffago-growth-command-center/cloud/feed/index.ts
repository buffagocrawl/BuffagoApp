import { handle } from './handler.mjs';
Deno.serve((req: Request) => handle(req, Deno.env.toObject()));
