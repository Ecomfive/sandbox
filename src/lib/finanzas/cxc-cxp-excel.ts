// Lectura de las cuentas por cobrar y por pagar del Excel de gastos (GASTOS_PANAMA_<año>.xlsx). Lógica pura: recibe las
// filas de cada hoja ya leídas (arreglos de celdas) y devuelve documentos con sus abonos, lo descartado con su motivo y
// los controles contra lo que dice la hoja (saldo, estado, «CUENTA CERRADA»). La usan la pantalla «Importar Excel» de
// cada cartera (en el navegador) y `scripts/finanzas/importar-cartera.ts`. Prueba en `cxc-cxp-excel.test.ts`.
//
// Formatos que entiende:
//  - «CPC»: una lista (N, CLIENTE / DEUDOR, FACT, FECH. EMI., MOTIVO, MONTO TOTAL, ABONO 1/2/3, MÉTODO, S. PENDIENTE,
//    ESTADO, OBSERVACIONES). Las filas de plantilla (solo el número, la fecha y el saldo en 0) se ignoran.
//  - «CPP»: bloques uno al lado del otro, uno por acreedor: el nombre arriba, «MOTIVO», y las columnas FECHA, (NOMBRE),
//    DEUDA, FECH. ABONO, ABONO, REF., MÉTODO. Un mismo bloque puede seguir más abajo con otro acreedor. Una fila de
//    DEUDA que llega después de abonos es el saldo que va quedando (fórmula del Excel), no una deuda nueva. «CUENTA
//    CERRADA» cierra el bloque.
//  - Una hoja en lista con DESCRIPCIÓN, FECHA COMPRA, # MONTO y ESTATUS («CPP CALZADOS O. VZLA»).

import { huella, leerMonto, type Celda } from "./libro-excel";
import { diasEntre, normalizarMetodo, redondear, saldoDe, estadoDe, type AbonoImportado, type Clase, type DocumentoImportado, type Estado } from "./cxc-cxp";

export interface DescartadaCartera {
  hoja: string;
  fila: number;
  motivo: string;
}

/** Un saldo o un estado que dice la hoja y no coincide con lo que calcula el portal. */
export interface ControlCartera {
  hoja: string;
  fila: number;
  contraparte: string;
  documento: string | null;
  qué: string;
  excel: string;
  portal: string;
}

export interface FechaCorregida {
  hoja: string;
  fila: number;
  excel: string;
  portal: string;
}

export interface LecturaCartera {
  documentos: DocumentoImportado[];
  descartadas: DescartadaCartera[];
  controles: ControlCartera[];
  fechasCorregidas: FechaCorregida[];
  /** Filas de plantilla (numeradas pero vacías) que se ignoraron. */
  plantilla: number;
  hojas: string[];
}

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const texto = (v: Celda): string | null => {
  if (v === null || v === undefined || v instanceof Date) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};

const esErrorExcel = (v: Celda) => typeof v === "string" && /^#(VALUE|REF|DIV\/0|N\/A|NAME\?|NUM|NULL)/i.test(v.trim());

const iso = (y: number, m: number, d: number): string | null => {
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(y, m - 1, d));
  return f.getUTCMonth() === m - 1 ? f.toISOString().slice(0, 10) : null;
};

/** Una fecha leída de una celda: la que dice (`fecha`) y, si el día y el mes pueden estar invertidos, la otra lectura. */
export interface FechaLeida {
  fecha: string | null;
  alterna: string | null;
  /** La celda tenía algo que no es una fecha válida (#VALUE!, un año 20225…). */
  error: boolean;
}

const SIN_FECHA: FechaLeida = { fecha: null, alterna: null, error: false };

/**
 * Lee una fecha de una celda. Una fecha de Excel cuyo día y mes son los dos ≤ 12 (y distintos) puede venir invertida: el
 * Excel está en día/mes y algunas fechas se escribieron mes/día; esas quedan con `alterna` para que `resolverFechas`
 * elija por sus vecinas. Un texto «11/15/2025» es mes/día (el 15 no es un mes); «15/11/2025» es día/mes.
 */
export function leerFechaCelda(v: Celda): FechaLeida {
  if (v === null || v === undefined || v === "") return SIN_FECHA;
  let y: number, m: number, d: number;
  let ambigua = false;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return { ...SIN_FECHA, error: true };
    // +12 h: la fecha local de medianoche cae en el mismo día UTC en cualquier zona entre −12 y +12.
    const f = new Date(v.getTime() + 12 * 3_600_000);
    [y, m, d] = [f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()];
    ambigua = d <= 12 && d !== m;
  } else if (typeof v === "number") {
    if (v < 20000 || v > 80000) return { ...SIN_FECHA, error: true };
    const f = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000);
    [y, m, d] = [f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate()];
    ambigua = d <= 12 && d !== m;
  } else {
    const s = String(v).trim();
    const a = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    const b = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    if (a) [y, m, d] = [Number(a[1]), Number(a[2]), Number(a[3])];
    else if (b) {
      const [p, q] = [Number(b[1]), Number(b[2])];
      y = Number(b[3]);
      // Mes primero salvo que el primero no pueda ser un mes.
      if (p > 12) [m, d] = [q, p];
      else [m, d] = [p, q];
      ambigua = p <= 12 && q <= 12 && p !== q;
    } else return { ...SIN_FECHA, error: true };
  }
  const fecha = iso(y, m, d);
  if (!fecha) return { ...SIN_FECHA, error: true };
  return { fecha, alterna: ambigua ? iso(y, d, m) : null, error: false };
}

/**
 * Elige entre la fecha y su lectura invertida mirando las fechas seguras más cercanas de la misma secuencia (la de arriba
 * y la de abajo): se invierte solo si así queda claramente más cerca de ellas (menos de la mitad de distancia).
 */
export function resolverFechas(fechas: FechaLeida[]): { fecha: string | null; corregida: boolean }[] {
  const seguras = fechas.map((f, i) => (f.fecha && !f.alterna ? i : -1)).filter((i) => i >= 0);
  return fechas.map((f, i) => {
    if (!f.fecha || !f.alterna) return { fecha: f.fecha, corregida: false };
    const antes = [...seguras].reverse().find((j) => j < i);
    const despues = seguras.find((j) => j > i);
    const anclas = [antes, despues].filter((j): j is number => j !== undefined).map((j) => fechas[j].fecha!);
    if (!anclas.length) return { fecha: f.fecha, corregida: false };
    const distancia = (x: string) => anclas.reduce((a, b) => a + Math.abs(diasEntre(b, x)), 0);
    return distancia(f.alterna) * 2 < distancia(f.fecha) ? { fecha: f.alterna, corregida: true } : { fecha: f.fecha, corregida: false };
  });
}

/** La tienda o unidad que se deduce del código del pedido (CO-… Calzados O., ECOM-… Ecomfive). Decisión a confirmar. */
export function unidadPorCodigo(documento: string | null): string | null {
  const s = normal(documento ?? "");
  if (/^CO\s*-/.test(s)) return "CALZADOS O.";
  if (/^ECOM\s*-/.test(s)) return "ECOMFIVE";
  return null;
}

/** Huella estable de un documento: hoja, contraparte, documento, fecha y monto (sin el nombre del archivo). */
function claveDocumento(hoja: string, clase: Clase, contraparte: string, documento: string | null, fecha: string | null, monto: number) {
  return [normal(hoja), clase, normal(contraparte), normal(documento ?? ""), fecha ?? "", monto.toFixed(2)].join("|");
}

type SinHuella = Omit<DocumentoImportado, "origen_clave" | "abonos"> & { abonos: Omit<AbonoImportado, "origen_clave">[] };

/** Solo los campos del documento y sus abonos (sin lo que se usó para leer la hoja). */
function soloDocumento(d: SinHuella): SinHuella {
  return {
    fila: d.fila,
    hoja: d.hoja,
    clase: d.clase,
    contraparte: d.contraparte,
    unidad: d.unidad,
    documento: d.documento,
    fecha: d.fecha,
    motivo: d.motivo,
    monto: d.monto,
    notas_excel: d.notas_excel,
    abonos: d.abonos.map((a) => ({ fecha: a.fecha, monto: a.monto, metodo: a.metodo, referencia: a.referencia })),
  };
}

/** Pone las huellas (con un ordinal para los repetidos) a documentos y abonos. */
function ponerHuellas(docs: SinHuella[]): DocumentoImportado[] {
  const vistos = new Map<string, number>();
  return docs.map((d) => {
    const base = claveDocumento(d.hoja, d.clase, d.contraparte, d.documento, d.fecha, d.monto);
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    const clave = `${huella(base)}#${n}`;
    const vistosAbono = new Map<string, number>();
    const abonos = d.abonos.map((a) => {
      const b = [clave, "abono", a.fecha ?? "", a.monto.toFixed(2)].join("|");
      const k = (vistosAbono.get(b) ?? 0) + 1;
      vistosAbono.set(b, k);
      return { ...a, origen_clave: `${huella(b)}#${k}` };
    });
    return { ...d, origen_clave: clave, abonos };
  });
}

const ESTADO_EXCEL: [RegExp, Estado][] = [
  [/PAGAD|CANCELAD|CERRAD/, "pagado"],
  [/PROCESO|PARCIAL|ABONAD/, "parcial"],
  [/PENDIENTE/, "pendiente"],
  [/INCOBRABLE/, "incobrable"],
  [/ANULAD/, "anulado"],
];
const estadoDeExcel = (s: string | null): Estado | null => (s ? (ESTADO_EXCEL.find(([r]) => r.test(normal(s)))?.[1] ?? null) : null);

const usd = (n: number) => n.toFixed(2);

// ---------------------------------------------------------------------------------------------
// CPC: lista
// ---------------------------------------------------------------------------------------------

function ubicarLista(filas: Celda[][], requeridos: ((n: string) => boolean)[]) {
  for (let i = 0; i < Math.min(filas.length, 30); i++) {
    const nombres = (filas[i] ?? []).map((c) => normal(texto(c) ?? ""));
    if (requeridos.every((r) => nombres.some(r))) return { fila: i, nombres };
  }
  return null;
}

/** La hoja «CPC» (cuentas por cobrar, en lista). */
export function leerHojaCpc(filas: Celda[][], hoja: string): Omit<LecturaCartera, "hojas" | "documentos"> & { documentos: DocumentoImportado[] } {
  const salida = { documentos: [] as DocumentoImportado[], descartadas: [] as DescartadaCartera[], controles: [] as ControlCartera[], fechasCorregidas: [] as FechaCorregida[], plantilla: 0 };
  const titulos = ubicarLista(filas, [(n) => n.startsWith("CLIENTE") || n.startsWith("DEUDOR"), (n) => n.startsWith("MONTO")]);
  if (!titulos) return salida;
  const { fila: filaTitulos, nombres } = titulos;
  const col = (f: (n: string) => boolean) => nombres.findIndex(f);
  const c = {
    contraparte: col((n) => n.startsWith("CLIENTE") || n.startsWith("DEUDOR")),
    documento: col((n) => n === "FACT" || n === "FACT." || n === "FACTURA" || n.startsWith("N° FACT") || n.startsWith("NO FACT")),
    fecha: col((n) => n.startsWith("FECH")),
    vencimiento: col((n) => n.startsWith("VENC")),
    motivo: col((n) => n.startsWith("MOTIVO") || n.startsWith("CONCEPTO")),
    monto: col((n) => n.startsWith("MONTO")),
    metodo: col((n) => n.startsWith("METODO") || n.startsWith("FORMA DE PAGO")),
    saldo: col((n) => n.startsWith("S. PEND") || n.startsWith("SALDO")),
    estado: col((n) => n === "ESTADO" || n === "ESTATUS"),
    notas: col((n) => n.startsWith("OBSERV") || n.startsWith("NOTAS")),
  };
  const abonosCols = nombres.map((n, i) => (n.startsWith("ABONO") ? i : -1)).filter((i) => i >= 0);
  const celda = (f: Celda[], i: number): Celda => (i >= 0 ? f[i] : null);

  const crudos: (Omit<DocumentoImportado, "origen_clave" | "abonos"> & { abonos: Omit<AbonoImportado, "origen_clave">[]; saldoExcel: number | null; estadoExcel: string | null; fechaLeida: FechaLeida })[] = [];
  for (let i = filaTitulos + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    const fila = i + 1;
    const contraparte = texto(celda(f, c.contraparte));
    const monto = leerMonto(celda(f, c.monto));
    const estadoTxt = texto(celda(f, c.estado));
    const motivo = texto(celda(f, c.motivo));
    const documento = texto(celda(f, c.documento));
    const abonos = abonosCols.map((k) => leerMonto(f[k])).filter((n): n is number => n !== null && n > 0);
    if (!contraparte && (monto === null || monto === 0)) {
      if (estadoTxt || motivo || documento || abonos.length) salida.descartadas.push({ hoja, fila, motivo: `sin cliente ni monto${estadoTxt ? ` (estado «${estadoTxt}»)` : ""}` });
      else if (f.some((x) => x !== null && x !== undefined && x !== "")) salida.plantilla++;
      continue;
    }
    if (!contraparte) {
      salida.descartadas.push({ hoja, fila, motivo: "sin cliente" });
      continue;
    }
    if (monto === null || monto <= 0) {
      salida.descartadas.push({ hoja, fila, motivo: monto === null ? "sin monto" : "monto en cero o negativo" });
      continue;
    }
    const f1 = leerFechaCelda(celda(f, c.fecha));
    if (f1.error) salida.descartadas.push({ hoja, fila, motivo: "fecha con error del Excel: se importa sin fecha" });
    const metodo = normalizarMetodo(texto(celda(f, c.metodo)));
    crudos.push({
      fila,
      hoja,
      clase: "cobrar",
      contraparte,
      unidad: null,
      documento,
      fecha: f1.fecha,
      motivo,
      monto: redondear(monto),
      notas_excel: texto(celda(f, c.notas)),
      abonos: abonos.map((m) => ({ fecha: null, monto: redondear(m), metodo, referencia: null })),
      saldoExcel: leerMonto(celda(f, c.saldo)),
      estadoExcel: estadoTxt,
      fechaLeida: f1,
    });
  }
  // En una lista las fechas se resuelven en el orden de las filas.
  const resueltas = resolverFechas(crudos.map((d) => d.fechaLeida));
  crudos.forEach((d, i) => {
    if (resueltas[i].corregida) {
      salida.fechasCorregidas.push({ hoja, fila: d.fila, excel: d.fecha!, portal: resueltas[i].fecha! });
      d.fecha = resueltas[i].fecha;
      d.notas_excel = [d.notas_excel, NOTA_FECHA_CORREGIDA].filter(Boolean).join(" · ");
    }
  });
  const conHuella = ponerHuellas(crudos.map(soloDocumento));
  conHuella.forEach((d, i) => {
    const { saldoExcel, estadoExcel } = crudos[i];
    controlar(salida.controles, d, saldoExcel, estadoExcel);
  });
  salida.documentos = conHuella;
  return salida;
}

/** Anota si el saldo o el estado de la hoja no coinciden con los del portal. */
function controlar(controles: ControlCartera[], d: DocumentoImportado, saldoExcel: number | null, estadoExcel: string | null) {
  const saldo = saldoDe(d);
  const base = { hoja: d.hoja, fila: d.fila, contraparte: d.contraparte, documento: d.documento };
  if (saldoExcel !== null && Math.abs(saldoExcel - saldo) > 0.005) controles.push({ ...base, qué: "saldo", excel: usd(saldoExcel), portal: usd(saldo) });
  const esperado = estadoDeExcel(estadoExcel);
  const calculado = estadoDe({ ...d, vencimiento: null, estado_manual: null });
  if (estadoExcel && esperado !== calculado) controles.push({ ...base, qué: "estado", excel: estadoExcel, portal: calculado });
}

// ---------------------------------------------------------------------------------------------
// CPP: bloques por acreedor
// ---------------------------------------------------------------------------------------------

interface ColumnasBloque {
  fecha: number;
  documento: number;
  deuda: number;
  fechaAbono: number;
  abono: number;
  referencia: number;
  metodo: number;
  hasta: number;
}

/** Las columnas de un bloque a partir de su fila de títulos (FECHA en `c`). */
function columnasBloque(titulos: Celda[], c: number): ColumnasBloque | null {
  const cols: ColumnasBloque = { fecha: c, documento: -1, deuda: -1, fechaAbono: -1, abono: -1, referencia: -1, metodo: -1, hasta: c };
  for (let k = c + 1; k < Math.min(titulos.length, c + 10); k++) {
    const n = normal(texto(titulos[k]) ?? "");
    if (n === "FECHA") break; // empieza el bloque de al lado
    if (!n) {
      if (cols.metodo >= 0 || normal(texto(titulos[k + 1]) ?? "") === "") break;
      continue;
    }
    if (n.startsWith("DEUDA") || n.startsWith("MONTO")) cols.deuda = k;
    else if (n.startsWith("FECH")) cols.fechaAbono = k;
    else if (n.startsWith("ABONO") || n.startsWith("PAGO")) cols.abono = k;
    else if (n.startsWith("REF")) cols.referencia = k;
    else if (n.startsWith("METODO") || n.startsWith("FORMA")) cols.metodo = k;
    else if (n.startsWith("NOMBRE") || n.startsWith("FACT") || n.startsWith("DOC") || n.startsWith("PEDIDO")) cols.documento = k;
    cols.hasta = k;
  }
  return cols.deuda >= 0 ? cols : null;
}

/** El nombre del acreedor y el motivo, en las filas de arriba de los títulos del bloque. */
function cabeceraBloque(filas: Celda[][], filaTitulos: number, cols: ColumnasBloque): { contraparte: string | null; motivo: string | null } {
  let motivo: string | null = null;
  let filaMotivo = -1;
  for (let i = filaTitulos - 1; i >= Math.max(0, filaTitulos - 3); i--) {
    const f = filas[i] ?? [];
    for (let k = cols.fecha; k <= cols.hasta; k++) {
      if (normal(texto(f[k]) ?? "").startsWith("MOTIVO")) {
        filaMotivo = i;
        for (let j = k + 1; j <= cols.hasta; j++) {
          const t = texto(f[j]);
          if (t) {
            motivo = t;
            break;
          }
        }
        break;
      }
    }
    if (filaMotivo >= 0) break;
  }
  const filaNombre = (filaMotivo >= 0 ? filaMotivo : filaTitulos) - 1;
  const f = filas[filaNombre] ?? [];
  for (let k = cols.fecha; k <= cols.hasta; k++) {
    const t = texto(f[k]);
    if (t && !normal(t).startsWith("MOTIVO")) return { contraparte: t, motivo };
  }
  return { contraparte: null, motivo };
}

/** «Ortoped & Co SPA (SHILAJIT)» → nombre «Ortoped & Co SPA», detalle «SHILAJIT». */
export function separarNombre(t: string): { nombre: string; detalle: string | null } {
  const m = t.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
  return m ? { nombre: m[1].trim(), detalle: m[2].trim() } : { nombre: t.trim(), detalle: null };
}

export const NOTA_FECHA_CORREGIDA = "Fecha corregida: en el Excel tenía el día y el mes invertidos.";

type Crudo = Omit<DocumentoImportado, "origen_clave" | "abonos"> & { abonos: (Omit<AbonoImportado, "origen_clave"> & { fila: number; fechaLeida: FechaLeida })[]; fechaLeida: FechaLeida };

/** Una hoja de cuentas por pagar en bloques por acreedor (« CPP»). */
export function leerHojaCppBloques(filas: Celda[][], hoja: string): Omit<LecturaCartera, "hojas"> {
  const salida = { documentos: [] as DocumentoImportado[], descartadas: [] as DescartadaCartera[], controles: [] as ControlCartera[], fechasCorregidas: [] as FechaCorregida[], plantilla: 0 };
  const todos: { crudo: Crudo; cerrada: boolean; saldosExcel: { fila: number; saldo: number; esperado: number }[] }[] = [];

  for (let r = 0; r < filas.length; r++) {
    const f = filas[r] ?? [];
    for (let c = 0; c < f.length; c++) {
      if (normal(texto(f[c]) ?? "") !== "FECHA") continue;
      const cols = columnasBloque(f, c);
      if (!cols) continue;
      const cabecera = cabeceraBloque(filas, r, cols);
      if (!cabecera.contraparte) {
        salida.descartadas.push({ hoja, fila: r + 1, motivo: "bloque sin nombre de acreedor" });
        continue;
      }
      // «Proveedor (PRODUCTO)»: el acreedor es el proveedor; lo de entre paréntesis va al motivo.
      const { nombre: contraparte, detalle } = separarNombre(cabecera.contraparte);
      const motivo = [cabecera.motivo, detalle].filter(Boolean).join(" · ") || null;
      const docs: Crudo[] = [];
      const saldosExcel: { doc: number; fila: number; saldo: number; esperado: number }[] = [];
      let abonosDesdeDeuda = 0;
      let cerrada = false;
      const enBloque = (x: Celda[], k: number) => (k >= 0 ? x[k] : null);
      for (let i = r + 1; i < filas.length; i++) {
        const x = filas[i] ?? [];
        const celdas = x.slice(cols.fecha, cols.hasta + 1);
        if (celdas.some((v) => normal(texto(v) ?? "").includes("CUENTA CERRADA"))) {
          cerrada = true;
          break;
        }
        const fechaCelda = enBloque(x, cols.fecha);
        const fechaTxt = texto(fechaCelda);
        // Un texto que no es fecha en la columna FECHA: empieza otro acreedor más abajo (o «MOTIVO»).
        if (fechaTxt && !esErrorExcel(fechaCelda) && leerFechaCelda(fechaCelda).error) break;
        if (celdas.every((v) => v === null || v === undefined || v === "")) continue;
        const fila = i + 1;
        const deudaCelda = enBloque(x, cols.deuda);
        const deuda = leerMonto(deudaCelda);
        const abonoCelda = enBloque(x, cols.abono);
        const abono = leerMonto(abonoCelda);
        const fechaAbonoCelda = enBloque(x, cols.fechaAbono);
        if (deuda !== null) {
          if (docs.length && abonosDesdeDeuda > 0) {
            // Saldo que va quedando (la fórmula «deuda − abono» del Excel): se compara, no se suma.
            const d = docs[docs.length - 1];
            saldosExcel.push({ doc: docs.length - 1, fila, saldo: deuda, esperado: redondear(d.monto - d.abonos.reduce((a, b) => a + b.monto, 0)) });
            abonosDesdeDeuda = 0;
          } else if (deuda > 0) {
            const fl = leerFechaCelda(fechaCelda);
            if (fl.error) salida.descartadas.push({ hoja, fila, motivo: "fecha con error del Excel: la deuda se importa sin fecha" });
            const documento = texto(enBloque(x, cols.documento));
            docs.push({
              fila,
              hoja,
              clase: "pagar",
              contraparte,
              unidad: unidadPorCodigo(documento),
              documento,
              fecha: fl.fecha,
              fechaLeida: fl,
              motivo,
              monto: redondear(deuda),
              notas_excel: null,
              abonos: [],
            });
          } else if (deuda < 0) salida.descartadas.push({ hoja, fila, motivo: "deuda negativa" });
        } else if (esErrorExcel(deudaCelda)) salida.descartadas.push({ hoja, fila, motivo: "deuda con error del Excel" });
        if (abono !== null && abono > 0) {
          if (!docs.length) {
            salida.descartadas.push({ hoja, fila, motivo: "abono sin deuda arriba" });
            continue;
          }
          const fl = leerFechaCelda(fechaAbonoCelda);
          if (fl.error) salida.descartadas.push({ hoja, fila, motivo: "abono con fecha errónea en el Excel: se importa sin fecha" });
          docs[docs.length - 1].abonos.push({
            fila,
            fecha: fl.fecha,
            fechaLeida: fl,
            monto: redondear(abono),
            metodo: normalizarMetodo(texto(enBloque(x, cols.metodo))),
            referencia: texto(enBloque(x, cols.referencia)),
          });
          abonosDesdeDeuda++;
        } else if (deuda === null && (fechaAbonoCelda !== null && fechaAbonoCelda !== undefined && fechaAbonoCelda !== "")) {
          const fl = leerFechaCelda(fechaAbonoCelda);
          salida.descartadas.push({ hoja, fila, motivo: fl.error ? "abono sin monto y con la fecha en error (#VALUE!)" : "abono con fecha y sin monto" });
        }
      }
      // Fechas del bloque: deudas y abonos en el orden de las filas.
      const eventos = docs
        .flatMap((d) => [
          { fila: d.fila, f: d.fechaLeida, poner: (v: string) => ((d.fecha = v), (d.notas_excel = NOTA_FECHA_CORREGIDA)) },
          ...d.abonos.map((a) => ({ fila: a.fila, f: a.fechaLeida, poner: (v: string) => (a.fecha = v) })),
        ])
        .sort((a, b) => a.fila - b.fila);
      resolverFechas(eventos.map((e) => e.f)).forEach((res, i) => {
        if (res.corregida) {
          salida.fechasCorregidas.push({ hoja, fila: eventos[i].fila, excel: eventos[i].f.fecha!, portal: res.fecha! });
          eventos[i].poner(res.fecha!);
        }
      });
      // Un bloque cerrado: todos sus documentos deberían quedar en cero.
      docs.forEach((d, i) => todos.push({ crudo: d, cerrada, saldosExcel: saldosExcel.filter((s) => s.doc === i) }));
    }
  }

  const docs = ponerHuellas(
    todos.map(({ crudo }) => soloDocumento(crudo)),
  );
  docs.forEach((d, i) => {
    const t = todos[i];
    const saldo = saldoDe(d);
    const base = { hoja, contraparte: d.contraparte, documento: d.documento };
    // Cada saldo que anotó la hoja contra lo que quedaba en ese momento (monto − abonos de arriba).
    for (const s of t.saldosExcel) if (Math.abs(s.saldo - s.esperado) > 0.005) salida.controles.push({ ...base, fila: s.fila, qué: "saldo", excel: usd(s.saldo), portal: usd(s.esperado) });
    if (t.cerrada && saldo > 0.005) salida.controles.push({ ...base, fila: d.fila, qué: "cuenta cerrada con saldo", excel: "CUENTA CERRADA", portal: usd(saldo) });
  });
  salida.documentos = docs;
  return salida;
}

// ---------------------------------------------------------------------------------------------
// CPP en lista (DESCRIPCIÓN, FECHA COMPRA, # MONTO, ESTATUS)
// ---------------------------------------------------------------------------------------------

/** Nombre de la tienda que aparece en el nombre de la hoja («CPP CALZADOS O. VZLA» → CALZADOS O.). */
export function unidadDeHoja(hoja: string): string | null {
  const n = normal(hoja);
  for (const [r, u] of [
    [/CALZADOS/, "CALZADOS O."],
    [/OFER[FT]Y/, "OFERFY PAN"],
    [/NUVO/, "NUVO PAN"],
    [/KENKU/, "KENKU"],
    [/CLICKSI/, "CLICKSI"],
    [/ECOMFIVE/, "ECOMFIVE"],
  ] as [RegExp, string][])
    if (r.test(n)) return u;
  return null;
}

export function leerHojaCppLista(filas: Celda[][], hoja: string): Omit<LecturaCartera, "hojas"> {
  const salida = { documentos: [] as DocumentoImportado[], descartadas: [] as DescartadaCartera[], controles: [] as ControlCartera[], fechasCorregidas: [] as FechaCorregida[], plantilla: 0 };
  const titulos = ubicarLista(filas, [(n) => n.startsWith("DESCRIPCION"), (n) => n.includes("MONTO")]);
  if (!titulos) return salida;
  const { fila: filaTitulos, nombres } = titulos;
  const col = (f: (n: string) => boolean) => nombres.findIndex(f);
  const c = {
    descripcion: col((n) => n.startsWith("DESCRIPCION")),
    proveedor: col((n) => n.startsWith("PROVEEDOR") || n.startsWith("ACREEDOR")),
    fecha: col((n) => n.startsWith("FECHA")),
    pais: col((n) => n === "PAIS"),
    envio: col((n) => n.startsWith("SHIPPING") || n.startsWith("ENVIO")),
    estado: col((n) => n === "ESTADO"),
    monto: col((n) => n.includes("MONTO")),
    estatus: col((n) => n === "ESTATUS"),
  };
  const celda = (f: Celda[], i: number): Celda => (i >= 0 ? f[i] : null);
  const unidad = unidadDeHoja(hoja);
  // Sin columna de proveedor, el acreedor es la propia hoja (a confirmar con finanzas).
  const contraparteHoja = `Compras ${hoja.replace(/^\s*CPP\s*/i, "").replace(/\s+/g, " ").trim()}`;
  const crudos: (Omit<DocumentoImportado, "origen_clave" | "abonos"> & { abonos: Omit<AbonoImportado, "origen_clave">[] })[] = [];
  const fechas: FechaLeida[] = [];
  for (let i = filaTitulos + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    const fila = i + 1;
    const descripcion = texto(celda(f, c.descripcion));
    const monto = leerMonto(celda(f, c.monto));
    if (!descripcion && monto === null) continue;
    if (/^TOTAL/.test(normal(descripcion ?? ""))) continue; // fila de totales
    if (monto === null || monto <= 0) {
      salida.descartadas.push({ hoja, fila, motivo: "sin monto" });
      continue;
    }
    const fl = leerFechaCelda(celda(f, c.fecha));
    if (fl.error) salida.descartadas.push({ hoja, fila, motivo: "fecha con error del Excel: se importa sin fecha" });
    const estatus = texto(celda(f, c.estatus));
    const notas = [
      texto(celda(f, c.pais)) && `País: ${texto(celda(f, c.pais))}`,
      texto(celda(f, c.envio)) && `Envío: ${texto(celda(f, c.envio))}`,
      texto(celda(f, c.estado)) && `Estado: ${texto(celda(f, c.estado))}`,
      estatus && `Estatus: ${estatus}`,
    ].filter(Boolean);
    const pagada = !!estatus && /PAGAD/.test(normal(estatus)) && !/PENDIENTE/.test(normal(estatus));
    crudos.push({
      fila,
      hoja,
      clase: "pagar",
      contraparte: texto(celda(f, c.proveedor)) ?? contraparteHoja,
      unidad,
      documento: descripcion?.match(/\b[A-Z]{2,5}\s*-\s*\d{3,6}\b/i)?.[0].replace(/\s+/g, "") ?? null,
      fecha: fl.fecha,
      motivo: descripcion,
      monto: redondear(monto),
      notas_excel: notas.length ? notas.join(" · ") : null,
      // «PAGADO» sin detalle: un abono por el total, sin fecha.
      abonos: pagada ? [{ fecha: null, monto: redondear(monto), metodo: null, referencia: "Pagado según el Excel" }] : [],
    });
    fechas.push(fl);
  }
  resolverFechas(fechas).forEach((r, i) => {
    if (r.corregida) {
      salida.fechasCorregidas.push({ hoja, fila: crudos[i].fila, excel: crudos[i].fecha!, portal: r.fecha! });
      crudos[i].fecha = r.fecha;
    }
  });
  salida.documentos = ponerHuellas(crudos);
  return salida;
}

// ---------------------------------------------------------------------------------------------
// El libro completo
// ---------------------------------------------------------------------------------------------

export const nombreHoja = (h: string) => h.replace(/\s+/g, " ").trim().slice(0, 60);

/** Las hojas de cada cartera según su nombre: «CPC…» por cobrar, «CPP…» por pagar. */
export function hojasDeCartera(nombres: string[], clase: Clase): string[] {
  const prefijo = clase === "cobrar" ? "CPC" : "CPP";
  const largo = clase === "cobrar" ? "CUENTAS POR COBRAR" : "CUENTAS POR PAGAR";
  return nombres.filter((h) => {
    const n = normal(h);
    return n === prefijo || n.startsWith(`${prefijo} `) || n.startsWith(largo);
  });
}

/** Lee todas las hojas de una cartera de un libro (`filasDe` da las filas de una hoja). */
export function leerCartera(nombres: string[], filasDe: (hoja: string) => Celda[][], clase: Clase): LecturaCartera {
  const originales = hojasDeCartera(nombres, clase);
  // El nombre de la hoja sin espacios de sobra (« CPP» → «CPP»): es el que queda guardado como origen.
  const hojas = originales.map(nombreHoja);
  const total: LecturaCartera = { documentos: [], descartadas: [], controles: [], fechasCorregidas: [], plantilla: 0, hojas };
  for (const [i, original] of originales.entries()) {
    const filas = filasDe(original);
    const hoja = hojas[i];
    let r: Omit<LecturaCartera, "hojas">;
    if (clase === "cobrar") r = leerHojaCpc(filas, hoja);
    else {
      const enBloques = filas.slice(0, 40).some((f) => {
        const n = (f ?? []).map((x) => normal(texto(x) ?? ""));
        const i = n.indexOf("FECHA");
        return i >= 0 && n.slice(i + 1, i + 4).some((x) => x.startsWith("DEUDA"));
      });
      r = enBloques ? leerHojaCppBloques(filas, hoja) : leerHojaCppLista(filas, hoja);
    }
    total.documentos.push(...r.documentos);
    total.descartadas.push(...r.descartadas);
    total.controles.push(...r.controles);
    total.fechasCorregidas.push(...r.fechasCorregidas);
    total.plantilla += r.plantilla;
  }
  return total;
}
