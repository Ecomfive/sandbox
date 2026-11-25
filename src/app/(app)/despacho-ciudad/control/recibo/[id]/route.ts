import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { BUCKET_RECIBOS } from "@/lib/despacho/datos-control";
import { SOLO_TODA_LA_EMPRESA } from "@/lib/finanzas/acceso-tienda";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Envíos Delivery › Control de envíos › un recibo firmado (25 nov 2026), para Despacho y Finanzas. `?anulado=N` abre uno anulado (queda guardado).
 * Solo con Envíos Delivery y todas las tiendas.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("despacho-ciudad")) return new NextResponse("No autorizado", { status: 403 });
  if (await cargarTiendasPermitidas()) return new NextResponse(SOLO_TODA_LA_EMPRESA, { status: 403 });
  const { id } = await params;
  if (!esUuid(id)) return new NextResponse("No encontrado", { status: 404 });
  const supabase = createServiceClient();
  const { data: s } = await supabase.from("despacho_semanas").select("semana, pdf_ruta, anulados, delivery_id").eq("id", id).maybeSingle();
  if (!s) return new NextResponse("No encontrado", { status: 404 });
  const anulado = new URL(req.url).searchParams.get("anulado");
  const lista = Array.isArray(s.anulados) ? (s.anulados as { pdfRuta?: string }[]) : [];
  const ruta = anulado !== null ? lista[Number(anulado)]?.pdfRuta : (s.pdf_ruta as string | null);
  if (!ruta) return new NextResponse("No encontrado", { status: 404 });
  const { data: archivo } = await supabase.storage.from(BUCKET_RECIBOS).download(ruta);
  if (!archivo) return new NextResponse("No se pudo abrir el recibo.", { status: 500 });
  const nombre = ruta.split("/").pop() ?? `recibo-${s.semana}.pdf`;
  return new NextResponse(new Uint8Array(await archivo.arrayBuffer()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nombre}"`, "Cache-Control": "private, no-store" },
  });
}
