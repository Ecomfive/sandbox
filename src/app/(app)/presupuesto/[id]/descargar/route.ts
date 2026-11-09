import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { hoyPanama } from "@/lib/af4/fecha";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { SECCIONES, mesCorto } from "@/lib/finanzas/eerr";
import { cargarPresupuesto, cargarRealPorUnidad, unidadesPresupuesto } from "@/lib/finanzas/cargar-presupuesto";
import { cargarValoracion } from "@/lib/finanzas/valoracion";
import {
  CONCEPTOS,
  DELTAS_MARGEN,
  ESCENARIOS,
  SECCIONES_GASTO,
  baseSensibilidad,
  compararConReal,
  detalleDeLineas,
  esSeccion,
  matrizSensibilidad,
  tieneTipos,
  mesesCerradosConReal,
  mesesDelAnio,
  serieDeLineas,
  serieVacia,
  sumaEn,
  sumarSeries,
  valoresPorConcepto,
  type SerieSecciones,
} from "@/lib/finanzas/presupuesto";

type Celda = string | number | null;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Formato de los números: dinero con separador de miles; las columnas de % como porcentaje. */
function hoja(filas: Celda[][], anchos: number[], columnasPct: Set<number> = new Set(), desdeFila = 0) {
  const ws = XLSX.utils.aoa_to_sheet(filas);
  ws["!cols"] = anchos.map((wch) => ({ wch }));
  const rango = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  for (let r = desdeFila; r <= rango.e.r; r++) {
    for (let c = 1; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })];
      if (celda && typeof celda.v === "number") celda.z = columnasPct.has(c) ? "0.0%" : "#,##0.00;[Red]-#,##0.00";
    }
  }
  return ws;
}

/**
 * El presupuesto en Excel: una hoja por escenario (mes a mes y el total), «Vs real» del escenario base, «Sensibilidad»
 * del base y «Supuestos». `?ver=<tienda>` baja solo esa tienda en un presupuesto por tienda. Los montos van como números.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("presupuesto")) return new NextResponse("No autorizado", { status: 403 });
  const { id } = await params;
  const supabase = createServiceClient();
  const cargado = await cargarPresupuesto(supabase, id);
  if ("noExiste" in cargado) return new NextResponse("No existe", { status: 404 });
  if ("error" in cargado) return new NextResponse("Falta la migración 0913.", { status: 500 });
  const { presupuesto: p, lineas } = cargado;
  const meses = mesesDelAnio(p.anio);
  const [real, unidades, valoracion] = await Promise.all([cargarRealPorUnidad(supabase, meses), unidadesPresupuesto(supabase), cargarValoracion(supabase)]);
  const multiplo = valoracion.supuestos.multiplo;
  const nombresTipo = "error" in real ? {} : real.nombresTipo;
  const ver = req.nextUrl.searchParams.get("ver");
  const unidad = p.por_tienda ? (unidades.find((u) => u.id === ver) ?? null) : null;
  const filtro = p.por_tienda && !unidad ? undefined : (unidad?.id ?? null);
  const nombreVista = unidad?.nombre ?? (p.por_tienda ? "Todas las tiendas" : "Consolidado");

  const wb = XLSX.utils.book_new();
  const encabezado = ["Concepto", ...meses.map(mesCorto), "Total"];
  for (const e of ESCENARIOS) {
    const valores = valoresPorConcepto(serieDeLineas(lineas, e.clave, meses, filtro), meses);
    const detalle = detalleDeLineas(lineas, e.clave, meses, filtro);
    const filas: Celda[][] = [[`${p.nombre} · ${e.etiqueta} · ${nombreVista} · USD`], [], encabezado];
    for (const c of CONCEPTOS) {
      filas.push([c.etiqueta, ...meses.map((m) => r2(valores[c.clave][m])), r2(sumaEn(valores[c.clave], meses))]);
      // Los tipos de la sección, debajo y con sangría.
      if (esSeccion(c.clave) && tieneTipos(detalle[c.clave])) {
        for (const f of detalle[c.clave]) {
          const nombre = f.tipo_id === null ? `Otros de ${c.etiqueta.toLowerCase()}` : (nombresTipo[f.tipo_id] ?? "Tipo");
          filas.push([`   ${nombre}`, ...meses.map((m) => r2(f.meses[m] ?? 0)), r2(sumaEn(f.meses, meses))]);
        }
      }
    }
    XLSX.utils.book_append_sheet(wb, hoja(filas, [34, ...meses.map(() => 13), 14], new Set(), 3), e.etiqueta);
  }

  // Vs real del escenario base, mes a mes y acumulado.
  if (!("error" in real)) {
    const hoy = hoyPanama();
    const mesesReales = mesesCerradosConReal(meses, real.conDatos, hoy);
    if (mesesReales.length) {
      const serieReal: SerieSecciones = unidad ? (real.porUnidad.get(unidad.id) ?? serieVacia(meses)) : sumarSeries([...real.porUnidad.values()], meses);
      const comp = compararConReal(serieDeLineas(lineas, "base", meses, filtro), serieReal, mesesReales);
      const columnas = [...mesesReales.map(mesCorto), "Acumulado"];
      const filas: Celda[][] = [
        [`${p.nombre} · Base vs real · ${nombreVista} · USD`],
        [],
        ["Concepto", ...columnas.flatMap((c) => [`${c} real`, `${c} presupuesto`, `${c} diferencia`, `${c} %`])],
      ];
      for (const f of comp) {
        const celdas = [...mesesReales.map((m) => f.meses[m]), f.acumulado];
        filas.push([f.etiqueta, ...celdas.flatMap((c) => [r2(c.real), r2(c.presupuesto), r2(c.diferencia), c.pct === null ? null : c.pct / 100])]);
      }
      const pct = new Set(columnas.map((_, i) => 4 + i * 4));
      XLSX.utils.book_append_sheet(wb, hoja(filas, [34, ...columnas.flatMap(() => [13, 13, 13, 8])], pct, 3), "Vs real");
    }
  }

  // Sensibilidad del base.
  const base = serieDeLineas(lineas, "base", meses, filtro);
  const matriz = matrizSensibilidad(baseSensibilidad(base, meses, p.supuestos?.escenarios.base), undefined, undefined, multiplo);
  const sens: Celda[][] = [[`${p.nombre} · Sensibilidad del EBITDA anual (base) · ${nombreVista} · USD`], [], ["Ingresos \\ Margen bruto", ...DELTAS_MARGEN.map((d) => `${d > 0 ? "+" : ""}${d} pts`)]];
  for (const fila of matriz) sens.push([`${fila[0].deltaIngresos > 0 ? "+" : ""}${fila[0].deltaIngresos} %`, ...fila.map((c) => c.ebitda)]);
  sens.push([], [`Valor de empresa (${multiplo}× EBITDA)`]);
  for (const fila of matriz) sens.push([`${fila[0].deltaIngresos > 0 ? "+" : ""}${fila[0].deltaIngresos} %`, ...fila.map((c) => c.valorEmpresa)]);
  XLSX.utils.book_append_sheet(wb, hoja(sens, [24, ...DELTAS_MARGEN.map(() => 15)], new Set(), 3), "Sensibilidad");

  // Supuestos.
  if (p.supuestos) {
    const s = p.supuestos;
    const filas: Celda[][] = [
      [`${p.nombre} · Supuestos · base ${mesCorto(s.mesesBase[0])} – ${mesCorto(s.mesesBase[s.mesesBase.length - 1])}`],
      [],
      ["Supuesto", ...ESCENARIOS.map((e) => e.etiqueta)],
      ["Crecimiento mensual de ingresos (%)", ...ESCENARIOS.map((e) => s.escenarios[e.clave].crecimientoMensual)],
      ["Margen bruto (%)", ...ESCENARIOS.map((e) => s.escenarios[e.clave].margenBruto)],
      ...SECCIONES_GASTO.map((g) => [
        `${SECCIONES.find((x) => x.clave === g)!.etiqueta} (${s.escenarios.base.gastos[g].modo === "pct" ? "% de ingresos" : "USD por mes"})`,
        ...ESCENARIOS.map((e) => s.escenarios[e.clave].gastos[g].valor),
      ]),
      ["Inflación anual de gastos fijos (%)", ...ESCENARIOS.map((e) => s.escenarios[e.clave].inflacionAnual)],
    ];
    XLSX.utils.book_append_sheet(wb, hoja(filas, [44, 14, 14, 14]), "Supuestos");
  }

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nombre = `Presupuesto-${p.anio}-${p.nombre}-${nombreVista}`.replace(/[^\w.-]+/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}.xlsx"`,
    },
  });
}
