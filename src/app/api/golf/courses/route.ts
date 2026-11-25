import { NextResponse, type NextRequest } from "next/server";

import { findCoursesNear, MAX_RADIUS_KM } from "@/lib/golf/courses";

function parseCoordinate(value: string | null, limit: number): number | null {
  if (value === null || value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

/**
 * GET /api/golf/courses?lat=49.28&lng=-123.12&radiusKm=50
 *
 * Returns every course on TheGrint within `radiusKm` of the point, sorted by
 * distance, regardless of access type. Filtering (public/private, holes) and
 * the random pick happen client-side so toggling filters is instant.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const lat = parseCoordinate(searchParams.get("lat"), 90);
  const lng = parseCoordinate(searchParams.get("lng"), 180);
  const radiusKm = Number(searchParams.get("radiusKm") ?? 50);

  if (lat === null || lng === null) {
    return NextResponse.json({ error: "Valid lat and lng query parameters are required." }, { status: 400 });
  }

  if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > MAX_RADIUS_KM) {
    return NextResponse.json(
      { error: `radiusKm must be between 0 and ${MAX_RADIUS_KM}.` },
      { status: 400 },
    );
  }

  const result = await findCoursesNear(lat, lng, radiusKm);
  const allLive = result.regions.every((region) => region.source === "live");

  return NextResponse.json(result, {
    headers: {
      // Let browsers/CDNs reuse identical searches; recover quickly from outages.
      "Cache-Control": allLive
        ? "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400"
        : "public, max-age=60, s-maxage=60",
    },
  });
}
