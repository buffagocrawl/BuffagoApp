// Readiness comes from the service-only moderation RPC, not a browser request.
export function selectWingPreviewPath(row) {
  for (const [path, exists] of [
    [row.processed_storage_path, row.processed_object_exists],
    [row.thumbnail_storage_path, row.thumbnail_object_exists],
    [row.original_storage_path, row.original_object_exists],
  ]) {
    // Older RPC responses omit readiness; retain their path fallback.
    if (path && exists !== false) return path;
  }
  return null;
}
