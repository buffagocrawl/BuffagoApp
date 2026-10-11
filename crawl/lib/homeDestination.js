import { HOME_NEXT_SPOT_EVENT, HOME_NEXT_SPOT_KEY } from './destinationNavigationCore.js';

export { HOME_NEXT_SPOT_EVENT, HOME_NEXT_SPOT_KEY };

export async function persistHomeDestination(destination, storage, emitter) {
  const resolvedStorage = storage || (await import('@react-native-async-storage/async-storage')).default;
  const resolvedEmitter = emitter || (await import('react-native')).DeviceEventEmitter;
  await resolvedStorage.setItem(HOME_NEXT_SPOT_KEY, JSON.stringify({
    ...destination,
    selectedAt: Date.now(),
    source: destination.source || 'wingdex_want_to_try',
  }));
  resolvedEmitter.emit(HOME_NEXT_SPOT_EVENT, destination);
  return destination;
}
