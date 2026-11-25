"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import {
  ACCESS_OPTIONS,
  DEFAULT_ACCESS,
  RADIUS_LIMITS,
  convertRadius,
  courseMatches,
  directionsUrl,
  drawFacility,
  fetchRadiusFor,
  formatDistance,
  groupFacilities,
  mapsUrl,
  spinFrames,
  toKm,
  type AccessOption,
  type DistanceUnit,
  type Facility,
  type HolesFilter,
} from "@/lib/golf/picker";
import type { CourseAccess, GeocodeResult, NearbyCoursesResult } from "@/lib/golf/types";

// ---------------------------------------------------------------------------
// Preferences (persisted in localStorage, hydration-safe via useSyncExternalStore)
// ---------------------------------------------------------------------------

type PickerLocation = {
  label: string;
  lat: number;
  lng: number;
  source: "preset" | "search" | "device";
};

type Prefs = {
  location: PickerLocation | null;
  unit: DistanceUnit;
  radius: number;
  access: AccessOption[];
  holes: HolesFilter;
  skipShort: boolean;
  hiddenClubs: string[];
};

const PRESETS: PickerLocation[] = [
  { label: "Vancouver, BC", lat: 49.2827, lng: -123.1207, source: "preset" },
  { label: "Seattle, WA", lat: 47.6062, lng: -122.3321, source: "preset" },
];

const DEFAULT_PREFS: Prefs = {
  location: null,
  unit: "km",
  radius: RADIUS_LIMITS.km.default,
  access: DEFAULT_ACCESS,
  holes: "any",
  skipShort: true,
  hiddenClubs: [],
};

const PREFS_KEY = "pro-u1:course-picker:v1";

function sanitizePrefs(raw: unknown): Prefs {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
  const value = raw as Partial<Record<keyof Prefs, unknown>>;

  const unit: DistanceUnit = value.unit === "mi" ? "mi" : "km";
  const limits = RADIUS_LIMITS[unit];
  const radius =
    typeof value.radius === "number" && Number.isFinite(value.radius)
      ? Math.min(limits.max, Math.max(limits.min, value.radius))
      : limits.default;

  const location = value.location as Partial<PickerLocation> | null | undefined;
  const validLocation: PickerLocation | null =
    location &&
    typeof location.label === "string" &&
    typeof location.lat === "number" &&
    typeof location.lng === "number" &&
    Math.abs(location.lat) <= 90 &&
    Math.abs(location.lng) <= 180
      ? {
          label: location.label,
          lat: location.lat,
          lng: location.lng,
          source: location.source === "device" || location.source === "search" ? location.source : ("preset" as const),
        }
      : null;

  const accessValues = ACCESS_OPTIONS.map((option) => option.value);
  const access = Array.isArray(value.access)
    ? accessValues.filter((option) => (value.access as unknown[]).includes(option))
    : DEFAULT_ACCESS;

  return {
    location: validLocation,
    unit,
    radius,
    access,
    holes: value.holes === "18" || value.holes === "9" ? value.holes : "any",
    skipShort: typeof value.skipShort === "boolean" ? value.skipShort : DEFAULT_PREFS.skipShort,
    hiddenClubs: Array.isArray(value.hiddenClubs)
      ? value.hiddenClubs.filter((key): key is string => typeof key === "string")
      : [],
  };
}

const prefListeners = new Set<() => void>();
let cachedPrefs: Prefs | null = null;

function readPrefs(): Prefs {
  if (cachedPrefs) return cachedPrefs;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    cachedPrefs = raw ? sanitizePrefs(JSON.parse(raw)) : DEFAULT_PREFS;
  } catch {
    cachedPrefs = DEFAULT_PREFS;
  }
  return cachedPrefs;
}

function updatePrefs(update: (previous: Prefs) => Prefs) {
  cachedPrefs = update(readPrefs());
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(cachedPrefs));
  } catch {
    // Storage unavailable (private mode etc.); preferences just won't persist.
  }
  prefListeners.forEach((listener) => listener());
}

function subscribePrefs(listener: () => void) {
  prefListeners.add(listener);
  return () => {
    prefListeners.delete(listener);
  };
}

function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, readPrefs, () => DEFAULT_PREFS);
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

const cardClass =
  "rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5 sm:p-6 dark:bg-zinc-900 dark:ring-white/10";

const ACCESS_STYLES: Record<CourseAccess, string> = {
  Public: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  "Semi-Private": "bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  Private: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  Unknown: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const ACCESS_LABELS: Record<CourseAccess, string> = {
  Public: "Public",
  "Semi-Private": "Semi-private",
  Private: "Private",
  Unknown: "Access unknown",
};

function AccessBadge({ access }: { access: CourseAccess }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ACCESS_STYLES[access]}`}>
      {ACCESS_LABELS[access]}
    </span>
  );
}

function ToggleChip({
  pressed,
  onClick,
  children,
  disabled,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 ${
        pressed
          ? "border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-600"
          : "border-zinc-300 bg-white text-zinc-800 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-8 rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-emerald-600 ${
            value === option.value
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function FacilityMeta({ facility, unit }: { facility: Facility; unit: DistanceUnit }) {
  const place = [facility.city, facility.state ?? facility.region].filter(Boolean).join(", ");
  return (
    <span>
      {place ? `${place} · ` : ""}
      {formatDistance(facility.distanceKm, unit)} away
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

type CoursesState = {
  key: string;
  data: NearbyCoursesResult | null;
  error: string | null;
};

export function CoursePicker() {
  const prefs = usePrefs();
  const { location, unit, radius, access, holes, skipShort, hiddenClubs } = prefs;
  const limits = RADIUS_LIMITS[unit];
  const radiusKm = toKm(radius, unit);
  const fetchRadiusKm = fetchRadiusFor(radiusKm);

  // ----- Location: search + device geolocation -----
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // ----- Picking -----
  const [pickKey, setPickKey] = useState<string | null>(null);
  const [drawn, setDrawn] = useState<string[]>([]);
  const [spinName, setSpinName] = useState<string | null>(null);
  const spinTimers = useRef<number[]>([]);

  useEffect(() => {
    const timers = spinTimers.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  function stopSpin() {
    spinTimers.current.forEach((timer) => window.clearTimeout(timer));
    spinTimers.current = [];
    setSpinName(null);
  }

  function selectLocation(next: PickerLocation) {
    updatePrefs((previous) => ({ ...previous, location: next }));
    stopSpin();
    setPickKey(null);
    setDrawn([]);
    setLocationError(null);
  }

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;

    setSearching(true);
    setLocationError(null);
    try {
      const response = await fetch(`/api/golf/geocode?q=${encodeURIComponent(text)}`);
      const body = (await response.json()) as { results?: GeocodeResult[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Location search failed.");

      const results = body.results ?? [];
      setSearchResults(results);
      if (results.length === 0) {
        setLocationError(`No places found for “${text}”. Try a city name, address or postal code.`);
        return;
      }
      selectLocation({ label: results[0].label, lat: results[0].lat, lng: results[0].lng, source: "search" });
    } catch (error) {
      setLocationError(
        error instanceof Error ? `${error.message} You can still use the city buttons.` : "Location search failed.",
      );
    } finally {
      setSearching(false);
    }
  }

  function handleUseMyLocation() {
    if (!("geolocation" in navigator)) {
      setLocationError("This browser can't share its location. Search for a place instead.");
      return;
    }

    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = Math.round(position.coords.latitude * 1e4) / 1e4;
        const lng = Math.round(position.coords.longitude * 1e4) / 1e4;
        selectLocation({ label: "Your current location", lat, lng, source: "device" });
        setSearchResults([]);
        setLocating(false);

        // Best effort: swap the generic label for a place name.
        try {
          const response = await fetch(`/api/golf/geocode?lat=${lat}&lng=${lng}`);
          const body = (await response.json()) as { result?: GeocodeResult | null };
          const label = body.result?.label;
          if (response.ok && label) {
            updatePrefs((previous) =>
              previous.location?.source === "device" && previous.location.lat === lat && previous.location.lng === lng
                ? { ...previous, location: { ...previous.location, label: `Near ${label}` } }
                : previous,
            );
          }
        } catch {
          // Keep the generic label.
        }
      },
      (error) => {
        setLocating(false);
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location permission was denied. Pick a city or search for a place instead."
            : "Couldn't determine your location. Pick a city or search for a place instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 10 * 60 * 1000 },
    );
  }

  // ----- Course data -----
  const latParam = location ? location.lat.toFixed(3) : null;
  const lngParam = location ? location.lng.toFixed(3) : null;
  const requestKey = latParam && lngParam ? `${latParam},${lngParam},${fetchRadiusKm}` : null;
  const [coursesState, setCoursesState] = useState<CoursesState | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!latParam || !lngParam) return;
    const key = `${latParam},${lngParam},${fetchRadiusKm}`;
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: latParam, lng: lngParam, radiusKm: String(fetchRadiusKm) });

    fetch(`/api/golf/courses?${params}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as NearbyCoursesResult & { error?: string };
        if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
        setCoursesState({ key, data: body, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCoursesState({
          key,
          data: null,
          error: error instanceof Error ? error.message : "Couldn't load courses.",
        });
      });

    return () => controller.abort();
  }, [latParam, lngParam, fetchRadiusKm, reloadToken]);

  const current = coursesState && coursesState.key === requestKey ? coursesState : null;
  const loading = requestKey !== null && current === null;

  const { pool, hiddenInRange } = useMemo(() => {
    const courses = current?.data?.courses ?? [];
    const matching = groupFacilities(
      courses.filter((course) => courseMatches(course, { radiusKm, access, holes, skipShort })),
    );
    return {
      pool: matching.filter((facility) => !hiddenClubs.includes(facility.key)),
      hiddenInRange: matching.filter((facility) => hiddenClubs.includes(facility.key)),
    };
  }, [current, radiusKm, access, holes, skipShort, hiddenClubs]);

  const picked = pickKey ? (pool.find((facility) => facility.key === pickKey) ?? null) : null;
  const spinning = spinName !== null;

  function handlePick() {
    const poolKeys = new Set(pool.map((facility) => facility.key));
    const result = drawFacility(
      pool,
      drawn.filter((key) => poolKeys.has(key)),
      pickKey,
    );
    if (!result) return;

    stopSpin();
    setDrawn(result.drawn);

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion || pool.length < 2) {
      setPickKey(result.facility.key);
      return;
    }

    // Shuffle through names, slowing down, before landing on the pick.
    setPickKey(null);
    const frames = spinFrames(pool);
    for (const frame of frames) {
      spinTimers.current.push(window.setTimeout(() => setSpinName(frame.name), frame.at));
    }
    spinTimers.current.push(
      window.setTimeout(
        () => {
          spinTimers.current = [];
          setSpinName(null);
          setPickKey(result.facility.key);
        },
        (frames.at(-1)?.at ?? 0) + 180,
      ),
    );
  }

  function hideFacility(key: string) {
    updatePrefs((previous) => ({
      ...previous,
      hiddenClubs: previous.hiddenClubs.includes(key) ? previous.hiddenClubs : [...previous.hiddenClubs, key],
    }));
  }

  function unhideFacilities(keys: string[]) {
    updatePrefs((previous) => ({
      ...previous,
      hiddenClubs: previous.hiddenClubs.filter((key) => !keys.includes(key)),
    }));
  }

  function toggleAccess(option: AccessOption) {
    updatePrefs((previous) => ({
      ...previous,
      access: previous.access.includes(option)
        ? previous.access.filter((value) => value !== option)
        : ACCESS_OPTIONS.map((entry) => entry.value).filter(
            (value) => value === option || previous.access.includes(value),
          ),
    }));
  }

  function changeUnit(nextUnit: DistanceUnit) {
    updatePrefs((previous) => ({
      ...previous,
      unit: nextUnit,
      radius: convertRadius(previous.radius, previous.unit, nextUnit),
    }));
  }

  const regionIssues = current?.data?.regions.filter((region) => region.source !== "live") ?? [];
  const totalInRange = pool.length + hiddenInRange.length;

  let poolMessage: React.ReactNode;
  if (!location) poolMessage = "Choose a starting point to load nearby courses.";
  else if (loading) poolMessage = `Loading courses near ${location.label}…`;
  else if (current?.error)
    poolMessage = (
      <>
        Couldn&apos;t load courses: {current.error}{" "}
        <button
          type="button"
          onClick={() => setReloadToken((token) => token + 1)}
          className="font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
        >
          Try again
        </button>
      </>
    );
  else if (access.length === 0) poolMessage = "Select at least one access type to include.";
  else if (pool.length === 0)
    poolMessage = `No courses match within ${radius} ${unit}. Try a bigger radius or loosen the filters.`;
  else
    poolMessage = (
      <>
        <strong className="font-semibold text-zinc-900 dark:text-white">{pool.length}</strong>{" "}
        {pool.length === 1 ? "course matches" : "courses match"} within {radius} {unit} of {location.label}.
      </>
    );

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------ Where */}
      <section className={cardClass} aria-labelledby="picker-where">
        <h2 id="picker-where" className="text-lg font-semibold">
          Where are you starting from?
        </h2>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <ToggleChip
              key={preset.label}
              pressed={location?.source === "preset" && location.label === preset.label}
              onClick={() => {
                selectLocation(preset);
                setSearchResults([]);
              }}
            >
              {preset.label}
            </ToggleChip>
          ))}
          <ToggleChip pressed={location?.source === "device"} onClick={handleUseMyLocation} disabled={locating}>
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" strokeLinecap="round" />
              <circle cx="12" cy="12" r="7" />
            </svg>
            {locating ? "Locating…" : "Use my location"}
          </ToggleChip>
        </div>

        <form onSubmit={handleSearch} className="mt-4 flex gap-2" role="search">
          <label htmlFor="picker-search" className="sr-only">
            Search for a city, address or postal code
          </label>
          <input
            id="picker-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="City, address or postal code"
            autoComplete="off"
            className="min-h-10 w-full min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/30 sm:text-sm dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="min-h-10 shrink-0 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {searchResults.length > 1 && location?.source === "search" && (
          <div className="mt-3 text-sm">
            <p className="text-zinc-600 dark:text-zinc-400">Not the right place?</p>
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {searchResults.map((result) => {
                const active = location.lat === result.lat && location.lng === result.lng;
                return (
                  <li key={`${result.lat},${result.lng}`}>
                    <button
                      type="button"
                      title={result.detail}
                      aria-pressed={active}
                      onClick={() => selectLocation({ ...result, source: "search" })}
                      className={`rounded-md border px-2 py-1 text-left text-xs transition-colors ${
                        active
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-500/10 dark:text-emerald-200"
                          : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {result.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {locationError && (
          <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">
            {locationError}
          </p>
        )}

        {location && (
          <p className="mt-4 flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span>
              Searching from <span className="font-medium text-zinc-900 dark:text-zinc-100">{location.label}</span>
            </span>
          </p>
        )}
      </section>

      {/* -------------------------------------------------------- Filters */}
      <section className={cardClass} aria-labelledby="picker-filters">
        <h2 id="picker-filters" className="text-lg font-semibold">
          How far, and what kind of course?
        </h2>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="picker-radius" className="text-sm font-medium">
              Within{" "}
              <span className="tabular-nums">
                {radius} {unit}
              </span>
            </label>
            <Segmented
              label="Distance unit"
              value={unit}
              onChange={changeUnit}
              options={[
                { value: "km", label: "km" },
                { value: "mi", label: "mi" },
              ]}
            />
          </div>
          <input
            id="picker-radius"
            type="range"
            min={limits.min}
            max={limits.max}
            step={limits.step}
            value={radius}
            onChange={(event) =>
              updatePrefs((previous) => ({ ...previous, radius: Number(event.target.value) }))
            }
            className="mt-3 h-2 w-full cursor-pointer accent-emerald-600"
          />
          <div className="mt-1 flex justify-between text-xs text-zinc-500 dark:text-zinc-400" aria-hidden="true">
            <span>
              {limits.min} {unit}
            </span>
            <span>
              {limits.max} {unit}
            </span>
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Access</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACCESS_OPTIONS.map((option) => (
              <ToggleChip
                key={option.value}
                pressed={access.includes(option.value)}
                onClick={() => toggleAccess(option.value)}
              >
                {access.includes(option.value) ? (
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4" fill="currentColor">
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : null}
                {option.label}
              </ToggleChip>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Private clubs are excluded by default. Turn them on if you have a membership or an invite.
          </p>
        </fieldset>

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" aria-hidden="true">
              Holes
            </span>
            <Segmented
              label="Holes"
              value={holes}
              onChange={(value) => updatePrefs((previous) => ({ ...previous, holes: value }))}
              options={[
                { value: "any", label: "Any" },
                { value: "18", label: "18" },
                { value: "9", label: "9" },
              ]}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={skipShort}
              onChange={(event) => updatePrefs((previous) => ({ ...previous, skipShort: event.target.checked }))}
              className="size-4 rounded accent-emerald-600"
            />
            Skip par-3s &amp; pitch-and-putts
          </label>
        </div>
      </section>

      {/* ----------------------------------------------------------- Pick */}
      <section
        className="rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-900 p-5 text-white shadow-sm sm:p-6"
        aria-labelledby="picker-result"
      >
        <h2 id="picker-result" className="sr-only">
          Your random course
        </h2>

        <p className="text-sm text-emerald-50/90 [&_strong]:text-white">{poolMessage}</p>

        <button
          type="button"
          onClick={handlePick}
          disabled={!location || loading || pool.length === 0 || spinning}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-5 text-base font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="8.5" cy="8.5" r="1.25" fill="currentColor" />
            <circle cx="15.5" cy="15.5" r="1.25" fill="currentColor" />
            <circle cx="12" cy="12" r="1.25" fill="currentColor" />
          </svg>
          {spinning ? "Picking…" : picked ? "Pick another" : "Pick a course"}
        </button>

        <div aria-live="polite" className="mt-5 min-h-24">
          {spinning ? (
            <p className="truncate text-2xl font-bold text-emerald-50/70 sm:text-3xl">{spinName}</p>
          ) : picked ? (
            <article className="rounded-xl bg-white p-4 text-zinc-900 sm:p-5 dark:bg-zinc-950 dark:text-zinc-100">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                You&apos;re playing
              </p>
              <h3 className="mt-1 text-2xl font-bold tracking-tight">{picked.name}</h3>
              {picked.courses.some((course) => course.variant) && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {picked.courses.length > 1 ? "Courses: " : "Course: "}
                  {picked.courses.map((course) => course.variant ?? picked.name).join(" · ")}
                </p>
              )}
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                <FacilityMeta facility={picked} unit={unit} />
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <AccessBadge access={picked.access} />
                {[...new Set(picked.courses.map((course) => course.holes).filter((value) => value !== null))].map(
                  (value) => (
                    <span
                      key={`holes-${value}`}
                      className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {value} holes
                    </span>
                  ),
                )}
                {picked.courses.length === 1 && picked.courses[0].par !== null && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    Par {picked.courses[0].par}
                  </span>
                )}
                {picked.rating !== null && (
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    Grint rating {picked.rating.toFixed(1)}
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <a
                  href={directionsUrl(picked)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700"
                >
                  Directions
                </a>
                <a
                  href={mapsUrl(picked)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center rounded-lg border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Google Maps
                </a>
                <a
                  href={picked.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-9 items-center rounded-lg border border-zinc-300 px-3 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Scorecard on TheGrint
                </a>
                <button
                  type="button"
                  onClick={() => hideFacility(picked.key)}
                  className="inline-flex min-h-9 items-center rounded-lg px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                >
                  Never suggest this
                </button>
              </div>
            </article>
          ) : (
            location &&
            !loading &&
            pool.length > 0 && (
              <p className="text-sm text-emerald-50/80">Hit the button and let fate choose this weekend&apos;s round.</p>
            )
          )}
        </div>
      </section>

      {/* --------------------------------------------------- Candidates */}
      {location && current?.data && totalInRange > 0 && (
        <section className={cardClass} aria-labelledby="picker-list">
          <details>
            <summary className="cursor-pointer list-inside text-lg font-semibold" id="picker-list">
              All matching courses ({pool.length})
            </summary>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Nearest first. Hide any course you never want suggested.
            </p>
            <ul className="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800">
              {pool.map((facility) => (
                <li key={facility.key} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                      <a
                        href={facility.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline hover:underline-offset-2"
                      >
                        {facility.name}
                      </a>
                      <AccessBadge access={facility.access} />
                    </p>
                    <p className="text-xs text-zinc-600 dark:text-zinc-400">
                      <FacilityMeta facility={facility} unit={unit} />
                      {facility.courses.length > 1 ? ` · ${facility.courses.length} courses` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => hideFacility(facility.key)}
                    aria-label={`Hide ${facility.name}`}
                    className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
                  >
                    Hide
                  </button>
                </li>
              ))}
            </ul>

            {hiddenInRange.length > 0 && (
              <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-800/50">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">Hidden ({hiddenInRange.length})</p>
                  <button
                    type="button"
                    onClick={() => unhideFacilities(hiddenInRange.map((facility) => facility.key))}
                    className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                  >
                    Restore all
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {hiddenInRange.map((facility) => (
                    <li key={facility.key} className="flex items-center justify-between gap-2">
                      <span className="truncate text-zinc-600 dark:text-zinc-400">{facility.name}</span>
                      <button
                        type="button"
                        onClick={() => unhideFacilities([facility.key])}
                        className="shrink-0 text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      >
                        Restore
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </details>
        </section>
      )}

      {regionIssues.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-300/30 dark:bg-amber-950/40 dark:text-amber-100">
          {regionIssues
            .map((region) =>
              region.source === "snapshot"
                ? `TheGrint couldn't be reached for ${region.name}, so a saved copy of its course list is being used.`
                : `Courses in ${region.name} couldn't be loaded right now.`,
            )
            .join(" ")}
        </p>
      )}

      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Course directory from{" "}
        <a
          href="https://thegrint.com/golf-courses"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          TheGrint
        </a>
        . Distances are straight-line. Access types are as listed by TheGrint; check with the course before you go.
      </p>
    </div>
  );
}
