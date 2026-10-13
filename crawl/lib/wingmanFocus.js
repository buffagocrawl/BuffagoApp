// Retry after the native modal and Paper's entrance animation finish. Cancel
// every scheduled callback on a step change so a stale field cannot steal focus.
export function scheduleWingmanFocus(getInput, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  const focus = () => {
    const input = getInput();
    if (input && !input.isFocused?.()) input.focus();
  };
  const timers = [0, 350].map((delay) => schedule(focus, delay));
  return () => timers.forEach(cancel);
}
