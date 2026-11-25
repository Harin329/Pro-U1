// Server-side loading of golf courses near a location.
//
// Course data comes live from TheGrint's directory (one page per US state /
// country, cached by Next's fetch cache for a day). `regions.json` tells us
// which region pages have courses in which 1° grid cells, so a search only
// loads the handful of regions its circle can touch. If TheGrint can't be
// reached, Washington and British Columbia fall back to a bundled snapshot so
// the Seattle / Vancouver use case always works.

import regionIndex from "@/data/golf/regions.json";
import snapshotData from "@/data/golf/snapshot.json";
import { gridCellsForCircle, haversineKm } from "@/lib/golf/geo";
import { GRINT_BASE_URL, parseRegionPage, type GolfCourse } from "@/lib/golf/grint";
import type { NearbyCourse, NearbyCoursesResult, RegionSource } from "@/lib/golf/types";

export const MAX_RADIUS_KM = 400;

const USER_AGENT = "ProU1-CoursePicker/1.0 (personal golf course picker)";
const FETCH_REVALIDATE_SECONDS = 60 * 60 * 24; // TheGrint data changes rarely.
const FETCH_TIMEOUT_MS = 15_000;
const MEMO_TTL_MS = 6 * 60 * 60 * 1000;
const FAILURE_MEMO_TTL_MS = 5 * 60 * 1000;

type RegionIndexEntry = {
  path: string;
  name: string;
  country: string;
  count: number;
  cells: number[];
};

type LoadedRegion = {
  courses: GolfCourse[];
  source: RegionSource;
  error?: string;
};

const REGIONS = (regionIndex as { regions: RegionIndexEntry[] }).regions;
const SNAPSHOT = (snapshotData as unknown as { regions: Record<string, GolfCourse[]> }).regions;

const regionsByCell = new Map<number, RegionIndexEntry[]>();
for (const region of REGIONS) {
  for (const cell of region.cells) {
    const list = regionsByCell.get(cell);
    if (list) list.push(region);
    else regionsByCell.set(cell, [region]);
  }
}

/** Grint regions that have at least one course within range of the circle. */
export function regionsForCircle(lat: number, lng: number, radiusKm: number): RegionIndexEntry[] {
  const found = new Map<string, RegionIndexEntry>();
  for (const cell of gridCellsForCircle(lat, lng, radiusKm)) {
    for (const region of regionsByCell.get(cell) ?? []) found.set(region.path, region);
  }
  return [...found.values()];
}

async function fetchLiveRegion(path: string): Promise<GolfCourse[]> {
  const response = await fetch(`${GRINT_BASE_URL}/${path}`, {
    headers: { "user-agent": USER_AGENT, accept: "text/html" },
    next: { revalidate: FETCH_REVALIDATE_SECONDS, tags: ["grint-courses", `grint:${path}`] },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`TheGrint responded with HTTP ${response.status}`);
  }

  const { courses } = parseRegionPage(await response.text());
  if (courses.length === 0) {
    throw new Error("No courses found on TheGrint's page (its format may have changed)");
  }
  return courses;
}

// Parsed regions are memoized per server instance so warm requests skip the
// HTML parse; the fetch cache above handles persistence across instances.
const memo = new Map<string, { expiresAt: number; value: Promise<LoadedRegion> }>();

export function loadRegion(path: string): Promise<LoadedRegion> {
  const cached = memo.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const value = fetchLiveRegion(path).then(
    (courses): LoadedRegion => ({ courses, source: "live" }),
    (error: unknown): LoadedRegion => {
      const message = error instanceof Error ? error.message : String(error);
      const fallback = SNAPSHOT[path];
      if (fallback?.length) return { courses: fallback, source: "snapshot", error: message };
      return { courses: [], source: "unavailable", error: message };
    },
  );

  const entry = { expiresAt: Date.now() + MEMO_TTL_MS, value };
  memo.set(path, entry);

  // Retry failed regions sooner than healthy ones.
  void value.then((result) => {
    if (result.source !== "live" && memo.get(path) === entry) {
      entry.expiresAt = Date.now() + FAILURE_MEMO_TTL_MS;
    }
  });

  return value;
}

export async function findCoursesNear(lat: number, lng: number, radiusKm: number): Promise<NearbyCoursesResult> {
  const regions = regionsForCircle(lat, lng, radiusKm);
  const loaded = await Promise.all(
    regions.map(async (region) => ({ region, result: await loadRegion(region.path) })),
  );

  const seen = new Set<number>();
  const courses: NearbyCourse[] = [];

  for (const { region, result } of loaded) {
    for (const course of result.courses) {
      if (seen.has(course.id)) continue;
      const distanceKm = haversineKm(lat, lng, course.lat, course.lng);
      if (distanceKm > radiusKm) continue;
      seen.add(course.id);
      courses.push({ ...course, distanceKm: Math.round(distanceKm * 100) / 100, region: region.name });
    }
  }

  courses.sort((a, b) => a.distanceKm - b.distanceKm);

  return {
    center: { lat, lng },
    radiusKm,
    courses,
    regions: loaded.map(({ region, result }) => ({
      path: region.path,
      name: region.name,
      source: result.source,
      courseCount: result.courses.length,
      ...(result.error ? { error: result.error } : {}),
    })),
  };
}
