export const DISABLED_PHOTO_FLAGS = Object.freeze({ prompt: false, photo: false, video: false, creatorLeaderboard: false });
const KEYS = { wing_shot_prompt: 'prompt', wing_shot_photo_upload: 'photo', wing_shot_video_upload: 'video', wing_shot_creator_leaderboard: 'creatorLeaderboard' };

export async function loadPhotoWorkflowFlags(client, timeoutMs = 4000) {
  let timer;
  try {
    const { data, error } = await Promise.race([
      client.rpc('get_wing_shots_feature_flags'),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Photo options could not load. Please try again.')), timeoutMs); }),
    ]);
    if (error || !Array.isArray(data)) throw new Error('Photo options could not load. Please try again.');
    // A partial response is not an authoritative rollout decision. In that
    // case the rating entrypoint offers Retry instead of skipping photos.
    for (const required of ['wing_shot_prompt', 'wing_shot_photo_upload']) {
      if (!data.some((row) => row?.flag_key === required && typeof row.enabled_for_user === 'boolean')) {
        throw new Error('Photo options could not load. Please try again.');
      }
    }
    const flags = { ...DISABLED_PHOTO_FLAGS };
    for (const row of data) if (KEYS[row.flag_key]) flags[KEYS[row.flag_key]] = row.enabled_for_user === true;
    // New captures remain image-only regardless of historical video flag state.
    flags.video = false;
    return flags;
  } finally { clearTimeout(timer); }
}

export async function resolveRatingPhotoStep(refresh) {
  const flags = await refresh(true);
  return flags.prompt === true && flags.photo === true;
}
