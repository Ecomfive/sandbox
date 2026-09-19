import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { cargarFicha } from "@/lib/retiros/ficha-datos";
import { fichaACsv, nombreArchivo } from "@/lib/retiros/ficha";
import { fichaAPdf } from "@/lib/retiros/ficha-pdf";
import { fichaAXlsx } from "@/lib/retiros/ficha-xlsx";

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const aArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/** Descarga la ficha de un retiro en formato factura: ?formato=pdf | xlsx | csv. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("retiros")) {
    return new NextResponse("No autorizado", { status: 403 });
  }

  const { id } = await params;
  const formato = request.nextUrl.searchParams.get("formato") ?? "pdf";
  if (!ES_UUID.test(id) || !["pdf", "xlsx", "csv"].includes(formato)) {
    return new NextResponse("Solicitud no válida", { status: 400 });
  }

  const ficha = await cargarFicha(id, usuario.nombre || usuario.email);
  if (!ficha) return new NextResponse("Retiro no encontrado", { status: 404 });

  let cuerpo: BodyInit;
  let tipo: string;
  if (formato === "pdf") {
    cuerpo = aArrayBuffer(await fichaAPdf(ficha));
    tipo = "application/pdf";
  } else if (formato === "xlsx") {
    cuerpo = aArrayBuffer(fichaAXlsx(ficha));
    tipo = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  } else {
    cuerpo = fichaACsv(ficha);
    tipo = "text/csv; charset=utf-8";
  }

  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${nombreArchivo(ficha, formato)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
