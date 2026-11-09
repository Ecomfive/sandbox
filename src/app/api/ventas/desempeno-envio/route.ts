import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { csvDesempeno, desempenoEnvio } from "@/lib/ventas/desempeno-envio";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new Response("Sin acceso", { status: 403 });
  }
  const db = createServiceClient();
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: ords }, { data: reps }] = await Promise.all([
    db.from("ven_ordenes").select("fase, repartidor_id, transportista, fecha, entregada_en").not("fase", "is", null).gte("fecha", desde).limit(20000),
    db.from("del_repartidores").select("id, nombre").limit(2000),
  ]);
  const nombres = new Map((reps ?? []).map((r) => [r.id as string, String(r.nombre)]));
  const filas = desempenoEnvio(
    (ords ?? []).map((o) => ({
      fase: String(o.fase),
      repartidor: o.repartidor_id ? nombres.get(o.repartidor_id as string) ?? null : null,
      transportista: (o.transportista as string | null) ?? null,
      fecha: String(o.fecha),
      entregada_en: (o.entregada_en as string | null) ?? null,
    })),
  );
  return new Response(csvDesempeno(filas), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="desempeno-envio-${hoyPanama()}.csv"`, "Cache-Control": "no-store" },
  });
}
