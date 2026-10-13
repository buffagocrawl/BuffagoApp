// Includes body consumption. AbortSignal alone cannot bound a custom stream,
// DNS lookup or dependency that ignores cancellation.
export async function withWingmanDeadline<T>(operation: PromiseLike<T>, ms = 10000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve(operation), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Wingman dependency timed out. Please retry.')), ms);
    })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
