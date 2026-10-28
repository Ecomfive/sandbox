"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { accesoCrm, MODULO_ATENCION, MODULO_COMERCIAL } from "@/lib/crm/areas";
import { esAdministrador } from "@/lib/permisos/acceso";
import type { Ocupante, PuestoBase } from "@/lib/puestos/organigrama";
import { createServiceClient } from "@/lib/supabase/server";
import { motivoLimpio, motivoValido, puedeCancelar, puedeResolver, quienAutoriza, MIN_MOTIVO } from "@/lib/whatsapp/borrado";
import { personasConModulos } from "@/lib/whatsapp/personas-crm";
import { conversacionPermitida } from "../bandeja/datos-bandeja";

// Borrar un chat o un mensaje de WhatsApp solo con autorización (28 oct 2026). Nadie borra por su cuenta: se **pide** con un motivo, la persona por encima
// (el jefe en Puestos, o un administrador si no tiene) lo **autoriza o rechaza**, y recién entonces se **oculta** de la bandeja: se conserva en la base y un
// administrador lo puede recuperar. La base impide cualquier DELETE de verdad (migración 0171).

const RUTA = "/crm-dropshippers/borrados";
const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
const FALTA_MIGRACION = "Falta correr la migración 0172 (borrado con autorización).";

/** Quien puede escribir en el CRM (Atención o Comercial). */
async function usuarioQueEscribe(): Promise<UsuarioActual | null> {
  const u = await getUsuarioActual();
  if (!u || !(u.modulos.includes(MODULO_ATENCION) || u.modulos.includes(MODULO_COMERCIAL))) return null;
  const a = accesoCrm(u);
  return a.escribeAtencion || a.escribeComercial || a.escribeDireccion ? u : null;
}

const nombreDe = (u: UsuarioActual) => u.nombre || u.email;

/** Los puestos y quién ocupa cada uno, para saber quién es el jefe de una persona. Sin Puestos, quedan vacíos y autoriza un administrador. */
async function cargarOrganigrama(supabase: ReturnType<typeof createServiceClient>): Promise<{ puestos: PuestoBase[]; ocupantes: Ocupante[] }> {
  const [p, o] = await Promise.all([
    supabase.from("puestos").select("id, nombre, area, reporta_a, plazas, activo"),
    supabase.from("puesto_personas").select("puesto_id, usuario_id, principal"),
  ]);
  if (p.error || o.error) return { puestos: [], ocupantes: [] };
  return {
    puestos: (p.data ?? []).map((x) => ({ id: x.id as string, nombre: x.nombre as string, area: x.area as string, reportaA: (x.reporta_a as string | null) ?? null, plazas: Number(x.plazas ?? 1), activo: x.activo !== false })),
    ocupantes: (o.data ?? []).map((x) => ({ puestoId: x.puesto_id as string, usuarioId: x.usuario_id as string, principal: !!x.principal })),
  };
}

async function avisar(supabase: ReturnType<typeof createServiceClient>, personas: string[], titulo: string, texto: string | null) {
  if (!personas.length) return;
  await supabase.from("notificaciones_usuario").insert(personas.map((id) => ({ usuario_id: id, tipo: "whatsapp", titulo: titulo.slice(0, 200), texto: texto ? texto.slice(0, 500) : null, href: RUTA, autor_nombre: "Sistema" })));
}

/**
 * Pide borrar un chat o un mensaje. No borra nada: queda pendiente hasta que la persona por encima de quien lo pide (su jefe en Puestos; si no tiene, un
 * administrador) lo autorice, y a ella le llega el aviso. Hace falta el motivo.
 */
export async function pedirBorrado(entrada: { tipo: string; conversacionId: string; mensajeId?: string | null; motivo: string }): Promise<{ ok: true; autorizan: string[] } | { error: string }> {
  const u = await usuarioQueEscribe();
  if (!u) return { error: "No tienes permiso para escribir en el CRM." };
  const tipo = entrada.tipo === "mensaje" ? "mensaje" : entrada.tipo === "chat" ? "chat" : null;
  if (!tipo || !ES_ID(entrada.conversacionId) || (tipo === "mensaje" && !ES_ID(entrada.mensajeId))) return { error: "Petición no válida." };
  const motivo = motivoLimpio(entrada.motivo);
  if (!motivoValido(motivo)) return { error: `Cuenta por qué quieres borrarlo (al menos ${MIN_MOTIVO} letras).` };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, entrada.conversacionId, u, true))) return { error: "Esa conversación no existe o no es de tu área." };
  if (tipo === "mensaje") {
    const { data: m } = await supabase.from("whatsapp_mensajes").select("id").eq("id", entrada.mensajeId!).eq("conversacion_id", entrada.conversacionId).maybeSingle();
    if (!m) return { error: "Ese mensaje no está en esta conversación." };
  }

  const [conAcceso, admins, organigrama] = await Promise.all([personasConModulos(supabase, ["crm-dropshippers"]), personasConModulos(supabase, ["usuarios"]), cargarOrganigrama(supabase)]);
  const autorizan = quienAutoriza(u.id, organigrama.puestos, organigrama.ocupantes, new Set(conAcceso.map((p) => p.id)), admins.filter((p) => !p.soloLectura).map((p) => p.id));
  if (!autorizan) return { error: "No hay a quién pedirle la autorización: no tienes jefe en Puestos con acceso al CRM ni hay otro administrador." };

  const { error } = await supabase.from("whatsapp_solicitudes_borrado").insert({
    tipo,
    conversacion_id: entrada.conversacionId,
    mensaje_id: tipo === "mensaje" ? entrada.mensajeId : null,
    motivo,
    solicitante_id: u.id,
    solicitante_nombre: nombreDe(u),
    autoriza_a: autorizan.ids,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ya hay una petición esperando autorización para esto." };
    if (error.code === "42P01") return { error: FALTA_MIGRACION };
    return { error: "No se pudo mandar la petición." };
  }
  await avisar(supabase, autorizan.ids, `${nombreDe(u)} pide borrar ${tipo === "chat" ? "un chat" : "un mensaje"} de WhatsApp`, motivo);
  await registrarAuditoria({ accion: "pedir_borrado_whatsapp", entidad: "whatsapp_conversaciones", entidadId: entrada.conversacionId, detalle: `${tipo === "chat" ? "Chat" : "Mensaje"}: ${motivo}` });
  revalidatePath(RUTA);
  revalidatePath("/crm-dropshippers/bandeja");
  const nombres = new Map(conAcceso.map((p) => [p.id, p.nombre]));
  return { ok: true, autorizan: autorizan.ids.map((id) => nombres.get(id) ?? "Alguien") };
}

/** Cancela una petición que sigue pendiente: quien la hizo, o un administrador. */
export async function cancelarSolicitudBorrado(id: string): Promise<{ ok: true } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u) return { error: "No tienes sesión." };
  if (!ES_ID(id)) return { error: "Petición no válida." };
  const supabase = createServiceClient();
  const { data: s } = await supabase.from("whatsapp_solicitudes_borrado").select("id, estado, solicitante_id, conversacion_id").eq("id", id).maybeSingle();
  if (!s || s.estado !== "pendiente") return { error: "Esa petición ya no está pendiente." };
  if (!puedeCancelar(u.id, (s.solicitante_id as string | null) ?? null, esAdministrador(u))) return { error: "Solo quien la pidió (o un administrador) la puede cancelar." };
  const { data: hecha } = await supabase
    .from("whatsapp_solicitudes_borrado")
    .update({ estado: "cancelada", resuelta_por: u.id, resuelta_por_nombre: nombreDe(u), resuelta_en: new Date().toISOString() })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");
  if (!hecha?.length) return { error: "Esa petición ya no está pendiente." };
  await registrarAuditoria({ accion: "cancelar_borrado_whatsapp", entidad: "whatsapp_conversaciones", entidadId: s.conversacion_id as string });
  revalidatePath(RUTA);
  revalidatePath("/crm-dropshippers/bandeja");
  return { ok: true };
}

/**
 * Autoriza o rechaza una petición. Solo quien está en la lista de quienes autorizan y no es quien la pidió. Al autorizar, el chat o el mensaje se **oculta**:
 * deja de verse en la bandeja pero se conserva, y un administrador lo puede recuperar. A quien lo pidió le llega el aviso con la respuesta.
 */
export async function resolverSolicitudBorrado(id: string, autorizar: boolean, nota?: string): Promise<{ ok: true } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u) return { error: "No tienes sesión." };
  if (!ES_ID(id)) return { error: "Petición no válida." };
  const supabase = createServiceClient();
  const { data: s } = await supabase
    .from("whatsapp_solicitudes_borrado")
    .select("id, tipo, estado, conversacion_id, mensaje_id, solicitante_id, solicitante_nombre, autoriza_a")
    .eq("id", id)
    .maybeSingle();
  if (!s || s.estado !== "pendiente") return { error: "Esa petición ya no está pendiente." };
  if (!puedeResolver(u.id, (s.autoriza_a as string[]) ?? [], (s.solicitante_id as string | null) ?? null)) return { error: "No eres quien debe autorizar esto." };

  // Primero se reclama la petición (si otra persona ya la resolvió, aquí se entera) y después se oculta.
  const { data: reclamada } = await supabase
    .from("whatsapp_solicitudes_borrado")
    .update({ estado: autorizar ? "autorizada" : "rechazada", resuelta_por: u.id, resuelta_por_nombre: nombreDe(u), resuelta_en: new Date().toISOString(), nota_resolucion: motivoLimpio(nota) || null })
    .eq("id", id)
    .eq("estado", "pendiente")
    .select("id");
  if (!reclamada?.length) return { error: "Otra persona ya resolvió esta petición." };

  if (autorizar) {
    const por = `${nombreDe(u)} autorizó; lo pidió ${s.solicitante_nombre as string}`;
    const ahora = new Date().toISOString();
    const { error } =
      s.tipo === "chat"
        ? await supabase.from("whatsapp_conversaciones").update({ oculta_en: ahora, oculta_por: por }).eq("id", s.conversacion_id as string)
        : await supabase.from("whatsapp_mensajes").update({ oculto_en: ahora, oculto_por: por }).eq("id", s.mensaje_id as string);
    if (error) {
      await supabase.from("whatsapp_solicitudes_borrado").update({ estado: "pendiente", resuelta_por: null, resuelta_por_nombre: null, resuelta_en: null, nota_resolucion: null }).eq("id", id);
      return { error: "No se pudo ocultar. La petición sigue pendiente." };
    }
  }
  if (s.solicitante_id) await avisar(supabase, [s.solicitante_id as string], `${nombreDe(u)} ${autorizar ? "autorizó" : "rechazó"} tu petición de borrar ${s.tipo === "chat" ? "un chat" : "un mensaje"}`, motivoLimpio(nota) || null);
  await registrarAuditoria({ accion: autorizar ? "autorizar_borrado_whatsapp" : "rechazar_borrado_whatsapp", entidad: "whatsapp_conversaciones", entidadId: s.conversacion_id as string, detalle: `${s.tipo === "chat" ? "Chat" : "Mensaje"} pedido por ${s.solicitante_nombre as string}` });
  revalidatePath(RUTA);
  revalidatePath("/crm-dropshippers/bandeja");
  revalidatePath("/crm-dropshippers");
  return { ok: true };
}

/** Un administrador devuelve a la bandeja un chat o un mensaje que se había ocultado. */
export async function recuperarOculto(tipo: string, id: string): Promise<{ ok: true } | { error: string }> {
  const u = await getUsuarioActual();
  if (!u || !esAdministrador(u)) return { error: "Solo un administrador puede recuperar lo oculto." };
  if ((tipo !== "chat" && tipo !== "mensaje") || !ES_ID(id)) return { error: "Petición no válida." };
  const supabase = createServiceClient();
  const { data, error } =
    tipo === "chat"
      ? await supabase.from("whatsapp_conversaciones").update({ oculta_en: null, oculta_por: null }).eq("id", id).not("oculta_en", "is", null).select("id")
      : await supabase.from("whatsapp_mensajes").update({ oculto_en: null, oculto_por: null }).eq("id", id).not("oculto_en", "is", null).select("id, conversacion_id");
  if (error || !data?.length) return { error: "No se pudo recuperar (puede que ya no esté oculto)." };
  const conversacionId = tipo === "chat" ? id : (data[0] as unknown as { conversacion_id: string }).conversacion_id;
  await registrarAuditoria({ accion: "recuperar_whatsapp", entidad: "whatsapp_conversaciones", entidadId: conversacionId, detalle: tipo === "chat" ? "Chat recuperado" : "Mensaje recuperado" });
  revalidatePath(RUTA);
  revalidatePath("/crm-dropshippers/bandeja");
  revalidatePath("/crm-dropshippers");
  return { ok: true };
}
