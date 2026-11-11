import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { csvMotivos, motivosFallo } from "@/lib/ventas/motivos-fallo";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new Response("Sin acceso", { status: 403 });
  }
  const db = createServiceClient();
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db
    .from("ven_ordenes")
    .select("fase, motivo_fallo, motivo_fallo_codigo")
    .in("fase", ["fallida", "devuelta", "cancelada"])
    .gte("fecha", desde)
    .limit(20000);
  const filas = motivosFallo(
    (data ?? []).map((o) => ({
      fase: String(o.fase),
      motivo_codigo: (o.motivo_fallo_codigo as string | null) ?? null,
      motivo_texto: (o.motivo_fallo as string | null) ?? null,
    })),
  );
  return new Response(csvMotivos(filas), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="motivos-fallo-${hoyPanama()}.csv"`, "Cache-Control": "no-store" },
  });
}
