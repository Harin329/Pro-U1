"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type BallOption = {
  id: string;
  brand: string;
  model: string;
};

type HoleDraft = {
  hole_number: number;
  fairway_hit: boolean | null;
  miss_direction: string;
  gir: boolean | null;
  miss_type: string;
  up_and_down: boolean | null;
  putts: string;
};

type RoundLoggerProps = {
  initialBalls: BallOption[];
};

function createDefaultHoles(): HoleDraft[] {
  return Array.from({ length: 18 }, (_, index) => ({
    hole_number: index + 1,
    fairway_hit: null,
    miss_direction: "",
    gir: null,
    miss_type: "",
    up_and_down: null,
    putts: "",
  }));
}

function toBoolSelectValue(value: boolean | null): string {
  if (value === true) return "true";
  if (value === false) return "false";
  return "";
}

function fromBoolSelectValue(value: string): boolean | null {
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function RoundLogger({ initialBalls }: RoundLoggerProps) {
  const router = useRouter();

  const [balls, setBalls] = useState<BallOption[]>(initialBalls);
  const [isCreatingBall, setIsCreatingBall] = useState(false);
  const [isCreatingRound, setIsCreatingRound] = useState(false);
  const [isSavingHoles, setIsSavingHoles] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [ballBrand, setBallBrand] = useState("");
  const [ballModel, setBallModel] = useState("");
  const [ballCompression, setBallCompression] = useState("");
  const [ballCoverType, setBallCoverType] = useState("");

  const [selectedBallId, setSelectedBallId] = useState<string>(initialBalls[0]?.id ?? "");
  const [courseName, setCourseName] = useState("");
  const [teeBox, setTeeBox] = useState("");
  const [temperature, setTemperature] = useState("");
  const [windSpeed, setWindSpeed] = useState("");
  const [conditions, setConditions] = useState("");
  const [totalScore, setTotalScore] = useState("");
  const [date, setDate] = useState("");

  const [roundId, setRoundId] = useState<string | null>(null);
  const [holes, setHoles] = useState<HoleDraft[]>(createDefaultHoles());

  const selectedBallLabel = useMemo(() => {
    const selected = balls.find((ball) => ball.id === selectedBallId);
    return selected ? `${selected.brand} ${selected.model}` : "No ball selected";
  }, [balls, selectedBallId]);

  async function handleCreateBall(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setMessage(null);
    setIsCreatingBall(true);

    try {
      const response = await fetch("/api/balls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: ballBrand,
          model: ballModel,
          compression: ballCompression ? Number(ballCompression) : null,
          cover_type: ballCoverType || null,
        }),
      });

      const result = (await response.json()) as { error?: string; ball?: BallOption };

      if (!response.ok || !result.ball) {
        throw new Error(result.error || "Failed to create ball.");
      }

      setBalls((current) => [result.ball as BallOption, ...current]);
      setSelectedBallId(result.ball.id);
      setBallBrand("");
      setBallModel("");
      setBallCompression("");
      setBallCoverType("");
      setMessage("Ball added. You can now use it for the round.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create ball.");
    } finally {
      setIsCreatingBall(false);
    }
  }

  async function handleCreateRound(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setMessage(null);

    if (!selectedBallId) {
      setErrorMessage("Please add/select a ball first.");
      return;
    }

    setIsCreatingRound(true);

    try {
      const response = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ball_id: selectedBallId,
          course_name: courseName || null,
          tee_box: teeBox || null,
          temperature: temperature ? Number(temperature) : null,
          wind_speed: windSpeed ? Number(windSpeed) : null,
          conditions: conditions || null,
          total_score: totalScore ? Number(totalScore) : null,
          date: date || null,
        }),
      });

      const result = (await response.json()) as { error?: string; round?: { id: string } };

      if (!response.ok || !result.round) {
        throw new Error(result.error || "Failed to create round.");
      }

      setRoundId(result.round.id);
      setHoles(createDefaultHoles());
      setMessage("Round created. Enter holes below and click Save Holes.");
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not create round.");
    } finally {
      setIsCreatingRound(false);
    }
  }

  function updateHole(holeNumber: number, update: Partial<HoleDraft>) {
    setHoles((current) =>
      current.map((hole) => (hole.hole_number === holeNumber ? { ...hole, ...update } : hole)),
    );
  }

  async function handleSaveHoles() {
    setErrorMessage(null);
    setMessage(null);

    if (!roundId) {
      setErrorMessage("Create a round before saving holes.");
      return;
    }

    setIsSavingHoles(true);

    try {
      const response = await fetch("/api/holes/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          round_id: roundId,
          holes: holes.map((hole) => ({
            hole_number: hole.hole_number,
            fairway_hit: hole.fairway_hit,
            miss_direction: hole.miss_direction || null,
            gir: hole.gir,
            miss_type: hole.miss_type || null,
            up_and_down: hole.up_and_down,
            putts: hole.putts === "" ? null : Number(hole.putts),
          })),
        }),
      });

      const result = (await response.json()) as { error?: string; saved?: number };

      if (!response.ok) {
        throw new Error(result.error || "Failed to save holes.");
      }

      setMessage(`Saved ${result.saved ?? holes.length} holes for ${selectedBallLabel}.`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not save holes.");
    } finally {
      setIsSavingHoles(false);
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
      <h2 className="text-xl font-semibold">✍️ Log New Data</h2>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
        Fast flow: add/select a ball → create round → fill holes 1-18.
      </p>

      {(message || errorMessage) && (
        <div
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            errorMessage
              ? "border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-950/30 dark:text-red-200"
              : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-950/30 dark:text-emerald-200"
          }`}
        >
          {errorMessage || message}
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleCreateBall} className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
          <h3 className="font-medium">1) Add Ball</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={ballBrand}
              onChange={(event) => setBallBrand(event.target.value)}
              placeholder="Brand (Titleist)"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              required
            />
            <input
              value={ballModel}
              onChange={(event) => setBallModel(event.target.value)}
              placeholder="Model (Pro V1x)"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              required
            />
            <input
              type="number"
              value={ballCompression}
              onChange={(event) => setBallCompression(event.target.value)}
              placeholder="Compression (optional)"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              value={ballCoverType}
              onChange={(event) => setBallCoverType(event.target.value)}
              placeholder="Cover (optional)"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
          <button
            type="submit"
            disabled={isCreatingBall}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isCreatingBall ? "Adding..." : "Add Ball"}
          </button>
        </form>

        <form
          onSubmit={handleCreateRound}
          className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
        >
          <h3 className="font-medium">2) Create Round</h3>

          <select
            value={selectedBallId}
            onChange={(event) => setSelectedBallId(event.target.value)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            required
          >
            <option value="" disabled>
              Select a ball
            </option>
            {balls.map((ball) => (
              <option key={ball.id} value={ball.id}>
                {ball.brand} {ball.model}
              </option>
            ))}
          </select>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={courseName}
              onChange={(event) => setCourseName(event.target.value)}
              placeholder="Course name"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              value={teeBox}
              onChange={(event) => setTeeBox(event.target.value)}
              placeholder="Tee box"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              type="number"
              value={temperature}
              onChange={(event) => setTemperature(event.target.value)}
              placeholder="Temp"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              type="number"
              value={windSpeed}
              onChange={(event) => setWindSpeed(event.target.value)}
              placeholder="Wind"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              value={conditions}
              onChange={(event) => setConditions(event.target.value)}
              placeholder="Conditions (dry/wet)"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
            <input
              type="number"
              value={totalScore}
              onChange={(event) => setTotalScore(event.target.value)}
              placeholder="Total score"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>

          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          />

          <button
            type="submit"
            disabled={isCreatingRound}
            className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {isCreatingRound ? "Creating..." : "Create Round"}
          </button>
        </form>
      </div>

      <div className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-medium">3) Hole Entry ({roundId ? `Round ${roundId.slice(0, 8)}...` : "No round yet"})</h3>
          <button
            type="button"
            onClick={handleSaveHoles}
            disabled={!roundId || isSavingHoles}
            className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSavingHoles ? "Saving..." : "Save Holes"}
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-left dark:border-zinc-800">
                <th className="py-2 pr-2">Hole</th>
                <th className="py-2 pr-2">FW</th>
                <th className="py-2 pr-2">Miss Dir</th>
                <th className="py-2 pr-2">GIR</th>
                <th className="py-2 pr-2">Miss Type</th>
                <th className="py-2 pr-2">U&amp;D</th>
                <th className="py-2 pr-2">Putts</th>
              </tr>
            </thead>
            <tbody>
              {holes.map((hole) => (
                <tr key={hole.hole_number} className="border-b border-zinc-100 dark:border-zinc-800/60">
                  <td className="py-2 pr-2 font-medium">{hole.hole_number}</td>
                  <td className="py-2 pr-2">
                    <select
                      value={toBoolSelectValue(hole.fairway_hit)}
                      onChange={(event) =>
                        updateHole(hole.hole_number, { fairway_hit: fromBoolSelectValue(event.target.value) })
                      }
                      className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <option value="">-</option>
                      <option value="true">Y</option>
                      <option value="false">N</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      value={hole.miss_direction}
                      onChange={(event) => updateHole(hole.hole_number, { miss_direction: event.target.value })}
                      placeholder="L/R"
                      className="w-20 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={toBoolSelectValue(hole.gir)}
                      onChange={(event) => updateHole(hole.hole_number, { gir: fromBoolSelectValue(event.target.value) })}
                      className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <option value="">-</option>
                      <option value="true">Y</option>
                      <option value="false">N</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      value={hole.miss_type}
                      onChange={(event) => updateHole(hole.hole_number, { miss_type: event.target.value })}
                      placeholder="S/L/Lt/Rt"
                      className="w-24 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </td>
                  <td className="py-2 pr-2">
                    <select
                      value={toBoolSelectValue(hole.up_and_down)}
                      onChange={(event) =>
                        updateHole(hole.hole_number, { up_and_down: fromBoolSelectValue(event.target.value) })
                      }
                      className="rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <option value="">-</option>
                      <option value="true">Y</option>
                      <option value="false">N</option>
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="number"
                      min={0}
                      max={6}
                      value={hole.putts}
                      onChange={(event) => updateHole(hole.hole_number, { putts: event.target.value })}
                      className="w-16 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
