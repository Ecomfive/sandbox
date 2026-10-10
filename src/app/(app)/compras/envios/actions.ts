"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { paisesDelMundo } from "@/lib/paises-mundo";

// Compras › Envíos: las rutas de cada agente de envío (país, vía, tiempo prometido, activo) y sus tarifas. Todo devuelve el
// error como valor (en producción Next.js oculta el mensaje de una excepción).

const ES_ID = (v: unknown) => typeof v === "string" && /^[0-9a-fA-F-]{8,64}$/.test(v);
const texto = (f: FormData, k: string, max = 200) => {
  const t = String(f.get(k) ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  return t || null;
};
const dias = (f: FormData, k: string): number | null | "error" => {
  const t = String(f.get(k) ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 0 && n <= 365 ? n : "error";
};

/** Lo que llega del formulario de una ruta, revisado. */
function leerRuta(f: FormData): { error: string } | Record<string, unknown> {
  const pais = String(f.get("pais_codigo") ?? "").toUpperCase();
  const delMundo = paisesDelMundo().find((p) => p.codigo === pais);
  if (!delMundo) return { error: "Elige el país." };
  const via = String(f.get("via") ?? "");
  if (!["mar", "aire", "tierra"].includes(via)) return { error: "Elige la vía." };
  const modalidad = String(f.get("modalidad") ?? "");
  if (modalidad && !["DDP", "DAP"].includes(modalidad)) return { error: "Modalidad no válida." };
  const min = dias(f, "dias_min");
  const max = dias(f, "dias_max");
  if (min === "error" || max === "error") return { error: "Los días son números enteros entre 0 y 365." };
  if (min !== null && max !== null && min > max) return { error: "Los días mínimos no pueden ser más que los máximos." };
  const url = texto(f, "url", 500);
  if (url && !/^https?:\/\//i.test(url)) return { error: "El enlace debe empezar con http:// o https://." };
  return {
    agente: texto(f, "agente", 60),
    pais_codigo: pais,
    pais_nombre: delMundo.nombre,
    via,
    modalidad: modalidad || null,
    courier: texto(f, "courier", 60),
    dias_min: min ?? max,
    dias_max: max ?? min,
    nota: String(f.get("nota") ?? "").trim().slice(0, 2000) || null,
    url,
  };
}

/** Una ruta es de un país: quien tiene países limitados solo toca las de sus países (si el país existe en el sistema). */
async function sinAcceso(codigo: string): Promise<string | null> {
  const permitidos = (await getUsuarioActual())?.paisesPermitidos ?? null;
  return permitidos === null || permitidos.includes(codigo) ? null : "No tienes acceso a ese país.";
}

const etiquetaRuta = (r: Record<string, unknown>) => `${r.agente ?? "Sin agente"} · ${r.pais_nombre} · ${r.via}`;

export async function crearRuta(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const datos = leerRuta(formData);
  if ("error" in datos) return datos as { error: string };
  const noPuede = await sinAcceso(String(datos.pais_codigo));
  if (noPuede) return { error: noPuede };
  // La tarifa General de una vez, si se escribió al crear la ruta.
  const precioTexto = String(formData.get("tarifa_precio") ?? "").trim();
  const precio = precioTexto ? Number(precioTexto) : null;
  if (precio !== null && (!Number.isFinite(precio) || precio < 0 || precio > 1_000_000)) return { error: "Escribe un precio válido." };
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("wms_rutas_envio").insert(datos).select("id").single();
  if (error || !data) return { error: "No se pudo crear la ruta." };
  if (precio !== null) {
    const usuario = await getUsuarioActual();
    await supabase.from("wms_rutas_envio_tarifas").insert({
      ruta_id: data.id,
      tipo_producto: "General",
      precio: Math.round(precio * 100) / 100,
      unidad: datos.via === "mar" ? "cbm" : "kg",
      creado_por: usuario?.nombre || usuario?.email || null,
    });
  }
  await registrarAuditoria({ accion: "crear_ruta_envio", entidad: "wms_rutas_envio", entidadId: data.id, detalle: etiquetaRuta(datos) });
  revalidatePath("/compras/envios");
  return {};
}

export async function actualizarRuta(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const id = formData.get("id");
  if (!ES_ID(id)) return { error: "Ruta no válida." };
  const datos = leerRuta(formData);
  if ("error" in datos) return datos as { error: string };
  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("wms_rutas_envio").select("*").eq("id", id).maybeSingle();
  if (!antes) return { error: "La ruta ya no existe." };
  const noPuede = (await sinAcceso(String(antes.pais_codigo))) ?? (await sinAcceso(String(datos.pais_codigo)));
  if (noPuede) return { error: noPuede };
  const { error } = await supabase.from("wms_rutas_envio").update({ ...datos, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo guardar la ruta." };
  const cambios = Object.keys(datos).filter((k) => String(antes[k] ?? "") !== String(datos[k] ?? ""));
  await registrarAuditoria({
    accion: "editar_ruta_envio",
    entidad: "wms_rutas_envio",
    entidadId: String(id),
    antes: Object.fromEntries(cambios.map((k) => [k, String(antes[k] ?? "—")])),
    despues: Object.fromEntries(cambios.map((k) => [k, String(datos[k] ?? "—")])),
  });
  revalidatePath("/compras/envios");
  return {};
}

/** Activa o desactiva el canal (la ruta no se borra: queda su historial). */
export async function cambiarActivoRuta(id: string, activo: boolean): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  if (!ES_ID(id)) return { error: "Ruta no válida." };
  const supabase = createServiceClient();
  const { data: ruta } = await supabase.from("wms_rutas_envio").select("pais_codigo, pais_nombre, agente, via").eq("id", id).maybeSingle();
  if (!ruta) return { error: "La ruta ya no existe." };
  const noPuede = await sinAcceso(String(ruta.pais_codigo));
  if (noPuede) return { error: noPuede };
  const { error } = await supabase.from("wms_rutas_envio").update({ activo: !!activo, actualizado_en: new Date().toISOString() }).eq("id", id);
  if (error) return { error: "No se pudo cambiar." };
  await registrarAuditoria({ accion: activo ? "activar_ruta_envio" : "desactivar_ruta_envio", entidad: "wms_rutas_envio", entidadId: id, detalle: etiquetaRuta(ruta) });
  revalidatePath("/compras/envios");
  return {};
}

export async function eliminarRuta(id: string): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  if (!ES_ID(id)) return { error: "Ruta no válida." };
  const supabase = createServiceClient();
  const { data: ruta } = await supabase.from("wms_rutas_envio").select("pais_codigo, pais_nombre, agente, via").eq("id", id).maybeSingle();
  if (!ruta) return {};
  const noPuede = await sinAcceso(String(ruta.pais_codigo));
  if (noPuede) return { error: noPuede };
  const { error } = await supabase.from("wms_rutas_envio").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar." };
  await registrarAuditoria({ accion: "eliminar_ruta_envio", entidad: "wms_rutas_envio", entidadId: id, detalle: etiquetaRuta(ruta) });
  revalidatePath("/compras/envios");
  return {};
}

/** Una tarifa nueva de una ruta (la anterior del mismo tipo queda como historial). */
export async function agregarTarifa(rutaId: string, tipo: string, precio: number, unidad: string, vigenteDesde: string): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("compras");
  if (!ES_ID(rutaId)) return { error: "Ruta no válida." };
  const tipoLimpio = String(tipo ?? "").trim().replace(/\s+/g, " ").slice(0, 60) || "General";
  const monto = Number(precio);
  if (!Number.isFinite(monto) || monto < 0 || monto > 1_000_000) return { error: "Escribe un precio válido." };
  if (unidad !== "cbm" && unidad !== "kg") return { error: "Elige la unidad (CBM o kg)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(vigenteDesde))) return { error: "Elige desde qué fecha rige." };
  const supabase = createServiceClient();
  const { data: ruta } = await supabase.from("wms_rutas_envio").select("pais_codigo, pais_nombre, agente, via").eq("id", rutaId).maybeSingle();
  if (!ruta) return { error: "La ruta ya no existe." };
  const noPuede = await sinAcceso(String(ruta.pais_codigo));
  if (noPuede) return { error: noPuede };
  const { error } = await supabase
    .from("wms_rutas_envio_tarifas")
    .insert({ ruta_id: rutaId, tipo_producto: tipoLimpio, precio: Math.round(monto * 100) / 100, unidad, vigente_desde: vigenteDesde, creado_por: usuario.nombre || usuario.email });
  if (error) return { error: "No se pudo guardar la tarifa." };
  await registrarAuditoria({ accion: "tarifa_ruta_envio", entidad: "wms_rutas_envio", entidadId: rutaId, detalle: `${etiquetaRuta(ruta)} · ${tipoLimpio}: $${monto} ${unidad === "cbm" ? "por CBM" : "por kg"} desde ${vigenteDesde}` });
  revalidatePath("/compras/envios");
  return {};
}

export async function eliminarTarifa(id: string): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  if (!ES_ID(id)) return { error: "Tarifa no válida." };
  const supabase = createServiceClient();
  const { data: t } = await supabase.from("wms_rutas_envio_tarifas").select("ruta_id, tipo_producto, precio, unidad, wms_rutas_envio(pais_codigo)").eq("id", id).maybeSingle();
  if (!t) return {};
  const ruta = (Array.isArray(t.wms_rutas_envio) ? t.wms_rutas_envio[0] : t.wms_rutas_envio) as { pais_codigo: string } | null;
  const noPuede = ruta ? await sinAcceso(ruta.pais_codigo) : null;
  if (noPuede) return { error: noPuede };
  const { error } = await supabase.from("wms_rutas_envio_tarifas").delete().eq("id", id);
  if (error) return { error: "No se pudo eliminar la tarifa." };
  await registrarAuditoria({ accion: "eliminar_tarifa_envio", entidad: "wms_rutas_envio", entidadId: String(t.ruta_id), detalle: `${t.tipo_producto}: $${t.precio} ${t.unidad}` });
  revalidatePath("/compras/envios");
  return {};
}
