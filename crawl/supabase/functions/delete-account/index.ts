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
    const correlationId = crypto.randomUUID();

    const { data: cleanup, error: prepareError } = await admin.rpc(
      "prepare_wing_account_media_cleanup",
      {
        p_user_id: userId,
        p_correlation_id: correlationId,
      },
    );
    if (prepareError || !cleanup?.manifest_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "Private media cleanup could not be prepared." }),
        { status: 500 },
      );
    }

    const objectPaths = Array.isArray(cleanup.object_paths)
      ? cleanup.object_paths.filter((path: unknown): path is string =>
        typeof path === "string" && path.length > 0
      )
      : [];

    let objectsDeleted = true;
    let cleanupFailure = "";
    for (let index = 0; index < objectPaths.length; index += 100) {
      const batch = objectPaths.slice(index, index + 100);
      const { error: storageError } = await admin.storage
        .from("wing-submissions")
        .remove(batch);
      if (storageError) {
        objectsDeleted = false;
        cleanupFailure = "private_storage_delete_failed";
        break;
      }
    }

    const { error: completionError } = await admin.rpc(
      "complete_wing_account_media_cleanup",
      {
        p_manifest_id: cleanup.manifest_id,
        p_objects_deleted: objectsDeleted,
        p_failure_reason: objectsDeleted ? null : cleanupFailure,
      },
    );
    if (!objectsDeleted || completionError) {
      return new Response(
        JSON.stringify({ ok: false, error: "Private media cleanup did not complete." }),
        { status: 500 },
      );
    }

    // Authentication is removed last. If storage cleanup fails, the user can
    // retry and their private data is never orphaned behind a deleted identity.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500 }
    );
  }
});
