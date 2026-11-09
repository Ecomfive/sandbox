// Importa la nómina de Excel al Portal AF4 360° (Equipo › Nómina, migración 0906).
//
// Uso:
//   npx tsx scripts/finanzas/importar-nomina.ts [archivo…]                     # prueba: lee, recalcula y compara; no escribe
//   npx tsx scripts/finanzas/importar-nomina.ts [archivo…] --libro=<GASTOS_…>  # además concilia con el libro de ese Excel
//   npx tsx --env-file=.env.local scripts/finanzas/importar-nomina.ts [archivo…] --aplicar   # escribe en Supabase
//
// Sin archivos lee datos-privados/PLANILLA_FORMAL_PANAMA.xlsx y datos-privados/NOMINA_EXTRANJERA.xlsx (la carpeta no se
// sube a git). Es seguro repetirlo: cada línea tiene su huella; lo corregido a mano en el portal no se pisa y lo que
// desapareció del archivo se borra solo si vino de ese mismo archivo.
//
// **Datos sensibles:** no imprime nombres, cédulas ni salarios sueltos; solo totales por mes y hojas/filas.

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import * as XLSX from "xlsx";
import { leerBaseDistribucion, leerLibro, type Celda as CeldaLibro } from "../../src/lib/finanzas/libro-excel";
import { origenDeArchivo } from "../../src/lib/finanzas/guardar-libro";
import { hojasDelLibro, leerLibroNomina } from "../../src/lib/nomina/hoja";
import { leerNomina, UNIDAD_REPARTO, type LecturaNomina } from "../../src/lib/nomina/excel";
import { TAMANO_LOTE, cerrarImportacionNomina, guardarLoteNomina } from "../../src/lib/nomina/guardar";
import { conciliarPorMes, conciliarPorTienda, explicarDiferencias, repartir, sinExplicar, TIPOS_SUELDO, type CostoNomina, type EerrSueldo, type MovimientoSueldo } from "../../src/lib/nomina/conciliacion";

const APLICAR = process.argv.includes("--aplicar");
const LIBRO = process.argv.find((a) => a.startsWith("--libro="))?.slice(8) ?? null;
const pedidos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ARCHIVOS = pedidos.length ? pedidos : ["datos-privados/PLANILLA_FORMAL_PANAMA.xlsx", "datos-privados/NOMINA_EXTRANJERA.xlsx"];

const usd = (v: number) => v.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mes = (p: string) => p.slice(0, 7);

const lecturas: { archivo: string; origen: string; lectura: LecturaNomina }[] = [];
for (const archivo of ARCHIVOS) {
  if (!existsSync(archivo)) {
    console.error(`No encuentro ${archivo}.`);
    process.exit(1);
  }
  const lectura = leerNomina(hojasDelLibro(leerLibroNomina(readFileSync(archivo))));
  if (!lectura) {
    console.error(`${archivo}: no parece una planilla formal ni una nómina externa.`);
    process.exit(1);
  }
  const origen = origenDeArchivo(basename(archivo));
  lecturas.push({ archivo, origen, lectura });
  const { tipo, lineas, periodos, noCuadran, descartadas, hojasIgnoradas } = lectura;
  console.log(`\n${origen} · nómina ${tipo} · ${lineas.length} líneas · ${new Set(lineas.map((l) => l.clave)).size} personas`);
  if (hojasIgnoradas.length) console.log(`  Hojas que no son un mes (se ignoran): ${hojasIgnoradas.join(", ")}`);
  if (descartadas.length) console.log(`  Filas descartadas: ${descartadas.map((d) => `${d.hoja} f${d.fila} (${d.motivo})`).join("; ")}`);
  console.log(`  Mes      Líneas  Suma de líneas  Total del Excel  Diferencia  Comisión`);
  for (const p of periodos) {
    const dif = p.total_excel === null ? "—" : usd(p.suma_lineas - p.total_excel);
    console.log(
      `  ${mes(p.periodo)}  ${String(p.lineas).padStart(6)}  ${usd(p.suma_lineas).padStart(14)}  ${(p.total_excel === null ? (tipo === "formal" ? "(sin fila)" : "(sin dato)") : usd(p.total_excel)).padStart(15)}  ${dif.padStart(10)}  ${usd(p.comision).padStart(8)}`,
    );
  }
  console.log(`  Filas que no cuadran con las fórmulas: ${new Set(noCuadran.map((x) => `${x.hoja}|${x.fila}`)).size}`);
  for (const x of noCuadran) console.log(`    ${x.hoja} fila ${x.fila}: ${x.campo} Excel ${usd(x.excel)} · fórmula ${usd(x.calculado)}`);
}

// ---------------------------------------------------------------------------------------------
// Conciliación con el libro de un Excel de gastos (solo lectura, sin Supabase)
// ---------------------------------------------------------------------------------------------
if (LIBRO) {
  const libroXlsx = XLSX.read(readFileSync(LIBRO), { cellDates: true });
  const filas = (h: string) => XLSX.utils.sheet_to_json<CeldaLibro[]>(libroXlsx.Sheets[h], { header: 1, raw: true, defval: null });
  const hojaAnio = libroXlsx.SheetNames.find((h) => /^20\d{2}$/.test(h.trim())) ?? "2026";
  const { movimientos } = leerLibro(filas(hojaAnio), origenDeArchivo(basename(LIBRO)));
  const base = libroXlsx.Sheets.EERR ? leerBaseDistribucion(filas("EERR")) : [];
  const libro: MovimientoSueldo[] = movimientos
    .filter((m) => m.tipo && TIPOS_SUELDO.includes(m.tipo.trim().toUpperCase()))
    .map((m) => ({ periodo: m.periodo, unidad: m.unidad, tipo: m.tipo!, en_eerr: m.en_eerr, monto: m.monto, descripcion: m.descripcion, fecha: m.fecha_pago }));
  const reparto = new Set([UNIDAD_REPARTO]);
  // El EERR del libro repartido como `fin_eerr_mensual`.
  const eerr: EerrSueldo[] = [];
  for (const periodo of new Set(libro.map((m) => m.periodo))) {
    for (const tipo of TIPOS_SUELDO) {
      const montos = new Map<string, number>();
      for (const m of libro) if (m.periodo === periodo && m.en_eerr && m.tipo.trim().toUpperCase() === tipo) montos.set(m.unidad, (montos.get(m.unidad) ?? 0) + m.monto);
      const r = repartir(montos, base.filter((b) => b.periodo === periodo), reparto);
      for (const [unidad, monto] of r.porTienda) eerr.push({ periodo, unidad, tipo, monto });
    }
  }
  const costos: CostoNomina[] = lecturas.flatMap(({ lectura }) =>
    lectura.lineas.map((l) => ({ periodo: l.periodo, tipo: l.tipo, unidad: l.unidad ?? l.unidad_persona ?? UNIDAD_REPARTO, neto: l.neto })),
  );
  const comisiones: Record<string, number> = {};
  const retenciones: Record<string, number> = {};
  for (const { lectura } of lecturas) {
    for (const p of lectura.periodos) comisiones[p.periodo] = (comisiones[p.periodo] ?? 0) + p.comision;
    for (const l of lectura.lineas) retenciones[l.periodo] = (retenciones[l.periodo] ?? 0) + l.seguro_social + l.seguro_educativo;
  }
  console.log(`\nConciliación con el libro (${basename(LIBRO)}, hoja ${hojaAnio}) · formal = neto contra SUELDOS · externa = total USDT contra OTROS SUELDOS`);
  console.log(`  Mes      Planilla   SUELDOS    Dif.   │  Externa   OTROS S.    Dif.   │ Fuera EERR`);
  const porMes = conciliarPorMes(costos, libro, comisiones);
  for (const f of porMes) {
    console.log(
      `  ${mes(f.periodo)} ${usd(f.formal).padStart(9)} ${usd(f.sueldosLibro).padStart(9)} ${usd(f.difFormal).padStart(8)}   │ ${usd(f.externa).padStart(9)} ${usd(f.otrosLibro).padStart(9)} ${usd(f.difExterna).padStart(8)}   │ ${usd(f.fueraEerr).padStart(9)}`,
    );
    const exp = explicarDiferencias(f, libro, Math.round((retenciones[f.periodo] ?? 0) * 100) / 100);
    for (const e of exp) console.log(`      · ${e.texto}: ${usd(e.monto)}`);
    if (exp.some((e) => e.explica)) console.log(`      = sin explicar: ${usd(sinExplicar(f, exp))}`);
  }
  for (const periodo of (process.argv.find((a) => a.startsWith("--detalle="))?.slice(10) ?? "").split(",").filter(Boolean)) {
    console.log(`\n  Por tienda ${periodo} (nómina repartida por envíos vs EERR del libro)`);
    for (const t of conciliarPorTienda(`${periodo}-01`, costos, eerr, libro, base, reparto)) {
      console.log(`    ${t.unidad.padEnd(16)} planilla ${usd(t.nominaFormal).padStart(9)} libro ${usd(t.libroSueldos).padStart(9)} · externa ${usd(t.nominaExterna).padStart(9)} libro ${usd(t.libroOtros).padStart(9)} · dif ${usd(t.diferencia).padStart(9)}`);
    }
  }
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
  for (const { origen, lectura } of lecturas) {
    const lineas = [...lectura.lineas].sort((a, b) => a.periodo.localeCompare(b.periodo));
    let conservados = 0;
    let personasNuevas = 0;
    let enMesCerrado = 0;
    const tiendas = new Set<string>();
    for (let i = 0; i < lineas.length; i += TAMANO_LOTE) {
      const r = await guardarLoteNomina(supabase, origen, lineas.slice(i, i + TAMANO_LOTE));
      conservados += r.conservados;
      enMesCerrado += r.enMesCerrado;
      personasNuevas += r.personasNuevas;
      r.tiendasNuevas.forEach((t) => tiendas.add(t));
    }
    const cierre = await cerrarImportacionNomina(supabase, origen, new Set(lineas.map((l) => l.origen_clave)), lectura.periodos);
    console.log(`${origen}: ${lineas.length} líneas cargadas o actualizadas, ${personasNuevas} personas nuevas, ${cierre.borrados} borradas, ${cierre.meses} meses`);
    if (conservados) console.log(`  Corregidas a mano en el portal (no se pisaron): ${conservados}`);
    if (enMesCerrado + cierre.enMesCerrado) console.log(`  De meses cerrados (no se tocaron): ${enMesCerrado + cierre.enMesCerrado}`);
    if (tiendas.size) console.log(`  Tiendas nuevas: ${[...tiendas].join(", ")}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
