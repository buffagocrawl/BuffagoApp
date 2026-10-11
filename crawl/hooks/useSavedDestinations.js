import { useCallback, useEffect, useRef, useState } from 'react';
import { getSavedDestinationState, getSavedDestinations, mutateSavedDestination, clearSavedDestinationState } from '../lib/savedDestinations.js';
import { accountUserId, createAccountScope, lookupAccount } from '../lib/accountBoundary.js';

const initialState = { status: 'loading', userId: null, ratedIds: new Set(), favoriteIds: new Set(), wantToTryIds: new Set(), error: null };

export function useSavedDestinations({ client, enabled = false } = {}) {
  const [state, setState] = useState(enabled ? initialState : { ...initialState, status: 'disabled' });
  const [pending, setPending] = useState({});
  const [listState, setListState] = useState({ status: 'idle', kind: null, rows: [], error: null });
  const requestRef = useRef(0);
  const pendingRef = useRef(new Map());
  const scope = useRef(createAccountScope()).current;
  const userIdRef = useRef(undefined);
  const listRequestRef = useRef(0);

  const refresh = useCallback(async (destinationIds = []) => {
    if (!enabled) {
      setState((current) => ({ ...current, status: 'disabled', error: null }));
      return { status: 'disabled' };
    }
    const request = ++requestRef.current;
    const epoch = scope.capture();
    const isCurrent = () => scope.current(epoch) && request === requestRef.current;
    setState((current) => ({ ...current, status: 'loading', error: null }));
    try {
      const next = await getSavedDestinationState({ client, destinationIds, expectedUserId: userIdRef.current, isCurrent });
      if (isCurrent()) setState({ ...next, error: null });
      return next;
    } catch (error) {
      if (isCurrent()) setState((current) => ({ ...current, status: 'error', error }));
      throw error;
    }
  }, [client, enabled, scope]);

  useEffect(() => {
    scope.activate();
    scope.invalidate();
    requestRef.current += 1;
    listRequestRef.current += 1;
    pendingRef.current.clear();
    setPending({});
    if (!enabled) {
      setState((current) => clearSavedDestinationState({ ...current, status: 'disabled', error: null }));
      setListState({ status: 'disabled', kind: null, rows: [], error: null });
      return () => scope.dispose();
    }
    let alive = true;
    let authRevision = 0;
    const acceptAccount = (user) => {
      if (!alive) return;
      const changed = scope.update(user);
      userIdRef.current = accountUserId(user);
      if (!changed) return;
      requestRef.current += 1;
      listRequestRef.current += 1;
      pendingRef.current.clear();
      setPending({});
      setState((current) => clearSavedDestinationState({ ...current, status: userIdRef.current ? 'loading' : 'guest', error: null }));
      setListState({ status: userIdRef.current ? 'idle' : 'guest', kind: null, rows: [], error: null });
      Promise.resolve().then(() => { if (alive) void refresh().catch(() => {}); });
    };
    const initialRevision = authRevision;
    lookupAccount(client).then((user) => { if (initialRevision === authRevision) acceptAccount(user); }).catch((error) => {
      if (alive && initialRevision === authRevision) setState((current) => clearSavedDestinationState({ ...current, status: 'error', error }));
    });
    const { data: subscription } = client.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      authRevision += 1;
      acceptAccount(session?.user || null);
    });
    return () => {
      alive = false;
      scope.dispose();
      subscription?.subscription?.unsubscribe?.();
    };
  }, [client, enabled, refresh, scope]);

  const loadList = useCallback(async (kind) => {
    if (!enabled) return { status: 'disabled', rows: [] };
    const epoch = scope.capture();
    const request = ++listRequestRef.current;
    const isCurrent = () => scope.current(epoch) && request === listRequestRef.current;
    setListState((current) => ({ ...current, status: 'loading', kind, error: null }));
    try {
      const next = await getSavedDestinations({ client, kind, expectedUserId: userIdRef.current, isCurrent });
      if (isCurrent()) setListState({ status: next.status === 'guest' ? 'guest' : 'ready', kind, rows: next.rows || [], error: null });
      return next;
    } catch (error) {
      if (isCurrent()) setListState((current) => ({ ...current, status: 'error', kind, error }));
      throw error;
    }
  }, [client, enabled, scope]);

  const mutate = useCallback(async ({ kind, destinationId, saved, expectedUserId = userIdRef.current }) => {
    if (!enabled) return { status: 'disabled' };
    const epoch = scope.capture();
    const isCurrent = () => scope.current(epoch);
    const key = `${kind}:${destinationId}`;
    if (pendingRef.current.has(key)) return pendingRef.current.get(key);
    const operation = (async () => {
      setPending((current) => ({ ...current, [key]: true }));
      try {
        const result = await mutateSavedDestination({ client, kind, destinationId, saved, expectedUserId, isCurrent });
        if (isCurrent() && result.status === 'signed_in') await refresh();
        return result;
      } catch (error) {
        if (isCurrent()) setState((current) => ({ ...current, error }));
        throw error;
      } finally {
        if (isCurrent() && pendingRef.current.get(key) === operation) {
          pendingRef.current.delete(key);
          setPending((current) => {
          const next = { ...current };
          delete next[key];
          return next;
          });
        }
      }
    })();
    pendingRef.current.set(key, operation);
    return operation;
  }, [client, enabled, refresh, scope]);

  const invalidateAfterRating = useCallback((destinationId) => {
    if (!enabled) return;
    setState((current) => {
      const ratedIds = new Set(current.ratedIds);
      if (destinationId) ratedIds.add(destinationId);
      const wantToTryIds = new Set(current.wantToTryIds);
      if (destinationId) wantToTryIds.delete(destinationId);
      return { ...current, ratedIds, wantToTryIds };
    });
    void refresh(destinationId ? [destinationId] : []).catch(() => {});
  }, [enabled, refresh]);

  return {
    ...state,
    pending,
    listRows: listState.rows,
    listStatus: listState.status,
    listKind: listState.kind,
    listError: listState.error,
    loadList,
    refresh,
    mutate,
    invalidateAfterRating,
    isPending: (kind, destinationId) => Boolean(pending[`${kind}:${destinationId}`]),
  };
}
