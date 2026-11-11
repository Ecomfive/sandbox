#!/usr/bin/env node
// Pide cada página una vez (sin navegador) para que `next dev` las compile antes de capturar, y dice el estado HTTP
// de cada una. Uso: node scripts/preview/calentar.mjs [ruta…]
import { cookieSesion } from "./sesion.mjs";
import { RUTAS_PORTAL } from "./rutas.mjs";

const BASE = process.env.PREVIEW_URL ?? "http://127.0.0.1:3100";
const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const c = cookieSesion(SUPA);
const rutas = process.argv.slice(2).length ? process.argv.slice(2) : RUTAS_PORTAL.filter((r) => !r.includes(":"));
let mal = 0;
for (const r of rutas) {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${r}`, { headers: { cookie: `${c.name}=${c.value}` }, redirect: "manual", signal: AbortSignal.timeout(300_000) });
    const cuerpo = await res.text();
    const titulo = cuerpo.match(/<title>([^<]*)/)?.[1] ?? "";
    const errorNext = /id="__next_error__"|This page could not be found|Application error/.test(cuerpo);
    if (res.status >= 400 || errorNext || res.status === 307) mal++;
    console.log(`${res.status} ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s ${r} ${titulo}${errorNext ? " [error de Next]" : ""}${res.headers.get("location") ? ` → ${res.headers.get("location")}` : ""}`);
  } catch (e) {
    mal++;
    console.log(`ERR ${r} ${e.message}`);
  }
}
console.log(`${rutas.length} páginas, ${mal} con problemas`);
