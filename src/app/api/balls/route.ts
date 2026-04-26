import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase";

type CreateBallPayload = {
  brand?: string;
  model?: string;
  compression?: number | null;
  cover_type?: string | null;
  user_id?: string | null;
};

export async function POST(request: Request) {
  const supabase = createClient();

  if (!supabase) {
    return NextResponse.json({ error: "Supabase env is not configured." }, { status: 500 });
  }

  let body: CreateBallPayload;

  try {
    body = (await request.json()) as CreateBallPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const brand = body.brand?.trim();
  const model = body.model?.trim();

  if (!brand || !model) {
    return NextResponse.json({ error: "brand and model are required." }, { status: 400 });
  }

  const payload = {
    brand,
    model,
    compression: typeof body.compression === "number" ? body.compression : null,
    cover_type: body.cover_type?.trim() || null,
    user_id: body.user_id?.trim() || null,
  };

  const { data, error } = await supabase
    .from("balls")
    .insert(payload)
    .select("id, brand, model")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ball: data }, { status: 201 });
}
