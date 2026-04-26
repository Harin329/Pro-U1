import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase";

type HoleInput = {
  hole_number: number;
  fairway_hit?: boolean | null;
  miss_direction?: string | null;
  gir?: boolean | null;
  miss_type?: string | null;
  up_and_down?: boolean | null;
  putts?: number | null;
};

type SaveHolesPayload = {
  round_id?: string;
  holes?: HoleInput[];
};

export async function POST(request: Request) {
  const supabase = createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase env is not configured." }, { status: 500 });
  }

  let body: SaveHolesPayload;

  try {
    body = (await request.json()) as SaveHolesPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const roundId = body.round_id?.trim();
  const holes = body.holes ?? [];

  if (!roundId) {
    return NextResponse.json({ error: "round_id is required." }, { status: 400 });
  }

  if (!Array.isArray(holes) || holes.length === 0) {
    return NextResponse.json({ error: "holes must be a non-empty array." }, { status: 400 });
  }

  const invalid = holes.find(
    (hole) => !Number.isInteger(hole.hole_number) || hole.hole_number < 1 || hole.hole_number > 18,
  );

  if (invalid) {
    return NextResponse.json({ error: "hole_number must be an integer between 1 and 18." }, { status: 400 });
  }

  const payload = holes.map((hole) => ({
    round_id: roundId,
    hole_number: hole.hole_number,
    fairway_hit: hole.fairway_hit ?? null,
    miss_direction: hole.miss_direction?.trim() || null,
    gir: hole.gir ?? null,
    miss_type: hole.miss_type?.trim() || null,
    up_and_down: hole.up_and_down ?? null,
    putts: typeof hole.putts === "number" ? hole.putts : null,
  }));

  const { error } = await supabase.from("holes").upsert(payload, {
    onConflict: "round_id,hole_number",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ saved: payload.length }, { status: 200 });
}
