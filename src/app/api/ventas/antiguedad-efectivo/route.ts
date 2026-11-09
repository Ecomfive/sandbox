import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { csvAntiguedad, reporteAntiguedad } from "@/lib/ventas/reporte-antiguedad";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

/** Antigüedad del efectivo contra entrega pendiente (0-3, 4-7, 8-14, 15+ días) por mensajero o transportadora. */
export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const supabase = createServiceClient();
  const [{ data: saldos, error }, { data: mensajeros }] = await Promise.all([
    supabase.from("ven_cod_saldo").select("repartidor_id, transportista, pendiente, dias").gt("pendiente", 0).limit(20000),
    supabase.from("del_repartidores").select("id, nombre"),
  ]);
  if (error) return new NextResponse("No se pudo leer el efectivo pendiente.", { status: 500 });
  const nombre = new Map((mensajeros ?? []).map((m: { id: string; nombre: string }) => [m.id, m.nombre]));
  const filas = reporteAntiguedad(
    (saldos ?? []).map((s: Record<string, unknown>) => ({
      quien: (s.repartidor_id ? nombre.get(s.repartidor_id as string) : null) ?? (s.transportista as string | null) ?? "Sin asignar",
      pendiente: Number(s.pendiente ?? 0),
      dias: Number(s.dias ?? 0),
    })),
  );
  return new NextResponse(csvAntiguedad(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="antiguedad-efectivo-${hoyPanama()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
