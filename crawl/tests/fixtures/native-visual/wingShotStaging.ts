if (!__DEV__) throw new Error('Development fixtures only');
export async function stageWingShotMedia({ correlationId }: { correlationId: string }) {
  return { bucket: 'fixture-only', objectPath: 'fixture-only.jpg', correlationId, uploadCompleted: true };
}
export async function cleanupWingShotStaging() {}
