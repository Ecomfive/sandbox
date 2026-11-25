import { NextResponse } from "next/server";
import { BUCKET_RECIBOS, deliveryDeCourier } from "@/lib/despacho/datos-control";
import { cuentaRepartidorActual } from "@/lib/despacho/sesion-repartidor";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

/** App del delivery › Mis pagos › «Ver mi recibo» (25 nov 2026): el PDF firmado de una de sus semanas, solo suyo. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cuenta = await cuentaRepartidorActual();
  if (!cuenta) return new NextResponse("Tu sesión terminó.", { status: 401 });
  if (!esUuid(id)) return new NextResponse("No encontrado", { status: 404 });
  const supabase = createServiceClient();
  const delivery = await deliveryDeCourier(supabase, cuenta.courier);
  const { data: s } = await supabase.from("despacho_semanas").select("delivery_id, semana, pdf_ruta, estado").eq("id", id).maybeSingle();
  if (!delivery || !s || s.delivery_id !== delivery.id || s.estado !== "firmada" || !s.pdf_ruta) return new NextResponse("No encontrado", { status: 404 });
  const { data: archivo } = await supabase.storage.from(BUCKET_RECIBOS).download(s.pdf_ruta as string);
  if (!archivo) return new NextResponse("No se pudo abrir el recibo.", { status: 500 });
  return new NextResponse(new Uint8Array(await archivo.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="recibo-${s.semana}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
