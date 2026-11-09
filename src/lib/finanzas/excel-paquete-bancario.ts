// El paquete bancario en Excel, una hoja por sección (mejora 4). Reutiliza las planillas con fórmulas del EERR y del
// flujo (`excel-reportes.ts`) y suma las suyas: los indicadores con sus datos de entrada y las fórmulas que los calculan
// (márgenes, días, ciclo, deuda / EBITDA, cobertura, liquidez), la cartera y la deuda con sus totales en SUM y la
// concentración con la participación como cociente. Lógica pura a partir de la foto del paquete; prueba en
// `excel-paquete-bancario.test.ts`.

import * as XLSX from "xlsx";
import { escribirLibro, hojaPlanilla, FORMATO_DINERO, FORMATO_PCT } from "./excel-formulas";
import { planillaEerr, planillaFlujo } from "./excel-reportes";
import type { SnapshotPaquete } from "./cargar-paquete-bancario";
import { TRAMOS } from "./cxc-cxp";
import { etiquetaSeccion } from "./paquete-bancario";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const FORMATO_DIAS = "0";
const FORMATO_VECES = '0.0"×"';

type Celda = string | number | null | { f: string; v: number | string | null; z?: string } | { n: number; z: string };

/** Una hoja desde filas de celdas: texto, número, número con formato o fórmula con su valor ya calculado. */
function hoja(filas: Celda[][], anchos: number[]): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  let maxC = 0;
  filas.forEach((fila, r) => {
    fila.forEach((c, k) => {
      maxC = Math.max(maxC, k);
      if (c === null || c === undefined) return;
      const dir = XLSX.utils.encode_cell({ r, c: k });
      if (typeof c === "string") ws[dir] = { t: "s", v: c };
      else if (typeof c === "number") ws[dir] = { t: "n", v: c, z: FORMATO_DINERO };
      else if ("n" in c) ws[dir] = { t: "n", v: c.n, z: c.z };
      else ws[dir] = typeof c.v === "number" ? { t: "n", v: c.v, f: c.f, z: c.z ?? FORMATO_DINERO } : { t: "s", v: c.v ?? "", f: c.f };
    });
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(filas.length - 1, 0), c: maxC } });
  ws["!cols"] = anchos.map((wch) => ({ wch }));
  return ws;
}

/** La hoja de indicadores: datos de entrada (filas 4–17) y las fórmulas que los usan (filas 20–31). */
export function hojaIndicadores(s: SnapshotPaquete): XLSX.WorkSheet | null {
  if (!s.indicadores) return null;
  const i = s.indicadores.insumos;
  const v = s.indicadores.valores;
  const dias = (Math.min(Math.max(i.mesesConDatos, 0), 12) / 12) * 365;
  const f = (formula: string, valor: number | null, z = FORMATO_DINERO, vacio: string = ""): Celda => ({ f: formula, v: valor ?? vacio, z });
  const filas: Celda[][] = [
    [`Indicadores clave · 12 meses a ${mesCorto(s.corte)} · USD · Cifras de gestión, no auditadas`],
    [],
    ["Dato de entrada", "Valor"],
    ["Ventas netas (12 meses)", i.ventas],
    ["Ventas netas (12 meses anteriores)", i.ventasAnterior],
    ["Costo de ventas (12 meses)", i.costoVentas],
    ["Margen bruto (12 meses)", i.margenBruto],
    ["EBITDA (12 meses)", i.ebitda],
    ["Intereses (12 meses)", i.intereses],
    ["Cuentas por cobrar al corte", i.cxc],
    ["Inventario al corte", i.inventario],
    ["Cuentas por pagar al corte", i.cxp],
    ["Caja al corte", i.caja],
    ["Deuda financiera al corte", i.deudaFinanciera],
    ["Activo corriente", i.activoCorriente],
    ["Pasivo corriente", i.pasivoCorriente],
    ["Días del período", { f: `${i.mesesConDatos}/12*365`, v: dias, z: FORMATO_DIAS }],
    [],
    ["Indicador", "Valor"],
    ["Margen bruto", f('IF(B4>0,B7/B4,"")', v.margenBrutoPct === null ? null : v.margenBrutoPct / 100, FORMATO_PCT)],
    ["Margen EBITDA", f('IF(B4>0,B8/B4,"")', v.margenEbitdaPct === null ? null : v.margenEbitdaPct / 100, FORMATO_PCT)],
    ["Crecimiento de ventas", f('IF(N(B5)>0,B4/B5-1,"")', v.crecimientoPct === null ? null : v.crecimientoPct / 100, FORMATO_PCT)],
    ["Días de calle (DSO)", f('IF(AND(B4>0,ISNUMBER(B10)),B10/B4*B17,"")', v.dso, FORMATO_DIAS)],
    ["Días de inventario (DIO)", f('IF(AND(B6>0,ISNUMBER(B11)),B11/B6*B17,"")', v.dio, FORMATO_DIAS)],
    ["Días de proveedores (DPO)", f('IF(AND(B6>0,ISNUMBER(B12)),B12/B6*B17,"")', v.dpo, FORMATO_DIAS)],
    ["Ciclo de caja (DIO + DSO − DPO)", f('IF(AND(ISNUMBER(B23),ISNUMBER(B24),ISNUMBER(B25)),B24+B23-B25,"")', v.cicloCaja, FORMATO_DIAS)],
    ["Deuda financiera / EBITDA", f('IF(B8>0,B14/B8,IF(B14>0,"n. s.",""))', v.deudaEbitda, FORMATO_VECES, v.deudaEbitdaNoSignificativa ? "n. s." : "")],
    ["Deuda neta / EBITDA", f('IF(B8>0,(B14-B13)/B8,"")', v.deudaNetaEbitda, FORMATO_VECES)],
    ["Cobertura de intereses (EBITDA / intereses)", f('IF(B9>0,B8/B9,"")', v.coberturaIntereses, FORMATO_VECES)],
    ["Liquidez corriente", f('IF(N(B16)>0,B15/B16,"")', v.liquidezCorriente, '0.00"×"')],
    ["Capital de trabajo", f('IF(AND(ISNUMBER(B15),ISNUMBER(B16)),B15-B16,"")', v.capitalTrabajo)],
  ];
  return hoja(filas, [46, 18]);
}

/** El libro completo del paquete, con las secciones que la foto trae. */
export function libroPaqueteBancario(s: SnapshotPaquete): Buffer {
  const hojas: { nombre: string; hoja: XLSX.WorkSheet; congelar?: { filas: number; columnas: number } }[] = [];
  const titulo = (t: string) => `${t} · ${s.alcance} · USD`;

  // Resumen
  const resumen: Celda[][] = [
    [`Paquete bancario · ${s.empresa.nombre}`],
    [],
    ["Empresa", s.empresa.nombre],
    ["RUC", s.empresa.ruc ?? "—"],
    ["Fecha de corte", mesCorto(s.corte)],
    ["Alcance", s.alcance],
    ["Moneda", "USD"],
    ["Generado", s.generado.slice(0, 16).replace("T", " ")],
    ["Uso", "Cifras de gestión, no auditadas"],
    ["Secciones", s.secciones.map(etiquetaSeccion).join(", ")],
    [],
    ...(s.carta ? [["Carta"] as Celda[], ...s.carta.split("\n").map((l) => [l.replace(/^#{1,3}\s+/, "")] as Celda[])] : []),
  ];
  hojas.push({ nombre: "Resumen", hoja: hoja(resumen, [22, 90]), congelar: { filas: 1, columnas: 0 } });

  const ind = s.secciones.includes("indicadores") ? hojaIndicadores(s) : null;
  if (ind) hojas.push({ nombre: "Indicadores", hoja: ind, congelar: { filas: 3, columnas: 1 } });

  if (s.eerr && s.secciones.includes("eerr")) {
    hojas.push({ nombre: "EERR", hoja: hojaPlanilla({ nombreHoja: "EERR", titulo: titulo("Estado de resultados, 12 meses"), columnas: s.eerr.meses.map(mesCorto), filas: planillaEerr(s.eerr.filas, s.eerr.meses) }) });
    if (s.eerr.anual.length) {
      hojas.push({
        nombre: "EERR por año",
        hoja: hoja(
          [
            [titulo("Estado de resultados por año")],
            [],
            ["Concepto", ...s.eerr.anual.map((a) => `${a.anio}${a.meses < 12 ? ` (${a.meses} meses)` : ""}`)],
            ["Ingresos netos", ...s.eerr.anual.map((a) => a.ingresos)],
            ["Margen bruto", ...s.eerr.anual.map((a) => a.margenBruto)],
            ["EBITDA", ...s.eerr.anual.map((a) => a.ebitda)],
            ["Resultado neto", ...s.eerr.anual.map((a) => a.resultadoNeto)],
          ],
          [30, ...s.eerr.anual.map(() => 18)],
        ),
      });
    }
  }

  if (s.balance && s.secciones.includes("balance")) {
    const b = s.balance;
    hojas.push({
      nombre: "Balance",
      hoja: hoja(
        [[titulo("Balance general")], [], ["Concepto", ...b.cortes.map((c) => `Cierre ${mesCorto(c)}`)], ...b.filas.map((f) => [(f.tipo === "detalle" ? "    " : "") + f.etiqueta, ...f.valores] as Celda[])],
        [40, ...b.cortes.map(() => 16)],
      ),
    });
  }

  if (s.flujo && s.secciones.includes("flujo")) {
    hojas.push({ nombre: "Flujo", hoja: hojaPlanilla({ nombreHoja: "Flujo", titulo: titulo("Flujo de caja, 12 meses"), columnas: s.flujo.meses.map(mesCorto), filas: planillaFlujo(s.flujo.filas, s.flujo.meses) }) });
  }

  if (s.cartera && s.secciones.includes("cartera")) {
    const filas: Celda[][] = [[titulo(`Cartera al cierre de ${mesCorto(s.corte)}`)], [], ["Antigüedad", "Por cobrar", "Por pagar"]];
    TRAMOS.forEach((t) => filas.push([t.etiqueta, s.cartera!.cobrar?.tramos[t.clave] ?? null, s.cartera!.pagar?.tramos[t.clave] ?? null]));
    const fin = 3 + TRAMOS.length;
    filas.push(["Total abierto", { f: `SUM(B4:B${fin})`, v: s.cartera.cobrar?.total ?? 0 }, { f: `SUM(C4:C${fin})`, v: s.cartera.pagar?.total ?? 0 }]);
    filas.push(["Vencido", s.cartera.cobrar?.vencido ?? null, s.cartera.pagar?.vencido ?? null]);
    filas.push([]);
    for (const [clase, r] of [["Principales deudores", s.cartera.cobrar], ["Principales acreedores", s.cartera.pagar]] as const) {
      if (!r?.top.length) continue;
      filas.push([clase, "Saldo", "Parte"]);
      for (const c of r.top) filas.push([c.contraparte, c.saldo, { n: c.parte, z: FORMATO_PCT }]);
      filas.push([]);
    }
    hojas.push({ nombre: "Cartera", hoja: hoja(filas, [36, 16, 16]) });
  }

  if (s.deuda && s.secciones.includes("deuda")) {
    const filas: Celda[][] = [
      [titulo(`Deuda vigente al cierre de ${mesCorto(s.corte)}`)],
      [],
      ["Préstamo", "Acreedor", "Clase", "Monto original", "Tasa anual", "Plazo (meses)", "Cuota", "Saldo", "Corriente (12 m)", "No corriente"],
    ];
    s.deuda.prestamos.forEach((p) =>
      filas.push([p.nombre, p.acreedor ?? "—", p.clase, p.monto, { n: p.tasaAnual, z: FORMATO_PCT }, { n: p.plazoMeses, z: "0" }, p.cuota, p.saldo, p.corriente, p.noCorriente]),
    );
    const finP = 3 + s.deuda.prestamos.length;
    if (s.deuda.prestamos.length)
      filas.push(["Total préstamos", null, null, null, null, null, null, { f: `SUM(H4:H${finP})`, v: s.deuda.prestamos.reduce((a, p) => a + p.saldo, 0) }, { f: `SUM(I4:I${finP})`, v: s.deuda.prestamos.reduce((a, p) => a + p.corriente, 0) }, { f: `SUM(J4:J${finP})`, v: s.deuda.prestamos.reduce((a, p) => a + p.noCorriente, 0) }]);
    filas.push([]);
    filas.push(["Línea de crédito", "Banco", "Cupo", "Usado", "Disponible", "Tasa anual", "Renovación"]);
    const iniL = filas.length + 1;
    s.deuda.lineas.forEach((l, k) => {
      const r = iniL + k;
      filas.push([l.nombre, l.banco ?? "—", l.cupo, l.usado, { f: `C${r}-D${r}`, v: l.cupo - l.usado }, { n: l.tasaAnual, z: FORMATO_PCT }, l.renovacion ?? "—"]);
    });
    hojas.push({ nombre: "Deuda", hoja: hoja(filas, [30, 20, 14, 14, 12, 12, 12, 14, 14, 14]) });
  }

  if (s.proyeccion && s.secciones.includes("proyeccion")) {
    const p = s.proyeccion;
    const filas: Celda[][] = [[titulo(`Proyección de caja, 13 semanas desde ${p.desde} (escenario base)`)], [], ["Concepto", ...p.semanas, "Total"]];
    for (const f of p.filas) filas.push([(f.tipo === "detalle" ? "    " : "") + f.etiqueta, ...f.valores, f.total]);
    filas.push([], ["Escenario", "Caja al final", "Caja mínima"], ...p.escenarios.map((e) => [e.etiqueta, e.cajaFinal, e.cajaMinima] as Celda[]));
    filas.push([], ["Supuesto", "Valor"], ...p.supuestos.map((x) => [x.etiqueta, x.valor] as Celda[]));
    hojas.push({ nombre: "Proyección", hoja: hoja(filas, [40, ...p.semanas.map(() => 13), 14]) });
  }

  if (s.concentracion && s.secciones.includes("concentracion")) {
    const c = s.concentracion;
    const fin = 3 + c.filas.length;
    const filas: Celda[][] = [[titulo("Concentración de ventas por tienda, 12 meses")], [], ["Tienda", "Ventas", "Parte"]];
    c.filas.forEach((f, k) => filas.push([f.nombre, f.ventas, { f: `IF($B$${fin + 1}>0,B${4 + k}/$B$${fin + 1},"")`, v: f.parte, z: FORMATO_PCT }]));
    filas.push(["Total", { f: `SUM(B4:B${fin})`, v: c.total }, null]);
    filas.push(["Índice Herfindahl-Hirschman", { n: c.hhi, z: "0" }]);
    hojas.push({ nombre: "Concentración", hoja: hoja(filas, [36, 16, 12]) });
  }

  hojas.push({
    nombre: "Limitaciones",
    hoja: hoja([["Limitaciones"], [], ["Importancia", "Detalle"], ...s.limitaciones.map((l) => [l.severidad === "alta" ? "Alta" : "Media", l.texto] as Celda[])], [12, 110]),
    congelar: { filas: 3, columnas: 0 },
  });

  return escribirLibro(hojas);
}
