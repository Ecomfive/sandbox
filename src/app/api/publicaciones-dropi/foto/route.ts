import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { CDN_FOTOS_DROPI } from "@/lib/publicaciones/republicar-dropi";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { descargarPublico } from "@/lib/seguridad/url-externa";

const MAX_BYTES = 15 * 1024 * 1024;
const HOST_CDN = new URL(CDN_FOTOS_DROPI).host;

/**
 * Una foto de un producto de Dropi, bajada por el servidor para el favorito «Aplicar en Dropi» (25 oct 2026). El CDN de Dropi
 * (CloudFront) guarda copias de las fotos sin la cabecera CORS y el navegador, desde la pestaña de Dropi, no las deja leer; el
 * servidor sí. La pide la ventana de la plataforma (misma sesión) y se la pasa al favorito. Solo fotos del CDN de Dropi y solo
 * para quien puede abrir Gestión de IDs Dropi; se revisa por su firma que sea una imagen.
 */
export async function GET(request: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("publicaciones-dropi")) return new NextResponse("No autorizado", { status: 403 });

  let url: URL;
  try {
    url = new URL(request.nextUrl.searchParams.get("u") ?? "");
  } catch {
    return new NextResponse("Dirección no válida", { status: 400 });
  }
  if (url.protocol !== "https:" || url.host !== HOST_CDN || !/^\/[a-z]+\/products\/\d+\/[^/]+$/i.test(url.pathname)) {
    return new NextResponse("Solo fotos de productos del CDN de Dropi", { status: 400 });
  }

  const r = await descargarPublico(`${url.origin}${url.pathname}`, MAX_BYTES);
  if ("error" in r) return new NextResponse(r.error, { status: 502 });
  const imagen = detectarImagen(r.bytes);
  if (!imagen) return new NextResponse("No es una imagen", { status: 415 });
  const cuerpo = r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength) as ArrayBuffer;
  return new NextResponse(cuerpo, { headers: { "Content-Type": imagen.tipo, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
