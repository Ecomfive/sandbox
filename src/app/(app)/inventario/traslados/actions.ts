"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { MAX_NOTA_TRASLADO, numeroTraslado, revisarLineasTraslado } from "@/lib/wms/traslado";

const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F-]{8,64}$/.test(v);
const RUTA = "/inventario/traslados";

/** Crea un traslado entre dos bodegas propias del país (`wms_crear_traslado`, migración 0235): todos sus productos se mueven o ninguno. Devuelve el error como valor. */
export async function crearTraslado(datos: { desde: unknown; hacia: unknown; notas: unknown; lineas: unknown }): Promise<{ error: string } | { numero: string }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID(datos.desde)) return { error: "Elige de qué bodega sale." };
  if (!ES_ID(datos.hacia)) return { error: "Elige a qué bodega va." };
  if (datos.desde === datos.hacia) return { error: "La bodega de origen y la de destino son la misma." };
  const revisadas = revisarLineasTraslado(datos.lineas);
  if ("error" in revisadas) return revisadas;
  const notas = typeof datos.notas === "string" ? datos.notas.trim().slice(0, MAX_NOTA_TRASLADO) : "";
  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, datos.desde)) || !(await puedeVerBodega(supabase, usuario.paisesPermitidos, datos.hacia))) {
    return { error: "No tienes acceso al país de esas bodegas." };
  }
  const { data, error } = await supabase.rpc("wms_crear_traslado", { p_desde: datos.desde, p_hacia: datos.hacia, p_items: revisadas.lineas, p_notas: notas || null, p_usuario: usuario.id, p_nombre: usuario.nombre || usuario.email });
  if (error) {
    if (/wms_crear_traslado/.test(error.message)) return { error: "Falta correr la migración 0235 en la base." };
    return { error: error.message.length < 200 ? error.message : "No se pudo hacer el traslado." };
  }
  const creado = data as { id: string; numero: number };
  const numero = numeroTraslado(creado.numero);
  const unidades = revisadas.lineas.reduce((t, l) => t + l.cantidad, 0);
  await registrarAuditoria({
    accion: "traslado_inventario",
    entidad: "wms_traslados",
    entidadId: creado.id,
    detalle: `${numero}: ${revisadas.lineas.length} ${revisadas.lineas.length === 1 ? "producto" : "productos"}, ${unidades.toLocaleString("es-PA")} unidades${notas ? ` · ${notas}` : ""}`,
  });
  revalidatePath("/inventario");
  revalidatePath(RUTA);
  return { numero };
}

/** Cambia la nota de un traslado: qué traslado fue, en qué fecha, con qué número. La nota no mueve nada. */
export async function guardarNotaTraslado(id: string, nota: unknown): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID(id)) return { error: "Traslado no válido." };
  const texto = typeof nota === "string" ? nota.trim().slice(0, MAX_NOTA_TRASLADO) : "";
  const supabase = createServiceClient();
  const { data: t } = await supabase.from("wms_traslados").select("numero, notas, bodega_origen_id").eq("id", id).maybeSingle();
  if (!t) return { error: "El traslado ya no existe." };
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, t.bodega_origen_id as string))) return { error: "No tienes acceso al país de ese traslado." };
  if ((t.notas ?? "") === texto) return {};
  const { error } = await supabase.from("wms_traslados").update({ notas: texto || null }).eq("id", id);
  if (error) return { error: "No se pudo guardar la nota." };
  await registrarAuditoria({
    accion: "traslado_nota",
    entidad: "wms_traslados",
    entidadId: id,
    detalle: numeroTraslado(t.numero as number),
    antes: { Nota: (t.notas as string | null) ?? "—" },
    despues: { Nota: texto || "—" },
  });
  revalidatePath(RUTA);
  return {};
}
