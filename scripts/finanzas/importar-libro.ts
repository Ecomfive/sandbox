// Importa el libro de movimientos de Excel (GASTOS_PANAMA_<año>.xlsx) al Portal AF4 360° (ver FINANZAS-360.md).
//
// Uso:
//   npx tsx scripts/finanzas/importar-libro.ts [archivo] [--hoja=2026]            # prueba: lee y valida, no escribe
//   npx tsx scripts/finanzas/importar-libro.ts [archivo] [--hoja=2026] --aplicar  # escribe en Supabase (migración 0901)
//   npx tsx scripts/finanzas/importar-libro.ts datos-privados/GASTOS_COSTA_RICA_2026.xlsx --entidad=CR [--moneda=CRC]
//     # el libro de otra entidad (migración 0923): sus tiendas se crean en esa entidad y sus montos van en su moneda
//     # (la de la entidad, la del título del monto o la de una columna MONEDA); la base los pasa a dólares con la tasa
//     # del mes (Estado de resultados › Tipos de cambio). Sin --entidad, la que diga el nombre del archivo o Panamá.
//
// El archivo por defecto es datos-privados/GASTOS_PANAMA_2026.xlsx (la carpeta no se sube a git).
//
// Reglas:
//  - Lee la hoja del libro (por defecto la del año) y la base de reparto de la hoja «EERR» (envíos por tienda y mes).
//  - Crea las tiendas y las formas de pago que falten; un tipo que no está en el catálogo se guarda en `tipo_texto` sin
//    `tipo_id` y no entra al EERR hasta clasificarlo (vista `fin_movimientos_sin_tipo`).
//  - Es seguro repetirlo: cada fila tiene su huella (`origen_clave`); lo que ya estaba se actualiza. Las filas que
//    desaparecieron del archivo se borran del portal solo si vienen de este mismo archivo (nunca las cargadas a mano).
//  - No imprime descripciones ni montos sueltos: el detalle va a datos-privados/informe-libro.txt.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import { leerBaseDistribucion, leerLibro, type Celda } from "../../src/lib/finanzas/libro-excel";
import { TAMANO_LOTE, cerrarImportacion, guardarLoteMovimientos, origenDeArchivo, type EntidadLibro } from "../../src/lib/finanzas/guardar-libro";

const APLICAR = process.argv.includes("--aplicar");
const argumentos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ARCHIVO = argumentos[0] ?? "datos-privados/GASTOS_PANAMA_2026.xlsx";
const HOJA = process.argv.find((a) => a.startsWith("--hoja="))?.slice(7) ?? (ARCHIVO.match(/(20\d{2})/)?.[1] ?? "2026");
const ORIGEN = origenDeArchivo(basename(ARCHIVO));
const ENTIDAD = (process.argv.find((a) => a.startsWith("--entidad="))?.slice(10) ?? (/COSTA[\s_-]*RICA/i.test(ARCHIVO) ? "CR" : "PA")).toUpperCase();
const MONEDA = process.argv.find((a) => a.startsWith("--moneda="))?.slice(9)?.toUpperCase() ?? (ENTIDAD === "CR" ? "CRC" : undefined);

if (!existsSync(ARCHIVO)) {
  console.error(`No encuentro ${ARCHIVO}. Copia el Excel a datos-privados/ o pasa la ruta como primer argumento.`);
  process.exit(1);
}

const libro = XLSX.read(readFileSync(ARCHIVO), { cellDates: true });
const filasDe = (hoja: string): Celda[][] => {
  const ws = libro.Sheets[hoja];
  if (!ws) throw new Error(`El archivo no tiene la hoja «${hoja}». Hojas: ${libro.SheetNames.join(", ")}`);
  return XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, raw: true, defval: null });
};

const { movimientos, descartadas } = leerLibro(filasDe(HOJA), ORIGEN, { moneda: MONEDA });
const base = libro.Sheets.EERR ? leerBaseDistribucion(filasDe("EERR")) : [];

// Resumen sin datos sensibles.
const porMes = new Map<string, { filas: number; eerr: number }>();
for (const m of movimientos) {
  const x = porMes.get(m.periodo) ?? { filas: 0, eerr: 0 };
  x.filas++;
  if (m.en_eerr) x.eerr++;
  porMes.set(m.periodo, x);
}
console.log(`Archivo: ${ORIGEN} · hoja «${HOJA}» · entidad ${ENTIDAD}`);
const porMoneda = new Map<string, number>();
for (const m of movimientos) porMoneda.set(m.moneda, (porMoneda.get(m.moneda) ?? 0) + 1);
console.log(`Monedas: ${[...porMoneda].map(([k, n]) => `${k} ${n}`).join(", ")}`);
console.log(`Movimientos válidos: ${movimientos.length} · descartados: ${descartadas.length}`);
for (const [mes, x] of [...porMes].sort()) console.log(`  ${mes.slice(0, 7)}: ${x.filas} movimientos (${x.eerr} al EERR)`);
console.log(`Base de reparto: ${base.length} filas (tienda × mes con envíos)`);

const informe = [
  `Importación del libro ${ORIGEN} (${new Date().toISOString()})`,
  "",
  "Descartadas:",
  ...descartadas.map((d) => `  fila ${d.fila}: ${d.motivo}`),
  "",
  "Tiendas:",
  ...[...new Set(movimientos.map((m) => m.unidad))].sort().map((u) => `  ${u}`),
  "",
  "Tipos:",
  ...[...new Set(movimientos.map((m) => m.tipo ?? "(vacío)"))].sort().map((t) => `  ${t}`),
  "",
  "Formas de pago:",
  ...[...new Set(movimientos.map((m) => m.cuenta ?? "(vacía)"))].sort().map((t) => `  ${t}`),
].join("\n");
try {
  writeFileSync("datos-privados/informe-libro.txt", informe);
  console.log("Detalle en datos-privados/informe-libro.txt");
} catch {
  // Sin la carpeta (archivo pasado por ruta): el resumen de arriba basta.
}

if (!APLICAR) {
  console.log("\nPrueba en seco: no se escribió nada. Corre de nuevo con --aplicar para cargarlo.");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (corre con: npx tsx --env-file=.env.local …).");
  process.exit(1);
}
const supabase = createClient(url, clave, { auth: { persistSession: false } });

async function main() {
  let entidad: EntidadLibro | null = null;
  if (ENTIDAD !== "PA") {
    const { data, error } = await supabase.from("fin_entidades").select("id, codigo, moneda").eq("codigo", ENTIDAD).maybeSingle();
    if (error || !data) throw new Error(`No encuentro la entidad ${ENTIDAD} (¿corriste la migración 0923?).`);
    entidad = { id: data.id as string, codigo: data.codigo as string, moneda: data.moneda as string };
  }
  let sinTasa = 0;
  const tiendas = new Set<string>();
  const cuentas = new Set<string>();
  let conservados = 0;
  let porRegla = 0;
  let enMesCerrado = 0;
  for (let i = 0; i < movimientos.length; i += TAMANO_LOTE) {
    const r = await guardarLoteMovimientos(supabase, ORIGEN, movimientos.slice(i, i + TAMANO_LOTE), entidad);
    sinTasa += r.sinTasa ?? 0;
    r.tiendasNuevas.forEach((t) => tiendas.add(t));
    r.cuentasNuevas.forEach((c) => cuentas.add(c));
    conservados += r.conservados;
    porRegla += r.porRegla;
    enMesCerrado += r.enMesCerrado;
  }
  console.log(`fin_movimientos: ${movimientos.length} cargados o actualizados`);
  if (porRegla) console.log(`Completados por una regla: ${porRegla}`);
  if (conservados) console.log(`Corregidos a mano en el portal (no se pisaron): ${conservados}`);
  if (tiendas.size) console.log(`Tiendas nuevas: ${[...tiendas].join(", ")}`);
  if (cuentas.size) console.log(`Formas de pago nuevas: ${[...cuentas].join(", ")}`);
  if (sinTasa) console.log(`Sin tipo de cambio de su mes (no entran al EERR hasta cargarlo): ${sinTasa}`);
  const cierre = await cerrarImportacion(supabase, ORIGEN, new Set(movimientos.map((m) => m.origen_clave)), base, entidad);
  if (cierre.borrados) console.log(`fin_movimientos: ${cierre.borrados} borrados (ya no están en el archivo)`);
  if (enMesCerrado + cierre.enMesCerrado) console.log(`De meses cerrados (no se tocaron): ${enMesCerrado + cierre.enMesCerrado}`);
  console.log(`fin_base_distribucion: ${cierre.base} filas`);
  const { data: sinTipo } = await supabase.from("fin_movimientos_sin_tipo").select("movimientos");
  const n = (sinTipo ?? []).reduce((a, r) => a + Number(r.movimientos), 0);
  if (n) console.log(`Atención: ${n} movimientos con un tipo fuera del catálogo (vista fin_movimientos_sin_tipo).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
