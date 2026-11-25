// Types shared by the golf API routes and the client-side picker.

import type { GolfCourse } from "@/lib/golf/grint";

export type { CourseAccess, GolfCourse } from "@/lib/golf/grint";

/** Where a region's courses came from for this response. */
export type RegionSource = "live" | "snapshot" | "unavailable";

export type RegionStatus = {
  path: string;
  name: string;
  source: RegionSource;
  courseCount: number;
  error?: string;
};

export type NearbyCourse = GolfCourse & {
  distanceKm: number;
  /** Grint region (state/country) the course is listed under. */
  region: string;
};

export type NearbyCoursesResult = {
  center: { lat: number; lng: number };
  radiusKm: number;
  courses: NearbyCourse[];
  regions: RegionStatus[];
};

export type GeocodeResult = {
  label: string;
  detail: string;
  lat: number;
  lng: number;
};
