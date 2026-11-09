// Importa las cuentas por cobrar (hoja «CPC») y por pagar (hojas «CPP…») del Excel de gastos al Portal AF4 360°
// (migración 0905; ver FINANZAS-360.md). Es lo mismo que «Importar Excel» de cada cartera, desde la terminal.
//
// Uso:
//   npx tsx scripts/finanzas/importar-cartera.ts [archivo] [--cartera=cobrar|pagar]            # prueba: lee y compara, no escribe
//   npx tsx --env-file=.env.local scripts/finanzas/importar-cartera.ts [archivo] --aplicar     # escribe en Supabase
//
// El archivo por defecto es datos-privados/GASTOS_PANAMA_2026.xlsx (la carpeta no se sube a git). Sin --cartera hace las
// dos. Es seguro repetirlo: cada documento y cada abono tienen su huella. La consola muestra solo totales y números de
// fila; el detalle (con nombres) va a datos-privados/informe-cartera.txt.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import { leerCartera } from "../../src/lib/finanzas/cxc-cxp-excel";
import { CLASES, TAMANO_LOTE_IMPORTACION, hoyPanama, resumirCartera, saldoDe, type Clase } from "../../src/lib/finanzas/cxc-cxp";
import { archivoDeNombre, cerrarImportacionCartera, guardarLoteCartera } from "../../src/lib/finanzas/guardar-cartera";
import type { Celda } from "../../src/lib/finanzas/libro-excel";

const APLICAR = process.argv.includes("--aplicar");
const argumentos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ARCHIVO = argumentos[0] ?? "datos-privados/GASTOS_PANAMA_2026.xlsx";
const pedida = process.argv.find((a) => a.startsWith("--cartera="))?.slice(10);
const CARTERAS: Clase[] = pedida ? CLASES.filter((c) => c === pedida) : CLASES;
if (!CARTERAS.length) {
  console.error("--cartera debe ser cobrar o pagar.");
  process.exit(1);
}
if (!existsSync(ARCHIVO)) {
  console.error(`No encuentro ${ARCHIVO}. Copia el Excel a datos-privados/ o pasa la ruta como primer argumento.`);
  process.exit(1);
}

const libro = XLSX.read(readFileSync(ARCHIVO), { cellDates: true });
const filasDe = (h: string) => XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[h], { header: 1, raw: true, defval: null });
const hoy = hoyPanama();
const usd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const lecturas = CARTERAS.map((clase) => ({ clase, lectura: leerCartera(libro.SheetNames, filasDe, clase) }));
const informe: string[] = [`Importación de cartera ${basename(ARCHIVO)} (${new Date().toISOString()})`];

for (const { clase, lectura } of lecturas) {
  const docs = lectura.documentos.map((d) => ({ ...d, vencimiento: null, estado_manual: null }));
  const r = resumirCartera(docs, hoy);
  const abonos = docs.reduce((a, d) => a + d.abonos.length, 0);
  console.log(`\n${clase === "cobrar" ? "POR COBRAR" : "POR PAGAR"} · hojas: ${lectura.hojas.join(", ") || "(ninguna)"}`);
  console.log(`  Documentos: ${docs.length} (${r.documentosAbiertos} abiertos) · abonos: ${abonos} · plantilla ignorada: ${lectura.plantilla}`);
  console.log(`  Monto: ${usd(docs.reduce((a, d) => a + d.monto, 0))} · saldo abierto: ${usd(r.total)} · vencido: ${usd(r.vencido)}`);
  console.log(`  Antigüedad: 0-30 ${usd(r.tramos["0-30"])} · 31-60 ${usd(r.tramos["31-60"])} · 61-90 ${usd(r.tramos["61-90"])} · >90 ${usd(r.tramos["90+"])} · sin fecha ${usd(r.tramos["sin-fecha"])}`);
  console.log(`  Top 5 concentra ${(r.parteTop * 100).toFixed(1)} % · descartadas: ${lectura.descartadas.length} · no cuadran: ${lectura.controles.length} · fechas corregidas: ${lectura.fechasCorregidas.length}`);
  informe.push(
    "",
    `== ${clase} (${lectura.hojas.join(", ")})`,
    ...lectura.hojas.map((h) => {
      const deHoja = docs.filter((d) => d.hoja === h);
      return `  hoja ${h}: ${deHoja.length} documentos, saldo ${usd(deHoja.reduce((a, d) => a + Math.max(saldoDe(d), 0), 0))}`;
    }),
    "Por contraparte:",
    ...r.top.map((t) => `  ${t.contraparte}: ${usd(t.saldo)} (${(t.parte * 100).toFixed(1)} %, ${t.documentos} documentos)`),
    "Descartadas:",
    ...lectura.descartadas.map((d) => `  ${d.hoja} fila ${d.fila}: ${d.motivo}`),
    "No cuadran con la hoja:",
    ...lectura.controles.map((c) => `  ${c.hoja} fila ${c.fila} ${c.contraparte} ${c.documento ?? ""}: ${c.qué} hoja ${c.excel} / portal ${c.portal}`),
    "Fechas corregidas (día y mes invertidos):",
    ...lectura.fechasCorregidas.map((c) => `  ${c.hoja} fila ${c.fila}: ${c.excel} -> ${c.portal}`),
  );
}
try {
  writeFileSync("datos-privados/informe-cartera.txt", informe.join("\n"));
  console.log("\nDetalle en datos-privados/informe-cartera.txt");
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
  const archivo = archivoDeNombre(basename(ARCHIVO));
  for (const { clase, lectura } of lecturas) {
    if (!lectura.documentos.length) continue;
    const tiendas = new Set<string>();
    for (let i = 0; i < lectura.documentos.length; i += TAMANO_LOTE_IMPORTACION) {
      const r = await guardarLoteCartera(supabase, clase, archivo, lectura.documentos.slice(i, i + TAMANO_LOTE_IMPORTACION));
      r.tiendasDesconocidas.forEach((t) => tiendas.add(t));
    }
    const cierre = await cerrarImportacionCartera(supabase, clase, lectura.hojas, new Set(lectura.documentos.map((d) => d.origen_clave)));
    console.log(`${clase}: ${lectura.documentos.length} documentos cargados o actualizados, ${cierre.borrados} borrados, ${cierre.conservados} conservados`);
    if (tiendas.size) console.log(`  Tiendas fuera del catálogo (quedaron sin tienda): ${[...tiendas].join(", ")}`);
  }
  const { data } = await supabase.from("fin_cartera_totales").select("clase, saldo, vencido");
  for (const t of data ?? []) console.log(`fin_cartera_totales ${t.clase}: saldo ${usd(Number(t.saldo))}, vencido ${usd(Number(t.vencido))}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
