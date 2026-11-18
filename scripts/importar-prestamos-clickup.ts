// Importa a Tesorería › Préstamos del grupo (migración 0983) las listas de ClickUp exportadas en CSV: «Préstamos a México»,
// «Préstamos a Costa Rica» y «Financiamientos Ortoped&Co SPA».
//
//   npx tsx --env-file=.env.local scripts/importar-prestamos-clickup.ts <archivo.csv> [<archivo.csv> …]            (solo informa)
//   npx tsx --env-file=.env.local scripts/importar-prestamos-clickup.ts <archivo.csv> [<archivo.csv> …] --aplicar
//
// Se puede repetir: cada movimiento lleva `origen_clave` = «clickup:<tarea>:<n>» y lo ya importado no se vuelve a crear ni
// se cambia (si algo cambió en ClickUp, se corrige con otro movimiento en el sistema). Lo que depende de un estado de cuenta
// aparte o es ambiguo no se importa: se lista al final para cargarlo a mano.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { leerListaClickup, listaDeArchivo, type MovClickup, type PorRevisar } from "../src/lib/finanzas/prestamos-clickup";

const aplicar = process.argv.includes("--aplicar");
const archivos = process.argv.slice(2).filter((a) => !a.startsWith("--"));

async function main() {
  if (!archivos.length) {
    console.error("Indica los CSV de ClickUp.");
    process.exit(1);
  }
  const movs: MovClickup[] = [];
  const porRevisar: PorRevisar[] = [];
  for (const a of archivos) {
    const lista = listaDeArchivo(basename(a));
    if (!lista) {
      console.error(`No sé qué lista es «${basename(a)}» (el nombre debe decir México, Costa Rica u Ortoped).`);
      process.exit(1);
    }
    const r = leerListaClickup(readFileSync(a, "utf8"), lista);
    movs.push(...r.movimientos);
    porRevisar.push(...r.porRevisar);
  }

  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const partes = await s.from("fin_grupo_partes").select("id, nombre");
  if (partes.error) throw new Error(`No se pudieron leer las partes (¿falta la migración 0983?): ${partes.error.message}`);
  const idDe = new Map((partes.data ?? []).map((p) => [String(p.nombre).toLowerCase(), String(p.id)]));
  const faltan = [...new Set(movs.flatMap((m) => [m.acreedor, m.deudor]))].filter((n) => !idDe.has(n.toLowerCase()));
  if (faltan.length) throw new Error(`Faltan estas partes en el sistema: ${faltan.join(", ")}`);

  const claves = movs.map((m) => m.clave);
  const ya = new Set<string>();
  for (let i = 0; i < claves.length; i += 200) {
    const r = await s.from("fin_grupo_movimientos").select("origen_clave").in("origen_clave", claves.slice(i, i + 200));
    if (r.error) throw new Error(r.error.message);
    for (const x of r.data ?? []) ya.add(String(x.origen_clave));
  }
  const nuevos = movs.filter((m) => !ya.has(m.clave));

  const suma = new Map<string, number>();
  for (const m of nuevos) {
    const k = `${m.deudor} le debe a ${m.acreedor} · ${m.tipo}`;
    suma.set(k, (suma.get(k) ?? 0) + m.monto);
  }
  console.log(`Leídos ${movs.length} movimientos; ya estaban ${ya.size}; nuevos ${nuevos.length}.`);
  for (const [k, v] of suma) console.log(`  ${k}: US$${v.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
  if (porRevisar.length) {
    console.log("\nNo se importan (cargar a mano):");
    for (const p of porRevisar) console.log(`  · ${p.nombre.trim()} — ${p.motivo}`);
  }
  if (!aplicar) {
    console.log("\nSolo informe. Agrega --aplicar para guardar.");
    return;
  }
  const filas = nuevos.map((m) => ({
    acreedor_id: idDe.get(m.acreedor.toLowerCase()),
    deudor_id: idDe.get(m.deudor.toLowerCase()),
    tipo: m.tipo,
    fecha: m.fecha,
    vence: m.vence,
    monto: m.monto,
    concepto: m.concepto.slice(0, 300),
    ordenes: m.ordenes,
    medio: m.medio,
    nota: m.nota,
    origen: "clickup",
    origen_clave: m.clave,
  }));
  for (let i = 0; i < filas.length; i += 200) {
    const r = await s.from("fin_grupo_movimientos").insert(filas.slice(i, i + 200));
    if (r.error) throw new Error(r.error.message);
  }
  await s.from("historial_auditoria").insert({
    usuario_nombre: "Sistema",
    accion: "importar_prestamos_clickup",
    entidad: "fin_grupo_movimientos",
    detalle: `${filas.length} movimientos importados de ClickUp`,
  });
  console.log(`\nGuardados ${filas.length} movimientos.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
