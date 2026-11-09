// Importa la hoja de deliverys al Portal AF4 360° (Operación › Deliverys, migración 0911).
//
// Uso:
//   npx tsx scripts/finanzas/importar-deliverys.ts [archivo]                         # prueba: lee, calcula y compara; no escribe
//   npx tsx scripts/finanzas/importar-deliverys.ts [archivo] --libro=<GASTOS_….xlsx> # además cruza con los pagos del libro
//   npx tsx --env-file=.env.local scripts/finanzas/importar-deliverys.ts [archivo] --aplicar [--alias=NOMBRE:DUEÑO …]
//
// Sin archivo lee datos-privados/GESTION_DELIVERYS_SEPTIEMBRE_2026.xlsx (la carpeta no se sube a git). Es seguro
// repetirlo: cada línea tiene su huella; las de una semana ya cerrada no se tocan y lo que desapareció del archivo se
// borra solo si vino de ese mismo archivo. Un nombre de la hoja que no es de ningún repartidor se crea como repartidor
// nuevo, salvo que `--alias=ZONA 5 X:NOMBRE DEL DUEÑO` diga de quién es (o que ya esté en sus zonas).
//
// **Datos personales:** no imprime nombres de repartidores; solo totales por semana y tienda.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import { leerLibro, type Celda } from "../../src/lib/finanzas/libro-excel";
import { origenDeArchivo } from "../../src/lib/finanzas/guardar-libro";
import { cruzarConLibro } from "../../src/lib/deliverys/conciliar-libro";
import { claveEtiqueta, leerGestionDeliverys, TIENDAS_EXCEL } from "../../src/lib/deliverys/excel";
import { aplicarAsignaciones, cerrarImportacionEntregas, etiquetasSinDueno, guardarLoteEntregas, leerRepartidores, TAMANO_LOTE, type Asignacion } from "../../src/lib/deliverys/guardar";
import { leerHojaDeliverys } from "../../src/lib/deliverys/hoja";
import { finSemana, inicioSemana, liquidar, type LineaLiquidacion } from "../../src/lib/deliverys/liquidacion";
import { sugerirDueno } from "../../src/lib/deliverys/repartidor";

const APLICAR = process.argv.includes("--aplicar");
const LIBRO = process.argv.find((a) => a.startsWith("--libro="))?.slice(8) ?? null;
const ALIAS = process.argv.filter((a) => a.startsWith("--alias=")).map((a) => a.slice(8).split(":").map(claveEtiqueta) as [string, string]);
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "datos-privados/GESTION_DELIVERYS_SEPTIEMBRE_2026.xlsx";
const usd = (v: number) => v.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

if (!existsSync(ARCHIVO)) {
  console.error(`No encuentro ${ARCHIVO}.`);
  process.exit(1);
}
const hoja = leerHojaDeliverys(readFileSync(ARCHIVO));
const lectura = hoja ? leerGestionDeliverys(hoja.filas) : null;
if (!hoja || !lectura) {
  console.error(`${ARCHIVO}: no encontré la hoja de gestión (fila con «NOMBRE DEL DELIVERY» y bloques «COSTE DE ENVIO $…»).`);
  process.exit(1);
}
const origen = origenDeArchivo(basename(ARCHIVO));
console.log(`\n${origen} · hoja «${hoja.hoja}» · ${lectura.filas} filas · ${lectura.entregas.length} líneas · ${lectura.etiquetas.length} nombres · del ${lectura.desde} al ${lectura.hasta}`);
console.log(`  Total que paga la hoja (CÁLCULO TOTAL A PAGAR): ${usd(lectura.totalExcel)} · calculado con las tarifas: ${usd(lectura.totalCalculado)}`);
console.log(`  Filas que no cuadran con «Pagar por envíos <tienda>»: ${lectura.noCuadran.length}`);
for (const x of lectura.noCuadran) console.log(`    fila ${x.fila} ${x.tienda}: Excel ${usd(x.excel)} · tarifas ${usd(x.calculado)}`);
for (const a of lectura.avisos) console.log(`  Aviso fila ${a.fila}: ${a.mensaje}`);

// Por semana (todas las personas): lo que va al recibo y lo de Clicksi.
const porSemana = new Map<string, LineaLiquidacion[]>();
const porSemanaTienda: { semana: string; tienda: string; monto: number }[] = [];
for (const e of lectura.entregas) {
  const s = inicioSemana(e.fecha);
  const l: LineaLiquidacion = { estado: e.estado, categoria: e.categoria, cantidad: e.cantidad, tarifa: e.tarifa, tienda: TIENDAS_EXCEL[e.tienda] ?? e.tienda, pagoAparte: e.tienda === "CLICKSI" };
  (porSemana.get(s) ?? porSemana.set(s, []).get(s)!).push(l);
}
console.log(`\n  Semana (jue–mié)        En ruta  Entregas  Tasa   A pagar (recibos)  Clicksi aparte`);
for (const [s, ls] of [...porSemana].sort(([a], [b]) => a.localeCompare(b))) {
  const r = liquidar(ls);
  for (const t of r.porTienda) if (!t.pagoAparte) porSemanaTienda.push({ semana: s, tienda: t.tienda, monto: t.total });
  console.log(
    `  ${s} al ${finSemana(s)}  ${String(r.enRuta).padStart(7)}  ${String(r.entregas).padStart(8)}  ${r.tasaEntrega === null ? "  —  " : `${Math.round(r.tasaEntrega * 100)} %`.padStart(5)}  ${usd(r.aPagar).padStart(17)}  ${usd(r.aparte).padStart(14)}`,
  );
}

if (LIBRO) {
  const libro = XLSX.read(readFileSync(LIBRO), { cellDates: true });
  const hojaAnio = libro.SheetNames.find((h) => /^20\d{2}$/.test(h.trim())) ?? "2026";
  const filas = XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[hojaAnio], { header: 1, raw: true, defval: null });
  const { movimientos } = leerLibro(filas, origenDeArchivo(basename(LIBRO)));
  const pagos = movimientos.filter((m) => /^shipping por ventas/i.test(m.tipo ?? "")).map((m) => ({ periodo: m.periodo, tienda: m.unidad, descripcion: m.descripcion, monto: m.monto }));
  const cruce = cruzarConLibro(porSemanaTienda, pagos);
  console.log(`\n  Cruce con los pagos del libro (${basename(LIBRO)}, «TRANSPORTE … AL …», Shipping por Ventas)`);
  console.log(`  Semana       Tienda         Deliverys      Libro   Diferencia  Líneas`);
  for (const c of cruce) console.log(`  ${c.semana}  ${c.tienda.padEnd(12)} ${usd(c.deliverys).padStart(10)} ${usd(c.libro).padStart(10)} ${usd(c.diferencia).padStart(12)}  ${String(c.lineasLibro).padStart(6)}`);
  const cuadran = cruce.filter((c) => Math.abs(c.diferencia) < 0.01).length;
  console.log(`  Cuadran ${cuadran} de ${cruce.length} (las diferencias suelen ser adelantos o descuentos que en Deliverys van en el cierre).`);
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
  const l = lectura!;
  // Primero los dueños de cada nombre: --alias, la sugerencia «ZONA … <NOMBRE>» o un repartidor nuevo.
  let repartidores = await leerRepartidores(supabase);
  const porClave = new Map(repartidores.map((r) => [r.clave, r.id]));
  const directos = etiquetasSinDueno(l.etiquetas, repartidores).filter((e) => !ALIAS.some(([a]) => a === e) && !sugerirDueno(e, repartidores));
  // Los que no son zona de nadie se crean primero, para que las zonas («ZONA 5 X») encuentren a su dueño.
  if (directos.length) await aplicarAsignaciones(supabase, directos.map((etiqueta) => ({ etiqueta, repartidorId: null })));
  repartidores = await leerRepartidores(supabase);
  for (const r of repartidores) porClave.set(r.clave, r.id);
  const asignaciones: Asignacion[] = etiquetasSinDueno(l.etiquetas, repartidores).map((etiqueta) => {
    const dueno = ALIAS.find(([a]) => a === etiqueta)?.[1];
    return { etiqueta, repartidorId: (dueno && porClave.get(dueno)) || sugerirDueno(etiqueta, repartidores) };
  });
  const a = await aplicarAsignaciones(supabase, asignaciones);
  console.log(`\nRepartidores nuevos: ${directos.length + a.creados} · zonas asignadas: ${a.alias}`);

  const lineas = [...l.entregas].sort((x, y) => x.fecha.localeCompare(y.fecha));
  let guardadas = 0;
  let conservadas = 0;
  let sinRepartidor = 0;
  let sinTienda = 0;
  for (let i = 0; i < lineas.length; i += TAMANO_LOTE) {
    const r = await guardarLoteEntregas(supabase, origen, lineas.slice(i, i + TAMANO_LOTE));
    guardadas += r.guardadas;
    conservadas += r.conservadas;
    sinRepartidor += r.sinRepartidor;
    sinTienda += r.sinTienda;
  }
  const fin = await cerrarImportacionEntregas(supabase, origen, new Set(lineas.map((x) => x.origen_clave)));
  console.log(`${origen}: ${guardadas} líneas cargadas o actualizadas, ${fin.borradas} borradas`);
  if (conservadas) console.log(`  De semanas ya cerradas (no se tocaron): ${conservadas}`);
  if (sinRepartidor) console.log(`  Sin repartidor (no se cargaron): ${sinRepartidor}`);
  if (sinTienda) console.log(`  Tienda sin configurar en del_tiendas (no se cargaron): ${sinTienda}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
