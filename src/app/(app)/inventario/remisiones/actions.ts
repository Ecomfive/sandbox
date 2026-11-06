"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { quienesAutorizan, revisarCorreccion, textoCorreccion } from "@/lib/wms/correccion-remision";
import { numeroRemision, revisarLineasRemision } from "@/lib/wms/remision";

const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Crea una remisión con todos sus productos (`wms_crear_remision`, migración 0233): salen de la bodega y quedan «en camino». Es todo o nada: si a uno no le alcanza el
 * stock, no sale ninguno. Devuelve el error como valor.
 */
export async function crearRemision(datos: { desde: unknown; hacia: unknown; notas: unknown; lineas: unknown }): Promise<{ error: string } | { id: string; numero: string }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID(datos.desde)) return { error: "Elige de qué bodega sale." };
  if (!ES_ID(datos.hacia)) return { error: "Elige a qué bodega va." };
  const revisadas = revisarLineasRemision(datos.lineas);
  if ("error" in revisadas) return revisadas;
  const notas = typeof datos.notas === "string" ? datos.notas.trim().slice(0, 300) : "";
  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, datos.desde)) || !(await puedeVerBodega(supabase, usuario.paisesPermitidos, datos.hacia))) {
    return { error: "No tienes acceso al país de esas bodegas." };
  }
  const { data, error } = await supabase.rpc("wms_crear_remision", { p_desde: datos.desde, p_hacia: datos.hacia, p_items: revisadas.lineas, p_notas: notas || null, p_usuario: usuario.id });
  if (error) {
    if (/wms_crear_remision/.test(error.message)) return { error: "Falta correr la migración 0233 en la base." };
    return { error: error.message.length < 200 ? error.message : "No se pudo crear la remisión." };
  }
  const creada = data as { id: string; numero: number };
  const numero = numeroRemision(creada.numero);
  const unidades = revisadas.lineas.reduce((t, l) => t + l.cantidad, 0);
  await registrarAuditoria({
    accion: "envio_dropi_inventario",
    entidad: "wms_remisiones",
    entidadId: creada.id,
    detalle: `${numero}: ${revisadas.lineas.length} ${revisadas.lineas.length === 1 ? "producto" : "productos"}, ${unidades.toLocaleString("es-PA")} unidades${notas ? ` · ${notas}` : ""}`,
  });
  revalidatePath("/inventario");
  revalidatePath("/inventario/remisiones");
  return { id: creada.id, numero };
}

const RUTA = "/inventario/remisiones";

/** El aviso en la campana de cada persona (no falla la acción si no se puede mandar). */
async function avisar(supabase: ReturnType<typeof createServiceClient>, personas: string[], titulo: string, texto: string, autor: { id: string; nombre: string }) {
  if (!personas.length) return;
  await supabase.from("notificaciones_usuario").insert(personas.map((usuario_id) => ({ usuario_id, tipo: "remision", titulo, texto: texto.slice(0, 500), href: RUTA, autor_id: autor.id, autor_nombre: autor.nombre })));
}

/** Pide corregir lo recibido o anular lo que sigue en camino (migración 0234). No cambia nada: queda esperando a quien puede autorizar y les llega el aviso. */
export async function pedirCorreccion(envioId: string, tipo: unknown, recibida: unknown, motivo: unknown): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID(envioId)) return { error: "Línea no válida." };
  const supabase = createServiceClient();
  const { data: linea } = await supabase
    .from("wms_envios_dropi")
    .select("id, estado, enviada, recibida, referencia, bodega_origen_id, skus_maestros(codigo), wms_bodegas!wms_envios_dropi_bodega_origen_id_fkey(pais_id)")
    .eq("id", envioId)
    .maybeSingle();
  if (!linea) return { error: "La línea ya no existe." };
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, linea.bodega_origen_id as string))) return { error: "No tienes acceso al país de esa remisión." };
  const r = revisarCorreccion({ estado: linea.estado as string, recibida: linea.recibida === null ? null : Number(linea.recibida) }, { tipo, recibida, motivo });
  if ("error" in r) return r;
  const bodega = (Array.isArray(linea.wms_bodegas) ? linea.wms_bodegas[0] : linea.wms_bodegas) as { pais_id: string } | null;
  const { data: autorizadores, error: errorAut } = await supabase.from("wms_autorizadores_remision").select("perfil_id, pais_id");
  if (errorAut) return { error: "Falta correr la migración 0234 en la base." };
  const autoriza = quienesAutorizan(autorizadores ?? [], bodega?.pais_id ?? "", usuario.id);
  if (!autoriza.length) return { error: "No hay quién autorice esta corrección." };
  const nombre = usuario.nombre || usuario.email;
  const { error } = await supabase.from("wms_correcciones_remision").insert({
    envio_id: envioId,
    tipo: r.tipo,
    recibida_antes: linea.recibida,
    recibida_nueva: r.recibida,
    motivo: r.motivo,
    solicitante_id: usuario.id,
    solicitante_nombre: nombre,
    autoriza_a: autoriza,
  });
  if (error) return { error: error.code === "23505" ? "Esa línea ya tiene una petición esperando autorización." : "No se pudo guardar la petición." };
  const sku = (Array.isArray(linea.skus_maestros) ? linea.skus_maestros[0] : linea.skus_maestros) as { codigo: string } | null;
  const que = textoCorreccion({ tipo: r.tipo, recibidaAntes: linea.recibida === null ? null : Number(linea.recibida), recibidaNueva: r.recibida, enviada: Number(linea.enviada) });
  const donde = `${linea.referencia ?? "Remisión"} · ${sku?.codigo ?? ""}`;
  await avisar(supabase, autoriza, `Remisión por autorizar: ${donde}`, `${que}. ${nombre}: ${r.motivo}`, { id: usuario.id, nombre });
  await registrarAuditoria({ accion: "remision_correccion_pedida", entidad: "wms_envios_dropi", entidadId: envioId, detalle: `${donde} · ${que} · ${r.motivo}` });
  revalidatePath(RUTA);
  return {};
}

/** Autoriza o rechaza una petición. La base comprueba que esta persona pueda hacerlo y que no sea quien la pidió. */
export async function resolverCorreccion(id: string, autorizar: boolean, nota: unknown): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID(id)) return { error: "Petición no válida." };
  const supabase = createServiceClient();
  const texto = typeof nota === "string" ? nota.trim().slice(0, 300) : "";
  const nombre = usuario.nombre || usuario.email;
  const { error } = await supabase.rpc("wms_resolver_correccion_remision", { p_correccion: id, p_autorizar: autorizar, p_nota: texto || null, p_usuario: usuario.id, p_nombre: nombre });
  if (error) return { error: error.message.length < 200 ? error.message : "No se pudo resolver la petición." };
  const { data: c } = await supabase.from("wms_correcciones_remision").select("envio_id, tipo, recibida_antes, recibida_nueva, solicitante_id, wms_envios_dropi(enviada, referencia)").eq("id", id).maybeSingle();
  if (c) {
    const e = (Array.isArray(c.wms_envios_dropi) ? c.wms_envios_dropi[0] : c.wms_envios_dropi) as { enviada: number; referencia: string | null } | null;
    const que = textoCorreccion({ tipo: c.tipo as "recibida" | "anular", recibidaAntes: c.recibida_antes as number | null, recibidaNueva: c.recibida_nueva as number | null, enviada: Number(e?.enviada ?? 0) });
    const palabra = autorizar ? "autorizó" : "rechazó";
    if (c.solicitante_id) await avisar(supabase, [c.solicitante_id as string], `${nombre} ${palabra} tu corrección`, `${e?.referencia ?? "Remisión"} · ${que}${texto ? ` · ${texto}` : ""}`, { id: usuario.id, nombre });
    await registrarAuditoria({ accion: autorizar ? "remision_correccion_autorizada" : "remision_correccion_rechazada", entidad: "wms_envios_dropi", entidadId: c.envio_id as string, detalle: `${e?.referencia ?? "Remisión"} · ${que}${texto ? ` · ${texto}` : ""}` });
  }
  revalidatePath(RUTA);
  revalidatePath("/inventario");
  return {};
}
