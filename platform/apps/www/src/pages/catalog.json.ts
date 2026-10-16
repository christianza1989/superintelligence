import type { APIRoute } from "astro";
import { sourceCandidates, snapshot } from "../project-data";
export const GET: APIRoute = () => new Response(JSON.stringify({ sourceSnapshot: snapshot.date, scope: "Source research only; not installed or runtime-verified integrations", entries: sourceCandidates }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
