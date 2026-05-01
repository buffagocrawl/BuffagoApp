import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing env vars" }),
        { status: 500 }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Missing auth header" }),
        { status: 401 }
      );
    }

    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);

    if (userErr || !userData?.user) {
      return new Response(
        JSON.stringify({ ok: false, error: "Invalid user" }),
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    console.error("delete-account failed", e);
    return new Response(
      JSON.stringify({ ok: false, error: "Could not delete account" }),
      { status: 500 }
    );
  }
});
