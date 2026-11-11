import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { csvDias, reporteDias } from "@/lib/ventas/reporte-dias";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

/** Órdenes y ventas por día de los últimos 30 días. */
export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const hoy = hoyPanama();
  const desde = new Date(new Date(`${hoy}T00:00:00Z`).getTime() - 29 * 86400000).toISOString().slice(0, 10);
  const { data, error } = await createServiceClient().from("ven_ordenes").select("fecha, fase, total").gte("fecha", desde).limit(50000);
  if (error) return new NextResponse("No se pudieron leer las órdenes.", { status: 500 });
  const filas = reporteDias(
    (data ?? []).map((o: Record<string, unknown>) => ({ fecha: String(o.fecha ?? ""), fase: (o.fase as string | null) ?? null, total: Number(o.total ?? 0) })),
    desde,
    hoy,
  );
  return new NextResponse(csvDias(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ventas-por-dia-${hoy}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
