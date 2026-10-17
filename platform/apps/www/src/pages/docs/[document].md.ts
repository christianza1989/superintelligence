import type { APIRoute } from "astro";
import { documentSources, publicDocument } from "../../project-data";
export function getStaticPaths() { return Object.entries(documentSources).map(([document, source]) => ({ params: { document }, props: { source } })); }
export const GET: APIRoute = ({ props }) => new Response(publicDocument(props.source), { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
