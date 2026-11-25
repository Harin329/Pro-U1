// Pure, client-safe logic for the random course picker: filtering, grouping
// courses into facilities, unit conversion and the random draw itself.

import { KM_PER_MILE } from "@/lib/golf/geo";
import type { CourseAccess, NearbyCourse } from "@/lib/golf/types";

export type DistanceUnit = "km" | "mi";
export type AccessOption = Exclude<CourseAccess, "Unknown">;
export type HolesFilter = "any" | "18" | "9";

export const ACCESS_OPTIONS: { value: AccessOption; label: string }[] = [
  { value: "Public", label: "Public" },
  { value: "Semi-Private", label: "Semi-private" },
  { value: "Private", label: "Private" },
];

/** Private clubs are excluded unless the user opts in. */
export const DEFAULT_ACCESS: AccessOption[] = ["Public", "Semi-Private"];

export const RADIUS_LIMITS: Record<DistanceUnit, { min: number; max: number; step: number; default: number }> = {
  km: { min: 5, max: 320, step: 5, default: 40 },
  mi: { min: 5, max: 200, step: 5, default: 25 },
};

// Courses are fetched for the smallest bucket covering the chosen radius, so
// dragging the slider within a bucket filters instantly without refetching.
const FETCH_BUCKETS_KM = [25, 50, 100, 200, 400];

export function toKm(value: number, unit: DistanceUnit): number {
  return unit === "km" ? value : value * KM_PER_MILE;
}

export function convertRadius(value: number, from: DistanceUnit, to: DistanceUnit): number {
  if (from === to) return value;
  const limits = RADIUS_LIMITS[to];
  const converted = to === "km" ? value * KM_PER_MILE : value / KM_PER_MILE;
  const stepped = Math.round(converted / limits.step) * limits.step;
  return Math.min(limits.max, Math.max(limits.min, stepped));
}

export function fetchRadiusFor(radiusKm: number): number {
  return FETCH_BUCKETS_KM.find((bucket) => bucket >= radiusKm) ?? FETCH_BUCKETS_KM[FETCH_BUCKETS_KM.length - 1];
}

export function formatDistance(km: number, unit: DistanceUnit): string {
  const value = unit === "km" ? km : km / KM_PER_MILE;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
}

const SHORT_COURSE_NAME = /\b(pitch|putt|putting|par[\s-]?3s?|par three|driving range|batting|mini golf)\b/i;

/** Par-3s, pitch-and-putts and short executive layouts. */
export function isShortCourse(course: Pick<NearbyCourse, "clubName" | "variant" | "holes" | "par">): boolean {
  if (SHORT_COURSE_NAME.test(course.clubName) || (course.variant && SHORT_COURSE_NAME.test(course.variant))) {
    return true;
  }
  if (course.par === null || course.holes === null) return false;
  return (course.holes >= 18 && course.par < 60) || (course.holes < 18 && course.par < 30);
}

export type CourseFilters = {
  radiusKm: number;
  access: AccessOption[];
  holes: HolesFilter;
  skipShort: boolean;
};

export function courseMatches(course: NearbyCourse, filters: CourseFilters): boolean {
  if (course.distanceKm > filters.radiusKm) return false;
  // Courses without a listed access type can't be filtered, so they stay in.
  if (course.access !== "Unknown" && !filters.access.includes(course.access)) return false;
  if (filters.holes === "18" && !(course.holes !== null && course.holes >= 18)) return false;
  if (filters.holes === "9" && !(course.holes !== null && course.holes < 18)) return false;
  if (filters.skipShort && isShortCourse(course)) return false;
  return true;
}

/** A club/facility: one destination, possibly with several courses. */
export type Facility = {
  key: string;
  name: string;
  city: string | null;
  state: string | null;
  region: string;
  distanceKm: number;
  lat: number;
  lng: number;
  access: CourseAccess;
  courses: NearbyCourse[];
  /** Highest Grint rating among its matching courses. */
  rating: number | null;
  url: string;
};

const ACCESS_RANK: Record<CourseAccess, number> = { Public: 0, "Semi-Private": 1, Private: 2, Unknown: 3 };

/** Group matching courses by club so a 3-course resort isn't 3× likelier to be picked. */
export function groupFacilities(courses: NearbyCourse[]): Facility[] {
  const byClub = new Map<string, NearbyCourse[]>();
  for (const course of courses) {
    const list = byClub.get(course.clubKey);
    if (list) list.push(course);
    else byClub.set(course.clubKey, [course]);
  }

  const facilities: Facility[] = [];
  for (const [key, members] of byClub) {
    const sorted = [...members].sort(
      (a, b) => (b.holes ?? 0) - (a.holes ?? 0) || (b.rating ?? 0) - (a.rating ?? 0),
    );
    const nearest = members.reduce((best, course) => (course.distanceKm < best.distanceKm ? course : best));
    const main = sorted[0];
    const ratings = members.map((course) => course.rating).filter((rating): rating is number => rating !== null);

    facilities.push({
      key,
      name: main.clubName,
      city: main.city,
      state: main.state,
      region: main.region,
      distanceKm: nearest.distanceKm,
      lat: nearest.lat,
      lng: nearest.lng,
      access: members.reduce<CourseAccess>(
        (best, course) => (ACCESS_RANK[course.access] < ACCESS_RANK[best] ? course.access : best),
        "Unknown",
      ),
      courses: sorted,
      rating: ratings.length ? Math.max(...ratings) : null,
      url: (sorted.find((course) => course.variant === null) ?? main).url,
    });
  }

  return facilities.sort((a, b) => a.distanceKm - b.distanceKm || a.name.localeCompare(b.name));
}

/**
 * Draw a random facility, avoiding ones already drawn until the pool is
 * exhausted (like a shuffled deck), and never repeating the previous pick
 * back-to-back when there's an alternative.
 */
export function drawFacility(
  pool: Facility[],
  alreadyDrawn: string[],
  previousKey: string | null,
  random: () => number = Math.random,
): { facility: Facility; drawn: string[] } | null {
  if (pool.length === 0) return null;

  const drawnSet = new Set(alreadyDrawn);
  let candidates = pool.filter((facility) => !drawnSet.has(facility.key));
  let drawn = alreadyDrawn;

  if (candidates.length === 0) {
    drawn = [];
    candidates = pool.filter((facility) => facility.key !== previousKey);
    if (candidates.length === 0) candidates = pool;
  }

  const facility = candidates[Math.floor(random() * candidates.length)];
  return { facility, drawn: [...drawn, facility.key] };
}

/**
 * Names to flash while "spinning", with the delay (ms from start) of each
 * frame. Frames slow down so the reveal feels like a wheel coming to rest.
 */
export function spinFrames(
  pool: Pick<Facility, "name">[],
  steps = 14,
  random: () => number = Math.random,
): { name: string; at: number }[] {
  const frames: { name: string; at: number }[] = [];
  let elapsed = 0;
  for (let step = 0; step < steps && pool.length > 0; step += 1) {
    elapsed += 40 + step * step * 1.1;
    frames.push({ name: pool[Math.floor(random() * pool.length)].name, at: Math.round(elapsed) });
  }
  return frames;
}

export function mapsUrl(facility: Pick<Facility, "name" | "city" | "state" | "lat" | "lng">): string {
  const query = [facility.name, facility.city, facility.state].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query || `${facility.lat},${facility.lng}`)}`;
}

export function directionsUrl(facility: Pick<Facility, "lat" | "lng">): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${facility.lat},${facility.lng}`;
}
