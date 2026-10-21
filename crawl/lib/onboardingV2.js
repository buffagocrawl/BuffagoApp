const ONBOARDING_V2_SEED_KEY = 'buffago:onboarding:seed_rating';
function isCanonicalDestination(row) {
  return typeof row?.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.id);
}
async function persistV2Preview(storage, preview, savePreview) {
  // The canonical preview is written first; a failed compatibility write never destroys it.
  await savePreview(storage, preview);
  await storage.setItem(ONBOARDING_V2_SEED_KEY, JSON.stringify({
    ...preview.payload, operation_id: preview.preview_id, onboarding_version: 'v2', local_only: true,
  }));
}
async function finishV2({ markSeen, router, account, storage, entryPath, platform }) {
  await storage.setItem('buffago:onboarding:v2_arrival', JSON.stringify({ entry_path: entryPath, platform, pending: true }));
  await markSeen();
  // Keep a real home screen underneath auth, including when the user cancels.
  router.replace('/(tabs)/home');
  if (account) router.push('/auth/login');
}
module.exports = { isCanonicalDestination, persistV2Preview, finishV2 };
