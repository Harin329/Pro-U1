// Parsing helpers for TheGrint's public golf course directory
// (https://thegrint.com/golf-courses).
//
// Every region page (a US state such as /us/washington, or a country such as
// /canada or /rest-of-world/japan) renders a map whose props embed one point
// per course, including coordinates and access type. The props are inside the
// React Server Components "flight" payload that Next.js streams into the HTML
// via `self.__next_f.push([1, "..."])` calls.
//
// This file must stay dependency-free: it is also imported directly by
// `scripts/golf/build-region-index.mts` through Node's TypeScript stripping.

export const GRINT_BASE_URL = "https://thegrint.com/golf-courses";
export const GRINT_ORIGIN = "https://thegrint.com";

export type CourseAccess = "Public" | "Semi-Private" | "Private" | "Unknown";

/** Raw map point as embedded in a Grint region page. */
export type GrintMapPoint = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  rating?: number | null;
  type?: string | null;
  par?: number | null;
  holes?: number | null;
  city?: string | null;
  state?: string | null;
  href: string;
};

/** Normalized course used throughout the app. */
export type GolfCourse = {
  id: number;
  /** Display name of the club/facility (e.g. "Avalon Golf Links"). */
  clubName: string;
  /** Stable key shared by every course at the same facility. */
  clubKey: string;
  /** Course/layout name when a facility has several (e.g. "North/West"). */
  variant: string | null;
  lat: number;
  lng: number;
  access: CourseAccess;
  holes: number | null;
  par: number | null;
  /** TheGrint's 0-100 course rating, when available. */
  rating: number | null;
  city: string | null;
  state: string | null;
  /** Absolute URL of the course page on TheGrint. */
  url: string;
};

const FLIGHT_CHUNK_RE = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;

/** Reassemble the RSC flight payload streamed into a Next.js HTML page. */
export function extractFlightPayload(html: string): string {
  let payload = "";
  for (const match of html.matchAll(FLIGHT_CHUNK_RE)) {
    try {
      payload += JSON.parse(`"${match[1]}"`) as string;
    } catch {
      // Skip chunks that are not valid JSON string literals.
    }
  }
  return payload;
}

/**
 * Return the JSON array that starts at `start` (which must point at "["),
 * honoring nested brackets and string literals. Returns null if unbalanced.
 */
function sliceJsonArray(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }

    if (char === '"') inString = true;
    else if (char === "[" || char === "{") depth += 1;
    else if (char === "]" || char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

function isMapPoint(value: unknown): value is GrintMapPoint {
  if (!value || typeof value !== "object") return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.id === "number" &&
    typeof point.name === "string" &&
    typeof point.lat === "number" &&
    typeof point.lng === "number" &&
    typeof point.href === "string" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 &&
    Math.abs(point.lng) <= 180 &&
    // (0, 0) is a placeholder for "no coordinates", not a course in the Atlantic.
    !(point.lat === 0 && point.lng === 0)
  );
}

/** Extract every course map point from a Grint region page's HTML. */
export function extractMapPoints(html: string): GrintMapPoint[] {
  const flight = extractFlightPayload(html);
  const marker = '"points":[';
  let best: GrintMapPoint[] = [];

  for (let index = flight.indexOf(marker); index !== -1; index = flight.indexOf(marker, index + 1)) {
    const raw = sliceJsonArray(flight, index + marker.length - 1);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;
      const points = parsed.filter(isMapPoint);
      if (points.length > best.length) best = points;
    } catch {
      // Not a JSON array we understand; keep looking.
    }
  }

  return best;
}

/** Extract the region's display name from its "Golf Courses in X" heading. */
export function extractRegionName(html: string): string | null {
  const match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  if (!match) return null;

  const text = match[1]
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  return text.replace(/^Golf Courses in\s+/i, "").replace(/[\s,]+$/, "") || null;
}

function normalizeAccess(type: string | null | undefined): CourseAccess {
  const value = (type ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (value === "public" || value === "municipal" || value === "resort") return "Public";
  if (value === "semiprivate") return "Semi-Private";
  if (value === "private") return "Private";
  return "Unknown";
}

const UPPERCASE_WORDS = new Set(["gc", "cc", "g&cc", "rv", "ymca", "usa", "bc", "pga", "ii", "iii", "iv"]);
const LOWERCASE_WORDS = new Set(["and", "of", "the", "at", "on", "in", "by", "de", "la", "du"]);
const GENERIC_SLUG_WORDS = new Set([
  "golf",
  "club",
  "course",
  "courses",
  "country",
  "links",
  "resort",
  "park",
  "the",
  "and",
]);

/** Turn a URL slug like "eagles-pride-gc" into "Eagles Pride GC". */
export function prettifySlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word, index) => {
      if (UPPERCASE_WORDS.has(word)) return word.toUpperCase();
      if (index > 0 && LOWERCASE_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function nameMatchesSlug(name: string, slug: string): boolean {
  const lowerName = name.toLowerCase();
  const distinctive = slug.split("-").filter((word) => word.length >= 3 && !GENERIC_SLUG_WORDS.has(word));
  if (distinctive.length === 0) return true;
  return distinctive.some((word) => lowerName.includes(word));
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : null;
}

/**
 * Normalize raw map points from one region page. Courses that share a club
 * URL segment (e.g. /avalon-golf-links/north-west and /avalon-golf-links/west-south)
 * are tagged with the same clubKey/clubName so the picker can treat a facility as
 * one destination.
 */
export function normalizeMapPoints(points: GrintMapPoint[]): GolfCourse[] {
  const groups = new Map<string, GrintMapPoint[]>();

  for (const point of points) {
    const segments = point.href.replace(/^\/+|\/+$/g, "").split("/");
    const clubKey = segments.slice(0, -1).join("/") || segments.join("/");
    const group = groups.get(clubKey);
    if (group) group.push(point);
    else groups.set(clubKey, [point]);
  }

  const courses: GolfCourse[] = [];

  for (const [clubKey, members] of groups) {
    const clubSlug = clubKey.split("/").pop() ?? clubKey;
    const courseSlug = (point: GrintMapPoint) => point.href.replace(/\/+$/, "").split("/").pop();

    // Prefer the member whose own page/name *is* the club, e.g.
    // /gamble-sands/gamble-sands-golf-course -> "Gamble Sands Golf Course".
    const primary =
      members.find((point) => courseSlug(point) === clubSlug) ??
      members.find((point) => slugify(point.name) === clubSlug) ??
      members.find((point) => slugify(point.name).startsWith(`${clubSlug}-`));
    const clubName =
      cleanText(primary?.name) ??
      (members.length === 1 && nameMatchesSlug(members[0].name, clubSlug)
        ? cleanText(members[0].name)
        : null) ??
      prettifySlug(clubSlug);

    for (const point of members) {
      const name = cleanText(point.name) ?? clubName;
      courses.push({
        id: point.id,
        clubName,
        clubKey: clubKey.replace(/^golf-courses\//, ""),
        variant: name === clubName ? null : name,
        lat: Math.round(point.lat * 1e5) / 1e5,
        lng: Math.round(point.lng * 1e5) / 1e5,
        access: normalizeAccess(point.type),
        holes: typeof point.holes === "number" && point.holes > 0 ? point.holes : null,
        par: typeof point.par === "number" && point.par > 0 ? point.par : null,
        rating: typeof point.rating === "number" ? point.rating : null,
        city: cleanText(point.city),
        state: cleanText(point.state),
        url: point.href.startsWith("http") ? point.href : `${GRINT_ORIGIN}${point.href}`,
      });
    }
  }

  return courses;
}

/** Fetch-free convenience: parse + normalize a region page. */
export function parseRegionPage(html: string): { name: string | null; courses: GolfCourse[] } {
  return { name: extractRegionName(html), courses: normalizeMapPoints(extractMapPoints(html)) };
}
