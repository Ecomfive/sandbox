import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { csvProyeccion, reporteProyeccion } from "@/lib/ventas/reporte-proyeccion";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

/** Caja esperada del efectivo contra entrega: lo despachado por la tasa de entrega de 90 días + lo entregado sin remesar. */
export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const [ruta, saldos, ent, per] = await Promise.all([
    supabase.from("ven_ordenes").select("cod_esperado").eq("fase", "despachada").gt("cod_esperado", 0).limit(20000),
    supabase.from("ven_cod_saldo").select("pendiente").gt("pendiente", 0).limit(20000),
    supabase.from("ven_ordenes").select("id", { count: "exact", head: true }).eq("fase", "entregada").gte("fecha", desde),
    supabase.from("ven_ordenes").select("id", { count: "exact", head: true }).in("fase", ["fallida", "devuelta"]).gte("fecha", desde),
  ]);
  if (ruta.error || saldos.error) return new NextResponse("No se pudo leer el efectivo.", { status: 500 });
  const filas = reporteProyeccion({
    enRuta: (ruta.data ?? []).map((o: Record<string, unknown>) => ({ cod: Number(o.cod_esperado ?? 0) })),
    pendientesRemesa: (saldos.data ?? []).reduce((s: number, r: Record<string, unknown>) => s + Number(r.pendiente ?? 0), 0),
    entregadas: ent.count ?? 0,
    perdidas: per.count ?? 0,
  });
  return new NextResponse(csvProyeccion(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="proyeccion-caja-${hoyPanama()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
