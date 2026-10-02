export interface TravelTimeProvider {
  getTravelTimeMinutes(fromLat: number, fromLng: number, toLat: number, toLng: number): number;
  getDistanceKm(fromLat: number, fromLng: number, toLat: number, toLng: number): number;
}

// Haversine formula
function haversineDist(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export const MockTravelTimeProvider: TravelTimeProvider = {
  getDistanceKm(fromLat, fromLng, toLat, toLng) {
    return haversineDist(fromLat, fromLng, toLat, toLng);
  },
  getTravelTimeMinutes(fromLat, fromLng, toLat, toLng) {
    const distKm = this.getDistanceKm(fromLat, fromLng, toLat, toLng);
    // 1.35 road factor, 38 km/h + 1 min overhead
    return (distKm * 1.35 / 38) * 60 + 1;
  }
};
