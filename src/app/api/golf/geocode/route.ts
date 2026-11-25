import { NextResponse, type NextRequest } from "next/server";

import type { GeocodeResult } from "@/lib/golf/types";

// Geocoding via OpenStreetMap Nominatim. Per its usage policy we identify the
// app, cache results, and only call it on explicit user searches (no
// search-as-you-type).
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";
const USER_AGENT = "ProU1-CoursePicker/1.0 (personal golf course picker)";
const CACHE_SECONDS = 60 * 60 * 24 * 30;

type NominatimAddress = Partial<
  Record<
    | "city"
    | "town"
    | "village"
    | "hamlet"
    | "municipality"
    | "suburb"
    | "county"
    | "state"
    | "province"
    | "region"
    | "country",
    string
  >
>;

type NominatimPlace = {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: NominatimAddress;
};

function shortLabel(place: NominatimPlace): string {
  const address = place.address ?? {};
  const locality =
    place.name ||
    address.city ||
    address.town ||
    address.village ||
    address.hamlet ||
    address.municipality ||
    address.suburb ||
    address.county;
  const region = address.state || address.province || address.region;
  const parts = [locality, region, address.country].filter((part): part is string => Boolean(part));
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.length ? unique.join(", ") : place.display_name;
}

function toResult(place: NominatimPlace): GeocodeResult | null {
  const lat = Number(place.lat);
  const lng = Number(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { label: shortLabel(place), detail: place.display_name, lat, lng };
}

async function callNominatim(path: string, params: Record<string, string>): Promise<unknown> {
  const url = new URL(path, NOMINATIM_URL);
  for (const [key, value] of Object.entries({ format: "jsonv2", addressdetails: "1", ...params })) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, "accept-language": "en" },
    next: { revalidate: CACHE_SECONDS },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) throw new Error(`Geocoder responded with HTTP ${response.status}`);
  return response.json();
}

/**
 * GET /api/golf/geocode?q=Seattle            -> { results: GeocodeResult[] }
 * GET /api/golf/geocode?lat=47.6&lng=-122.3  -> { result: GeocodeResult | null }
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q")?.trim();

  try {
    if (query) {
      if (query.length > 200) {
        return NextResponse.json({ error: "Search text is too long." }, { status: 400 });
      }

      const places = (await callNominatim("/search", { q: query, limit: "5" })) as NominatimPlace[];
      const results = (Array.isArray(places) ? places : [])
        .map(toResult)
        .filter((result): result is GeocodeResult => result !== null);
      return NextResponse.json({ results });
    }

    const lat = Number(searchParams.get("lat"));
    const lng = Number(searchParams.get("lng"));
    if (
      searchParams.has("lat") &&
      searchParams.has("lng") &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      // Round to ~1 km: enough for a "near X" label, and better for caching/privacy.
      const place = (await callNominatim("/reverse", {
        lat: lat.toFixed(2),
        lon: lng.toFixed(2),
        zoom: "10",
      })) as NominatimPlace & { error?: string };
      return NextResponse.json({ result: place && !place.error ? toResult(place) : null });
    }

    return NextResponse.json({ error: "Provide q, or lat and lng." }, { status: 400 });
  } catch (error) {
    console.error("Geocoding failed:", error);
    return NextResponse.json({ error: "Location search is unavailable right now." }, { status: 502 });
  }
}
