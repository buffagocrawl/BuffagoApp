import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from '../supabase';
import { trackEvent } from '../analytics';
import { getInstallationId } from './pushRegistration';
import { selectGeofenceRegions } from './proximity';

export const CRAWL_GEOFENCE_TASK = 'buffago-crawl-proximity-v1';

if (!TaskManager.isTaskDefined(CRAWL_GEOFENCE_TASK)) {
  TaskManager.defineTask(CRAWL_GEOFENCE_TASK, async ({ data, error }) => {
    if (error || data?.eventType !== Location.GeofencingEventType.Enter) return;
    const identifier = data?.region?.identifier || '';
    const match = /^buffago:crawl:([^:]+):destination:([^:]+)$/.exec(identifier);
    if (!match) return;
    const [, crawlId, destinationId] = match;
    try {
      const installationId = await getInstallationId();
      const { data: result, error: rpcError } = await supabase.rpc('record_crawl_proximity', {
        p_crawl_id: crawlId,
        p_destination_id: destinationId,
        p_installation_id: installationId,
        // OS region entry can be approximate; the server will suppress it until a
        // precise foreground confirmation unless production validation approves it.
        p_accuracy_class: 'unknown',
      });
      if (rpcError) throw rpcError;
      await trackEvent({
        eventName: 'crawl_proximity_entered',
        screen: 'background_geofence',
        metadata: { queued: Boolean(result?.queued), reason: result?.reason || 'recorded' },
      });
    } catch {
      // Background failures are retried on next foreground synchronization.
    }
  });
}

export async function syncCrawlGeofences({ stops, enabled }) {
  const active = await Location.hasStartedGeofencingAsync(CRAWL_GEOFENCE_TASK);
  if (!enabled) {
    if (active) await Location.stopGeofencingAsync(CRAWL_GEOFENCE_TASK);
    return { active: false, regions: 0 };
  }
  const foreground = await Location.getForegroundPermissionsAsync();
  const background = await Location.getBackgroundPermissionsAsync();
  if (!foreground.granted || !background.granted) {
    return { active: false, regions: 0, reason: 'permission_missing' };
  }
  const regions = selectGeofenceRegions(stops);
  if (!regions.length) {
    if (active) await Location.stopGeofencingAsync(CRAWL_GEOFENCE_TASK);
    return { active: false, regions: 0, reason: 'no_eligible_stop' };
  }
  await Location.startGeofencingAsync(CRAWL_GEOFENCE_TASK, regions);
  return { active: true, regions: regions.length };
}

export async function requestCrawlLocationPermissions() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) return { foreground: false, background: false };
  const background = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: background.granted };
}
