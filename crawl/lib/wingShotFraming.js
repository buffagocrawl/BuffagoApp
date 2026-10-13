// Convert the preview's source-pixel rectangle to a safe, integer square.
// Clamping also covers subpixel rounding at the right/bottom image edges.
export function confirmedWingShotCrop(rect, width, height) {
  if (![width, height, rect?.originX, rect?.originY, rect?.width, rect?.height].every(Number.isFinite)
    || width < 1 || height < 1 || rect.width < 1 || rect.height < 1) {
    throw new Error('The photo frame is unavailable. Reset and try again.');
  }
  const edge = Math.max(1, Math.floor(Math.min(rect.width, rect.height, width, height)));
  return {
    originX: Math.min(Math.max(0, Math.round(rect.originX)), Math.floor(width) - edge),
    originY: Math.min(Math.max(0, Math.round(rect.originY)), Math.floor(height) - edge),
    width: edge, height: edge,
  };
}
