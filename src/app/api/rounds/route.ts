import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase";

type CreateRoundPayload = {
  user_id?: string | null;
  ball_id?: string;
  course_name?: string | null;
  tee_box?: string | null;
  temperature?: number | null;
  wind_speed?: number | null;
  conditions?: string | null;
  total_score?: number | null;
  date?: string | null;
};

export async function POST(request: Request) {
  const supabase = createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase env is not configured." }, { status: 500 });
  }

  let body: CreateRoundPayload;

  try {
    body = (await request.json()) as CreateRoundPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const ballId = body.ball_id?.trim();

  if (!ballId) {
    return NextResponse.json({ error: "ball_id is required." }, { status: 400 });
  }

  const payload = {
    user_id: body.user_id?.trim() || null,
    ball_id: ballId,
    course_name: body.course_name?.trim() || null,
    tee_box: body.tee_box?.trim() || null,
    temperature: typeof body.temperature === "number" ? body.temperature : null,
    wind_speed: typeof body.wind_speed === "number" ? body.wind_speed : null,
    conditions: body.conditions?.trim() || null,
    total_score: typeof body.total_score === "number" ? body.total_score : null,
    date: body.date || null,
  };

  const { data, error } = await supabase
    .from("rounds")
    .insert(payload)
    .select("id, ball_id, course_name, total_score, date")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ round: data }, { status: 201 });
}
