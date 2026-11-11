import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { csvProductos, reporteProductos, type LineaParaProducto } from "@/lib/ventas/reporte-productos";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

/** Productos más vendidos de los últimos 30 días (sin servicios ni canceladas). */
export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data: ordenes, error } = await supabase.from("ven_ordenes").select("id, fase").gte("fecha", desde).limit(50000);
  if (error) return new NextResponse("No se pudieron leer las órdenes.", { status: 500 });
  const fase = new Map((ordenes ?? []).map((o: { id: string; fase: string | null }) => [o.id, o.fase]));
  const ids = [...fase.keys()];
  const lineas: LineaParaProducto[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error: el } = await supabase
      .from("ven_orden_lineas")
      .select("orden_id, producto, cantidad, precio, es_servicio")
      .in("orden_id", ids.slice(i, i + 500));
    if (el) return new NextResponse("No se pudieron leer las líneas.", { status: 500 });
    for (const l of data ?? []) {
      if (l.es_servicio) continue;
      lineas.push({
        producto: String(l.producto ?? "Sin nombre"),
        cantidad: Number(l.cantidad ?? 0),
        precio: Number(l.precio ?? 0),
        fase: fase.get(l.orden_id) ?? null,
        orden: String(l.orden_id),
      });
    }
  }
  return new NextResponse(csvProductos(reporteProductos(lineas)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="productos-vendidos-${hoyPanama()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
