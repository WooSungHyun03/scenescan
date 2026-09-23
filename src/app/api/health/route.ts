export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { status: "healthy", service: "scenescan" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
