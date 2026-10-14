export function savedRestaurantLabel(ratedByMe, selected) {
  return ratedByMe ? (selected ? 'Already favorited' : 'Favorite') : (selected ? 'Want to Try' : 'Add to Want to Try');
}
