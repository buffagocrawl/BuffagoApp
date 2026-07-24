/**
 * The mission host is reserved for an actionable daily mission. Active crawls
 * are navigation tasks and must remain mascot-free.
 */
export function shouldShowMissionHost({ mission, activeCrawl, actionType }) {
  return Boolean(mission && !activeCrawl && actionType !== 'loading');
}
