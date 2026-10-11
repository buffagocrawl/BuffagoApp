// UI state belongs to a principal, including an anonymous-auth guest principal.
export function accountKey(user) {
  return user?.id ? `${user.is_anonymous ? 'anonymous' : 'account'}:${user.id}` : 'guest';
}

export function accountUserId(user) {
  return user?.id && !user.is_anonymous ? user.id : null;
}

export function isMissingAuthSession(error) {
  return error?.name === 'AuthSessionMissingError';
}

export async function lookupAccount(client) {
  const { data, error } = await client.auth.getUser();
  if (error && !isMissingAuthSession(error)) throw error;
  return error ? null : data?.user || null;
}

export async function accountBoundRpc(client, userId, isCurrent) {
  const { data, error } = await client.auth.getSession();
  const session = data?.session;
  if (error || isCurrent?.() === false || accountUserId(session?.user) !== userId || !session?.access_token) throw new Error('account_changed');
  return { rpc: (...args) => client.rpc(...args).setHeader('Authorization', `Bearer ${session.access_token}`) };
}

export function createAccountScope() {
  let key;
  let epoch = 0;
  let alive = true;
  return {
    update(user) {
      const next = accountKey(user);
      if (next === key) return false;
      key = next;
      epoch += 1;
      return true;
    },
    capture: () => epoch,
    current: (captured) => alive && captured === epoch,
    invalidate: () => { epoch += 1; },
    activate: () => { if (!alive) key = undefined; alive = true; },
    dispose: () => { alive = false; epoch += 1; },
  };
}
