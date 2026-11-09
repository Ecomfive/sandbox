import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { ESCENARIOS, diaCorto, etiquetaRecurrente, filasTabla, type Proyeccion } from "@/lib/finanzas/proyeccion-caja";
import { cargarVista, leerParametros } from "../datos";

const r2 = (v: number) => Math.round(v * 100) / 100;
const FORMATO = "#,##0.00;[Red]-#,##0.00";

function formatear(ws: XLSX.WorkSheet, desdeFila: number) {
  const rango = XLSX.utils.decode_range(ws["!ref"]!);
  for (let r = desdeFila; r <= rango.e.r; r++) {
    for (let c = 1; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })];
      if (celda && typeof celda.v === "number") celda.z = FORMATO;
    }
  }
}

/** Una hoja con las mismas filas que la tabla de la página (los detalles con sangría). */
function hojaProyeccion(titulo: string, p: Proyeccion): XLSX.WorkSheet {
  const encabezado = ["Concepto", ...p.semanas.map((s, i) => `S${i + 1} · ${diaCorto(s)}`), "Total"];
  const datos: (string | number | null)[][] = [[titulo], [], encabezado];
  for (const f of filasTabla(p)) {
    const sangria = f.tipo === "detalle" ? "      " : f.tipo === "concepto" ? "  " : "";
    datos.push([sangria + f.etiqueta, ...f.valores.map(r2), f.total === null ? null : r2(f.total)]);
  }
  const ws = XLSX.utils.aoa_to_sheet(datos);
  ws["!cols"] = [{ wch: 44 }, ...encabezado.slice(1).map(() => ({ wch: 13 }))];
  formatear(ws, 3);
  return ws;
}

/** La proyección en Excel: el escenario elegido, la caja final de los tres y los supuestos. */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("proyeccion-caja")) return new NextResponse("No autorizado", { status: 403 });
  const { escenario, conDividendos } = leerParametros(Object.fromEntries(req.nextUrl.searchParams));
  const vista = await cargarVista(createServiceClient(), escenario, conDividendos);
  if ("error" in vista) return new NextResponse(vista.error, { status: 500 });
  const { datos } = vista;
  const etiqueta = ESCENARIOS.find((e) => e.clave === escenario)!.etiqueta;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, hojaProyeccion(`Proyección de caja · ${etiqueta}${conDividendos ? "" : " · sin dividendos"} · USD`, vista.activa), "Proyección");

  const esc: (string | number)[][] = [["Caja al cierre de cada semana · USD"], [], ["Semana", ...ESCENARIOS.map((e) => e.etiqueta)]];
  datos.semanas.forEach((s, i) => esc.push([`S${i + 1} · ${diaCorto(s)}`, ...ESCENARIOS.map((e) => r2(vista.porEscenario[e.clave].cajaFinal[i]))]));
  const wsEsc = XLSX.utils.aoa_to_sheet(esc);
  wsEsc["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  formatear(wsEsc, 3);
  XLSX.utils.book_append_sheet(wb, wsEsc, "Escenarios");

  const s = datos.supuestos;
  const sup: (string | number | null)[][] = [
    ["Supuestos"],
    [],
    ["Caja de hoy", r2(datos.cajaHoy), datos.fuenteCaja === "saldos" ? "Flujo de caja" : datos.fuenteCaja === "manual" ? "Cargada a mano" : "Sin caja (parte de cero)"],
    ["Caja mínima", r2(datos.config.cajaMinima), null],
    ["Por cobrar vencido que se cobra en la semana 1", datos.config.probabilidades.cobroVencido, null],
    ["Por pagar vencido que se paga en la semana 1", datos.config.probabilidades.pagoVencido, null],
    ["Por cobrar vencido", r2(s.porCobrarVencido), null],
    ["Por pagar vencido", r2(s.porPagarVencido), null],
    ["Semanas de las ventas", `${s.ventanaVentas[0]} a ${s.ventanaVentas.at(-1)}`, null],
    ["Semanas del libro", `${s.ventanaLibro[0]} a ${s.ventanaLibro.at(-1)}`, s.mesCompletoLibro ? `Último mes completo: ${s.mesCompletoLibro.slice(0, 7)}` : null],
    ["Días hasta recibir un retiro de Dropi", s.diasRetiro, null],
    ["Repartidores por semana", r2(s.repartidoresPorSemana), null],
    ["Envíos por semana (libro)", r2(s.envioPorSemana), null],
    ["Marketing por semana", r2(s.marketingPorSemana), null],
    ["Otros gastos operativos por semana", r2(s.otrosPorSemana), null],
    ["Mercancía por semana", r2(s.mercanciaPorSemana), null],
    ["Dividendos por semana", r2(s.dividendosPorSemana), null],
    [],
    ["Ventas por tienda", "Envíos por semana", "Tasa de entrega", "Ticket", "Comisión", "Cobro por semana"],
    ...s.ventas.map((v) => [v.tienda, r2(v.enviadasPorSemana), v.tasaEntrega, r2(v.ticket), v.comision, r2(v.cobroPorSemana)]),
    ...(s.tiendasDeTerceros.length ? [["De terceros (sin ingresos en el libro)", s.tiendasDeTerceros.join(", ")]] : []),
    [],
    ["Otros ingresos (unidad)", "Por semana"],
    ...s.ingresosOtros.map((x) => [x.unidad, r2(x.porSemana)]),
    [],
    ["Gasto recurrente", "Monto mensual", "Día", "Meses"],
    ...s.recurrentes.map((g) => [etiquetaRecurrente(g), r2(g.monto), g.dia, g.meses]),
    ...s.impuestos.map((g) => [`Impuesto · ${g.tipo}`, r2(g.monto), g.dia, g.meses]),
    [],
    ["Nómina", "Día del mes", "Parte"],
    ...Object.entries(s.patrones).flatMap(([tipo, ps]) => ps.map((p) => [tipo, p.dia === 30 ? "Fin de mes" : p.dia + 1, p.fraccion])),
  ];
  const wsSup = XLSX.utils.aoa_to_sheet(sup);
  wsSup["!cols"] = [{ wch: 48 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsSup, "Supuestos");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nombre = `Proyeccion-de-caja-${datos.semanas[0]}-${escenario}.xlsx`;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
