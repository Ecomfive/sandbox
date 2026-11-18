import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { armarFormatoTrasladoHL, nombreArchivoFormato } from "@/lib/publicaciones/formato-traslado-hl";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { esBodegaDropi } from "@/lib/publicaciones/automatico";
import { normalizarDatosRepublicar, unidadesEnBodegaDropi } from "@/lib/publicaciones/traslado-b280";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const error = (texto: string, estado: number) => new NextResponse(texto, { status: estado, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

/**
 * El manifiesto de HL Express Panamá con los datos del traslado de una republicación de la B280 (18 nov 2026): se pide con el id de la tarea «Pedir a Dropi el traslado» y se arma con
 * el cambio de la cola que la creó (ID viejo y nuevo, unidades en la bodega de Dropi y, si el producto tiene variaciones, las de cada una según la última lectura de «Mis productos»).
 * Solo para quien puede abrir Gestión de IDs Dropi y ve el país; no cambia nada en Dropi ni en el sistema (queda una línea en la auditoría).
 */
export async function GET(request: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("publicaciones-dropi")) return error("No autorizado", 403);

  const tarea = request.nextUrl.searchParams.get("tarea") ?? "";
  if (!UUID.test(tarea)) return error("Tarea no válida.", 400);

  const supabase = createServiceClient();
  const { data: cambio } = await supabase
    .from("dropi_cambios_pendientes")
    .select("pais_id, publicacion_id, dropi_producto_id, nuevo_dropi_id, datos")
    .eq("tipo", "republicar")
    .eq("datos->>trasladoTarea", tarea)
    .maybeSingle();
  const datos = normalizarDatosRepublicar(cambio?.datos);
  const viejo = Number(cambio?.dropi_producto_id);
  const nuevo = Number(cambio?.nuevo_dropi_id);
  if (!cambio || !datos || !viejo || !nuevo) return error("Esta tarea no es de un traslado de la bodega de Dropi: el formato solo se arma para eso.", 404);

  const { data: pais } = await supabase.from("paises").select("codigo").eq("id", cambio.pais_id as string).maybeSingle();
  const codigo = String(pais?.codigo ?? "").toUpperCase();
  if (!puedeVerPais(usuario.paisesPermitidos, codigo)) return error("No tienes acceso a ese país.", 403);
  if (codigo !== "PA") return error("El formato es el de HL Express Panamá: para este país el traslado se pide con el mensaje de la tarea.", 400);

  const [{ data: pub }, { data: lectura }] = await Promise.all([
    supabase.from("dropi_publicaciones").select("nombre, numero").eq("id", cambio.publicacion_id as string).maybeSingle(),
    supabase.from("dropi_productos_proveedor").select("bodegas, variaciones").eq("pais_id", cambio.pais_id as string).eq("dropi_producto_id", viejo).maybeSingle(),
  ]);

  // Lo que el ID viejo tiene hoy en la bodega de Dropi, por variación si la lectura las trae.
  type VariacionLeida = { etiqueta?: unknown; bodegas?: { id?: unknown; stock?: unknown }[] };
  const variaciones = (Array.isArray(lectura?.variaciones) ? (lectura!.variaciones as VariacionLeida[]) : [])
    .map((v) => ({
      etiqueta: String(v.etiqueta ?? ""),
      unidades: (Array.isArray(v.bodegas) ? v.bodegas : []).filter((b) => esBodegaDropi(Number(b.id))).reduce((t, b) => t + Math.max(0, Number(b.stock) || 0), 0),
    }))
    .filter((v) => v.unidades > 0);
  const enLectura = unidadesEnBodegaDropi(lectura?.bodegas);
  const unidades = datos.unidadesB280 ?? (enLectura > 0 ? enLectura : null);

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const archivo = await armarFormatoTrasladoHL({
    viejo,
    nuevo,
    nombre: String(pub?.nombre ?? ""),
    unidades,
    variaciones,
    origen: "Bodega Dropi Panamá (B280)",
    fecha: hoy,
    publicacion: pub?.numero ? numeroPublicacion(Number(pub.numero)) : null,
  });

  await registrarAuditoria({
    accion: "descargar_formato_traslado_hl",
    entidad: "dropi_publicaciones",
    entidadId: cambio.publicacion_id as string,
    detalle: `Descargó el formato de HL Express del traslado del ID ${viejo} al ${nuevo}`,
  });

  const cuerpo = archivo.buffer.slice(archivo.byteOffset, archivo.byteOffset + archivo.byteLength) as ArrayBuffer;
  return new NextResponse(cuerpo, {
    headers: {
      "Content-Type": XLSX,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nombreArchivoFormato(viejo, nuevo))}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
