"use server";

import { registrarAuditoria } from "@/lib/auditoria";
import { nombrePais } from "@/lib/paises-mundo";
import { createServiceClient } from "@/lib/supabase/server";
import { avisarBandeja } from "@/lib/whatsapp/aviso-bandeja";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

const FALTA_0194 = "Falta correr en Supabase la migración 0194 (lista de plataformas de «Dónde vende»).";
const falta = (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "42703";
const limpiar = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, 40);

/** La lista propia de plataformas de «Dónde vende» (migración 0194) y los países. */
export async function opcionesVendeEn(): Promise<{ plataformas: string[]; paises: { codigo: string; nombre: string }[] } | { error: string }> {
  if (!(await usuarioBandeja(false))) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  const [p, x] = await Promise.all([supabase.from("crm_plataformas_venta").select("nombre").order("nombre"), supabase.from("paises").select("codigo, nombre").order("nombre")]);
  if (p.error) return { error: falta(p.error) ? FALTA_0194 : "No se pudieron cargar las plataformas." };
  if (x.error) return { error: "No se pudieron cargar los países." };
  return { plataformas: (p.data ?? []).map((r) => r.nombre as string), paises: (x.data ?? []).map((r) => ({ codigo: r.codigo as string, nombre: r.nombre as string })) };
}

/** La plataforma de la lista con ese nombre (sin mirar mayúsculas). */
async function plataformaPorNombre(supabase: ReturnType<typeof createServiceClient>, nombre: string) {
  const { data, error } = await supabase.from("crm_plataformas_venta").select("id, nombre").ilike("nombre", nombre.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  return { data: data as { id: string; nombre: string } | null, error };
}

/**
 * Pone o quita una plataforma en un país en «Dónde vende» del dropshipper de un chat (29 oct 2026, pedido de Alcides). Quitar lo que viene de una cuenta
 * vinculada la oculta de la lista (la cuenta no se toca). Pide poder escribir en el área del chat y que el chat tenga dropshipper; queda en su auditoría.
 */
export async function cambiarVendeEn(conversacionId: string, plataforma: string, pais: string, poner: boolean): Promise<{ ok: true } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  const chat = await conversacionPermitida(supabase, conversacionId, u, true);
  if (!chat) return { error: "Esa conversación no existe o no es de tu área." };
  if (!chat.dropshipperId) return { error: "Primero vincula el chat con su dropshipper." };
  const nombre = limpiar(plataforma);
  let p = await plataformaPorNombre(supabase, nombre);
  if (p.error) return { error: falta(p.error) ? FALTA_0194 : "No se pudo guardar." };
  // Quitar lo de una cuenta vinculada cuya plataforma todavía no está en la lista: se agrega a la lista para poder ocultarla.
  if (!p.data && !poner && nombre) {
    await supabase.from("crm_plataformas_venta").insert({ nombre });
    p = await plataformaPorNombre(supabase, nombre);
  }
  const x = await supabase.from("paises").select("id, codigo").eq("codigo", String(pais)).maybeSingle();
  if (!p.data || !x.data) return { error: "Elige una plataforma y un país de la lista." };
  const fila = { dropshipper_id: chat.dropshipperId, plataforma_venta_id: p.data.id, pais_id: x.data.id as string };
  let r;
  if (poner) {
    r = await supabase.from("dropshipper_vende_en").upsert({ ...fila, oculto: false, creado_por: u.id }, { onConflict: "dropshipper_id,plataforma_venta_id,pais_id" });
  } else {
    // ¿Viene de una cuenta vinculada? Entonces se oculta; si no, se borra.
    const { data: cuentas } = await supabase.from("dropshipper_cuentas").select("plataformas(nombre)").eq("dropshipper_id", chat.dropshipperId).eq("pais_id", x.data.id as string);
    const deCuenta = (cuentas ?? []).some((c) => {
      const n = (Array.isArray(c.plataformas) ? c.plataformas[0] : (c.plataformas as { nombre: string } | null))?.nombre;
      return n?.trim().toLowerCase() === p.data!.nombre.trim().toLowerCase();
    });
    r = deCuenta
      ? await supabase.from("dropshipper_vende_en").upsert({ ...fila, oculto: true, creado_por: u.id }, { onConflict: "dropshipper_id,plataforma_venta_id,pais_id" })
      : await supabase.from("dropshipper_vende_en").delete().match(fila);
  }
  if (r.error) return { error: falta(r.error) ? FALTA_0194 : "No se pudo guardar." };
  const donde = `${p.data.nombre} ${nombrePais(x.data.codigo as string)}`;
  await registrarAuditoria({ accion: "vende_en_dropshipper", entidad: "dropshippers", entidadId: chat.dropshipperId, detalle: poner ? `Agregó ${donde}` : `Quitó ${donde}` });
  await avisarBandeja();
  return { ok: true };
}

/** Agrega una plataforma a la lista de «Dónde vende». */
export async function crearPlataformaVenta(nombre: string): Promise<{ nombre: string } | { error: string }> {
  if (!(await usuarioBandeja(true))) return { error: "No tienes permiso para escribir en el CRM." };
  const limpio = limpiar(nombre);
  if (!limpio) return { error: "Escribe el nombre de la plataforma." };
  const supabase = createServiceClient();
  const ya = await plataformaPorNombre(supabase, limpio);
  if (ya.error) return { error: falta(ya.error) ? FALTA_0194 : "No se pudo crear." };
  if (ya.data) return { nombre: ya.data.nombre };
  const { error } = await supabase.from("crm_plataformas_venta").insert({ nombre: limpio });
  if (error) return { error: "No se pudo crear la plataforma." };
  await registrarAuditoria({ accion: "crear_plataforma_venta", entidad: "crm_plataformas_venta", detalle: limpio });
  return { nombre: limpio };
}

/** Corrige el nombre de una plataforma de la lista: cambia en todos los dropshippers que la tengan. */
export async function renombrarPlataformaVenta(viejo: string, nuevo: string): Promise<{ nombre: string } | { error: string }> {
  if (!(await usuarioBandeja(true))) return { error: "No tienes permiso para escribir en el CRM." };
  const limpio = limpiar(nuevo);
  if (!limpio) return { error: "Escribe el nombre de la plataforma." };
  const supabase = createServiceClient();
  const p = await plataformaPorNombre(supabase, limpiar(viejo));
  if (!p.data) return { error: "Esa plataforma ya no está en la lista." };
  const otra = await plataformaPorNombre(supabase, limpio);
  if (otra.data && otra.data.id !== p.data.id) return { error: `Ya hay una plataforma «${otra.data.nombre}».` };
  const { error } = await supabase.from("crm_plataformas_venta").update({ nombre: limpio }).eq("id", p.data.id);
  if (error) return { error: "No se pudo cambiar el nombre." };
  await registrarAuditoria({ accion: "renombrar_plataforma_venta", entidad: "crm_plataformas_venta", entidadId: p.data.id, antes: { Nombre: p.data.nombre }, despues: { Nombre: limpio } });
  await avisarBandeja();
  return { nombre: limpio };
}

/** Borra una plataforma de la lista: se quita de «Dónde vende» de todos los dropshippers (las cuentas vinculadas no se tocan). */
export async function eliminarPlataformaVenta(nombre: string): Promise<{ ok: true } | { error: string }> {
  if (!(await usuarioBandeja(true))) return { error: "No tienes permiso para escribir en el CRM." };
  const supabase = createServiceClient();
  const p = await plataformaPorNombre(supabase, limpiar(nombre));
  if (!p.data) return { ok: true };
  const { error } = await supabase.from("crm_plataformas_venta").delete().eq("id", p.data.id);
  if (error) return { error: "No se pudo borrar la plataforma." };
  await registrarAuditoria({ accion: "eliminar_plataforma_venta", entidad: "crm_plataformas_venta", entidadId: p.data.id, detalle: p.data.nombre });
  await avisarBandeja();
  return { ok: true };
}
