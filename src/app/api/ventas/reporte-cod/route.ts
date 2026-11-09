import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { DIAS_PLAZO_REMESA } from "@/lib/ventas/ciclo";
import { csvReporteCod, reporteCod } from "@/lib/ventas/reporte-cod";
import { hoyPanama } from "@/lib/af4/fecha";

/** Efectivo contra entrega pendiente por mensajero o transportadora, en CSV (mismo plazo que la pestaña de remesas). */
export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const supabase = createServiceClient();
  const [{ data: saldos, error }, { data: mensajeros }] = await Promise.all([
    supabase.from("ven_cod_saldo").select("numero, repartidor_id, transportista, esperado, cobrado, remitido, pendiente, dias").gt("pendiente", 0).limit(20000),
    supabase.from("del_repartidores").select("id, nombre"),
  ]);
  if (error) return new NextResponse("No se pudo leer el efectivo pendiente.", { status: 500 });
  const nombre = new Map((mensajeros ?? []).map((m: { id: string; nombre: string }) => [m.id, m.nombre]));
  const filas = reporteCod(
    (saldos ?? []).map((s: Record<string, unknown>) => ({
      quien: (s.repartidor_id ? nombre.get(s.repartidor_id as string) : null) ?? (s.transportista as string | null) ?? "Sin asignar",
      numero: String(s.numero ?? ""),
      esperado: Number(s.esperado ?? 0),
      cobrado: Number(s.cobrado ?? 0),
      remitido: Number(s.remitido ?? 0),
      pendiente: Number(s.pendiente ?? 0),
      dias: Number(s.dias ?? 0),
    })),
    DIAS_PLAZO_REMESA,
  );
  return new NextResponse(csvReporteCod(filas), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="efectivo-contra-entrega-${hoyPanama()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
