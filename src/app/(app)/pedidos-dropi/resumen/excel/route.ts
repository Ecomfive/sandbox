import { NextResponse, type NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { getUsuarioActual } from "@/lib/auth";
import { cargarResumenDropi } from "@/lib/dropi/cargar-resumen";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";

/** Pedidos Dropi › Resumen en Excel: lo mismo que se ve (`?anio=`, `?mes=`: un mes con el anterior y la diferencia, o el año). */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("pedidos-dropi-resumen")) return new NextResponse("No autorizado", { status: 403 });
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const r = await cargarResumenDropi(supabase, pais.id, { anio: req.nextUrl.searchParams.get("anio"), mes: req.nextUrl.searchParams.get("mes") });
  if (!r) return new NextResponse("Sin pedidos de Dropi guardados.", { status: 404 });
  if ("error" in r) return new NextResponse(r.error, { status: 500 });

  const datos: (string | number | null)[][] = [
    [`Resumen de Dropi · ${pais.nombre} · ${r.vista.mes ? r.columnas[0].titulo : `todo ${r.vista.anio}`}`],
    [],
    ["Concepto", ...r.columnas.map((c) => (c.nota ? `${c.titulo} (${c.nota})` : c.titulo))],
  ];
  const formatos: (string | null)[] = [null, null, null];
  for (const f of r.filas) {
    if (f.tipo === "seccion") {
      datos.push([], [f.etiqueta.toUpperCase()]);
      formatos.push(null, null);
      continue;
    }
    datos.push([`${f.tipo === "detalle" ? "   " : ""}${f.etiqueta}`, ...f.valores.map((v, j) => (v === null ? (f.tipo === "pendiente" && r.columnas[j].tipo !== "diferencia" ? "Pendiente" : null) : v))]);
    formatos.push(f.formato === "dinero" ? "#,##0.00" : f.formato === "porcentaje" ? "0.0%" : "#,##0");
  }
  const ws = XLSX.utils.aoa_to_sheet(datos);
  ws["!cols"] = [{ wch: 58 }, ...r.columnas.map(() => ({ wch: 16 }))];
  formatos.forEach((z, fila) => {
    if (!z) return;
    for (let c = 1; c <= r.columnas.length; c++) {
      const celda = ws[XLSX.utils.encode_cell({ r: fila, c })];
      if (celda && typeof celda.v === "number") celda.z = z;
    }
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Resumen");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const nombre = r.vista.mes ? r.vista.mes.slice(0, 7) : r.vista.anio;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Resumen-Dropi-${pais.codigo}-${nombre}.xlsx"`,
    },
  });
}
