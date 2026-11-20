import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioActual } from "@/lib/auth";
import { cargarResumenDropi } from "@/lib/dropi/cargar-resumen";
import { filasResumen, mesCorto } from "@/lib/dropi/resumen-mensual";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";

/** Pedidos Dropi › Resumen en Excel: los mismos renglones y meses que la página (migración 0340). */
export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("pedidos-dropi-resumen")) return new NextResponse("No autorizado", { status: 403 });
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const r = await cargarResumenDropi(supabase, pais.id);
  if ("error" in r) return new NextResponse(r.error, { status: 500 });

  const datos: (string | number | null)[][] = [
    [`Resumen de Dropi · ${pais.nombre}`],
    [],
    ["Concepto", ...r.meses.map((m) => `${mesCorto(m.periodo)}${m.periodo === r.enCurso ? " (en curso)" : ""}`)],
  ];
  for (const f of filasResumen(r.meses)) {
    if (f.tipo === "seccion") {
      datos.push([], [f.etiqueta.toUpperCase()]);
      continue;
    }
    const etiqueta = `${f.tipo === "detalle" ? "   " : ""}${f.etiqueta}`;
    datos.push([etiqueta, ...f.valores.map((v) => (v === null ? (f.tipo === "pendiente" ? "Pendiente" : null) : v))]);
  }
  const ws = XLSX.utils.aoa_to_sheet(datos);
  ws["!cols"] = [{ wch: 58 }, ...r.meses.map(() => ({ wch: 14 }))];
  // Formato de cada renglón: dinero con dos decimales, % y enteros.
  const filas = filasResumen(r.meses).filter((f) => f.tipo !== "seccion");
  const rango = XLSX.utils.decode_range(ws["!ref"]!);
  for (let fila = 3; fila <= rango.e.r; fila++) {
    const nombre = String(ws[XLSX.utils.encode_cell({ r: fila, c: 0 })]?.v ?? "").trim();
    const def = filas.find((f) => f.etiqueta === nombre);
    if (!def) continue;
    for (let c = 1; c <= rango.e.c; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r: fila, c })];
      if (celda && typeof celda.v === "number") celda.z = def.formato === "dinero" ? "#,##0.00" : def.formato === "porcentaje" ? "0.0%" : "#,##0";
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resumen");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Resumen-Dropi-${pais.codigo}-${r.enCurso.slice(0, 7)}.xlsx"`,
    },
  });
}
