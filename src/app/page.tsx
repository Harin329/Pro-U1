import { createClient } from "@/lib/supabase";
import { RoundLogger } from "@/components/round-logger";

type BallStat = {
  ball_id: string;
  brand: string;
  model: string;
  rounds_played: number | null;
  avg_score: number | null;
  avg_putts: number | null;
  fairway_pct: number | null;
  gir_pct: number | null;
  up_and_down_pct: number | null;
};

type Round = {
  id: string;
  course_name: string | null;
  total_score: number | null;
  date: string | null;
};

type BallOption = {
  id: string;
  brand: string;
  model: string;
};

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }

  return `${(value * 100).toFixed(0)}%`;
}

function formatDate(value: string | null): string {
  if (!value) return "No date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No date";

  return date.toLocaleDateString();
}

function BestBallCard({ ballStats }: { ballStats: BallStat[] }) {
  const sortable = ballStats.filter((ball) => ball.avg_score !== null);

  if (!sortable.length) {
    return (
      <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
        <h2 className="mb-2 text-xl font-semibold">🏆 Best Ball</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          Add a few rounds to unlock your best ball insight.
        </p>
      </section>
    );
  }

  const best = [...sortable].sort(
    (a, b) => (a.avg_score ?? Number.MAX_SAFE_INTEGER) - (b.avg_score ?? Number.MAX_SAFE_INTEGER),
  )[0];

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
      <h2 className="mb-2 text-xl font-semibold">🏆 Best Ball</h2>
      <p className="text-lg font-bold">
        {best.brand} {best.model}
      </p>
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Avg Score: {best.avg_score?.toFixed(1) ?? "-"} • Rounds: {best.rounds_played ?? 0}
      </p>
    </section>
  );
}

function BallComparisonTable({ ballStats }: { ballStats: BallStat[] }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
      <h2 className="mb-4 text-xl font-semibold">Ball Comparison</h2>

      {ballStats.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No ball stats yet. Once you log rounds + holes, they&apos;ll show up here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
                <th className="py-3 pr-3 font-medium">Ball</th>
                <th className="py-3 pr-3 font-medium">Rounds</th>
                <th className="py-3 pr-3 font-medium">Avg Score</th>
                <th className="py-3 pr-3 font-medium">FW%</th>
                <th className="py-3 pr-3 font-medium">GIR%</th>
                <th className="py-3 pr-3 font-medium">Avg Putts</th>
                <th className="py-3 pr-3 font-medium">U&amp;D%</th>
              </tr>
            </thead>
            <tbody>
              {[...ballStats]
                .sort(
                  (a, b) =>
                    (a.avg_score ?? Number.MAX_SAFE_INTEGER) - (b.avg_score ?? Number.MAX_SAFE_INTEGER),
                )
                .map((ball) => (
                  <tr key={ball.ball_id} className="border-b border-zinc-100 dark:border-zinc-800/70">
                    <td className="py-3 pr-3">
                      {ball.brand} {ball.model}
                    </td>
                    <td className="py-3 pr-3">{ball.rounds_played ?? 0}</td>
                    <td className="py-3 pr-3">{ball.avg_score?.toFixed(1) ?? "-"}</td>
                    <td className="py-3 pr-3">{formatPercent(ball.fairway_pct)}</td>
                    <td className="py-3 pr-3">{formatPercent(ball.gir_pct)}</td>
                    <td className="py-3 pr-3">{ball.avg_putts?.toFixed(2) ?? "-"}</td>
                    <td className="py-3 pr-3">{formatPercent(ball.up_and_down_pct)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RecentRounds({ rounds }: { rounds: Round[] }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
      <h2 className="mb-4 text-xl font-semibold">Recent Rounds</h2>

      {rounds.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          No rounds yet. Log one to start building your trends.
        </p>
      ) : (
        <ul className="space-y-2">
          {rounds.map((round) => (
            <li
              key={round.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <div>
                <p className="font-medium">{round.course_name || "Unnamed Course"}</p>
                <p className="text-xs text-zinc-600 dark:text-zinc-300">{formatDate(round.date)}</p>
              </div>
              <p className="text-base font-semibold">{round.total_score ?? "-"}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SetupNotice() {
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900 dark:border-amber-300/30 dark:bg-amber-950/40 dark:text-amber-100">
      <h2 className="mb-2 text-lg font-semibold">Connect Supabase to load dashboard data</h2>
      <p className="text-sm leading-6">
        Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your
        environment file, then refresh.
      </p>
    </section>
  );
}

export default async function Home() {
  const supabase = createClient();

  if (!supabase) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6 md:py-10">
        <h1 className="mb-6 text-3xl font-bold tracking-tight">Golf Ball Dashboard</h1>
        <SetupNotice />
      </main>
    );
  }

  const [
    { data: ballStatsData, error: ballStatsError },
    { data: roundsData, error: roundsError },
    { data: ballsData, error: ballsError },
  ] =
    await Promise.all([
      supabase.from("ball_stats").select("*").returns<BallStat[]>(),
      supabase
        .from("rounds")
        .select("id, course_name, total_score, date")
        .order("date", { ascending: false })
        .limit(5)
        .returns<Round[]>(),
      supabase
        .from("balls")
        .select("id, brand, model")
        .order("created_at", { ascending: false })
        .limit(50)
        .returns<BallOption[]>(),
    ]);

  const ballStats = ballStatsData ?? [];
  const rounds = roundsData ?? [];
  const balls = ballsData ?? [];
  const loadErrorMessage =
    ballStatsError?.message || roundsError?.message || ballsError?.message || "";
  const hasDivisionByZeroError = /division by zero/i.test(loadErrorMessage);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-6 md:py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Golf Ball Dashboard</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Track which ball performs best across score, fairways, greens, and putting.
        </p>
      </header>

      {(ballStatsError || roundsError || ballsError) && (
        <section className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-300/30 dark:bg-red-950/30 dark:text-red-200">
          <p className="font-medium">Unable to load all dashboard data.</p>
          <p>{loadErrorMessage || "Check your schema (tables + views) and try again."}</p>
          {hasDivisionByZeroError && (
            <p className="mt-2">
              Fix: run the safe view SQL in <code>supabase/ball_stats_view.sql</code> inside your Supabase SQL
              editor, then refresh.
            </p>
          )}
        </section>
      )}

      <div className="space-y-6">
        <RoundLogger initialBalls={balls} />
        <BestBallCard ballStats={ballStats} />
        <BallComparisonTable ballStats={ballStats} />
        <RecentRounds rounds={rounds} />
      </div>
    </main>
  );
}
