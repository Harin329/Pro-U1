// Small, dependency-free geo helpers shared by the server code and the
// region index build script.

const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_DEGREE_LAT = 111.32;

export const KM_PER_MILE = 1.609344;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in kilometres. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Identify the 1°×1° grid cell containing a point. Used to index which
 * Grint regions have courses where, so a search only loads nearby regions.
 */
export function gridCell(lat: number, lng: number): number {
  const row = Math.min(179, Math.max(0, Math.floor(lat) + 90));
  const col = (((Math.floor(lng) + 180) % 360) + 360) % 360;
  return row * 360 + col;
}

/** Every grid cell that a circle of `radiusKm` around (lat, lng) can touch. */
export function gridCellsForCircle(lat: number, lng: number, radiusKm: number): number[] {
  const dLat = radiusKm / KM_PER_DEGREE_LAT;
  const minLat = Math.max(-90, lat - dLat);
  const maxLat = Math.min(89.999999, lat + dLat);

  // Longitude degrees shrink toward the poles; use the widest span in range.
  const widestLat = Math.max(Math.abs(minLat), Math.abs(maxLat));
  const cosLat = Math.cos(toRadians(Math.min(widestLat, 89.999999)));
  const dLng = cosLat > 1e-6 ? radiusKm / (KM_PER_DEGREE_LAT * cosLat) : 360;
  const coversAllLongitudes = dLng >= 180;

  const cells: number[] = [];
  for (let row = Math.floor(minLat); row <= Math.floor(maxLat); row += 1) {
    const colStart = coversAllLongitudes ? -180 : Math.floor(lng - dLng);
    const colEnd = coversAllLongitudes ? 179 : Math.floor(lng + dLng);
    for (let col = colStart; col <= colEnd; col += 1) {
      cells.push(gridCell(row, col));
    }
  }

  return [...new Set(cells)];
}
