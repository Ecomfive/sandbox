import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { csvTiendas, reporteTiendas } from "@/lib/ventas/reporte-tiendas";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

/** Resumen por tienda de los últimos 30 días: órdenes, vendido y % de entrega. */
export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [{ data: ordenes, error }, { data: unidades }] = await Promise.all([
    supabase.from("ven_ordenes").select("unidad_id, fase, total").gte("fecha", desde).limit(50000),
    supabase.from("fin_unidades").select("id, nombre"),
  ]);
  if (error) return new NextResponse("No se pudieron leer las órdenes.", { status: 500 });
  const nombre = new Map((unidades ?? []).map((u: { id: string; nombre: string }) => [u.id, u.nombre]));
  const filas = reporteTiendas(
    (ordenes ?? []).map((o: Record<string, unknown>) => ({
      tienda: nombre.get(o.unidad_id as string) ?? "Sin tienda",
      fase: (o.fase as string | null) ?? null,
      total: Number(o.total ?? 0),
    })),
  );
  return new NextResponse(csvTiendas(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="resumen-tiendas-${hoyPanama()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
