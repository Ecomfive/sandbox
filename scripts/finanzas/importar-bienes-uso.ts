// Importa la hoja «Bienes de Uso» de GASTOS_PANAMA_<año>.xlsx al Portal AF4 360° (tabla fin_bienes_uso, migración 0907).
//
// Uso:
//   npx tsx scripts/finanzas/importar-bienes-uso.ts [archivo]            # prueba: lee, compara con la grilla, no escribe
//   npx tsx --env-file=.env.local scripts/finanzas/importar-bienes-uso.ts [archivo] --aplicar
//
// Además de leer los bienes, compara la depreciación que calcula el portal (lineal, desde el mes de alta, durante los
// meses de vida) con la grilla «Depreciación mensual» del Excel, celda por celda y por el total de cada mes.
// No imprime descripciones: solo filas, meses y montos.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import { compararConGrilla, depreciacionPorMes, leerBienesExcel, validarBienExcel } from "../../src/lib/finanzas/bienes-uso";
import { guardarBienes, type BienValidado } from "../../src/lib/finanzas/guardar-bienes";
import { origenDeArchivo } from "../../src/lib/finanzas/guardar-libro";
import type { Celda } from "../../src/lib/finanzas/libro-excel";

const APLICAR = process.argv.includes("--aplicar");
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "datos-privados/GASTOS_PANAMA_2026.xlsx";
const HOJA = "Bienes de Uso";

if (!existsSync(ARCHIVO)) {
  console.error(`No encuentro ${ARCHIVO}.`);
  process.exit(1);
}
const libro = XLSX.read(readFileSync(ARCHIVO), { cellDates: true });
const ws = libro.Sheets[HOJA];
if (!ws) {
  console.error(`El archivo no tiene la hoja «${HOJA}».`);
  process.exit(1);
}
const origen = origenDeArchivo(basename(ARCHIVO));
const { bienes, descartadas } = leerBienesExcel(XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, raw: true, defval: null }), origen);
const usd = (n: number) => n.toFixed(2);

console.log(`Archivo: ${origen} · hoja «${HOJA}»`);
console.log(`Bienes: ${bienes.length} · descartadas: ${descartadas.length}${descartadas.length ? ` (${descartadas.map((d) => `fila ${d.fila}: ${d.motivo}`).join("; ")})` : ""}`);
const sospechosos = bienes.filter((b) => b.sospechoso);
if (sospechosos.length) console.log(`Importes que parecen mal escritos (filas): ${sospechosos.map((b) => `${b.fila} (${b.importe})`).join(", ")}`);

// Los meses que cubre la grilla del Excel.
const meses = [...new Set(bienes.flatMap((b) => Object.keys(b.grilla)))].sort();
if (meses.length) {
  const desde = meses[0];
  const hasta = meses[meses.length - 1];
  const r = compararConGrilla(bienes, meses);
  console.log(`\nComparación con la grilla (${desde.slice(0, 7)} a ${hasta.slice(0, 7)}): ${r.celdas - r.distintas.length} de ${r.celdas} celdas iguales.`);
  const porFila = new Map<number, number>();
  for (const d of r.distintas) porFila.set(d.fila, (porFila.get(d.fila) ?? 0) + 1);
  for (const [fila, n] of porFila) {
    const ej = r.distintas.find((d) => d.fila === fila)!;
    console.log(`  fila ${fila}: ${n} meses distintos (p. ej. ${ej.mes.slice(0, 7)}: Excel ${usd(ej.excel)} · portal ${usd(ej.portal)})`);
  }
  const calc = depreciacionPorMes(bienes.map((b) => ({ ...b, valor_residual: 0, fecha_baja: null })), desde, hasta);
  let maxDif = 0;
  for (const [mes, v] of calc) {
    const excel = bienes.reduce((a, b) => a + (b.grilla[mes] ?? 0), 0);
    maxDif = Math.max(maxDif, Math.abs(excel - v));
  }
  console.log(`Total por mes: diferencia máxima ${usd(maxDif)} USD.`);
  const fuera = bienes.filter((b) => !Object.keys(b.grilla).length && b.fecha_alta.slice(0, 7) <= hasta.slice(0, 7));
  if (fuera.length) console.log(`Sin grilla en el Excel aunque su alta cae dentro: filas ${fuera.map((b) => b.fila).join(", ")}`);
  const despues = bienes.filter((b) => b.fecha_alta.slice(0, 7) > hasta.slice(0, 7));
  if (despues.length) console.log(`Con alta después de la grilla: filas ${despues.map((b) => b.fila).join(", ")}`);
}

const validos = bienes.map(validarBienExcel).filter((b): b is BienValidado => b !== null);
if (!APLICAR) {
  console.log(`\nPrueba en seco: ${validos.length} bienes listos. Corre de nuevo con --aplicar para cargarlos.`);
  process.exit(0);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (corre con: npx tsx --env-file=.env.local …).");
  process.exit(1);
}
guardarBienes(createClient(url, clave, { auth: { persistSession: false } }), origen, validos)
  .then((r) =>
    console.log(`fin_bienes_uso: ${r.guardados} cargados o actualizados, ${r.conservados} corregidos en el portal (no se pisaron), ${r.borrados} borrados (ya no están en el archivo).`),
  )
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
