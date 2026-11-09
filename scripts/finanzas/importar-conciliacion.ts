// Importa el libro de conciliación bancaria (CONCILIACIONES_DE_BANCO_*.xlsx) al Portal AF4 360° (migración 0910; ver
// FINANZAS-360.md). Es lo mismo que «Conciliación bancaria › Importar», desde la terminal.
//
// Uso:
//   npx tsx scripts/finanzas/importar-conciliacion.ts [archivo] [--libro=GASTOS_PANAMA_2026.xlsx]   # prueba en seco
//   npx tsx --env-file=.env.local scripts/finanzas/importar-conciliacion.ts [archivo] --aplicar      # escribe en Supabase
//
// En seco lee el Excel, empareja en memoria (contra el libro de gastos si se pasa --libro, o el de datos-privados/) y
// compara con lo que se marcó en el Excel. La consola muestra solo totales; el detalle por línea (con descripciones
// del banco) va a informe-conciliacion.txt, junto al Excel (datos-privados/ es privada).

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import * as XLSX from "xlsx";
import { leerLibro, type Celda } from "../../src/lib/finanzas/libro-excel";
import { leerHoja, normal, type HojaLeida } from "../../src/lib/conciliacion/leer-excel";
import { clasificarLinea, emparejar, type CobroEmp, type LineaEmp, type MovEmp, type OrdenEmp, type Propuesta } from "../../src/lib/conciliacion/emparejar";
import { recalcularCuentaMes, guardarCobros, guardarLineas, guardarOrdenes, mesesDe, TAMANO_LOTE } from "../../src/lib/conciliacion/guardar";

const APLICAR = process.argv.includes("--aplicar");
const argumentos = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ARCHIVO = argumentos[0] ?? "datos-privados/CONCILIACIONES_DE_BANCO_PRUEBA.xlsx";
const LIBRO = process.argv.find((a) => a.startsWith("--libro="))?.slice(8) ?? "datos-privados/GASTOS_PANAMA_2026.xlsx";
if (!existsSync(ARCHIVO)) {
  console.error(`No encuentro ${ARCHIVO}. Copia el Excel a datos-privados/ o pasa la ruta como primer argumento.`);
  process.exit(1);
}

/** La cuenta del libro de cada hoja de extracto (la misma regla que `cuentaSugerida`). */
const CUENTA_DE_HOJA: Record<string, string> = { "BANCO GENERAL": "BANCO GENERAL", BAC: "BAC OCEANS", ECOMFIVE: "BAC ECOMFIVE" };
const cuentaDe = (hoja: string) => CUENTA_DE_HOJA[normal(hoja)] ?? normal(hoja);

const wb = XLSX.read(readFileSync(ARCHIVO), { cellDates: true });
const filasDe = (libro: XLSX.WorkBook, h: string) => XLSX.utils.sheet_to_json<Celda[]>(libro.Sheets[h], { header: 1, raw: true, defval: null });
const hojas: HojaLeida[] = wb.SheetNames.map((h) => leerHoja(h, filasDe(wb, h))).filter((h): h is HojaLeida => h !== null);
const extractos = hojas.filter((h) => h.lineas.length);
const cobros = hojas.flatMap((h) => h.cobros);
const ordenes = hojas.flatMap((h) => h.ordenes);
const usd = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const informe: string[] = [`Conciliación ${basename(ARCHIVO)} (${new Date().toISOString()})`];

console.log(`\n${basename(ARCHIVO)}`);
for (const h of hojas) {
  const rango = h.lineas.length ? ` · ${h.lineas[0].fecha} a ${h.lineas.reduce((a, l) => (l.fecha > a ? l.fecha : a), "")}` : "";
  console.log(
    `  ${h.hoja.padEnd(22)} ${h.formato.padEnd(14)} líneas ${String(h.lineas.length).padStart(4)} · cobros ${String(h.cobros.length).padStart(4)} · órdenes ${String(h.ordenes.length).padStart(4)} · descartadas ${h.descartadas.length}${rango}`,
  );
}

// El libro de gastos, para emparejar en seco contra sus movimientos (en el portal salen de fin_movimientos).
const SIGNO_MAS = new Set(["INGRESOS", "INTERES GANADOS", "APORTE CAPITAL"]);
let movimientos: (MovEmp & { cuenta: string })[] = [];
if (existsSync(LIBRO)) {
  const lb = XLSX.read(readFileSync(LIBRO), { cellDates: true });
  const hojaLibro = lb.SheetNames.find((h) => /^20\d{2}$/.test(h.trim())) ?? lb.SheetNames[0];
  const { movimientos: movs } = leerLibro(filasDe(lb, hojaLibro), basename(LIBRO));
  movimientos = movs
    .filter((m) => m.cuenta)
    .map((m) => ({
      id: m.origen_clave,
      cuenta: normal(m.cuenta!),
      fecha: m.fecha_pago ?? m.fecha_registro,
      efecto: SIGNO_MAS.has(normal(m.tipo ?? "")) ? m.monto : -m.monto,
      descripcion: m.descripcion,
    }));
  console.log(`  Libro ${basename(LIBRO)}: ${movimientos.length} movimientos con forma de pago`);
} else console.log(`  Sin libro de gastos (${LIBRO}): se empareja solo contra cobros y órdenes.`);

// ---------------------------------------------------------------------------------------------
// Emparejar en memoria y comparar con lo marcado en el Excel
// ---------------------------------------------------------------------------------------------
const cobrosEmp: CobroEmp[] = cobros.map((c) => ({
  id: c.huella,
  fuente: c.fuente,
  fecha: c.fecha,
  fechaDeposito: c.fecha_deposito,
  lote: c.lote,
  referenciaBanco: c.referencia_banco,
  bruto: c.monto_bruto,
  anulada: c.anulada,
}));
const ordenesEmp: OrdenEmp[] = ordenes.map((o) => ({ id: o.huella, fuente: "conc_ordenes", numero: o.numero, fecha: o.fecha, monto: o.monto, metodo: o.metodo_pago, repartidor: o.repartidor }));
const lineas: (LineaEmp & { hoja: string; estado_excel: string | null; fila: number })[] = extractos.flatMap((h) =>
  h.lineas.map((l) => ({
    id: `${h.hoja}|${l.huella}`,
    hoja: h.hoja,
    fila: l.fila,
    fecha: l.fecha,
    monto: l.monto,
    descripcion: l.descripcion,
    referencia: l.referencia,
    referenciaExtra: l.referencia_extra,
    clase: clasificarLinea(l.descripcion, l.monto),
    estado_excel: l.estado_excel,
  })),
);

// Todas las hojas a la vez (como en el portal: los cobros y las órdenes no son de una sola cuenta); el libro, por cuenta.
const porCuenta = new Map<string, typeof lineas>();
for (const l of lineas) porCuenta.set(cuentaDe(l.hoja), [...(porCuenta.get(cuentaDe(l.hoja)) ?? []), l]);
const elegidas = new Map<string, Propuesta>();
{
  // `emparejar` no sabe de cuentas: se corre por cuenta (como en el portal) con los cobros y órdenes que queden libres.
  const usados = new Set<string>();
  for (const [cuenta, ls] of [...porCuenta].sort(([a], [b]) => a.localeCompare(b))) {
    const r = emparejar(ls, {
      movimientos: movimientos.filter((m) => m.cuenta === cuenta),
      cobros: cobrosEmp.filter((c) => !usados.has(c.id)),
      ordenes: ordenesEmp.filter((o) => !usados.has(o.id)),
    });
    for (const p of r.elegidas) {
      elegidas.set(p.lineaId, p);
      for (const x of p.partes) if (x.clase !== "movimiento") usados.add(x.id);
    }
  }
}

const destino = (p: Propuesta | undefined) => (!p ? "pendiente" : p.auto ? "auto" : "sugerida");
console.log("\nPor banco (líneas · solas · sugeridas · pendientes) — y contra lo que se marcó Conciliado");
for (const [cuenta, ls] of porCuenta) {
  const c = { auto: 0, sugerida: 0, pendiente: 0 };
  const majo = { total: 0, auto: 0, sugerida: 0, pendiente: 0 };
  const noConc = { total: 0, auto: 0, sugerida: 0 };
  const porFuente = new Map<string, { auto: number; sugerida: number }>();
  for (const l of ls) {
    const p = elegidas.get(l.id);
    const d = destino(p);
    c[d]++;
    if (p) {
      const f = p.partes[0].clase === "movimiento" ? "libro" : p.partes[0].clase === "orden" ? "órdenes" : p.detalle.split(" ")[0].toLowerCase();
      const x = porFuente.get(f) ?? { auto: 0, sugerida: 0 };
      x[p.auto ? "auto" : "sugerida"]++;
      porFuente.set(f, x);
    }
    if (l.estado_excel === "conciliado") {
      majo.total++;
      majo[d]++;
    } else if (l.estado_excel === "no_conciliado" || l.estado_excel === "en_revision") {
      noConc.total++;
      if (d !== "pendiente") noConc[d]++;
    }
  }
  const creditos = ls.filter((l) => l.monto > 0).length;
  console.log(
    `  ${cuenta.padEnd(14)} ${String(ls.length).padStart(4)} líneas (${creditos} créditos, ${ls.length - creditos} débitos) · solas ${c.auto} · sugeridas ${c.sugerida} · pendientes ${c.pendiente}`,
  );
  console.log(`      por fuente: ${[...porFuente].map(([f, x]) => `${f} ${x.auto}+${x.sugerida}`).join(" · ") || "—"}  (solas+sugeridas)`);
  console.log(`      Excel «Conciliado» ${majo.total}: el portal las concilia solo ${majo.auto}, sugiere ${majo.sugerida}, deja pendientes ${majo.pendiente}`);
  console.log(`      Excel «No conciliado / en revisión» ${noConc.total}: el portal concilia solo ${noConc.auto}, sugiere ${noConc.sugerida}`);
  informe.push("", `== ${cuenta}`);
  for (const l of ls) {
    const p = elegidas.get(l.id);
    informe.push(
      `  ${l.hoja} fila ${l.fila} ${l.fecha} ${usd(l.monto).padStart(10)} [${l.clase}] Excel=${l.estado_excel ?? "—"} → ${destino(p)}${p ? ` (${p.puntaje}) ${p.detalle}` : ""} · ${l.descripcion}`,
    );
  }
}

// Cobros: lo liquidado contra lo depositado.
console.log("\nCobros (liquidado → en un depósito del banco)");
const enDeposito = new Set([...elegidas.values()].flatMap((p) => p.partes.filter((x) => x.clase === "cobro").map((x) => x.id)));
for (const fuente of ["yappy", "mipos", "servientrega"] as const) {
  const de = cobrosEmp.filter((c) => c.fuente === fuente && !c.anulada);
  const dep = de.filter((c) => enDeposito.has(c.id));
  console.log(
    `  ${fuente.padEnd(13)} ${String(de.length).padStart(4)} cobros ${usd(de.reduce((a, c) => a + c.bruto, 0)).padStart(11)} · en un depósito ${String(dep.length).padStart(4)} (${usd(dep.reduce((a, c) => a + c.bruto, 0))})`,
  );
}

try {
  // Junto al Excel (en datos-privados/, que es privada).
  writeFileSync(join(dirname(ARCHIVO), "informe-conciliacion.txt"), informe.join("\n"));
  console.log(`\nDetalle en ${join(dirname(ARCHIVO), "informe-conciliacion.txt")}`);
} catch {
  // Sin la carpeta (archivo pasado por ruta): el resumen de arriba basta.
}

if (!APLICAR) {
  console.log("\nPrueba en seco: no se escribió nada. Corre de nuevo con --aplicar para cargarlo.");
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------
// Escribir en Supabase
// ---------------------------------------------------------------------------------------------
async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (corre con --env-file=.env.local).");
    process.exit(1);
  }
  const supabase = createClient(url, clave, { auth: { persistSession: false } });
  const { data: cuentasDb, error: errorCuentas } = await supabase.from("fin_cuentas").select("id, nombre");
  if (errorCuentas) {
    console.error(`fin_cuentas: ${errorCuentas.message}`);
    process.exit(1);
  }
  const idCuenta = new Map((cuentasDb ?? []).map((c) => [normal(c.nombre as string), c.id as string]));

  for (let i = 0; i < cobros.length; i += TAMANO_LOTE) await guardarCobros(supabase, cobros.slice(i, i + TAMANO_LOTE));
  for (let i = 0; i < ordenes.length; i += TAMANO_LOTE) await guardarOrdenes(supabase, ordenes.slice(i, i + TAMANO_LOTE));
  const tocados = new Set<string>();
  for (const h of extractos) {
    const cuentaId = idCuenta.get(cuentaDe(h.hoja));
    if (!cuentaId) {
      console.error(`  ${h.hoja}: no existe la cuenta «${cuentaDe(h.hoja)}» en fin_cuentas; se salta.`);
      continue;
    }
    for (let i = 0; i < h.lineas.length; i += TAMANO_LOTE) {
      await guardarLineas(supabase, { cuentaId, archivo: basename(ARCHIVO), hoja: h.hoja, formato: h.formato }, h.lineas.slice(i, i + TAMANO_LOTE), null);
    }
    for (const mes of mesesDe(h.lineas)) tocados.add(`${cuentaId}|${mes}`);
  }
  let auto = 0;
  let sugeridas = 0;
  for (const t of tocados) {
    const [cuentaId, mes] = t.split("|");
    const r = await recalcularCuentaMes(supabase, cuentaId, mes);
    auto += r.auto;
    sugeridas += r.sugeridas;
  }
  console.log(`\nCargado: ${cobros.length} cobros, ${ordenes.length} órdenes, ${extractos.reduce((a, h) => a + h.lineas.length, 0)} líneas · conciliadas solas ${auto} · sugeridas ${sugeridas}.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.stack ?? e.message : JSON.stringify(e));
  process.exit(1);
});
