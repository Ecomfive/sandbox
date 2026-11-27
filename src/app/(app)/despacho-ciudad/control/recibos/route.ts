import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getUsuarioActual } from "@/lib/auth";
import { BUCKET_RECIBOS, recibosDelMes } from "@/lib/despacho/datos-control";
import { SOLO_TODA_LA_EMPRESA } from "@/lib/finanzas/acceso-tienda";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Envíos Delivery › Control de envíos › «Descargar todos» (25 nov 2026): los recibos firmados de un mes (`?mes=AAAA-MM`) en un solo PDF, una página
 * por recibo, para Finanzas. Solo con Envíos Delivery y todas las tiendas.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("despacho-ciudad")) return new NextResponse("No autorizado", { status: 403 });
  if (await cargarTiendasPermitidas()) return new NextResponse(SOLO_TODA_LA_EMPRESA, { status: 403 });
  const pedido = req.nextUrl.searchParams.get("mes") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(pedido)) return new NextResponse("Mes no válido", { status: 400 });
  const supabase = createServiceClient();
  const firmados = (await recibosDelMes(supabase, pedido)).filter((r) => r.estado === "firmada" && r.pdfRuta).reverse();
  if (!firmados.length) return new NextResponse("No hay recibos firmados en ese mes.", { status: 404 });
  const junto = await PDFDocument.create();
  junto.setTitle(`Recibos de deliverys ${pedido}`);
  for (const r of firmados) {
    const { data: archivo } = await supabase.storage.from(BUCKET_RECIBOS).download(r.pdfRuta!);
    if (!archivo) continue;
    const doc = await PDFDocument.load(new Uint8Array(await archivo.arrayBuffer()));
    for (const p of await junto.copyPages(doc, doc.getPageIndices())) junto.addPage(p);
  }
  return new NextResponse(new Uint8Array(await junto.save()), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="recibos-deliverys-${pedido}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
