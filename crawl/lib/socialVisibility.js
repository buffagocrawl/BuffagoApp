export function canUserAppearSocially(user) {
  return !user?.social_opt_out;
}

export function isSociallyVisibleUserId(userId, visibleUserIds) {
  if (!userId) return false;
  if (!visibleUserIds) return true;
  return visibleUserIds.has(userId);
}

export function filterSociallyVisibleRows(rows, visibleUserIds, userIdKey = 'user_id') {
  if (!Array.isArray(rows)) return [];
  if (!visibleUserIds) return rows;
  return rows.filter((row) => isSociallyVisibleUserId(row?.[userIdKey], visibleUserIds));
}
