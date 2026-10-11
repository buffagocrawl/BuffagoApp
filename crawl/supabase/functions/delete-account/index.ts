import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405 });
  }
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
    // prepare pseudonymizes ownership. A new random correlation after failure
    // would miss the original paths and could falsely authorize Auth deletion.
    // Refuse ambiguous legacy histories and preserve terminal failed manifests.
    const { data: manifests, error: manifestError } = await admin
      .from("wing_account_deletion_manifests")
      .select("id,user_id,correlation_id,status")
      .eq("user_id", userId).order("prepared_at", { ascending: true }).limit(2);
    if (manifestError || !Array.isArray(manifests) || manifests.length > 1
      || (manifests[0] && !["pending", "objects_deleted"].includes(manifests[0].status))) {
      return new Response(JSON.stringify({ ok: false, error: "Private media cleanup requires operator recovery." }), { status: 409 });
    }
    const existingManifest = manifests[0];
    if (existingManifest?.status === "objects_deleted") {
      const { data: newMedia, error: mediaError } = await admin.from("wing_media_submissions")
        .select("id").eq("user_id", userId).limit(1);
      if (mediaError || !Array.isArray(newMedia) || newMedia.length) {
        return new Response(JSON.stringify({ ok: false, error: "Private media cleanup requires operator recovery." }), { status: 409 });
      }
    }
    // A stable user-bound UUID also makes concurrent first attempts converge
    // under prepare's existing advisory lock, without client-owned correlation.
    const correlationId = existingManifest?.correlation_id || userId;
    const { data: correlationManifest, error: correlationError } = await admin
      .from("wing_account_deletion_manifests").select("id,user_id")
      .eq("correlation_id", correlationId).maybeSingle();
    if (correlationError || (correlationManifest && correlationManifest.user_id !== userId)) {
      return new Response(JSON.stringify({ ok: false, error: "Private media cleanup requires operator recovery." }), { status: 409 });
    }

    const { data: cleanup, error: prepareError } = await admin.rpc(
      "prepare_wing_account_media_cleanup",
      {
        p_user_id: userId,
        p_correlation_id: correlationId,
      },
    );
    if (prepareError || !cleanup?.manifest_id || !Array.isArray(cleanup.object_paths)
      || cleanup.object_paths.some((path: unknown) => typeof path !== "string" || !path)
      || !["pending", "objects_deleted"].includes(cleanup.status)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Private media cleanup could not be prepared." }),
        { status: 500 },
      );
    }

    // prepare's legacy global correlation replay does not verify user_id.
    // Independently bind the returned manifest to the authenticated account.
    const { data: ownedManifest, error: ownershipError } = await admin
      .from("wing_account_deletion_manifests").select("id,status")
      .eq("id", cleanup.manifest_id).eq("user_id", userId).maybeSingle();
    if (ownershipError || !ownedManifest || ownedManifest.status !== cleanup.status) {
      return new Response(JSON.stringify({ ok: false, error: "Private media cleanup requires operator recovery." }), { status: 409 });
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

    const { data: completionResult, error: completionError } = cleanup.status === "objects_deleted"
      ? { data: true, error: null }
      : await admin.rpc(
      "complete_wing_account_media_cleanup",
      {
        p_manifest_id: cleanup.manifest_id,
        p_objects_deleted: objectsDeleted,
        p_failure_reason: objectsDeleted ? null : cleanupFailure,
      },
    );
    if (!objectsDeleted || completionError || completionResult !== true) {
      return new Response(
        JSON.stringify({ ok: false, error: "Private media cleanup did not complete." }),
        { status: 500 },
      );
    }

    // Detect media committed after prepare before attempting Auth deletion.
    // This reread is defense in depth: an approved media-write fence must stay
    // in force through Auth deletion to eliminate the remaining concurrent gap.
    const { data: lateMedia, error: lateMediaError } = await admin.from("wing_media_submissions")
      .select("id").eq("user_id", userId).limit(1);
    if (lateMediaError || !Array.isArray(lateMedia) || lateMedia.length) {
      return new Response(JSON.stringify({ ok: false, error: "Private media cleanup requires operator recovery." }), { status: 409 });
    }

    // prepare's existing manifest omits uploaded-but-unfinalized originals.
    // Cancelling an intent does not prove its private object was removed.
    // Refuse any unmanifested reserved/cancelled/expired path rather than
    // inventing Storage deletions or changing the established manifest contract.
    const manifestPaths = new Set(objectPaths);
    let intentInventoryComplete = false;
    let intentOffset = 0;
    for (let page = 0; page < 10; page += 1) {
      const { data: intents, error: intentError } = await admin.from("wing_submission_upload_intents")
        .select("id,expected_storage_path").eq("user_id", userId)
        .order("id", { ascending: true }).range(intentOffset, intentOffset + 99);
      if (intentError || !Array.isArray(intents) || intents.length > 100
        || intents.some((intent) => !intent || typeof intent.expected_storage_path !== "string"
          || !intent.expected_storage_path || !manifestPaths.has(intent.expected_storage_path))) {
        return new Response(JSON.stringify({ ok: false, error: "Private media cleanup requires operator recovery." }), { status: 409 });
      }
      // PostgREST may impose a row cap below the requested page size. A short
      // page is not exhaustion: advance by received rows and require empty.
      if (intents.length === 0) { intentInventoryComplete = true; break; }
      intentOffset += intents.length;
    }
    if (!intentInventoryComplete) {
      return new Response(JSON.stringify({ ok: false, error: "Private media cleanup requires operator recovery." }), { status: 409 });
    }

    // Authentication is removed last. Pending interruption can replay the same
    // manifest; terminal failed manifests require separately approved recovery.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId);
    if (delErr) throw delErr;

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Account deletion could not be completed." }),
      { status: 500 }
    );
  }
});
