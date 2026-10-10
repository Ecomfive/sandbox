// Calcula la planificación automática (src/lib/compras/planificacion.ts) de las compras ABIERTAS que ya tienen fecha de
// envío: fecha de envío + la mediana de lo que tardaron los envíos de su país por su vía. Las cerradas y las que no tienen
// fecha de envío no se tocan (conservan la que se puso en ClickUp).
//
//   npx tsx scripts/recalcular-planificacion.ts            → informe: cuáles cambiarían y a qué mes
//   npx tsx scripts/recalcular-planificacion.ts --aplicar  → las cambia y deja la línea en la Actividad de cada una

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { estimarPlanificacion, tiemposDeTransito } from "../src/lib/compras/planificacion";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
type Compra = { id: string; codigo: string | null; tipo: string; pais_id: string | null; via_envio: string[] | null; fecha_envio: string | null; fecha_llegada: string | null; planificacion: string | null; estado: string };

async function todas(): Promise<Compra[]> {
  const out: Compra[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await supabase.from("wms_compras").select("id, codigo, tipo, pais_id, via_envio, fecha_envio, fecha_llegada, planificacion, estado").order("id").range(i, i + 999);
    if (error) throw error;
    out.push(...(data as Compra[]));
    if (data.length < 1000) return out;
  }
}

const clave = (c: Compra) => (c.tipo === "importacion" ? "importacion" : (c.pais_id ?? ""));

(async () => {
  const compras = await todas();
  const { data: paises } = await supabase.from("paises").select("id, codigo");
  const codigoPais = new Map((paises ?? []).map((p) => [p.id as string, p.codigo as string]));
  const tiempos = tiemposDeTransito(
    compras
      .filter((c) => c.fecha_envio && c.fecha_llegada && (c.via_envio ?? []).length === 1)
      .map((c) => ({ clave: clave(c), via: c.via_envio![0], dias: Math.round((Date.parse(c.fecha_llegada!) - Date.parse(c.fecha_envio!)) / 864e5) })),
  );
  console.log("Tiempos de tránsito (mediana):");
  for (const [k, t] of [...tiempos].sort()) {
    const [c, v] = k.split("|");
    console.log(`  ${c === "*" ? "Todos" : c === "importacion" ? "Importadora" : codigoPais.get(c)} · ${v}: ${t.dias} días (${t.muestra} envíos)`);
  }

  const cambios: { c: Compra; nueva: string; detalle: string }[] = [];
  for (const c of compras) {
    if (c.estado === "completado" || !c.fecha_envio) continue;
    const e = estimarPlanificacion(tiempos, clave(c), c.via_envio ?? [], c.fecha_envio);
    if (e && e.planificacion !== c.planificacion) cambios.push({ c, nueva: e.planificacion, detalle: e.explicacion });
  }
  const abiertasConEnvio = compras.filter((c) => c.estado !== "completado" && c.fecha_envio).length;
  console.log(`\nAbiertas con fecha de envío: ${abiertasConEnvio}. Cambian: ${cambios.length}. Ya coinciden: ${abiertasConEnvio - cambios.length}.`);
  const resumen = new Map<string, number>();
  for (const x of cambios) resumen.set(`${x.c.planificacion ?? "—"} → ${x.nueva}`, (resumen.get(`${x.c.planificacion ?? "—"} → ${x.nueva}`) ?? 0) + 1);
  for (const [k, n] of [...resumen].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);
  for (const x of cambios.slice(0, 40)) console.log(`  ${x.c.codigo ?? x.c.id} · envío ${x.c.fecha_envio} · ${x.c.planificacion ?? "—"} → ${x.nueva} · ${x.detalle}`);

  if (!aplicar) return console.log("\nSin --aplicar no se cambió nada.");
  const base = Date.now();
  for (const [i, x] of cambios.entries()) {
    const { error } = await supabase.from("wms_compras").update({ planificacion: x.nueva }).eq("id", x.c.id);
    if (error) throw error;
    await supabase.from("wms_compra_eventos").insert({
      compra_id: x.c.id,
      campo: "planificacion",
      valor_antes: x.c.planificacion ?? "—",
      valor_despues: x.nueva,
      ocurrido_en: new Date(base + i).toISOString(),
      autor: "Planificación automática",
      origen: "sistema",
    });
  }
  console.log(`\nAplicado: ${cambios.length} compras.`);
})();
