import { NextResponse } from "next/server";
import { searchRequestSchema } from "@/types/contracts";
import { searchByImage } from "@/server/repositories/locations";

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid search request" }, { status: 400 });
  try {
    const results = await searchByImage(parsed.data.embedding, parsed.data.filters);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Search failed", error);
    return NextResponse.json({ error: "Search unavailable" }, { status: 503 });
  }
}
