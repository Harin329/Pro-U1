// Crawl TheGrint's golf course directory and regenerate:
//
//   src/data/golf/regions.json   which Grint region pages have courses in which
//                                1°×1° grid cells (used to decide which regions
//                                to load for a search)
//   src/data/golf/snapshot.json  an offline copy of Washington + British Columbia
//                                courses, used if TheGrint can't be reached
//
// Usage (Node 22.18+ runs TypeScript directly):
//   npm run golf:refresh-courses                     # full crawl (~230 pages)
//   npm run golf:refresh-courses -- --snapshot-only  # just the WA + BC snapshot
// Behind an HTTPS proxy, set NODE_USE_ENV_PROXY=1 so Node's fetch uses it.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { gridCell, haversineKm } from "../../src/lib/golf/geo.ts";
import { GRINT_BASE_URL, parseRegionPage, type GolfCourse } from "../../src/lib/golf/grint.ts";

const USER_AGENT = "ProU1-CoursePicker/1.0 (personal golf course picker; region index builder)";
const DELAY_MS = 400;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DATA_DIR = path.join(ROOT, "src/data/golf");

// Region groups whose index pages link to one page per state/country.
const INDEX_PAGES = ["us", "uk-ireland", "rest-of-world"] as const;
const SINGLE_PAGE_REGIONS = ["canada"];

// Snapshot: all of Washington, plus western Canada (BC). Grint's Canada page has
// no province field, so BC is approximated by longitude; the cutoff keeps all of
// BC and a few Rockies-side Alberta towns (Banff, Canmore, Jasper), not Calgary.
const SNAPSHOT_REGIONS: Record<string, (course: GolfCourse) => boolean> = {
  "us/washington": () => true,
  canada: (course) => course.lng <= -114.5 && course.lat <= 60.0,
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(pagePath: string, attempts = 3): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${GRINT_BASE_URL}/${pagePath}`, {
        headers: { "user-agent": USER_AGENT, accept: "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      await sleep(1_000 * attempt);
    }
  }
  throw new Error(`Failed to fetch ${pagePath}: ${String(lastError)}`);
}

async function discoverRegionPaths(): Promise<string[]> {
  const paths = new Set<string>(SINGLE_PAGE_REGIONS);
  for (const group of INDEX_PAGES) {
    const html = await fetchPage(group);
    const linkRe = new RegExp(`href="/golf-courses/(${group}/[a-z0-9-]+)"`, "g");
    for (const match of html.matchAll(linkRe)) paths.add(match[1]);
    await sleep(DELAY_MS);
  }
  return [...paths].sort();
}

function countryFor(regionPath: string, name: string): string {
  if (regionPath.startsWith("us/")) return "United States";
  if (regionPath === "canada") return "Canada";
  return name;
}

type RegionIndexEntry = {
  path: string;
  name: string;
  country: string;
  count: number;
  cells: number[];
};

type CrawledRegion = { path: string; name: string; courses: GolfCourse[] };

// A few Grint courses have coordinates on the wrong continent (a Welsh course
// near Bellingham, a Colombian one in Colorado…). Leaving their grid cells in
// the index would make searches there load unrelated regions, so a cell is
// dropped when it is far from the rest of its region AND another region has
// clearly more courses in it. Genuinely remote spots (overseas territories,
// outback towns) aren't dominated by another region, so they stay.
const ISOLATED_CELL_KM = 1000;

function cellCenter(cell: number): [number, number] {
  return [Math.floor(cell / 360) - 90 + 0.5, (cell % 360) - 180 + 0.5];
}

function buildIndex(crawled: CrawledRegion[]): RegionIndexEntry[] {
  const countsByRegion = new Map<string, Map<number, number>>();
  const countsByCell = new Map<number, Map<string, number>>();

  for (const region of crawled) {
    const counts = new Map<number, number>();
    for (const course of region.courses) {
      const cell = gridCell(course.lat, course.lng);
      counts.set(cell, (counts.get(cell) ?? 0) + 1);
    }
    countsByRegion.set(region.path, counts);
    for (const [cell, count] of counts) {
      const perRegion = countsByCell.get(cell) ?? new Map<string, number>();
      perRegion.set(region.path, count);
      countsByCell.set(cell, perRegion);
    }
  }

  return crawled.map((region) => {
    const counts = countsByRegion.get(region.path) ?? new Map<number, number>();
    const cells = [...counts.keys()];
    // The cell with the most courses is the region's home turf; never drop it
    // (tiny countries like Andorra share their only cell with a bigger neighbour).
    // Ties go to the cell where other regions have the fewest courses.
    const othersIn = (cell: number) =>
      Math.max(
        0,
        ...[...(countsByCell.get(cell) ?? new Map<string, number>())]
          .filter(([otherPath]) => otherPath !== region.path)
          .map(([, count]) => count),
      );
    const homeCell = [...cells].sort(
      (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || othersIn(a) - othersIn(b),
    )[0];

    const kept = cells.filter((cell) => {
      if (cell === homeCell) return true;
      const [lat, lng] = cellCenter(cell);
      const isolated = cells.every(
        (other) => other === cell || haversineKm(lat, lng, ...cellCenter(other)) > ISOLATED_CELL_KM,
      );
      if (!isolated) return true;

      const own = counts.get(cell) ?? 0;
      const dominatedBy = [...(countsByCell.get(cell) ?? new Map<string, number>())].find(
        ([otherPath, otherCount]) => otherPath !== region.path && otherCount >= Math.max(3, own * 3),
      );
      if (!dominatedBy) return true;

      console.log(
        `  ${region.path}: ignoring ${own} misplaced course(s) near ${lat.toFixed(1)},${lng.toFixed(1)} (inside ${dominatedBy[0]})`,
      );
      return false;
    });

    return {
      path: region.path,
      name: region.name,
      country: countryFor(region.path, region.name),
      count: region.courses.length,
      cells: kept.sort((a, b) => a - b),
    };
  });
}

function serializeSnapshot(generatedAt: string, regions: Record<string, GolfCourse[]>): string {
  // One course per line keeps diffs readable when the snapshot is refreshed.
  const blocks = Object.entries(regions).map(([regionPath, courses]) => {
    const lines = courses.map((course) => `      ${JSON.stringify(course)}`).join(",\n");
    return `    ${JSON.stringify(regionPath)}: [\n${lines}\n    ]`;
  });
  return (
    "{\n" +
    `  "generatedAt": ${JSON.stringify(generatedAt)},\n` +
    `  "source": ${JSON.stringify(GRINT_BASE_URL)},\n` +
    `  "note": "Offline fallback for Washington and British Columbia (Canadian courses west of 114.5°W). Regenerate with scripts/golf/build-region-index.mts.",\n` +
    `  "regions": {\n${blocks.join(",\n")}\n  }\n` +
    "}\n"
  );
}

async function main() {
  const snapshotOnly = process.argv.includes("--snapshot-only");
  const generatedAt = new Date().toISOString().slice(0, 10);
  await mkdir(DATA_DIR, { recursive: true });

  const regionPaths = snapshotOnly ? Object.keys(SNAPSHOT_REGIONS) : await discoverRegionPaths();
  console.log(`Crawling ${regionPaths.length} region page(s)…`);

  const crawled: CrawledRegion[] = [];
  const snapshot: Record<string, GolfCourse[]> = {};
  const failures: string[] = [];

  for (const [i, regionPath] of regionPaths.entries()) {
    try {
      const { name, courses } = parseRegionPage(await fetchPage(regionPath));
      if (courses.length > 0) crawled.push({ path: regionPath, name: name ?? regionPath, courses });

      const snapshotFilter = SNAPSHOT_REGIONS[regionPath];
      if (snapshotFilter) {
        snapshot[regionPath] = courses
          .filter(snapshotFilter)
          .sort((a, b) => a.clubName.localeCompare(b.clubName) || a.id - b.id);
      }

      console.log(`[${i + 1}/${regionPaths.length}] ${regionPath}: ${courses.length} courses`);
    } catch (error) {
      failures.push(regionPath);
      console.warn(`[${i + 1}/${regionPaths.length}] ${regionPath}: FAILED ${String(error)}`);
    }
    await sleep(DELAY_MS);
  }

  for (const regionPath of Object.keys(SNAPSHOT_REGIONS)) {
    if (!snapshot[regionPath]?.length) {
      throw new Error(`Snapshot region ${regionPath} came back empty; refusing to overwrite snapshot.json`);
    }
  }

  await writeFile(path.join(DATA_DIR, "snapshot.json"), serializeSnapshot(generatedAt, snapshot));
  console.log(
    `Wrote snapshot.json (${Object.entries(snapshot)
      .map(([key, courses]) => `${key}: ${courses.length}`)
      .join(", ")})`,
  );

  if (!snapshotOnly) {
    if (failures.length > regionPaths.length / 10) {
      throw new Error(`Too many failures (${failures.length}); refusing to overwrite regions.json`);
    }

    const index = buildIndex(crawled);

    // Keep entries for regions that failed this run, from the previous index.
    try {
      const previous = JSON.parse(await readFile(path.join(DATA_DIR, "regions.json"), "utf8")) as {
        regions: RegionIndexEntry[];
      };
      for (const entry of previous.regions) {
        if (failures.includes(entry.path)) index.push(entry);
      }
    } catch {
      // No previous index.
    }

    index.sort((a, b) => a.path.localeCompare(b.path));
    const body =
      "{\n" +
      `  "generatedAt": ${JSON.stringify(generatedAt)},\n` +
      `  "source": ${JSON.stringify(GRINT_BASE_URL)},\n` +
      `  "regions": [\n${index.map((entry) => `    ${JSON.stringify(entry)}`).join(",\n")}\n  ]\n` +
      "}\n";
    await writeFile(path.join(DATA_DIR, "regions.json"), body);
    console.log(
      `Wrote regions.json (${index.length} regions, ${index.reduce((sum, entry) => sum + entry.count, 0)} courses)`,
    );
  }

  if (failures.length) console.warn(`Failed regions: ${failures.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
