// Importa el Excel de costos de mercancía (PRECIOS_DE_COSTE_MERCANCIA.xlsx) al Portal AF4 360° (ver FINANZAS-360.md).
//
// Uso:
//   npx tsx --env-file=.env.local scripts/finanzas/importar-costos.ts [archivo]            # prueba: lee y resume
//   npx tsx --env-file=.env.local scripts/finanzas/importar-costos.ts [archivo] --aplicar  # escribe (migración 0908)
//
// Lee las hojas «MERCANCIA …» (un lote por fila) y «MAPEO» (producto de Dropi → producto de costo). Es seguro repetirlo:
// cada lote tiene su huella; lo que desapareció de una hoja se borra solo si vino de este archivo. Un mapeo confirmado
// en el portal no se pisa con uno pendiente del Excel.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import { leerLotes, leerMapeo } from "../../src/lib/finanzas/costos-excel";
import { origenDeArchivo, TAMANO_LOTE } from "../../src/lib/finanzas/guardar-libro";
import { cerrarLotes, guardarLotes, guardarMapeo } from "../../src/lib/finanzas/guardar-costos";
import type { Celda } from "../../src/lib/finanzas/libro-excel";

const APLICAR = process.argv.includes("--aplicar");
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "datos-privados/PRECIOS_DE_COSTE_MERCANCIA.xlsx";
const ORIGEN = origenDeArchivo(basename(ARCHIVO));

if (!existsSync(ARCHIVO)) {
  console.error(`No encuentro ${ARCHIVO}.`);
  process.exit(1);
}
const libro = XLSX.read(readFileSync(ARCHIVO), { cellDates: true });
const filas = (h: string) => XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[h], { header: 1, raw: true, defval: null });
const hojas = libro.SheetNames.filter((h) => /^\s*MERCANC[IÍ]A\b/i.test(h));
const porHoja = hojas.map((h) => ({ hoja: h, ...leerLotes(filas(h), h) }));
const hojaMapeo = libro.SheetNames.find((h) => h.trim().toUpperCase() === "MAPEO");
const mapeo = hojaMapeo ? leerMapeo(filas(hojaMapeo)) : [];

console.log(`Archivo: ${ORIGEN}`);
for (const h of porHoja) console.log(`  ${h.hoja}: ${h.lotes.length} lotes, ${h.descartadas} filas descartadas`);
console.log(`  MAPEO: ${mapeo.length} productos de Dropi (${mapeo.filter((m) => m.estado === "mapeado").length} mapeados)`);

async function main() {
  if (!APLICAR) {
    console.log("\nPrueba en seco: no se escribió nada. Agrega --aplicar para guardar.");
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local).");
  const supabase = createClient(url, clave, { auth: { persistSession: false } });

  let guardados = 0;
  let borrados = 0;
  for (const h of porHoja) {
    for (let i = 0; i < h.lotes.length; i += TAMANO_LOTE) guardados += await guardarLotes(supabase, ORIGEN, h.lotes.slice(i, i + TAMANO_LOTE));
    borrados += await cerrarLotes(supabase, ORIGEN, h.hoja, new Set(h.lotes.map((l) => l.origen_clave)));
  }
  const mapeos = await guardarMapeo(supabase, mapeo);
  console.log(`\nGuardados: ${guardados} lotes · borrados: ${borrados} · mapeos: ${mapeos}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
