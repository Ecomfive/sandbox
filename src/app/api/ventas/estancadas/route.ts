import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { csvEstancadas, reporteEstancadas } from "@/lib/ventas/reporte-estancadas";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new Response("Sin acceso", { status: 403 });
  }
  const db = createServiceClient();
  const { data: ordenes } = await db
    .from("ven_ordenes")
    .select("id, numero, fase, fecha")
    .in("fase", ["confirmada", "despachada", "fallida"])
    .limit(20000);
  const ids = (ordenes ?? []).map((o) => String(o.id));
  // Última entrada a la fase actual: el evento de fase más reciente de cada orden.
  const desde = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data: ev } = await db
      .from("ven_orden_eventos")
      .select("orden_id, creado_en")
      .eq("tipo", "fase")
      .in("orden_id", ids.slice(i, i + 500))
      .order("creado_en", { ascending: false })
      .limit(20000);
    for (const e of ev ?? []) if (!desde.has(String(e.orden_id))) desde.set(String(e.orden_id), String(e.creado_en));
  }
  const filas = reporteEstancadas(
    (ordenes ?? []).map((o) => ({
      id: String(o.id),
      numero: String(o.numero ?? o.id),
      fase: String(o.fase),
      desde: desde.get(String(o.id)) ?? String(o.fecha ?? ""),
    })),
    new Date(),
  );
  return new Response(csvEstancadas(filas), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="ordenes-estancadas-${hoyPanama()}.csv"`, "Cache-Control": "no-store" },
  });
}
