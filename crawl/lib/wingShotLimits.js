// Wing Shot media limits. Keep the SQL contract and storage bucket at these
// exact byte values; this module is the client source used by validation,
// helper copy, and tests.
export const WING_SHOT_PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const WING_SHOT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const WING_SHOT_VIDEO_MAX_MB = WING_SHOT_VIDEO_MAX_BYTES / (1024 * 1024);
export const WING_SHOT_UPLOAD_LIMIT = 5;
export const WING_SHOT_UPLOAD_WINDOW_SECONDS = 15 * 60;
