import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { csvEmbudo, embudo } from "@/lib/ventas/embudo";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new Response("Sin acceso", { status: 403 });
  }
  const db = createServiceClient();
  const desde = new Date(Date.now() - 60 * 86_400_000).toISOString();
  const { data: ords } = await db.from("ven_ordenes").select("id, fecha").not("fase", "is", null).gte("fecha", desde.slice(0, 10)).limit(20000);
  const ids = (ords ?? []).map((o) => o.id as string);
  const eventos: { orden_id: string; fase_despues: string | null; creado_en: string }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await db.from("ven_orden_eventos").select("orden_id, fase_despues, creado_en").eq("tipo", "fase").in("orden_id", ids.slice(i, i + 500)).limit(20000);
    eventos.push(...((data ?? []) as typeof eventos));
  }
  const csv = csvEmbudo(embudo((ords ?? []).map((o) => ({ id: o.id as string, creado_en: String(o.fecha) })), eventos));
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="embudo-pipeline-${hoyPanama()}.csv"`, "Cache-Control": "no-store" } });
}
