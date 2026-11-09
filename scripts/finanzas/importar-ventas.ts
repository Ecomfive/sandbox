// Importa las órdenes de las tiendas Shopify (GESTION_OCEANS_PANAMA.xlsx, hoja «Excel Matriz») a Ventas por tienda del
// Portal AF4 360° (ver FINANZAS-360.md).
//
// Uso:
//   npx tsx --env-file=.env.local scripts/finanzas/importar-ventas.ts [archivo]            # prueba: lee y resume
//   npx tsx --env-file=.env.local scripts/finanzas/importar-ventas.ts [archivo] --aplicar  # escribe (migración 0909)
//
// El archivo por defecto es datos-privados/GESTION_OCEANS_PANAMA.xlsx (la carpeta no se sube a git). Lee también
// «Informe SE» (guías de Servientrega), «Monday» (estado de las órdenes recientes) y «BASE COSTO ECOMFIVE» (mapeo del
// nombre del producto en la tienda con su producto de costo).
//
// Si junto al archivo está GASTOS_PANAMA_2026.xlsx, compara las órdenes y entregadas de cada tienda y mes con las filas
// «TOTAL ENVÍOS» y «ENTREGADOS» de su hoja EERR (la base de reparto actual).
//
// Es seguro repetirlo: cada orden tiene su huella (tienda + número) y una que no cambió no se vuelve a escribir. Nunca
// imprime nombres, teléfonos ni direcciones: el detalle por tienda y mes va a informe-ventas.txt, junto al
// archivo.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as XLSX from "xlsx";
import type { Celda } from "../../src/lib/finanzas/libro-excel";
import { leerBaseDistribucion } from "../../src/lib/finanzas/libro-excel";
import { origenDeArchivo } from "../../src/lib/finanzas/guardar-libro";
import { complementos, leerGuias, leerMapeoProductos, leerMatriz, leerMonday, resumirLeido } from "../../src/lib/ventas/matriz";
import { TAMANO_LOTE_VENTAS, guardarLoteOrdenes, guardarMapeoProductos } from "../../src/lib/ventas/guardar";

const APLICAR = process.argv.includes("--aplicar");
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "datos-privados/GESTION_OCEANS_PANAMA.xlsx";
const GASTOS = join(dirname(ARCHIVO), "GASTOS_PANAMA_2026.xlsx");
const ORIGEN = origenDeArchivo(basename(ARCHIVO));

if (!existsSync(ARCHIVO)) {
  console.error(`No encuentro ${ARCHIVO}. Copia el Excel a datos-privados/ o pasa la ruta como primer argumento.`);
  process.exit(1);
}

const libro = XLSX.read(readFileSync(ARCHIVO), { dense: true });
const hoja = (nombre: string): Celda[][] => {
  const n = libro.SheetNames.find((h) => h.trim().toUpperCase() === nombre.toUpperCase());
  return n ? XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[n], { header: 1, raw: true, defval: null }) : [];
};
const guias = leerGuias(hoja("Informe SE"));
const monday = leerMonday(hoja("Monday"));
const mapeo = leerMapeoProductos(hoja("BASE COSTO ECOMFIVE"));
const { ordenes, descartadas, lineas } = leerMatriz(hoja("Excel Matriz"), complementos(guias, monday));
const resumen = resumirLeido(ordenes);

console.log(`Archivo: ${ORIGEN}`);
console.log(`Órdenes: ${ordenes.length} (${lineas} líneas) · filas descartadas: ${descartadas.length}`);
console.log(`Guías de Servientrega: ${guias.size} · estados de Monday: ${monday.size} · productos en el mapeo de costo: ${mapeo.length}`);
const estados = new Map<string, number>();
for (const o of ordenes) estados.set(o.estado_entrega, (estados.get(o.estado_entrega) ?? 0) + 1);
console.log(`Estados: ${[...estados].map(([e, n]) => `${e} ${n}`).join(" · ")}`);

// Comparación con la base de reparto de la hoja EERR (si está el libro de gastos).
const base = existsSync(GASTOS)
  ? leerBaseDistribucion(
      XLSX.utils.sheet_to_json<Celda[]>(XLSX.read(readFileSync(GASTOS), { cellDates: true, sheets: ["EERR"] }).Sheets.EERR, {
        header: 1,
        raw: true,
        defval: null,
      }),
    )
  : [];
const lineasInforme = [`Ventas por tienda: ${ORIGEN} (${new Date().toISOString()})`, "", "tienda | mes | órdenes | envíos EERR | entregadas | entregados EERR | ventas entregadas"];
let cuadran = 0;
let comparables = 0;
for (const r of resumen) {
  const b = base.find((x) => x.periodo === r.periodo && x.unidad === r.tienda);
  if (b && b.envios > 0) {
    comparables++;
    if (b.envios === r.ordenes && b.entregados === r.entregadas) cuadran++;
  }
  lineasInforme.push([r.tienda, r.periodo.slice(0, 7), r.ordenes, b?.envios ?? "—", r.entregadas, b?.entregados ?? "—", r.ventas.toFixed(2)].join(" | "));
}
if (base.length) console.log(`Contra la hoja EERR (tienda × mes con envíos): ${cuadran} de ${comparables} cuadran exacto en órdenes y entregadas`);
lineasInforme.push("", "Descartadas:", ...descartadas.slice(0, 200).map((d) => `  fila ${d.fila}: ${d.motivo}`));
try {
  writeFileSync(join(dirname(ARCHIVO), "informe-ventas.txt"), lineasInforme.join("\n"));
  console.log(`Detalle en ${join(dirname(ARCHIVO), "informe-ventas.txt")}`);
} catch {
  // Sin la carpeta (archivo pasado por ruta): el resumen de arriba basta.
}

async function main() {
  if (!APLICAR) {
    console.log("\nPrueba en seco: no se escribió nada. Agrega --aplicar para guardar.");
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (usa --env-file=.env.local).");
  const supabase = createClient(url, clave, { auth: { persistSession: false } });
  let nuevas = 0;
  let actualizadas = 0;
  let sinCambios = 0;
  const tiendas = new Set<string>();
  for (let i = 0; i < ordenes.length; i += TAMANO_LOTE_VENTAS) {
    const r = await guardarLoteOrdenes(supabase, ORIGEN, ordenes.slice(i, i + TAMANO_LOTE_VENTAS));
    nuevas += r.nuevas;
    actualizadas += r.actualizadas;
    sinCambios += r.sinCambios;
    r.tiendasNuevas.forEach((t) => tiendas.add(t));
    process.stdout.write(`\r  ${Math.min(i + TAMANO_LOTE_VENTAS, ordenes.length)} de ${ordenes.length}`);
  }
  const mapeos = await guardarMapeoProductos(supabase, ORIGEN, mapeo);
  console.log(`\nNuevas: ${nuevas} · actualizadas: ${actualizadas} · sin cambios: ${sinCambios} · mapeo: ${mapeos}`);
  if (tiendas.size) console.log(`Tiendas nuevas en el libro: ${[...tiendas].join(", ")}`);
  console.log("La base de reparto se actualiza desde el portal (Ventas por tienda › Cuadre).");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
