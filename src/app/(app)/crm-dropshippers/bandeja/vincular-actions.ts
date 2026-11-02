"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { sugerirDropshippers } from "@/lib/crm/sugerencias";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { enlazarChatsPorTelefono, guardarTelefonoDelChat, quitarTelefonoDelChat, type DecisionTelefono } from "@/lib/whatsapp/vinculo";
import { conversacionPermitida, usuarioBandeja } from "./datos-bandeja";

/** Un dropshipper que se puede elegir para vincular un chat. Nunca lleva su número ni su correo. */
export interface CandidatoVinculo {
  id: string;
  nombre: string;
  codigo: string | null;
  tiendas: string[];
  /** Sus usuarios de Dropi («Tienda · 12345»). */
  cuentas: string[];
  /** Solo en las sugerencias: qué tan parecido es su nombre al del perfil de WhatsApp (0 a 1). */
  puntaje?: number;
}

type Fila = { id: string; codigo: string | null; nombre: string; tienda: string | null; tiendas: string[] | null };
const COLUMNAS = "id, codigo, nombre, tienda, tiendas";
const ES_ID = (s: string) => /^[0-9a-f-]{36}$/i.test(s);
const tiendasDe = (f: Fila): string[] => (f.tiendas?.length ? f.tiendas : f.tienda ? [f.tienda] : []);

async function conCuentas(supabase: ReturnType<typeof createServiceClient>, filas: Fila[], puntajes?: Map<string, number>): Promise<CandidatoVinculo[]> {
  const ids = filas.map((f) => f.id);
  const porId = new Map<string, string[]>();
  if (ids.length) {
    const { data } = await supabase.from("dropshipper_cuentas").select("dropshipper_id, id_externo, tienda_nombre").in("dropshipper_id", ids);
    for (const c of data ?? []) {
      const lista = porId.get(c.dropshipper_id as string) ?? [];
      lista.push(`${(c.tienda_nombre as string | null) ?? "Dropi"} · ${c.id_externo as string}`);
      porId.set(c.dropshipper_id as string, lista);
    }
  }
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, codigo: f.codigo, tiendas: tiendasDe(f), cuentas: porId.get(f.id) ?? [], ...(puntajes ? { puntaje: puntajes.get(f.id) } : {}) }));
}

/** Busca dropshippers del CRM para vincular el chat: por nombre, tienda, código, correo o ID de usuario de Dropi. */
export async function buscarDropshippersParaVincular(conversacionId: string, consulta: string): Promise<{ candidatos: CandidatoVinculo[] } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, conversacionId, u, true))) return { error: "Ese chat no existe o no puedes escribir en su área." };
  const t = String(consulta ?? "").trim().slice(0, 80);
  if (t.length < 2) return { candidatos: [] };

  // El texto de la persona va como valor de un filtro (nunca armado dentro de un `.or()`) y sus comodines de LIKE se escapan.
  const patron = `%${t.replace(/[\\%_]/g, "\\$&")}%`;
  const base = () => supabase.from("dropshippers").select(COLUMNAS).limit(15);
  const consultas = [base().ilike("nombre", patron), base().ilike("codigo", patron), base().ilike("tienda", patron), base().ilike("contacto_email", patron)];
  const [resultados, cuentasPorId, cuentasPorTienda] = await Promise.all([
    Promise.all(consultas),
    /^\d{1,12}$/.test(t) ? supabase.from("dropshipper_cuentas").select("dropshipper_id").eq("id_externo", t).limit(15) : Promise.resolve({ data: [], error: null }),
    supabase.from("dropshipper_cuentas").select("dropshipper_id").ilike("tienda_nombre", patron).limit(15),
  ]);
  if (resultados.some((r) => r.error)) return { error: "No se pudo buscar." };

  const vistos = new Map<string, Fila>();
  for (const r of resultados) for (const f of (r.data ?? []) as Fila[]) vistos.set(f.id, f);
  const deCuentas = [...new Set([...(cuentasPorId.data ?? []), ...(cuentasPorTienda.data ?? [])].map((c) => c.dropshipper_id as string))].filter((id) => !vistos.has(id));
  if (deCuentas.length) {
    const { data } = await supabase.from("dropshippers").select(COLUMNAS).in("id", deCuentas.slice(0, 15));
    for (const f of (data ?? []) as Fila[]) vistos.set(f.id, f);
  }
  const filas = [...vistos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).slice(0, 15);
  return { candidatos: await conCuentas(supabase, filas) };
}

/** Los dropshippers cuyo nombre o tienda se parece al nombre del perfil de WhatsApp del chat: «¿Es alguno de estos?». Solo sugiere; una persona confirma. */
export async function sugerirDropshippersParaChat(conversacionId: string): Promise<{ candidatos: CandidatoVinculo[] } | { error: string }> {
  const u = await usuarioBandeja(false);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, conversacionId, u))) return { error: "Ese chat no existe o no es de tu área." };
  const { data: chat } = await supabase.from("whatsapp_conversaciones").select("nombre_perfil, dropshipper_id").eq("id", conversacionId).maybeSingle();
  const nombre = (chat?.nombre_perfil as string | null) ?? null;
  if (!nombre || chat?.dropshipper_id) return { candidatos: [] };
  const { data: todos, error } = await traerTodasConError<Fila>((desde, hasta) => supabase.from("dropshippers").select(COLUMNAS).order("id").range(desde, hasta));
  if (error || !todos) return { error: "No se pudieron cargar los dropshippers." };
  const mejores = sugerirDropshippers(nombre, todos.map((f) => ({ id: f.id, nombre: f.nombre, tiendas: tiendasDe(f) })), 3);
  if (!mejores.length) return { candidatos: [] };
  const puntajes = new Map(mejores.map((m) => [m.dropshipperId, m.puntaje]));
  const filas = mejores.map((m) => todos.find((f) => f.id === m.dropshipperId)!).filter(Boolean);
  return { candidatos: await conCuentas(supabase, filas, puntajes) };
}

const MENSAJE_NUMERO: Record<DecisionTelefono, string> = {
  principal: " Se guardó el número del chat en su ficha.",
  alterno: " Se guardó el número del chat como otro número suyo.",
  ocupado: " El número del chat ya es de otro dropshipper, así que no se guardó.",
  ya_es: "",
  no_aplica: "",
};

/**
 * Vincula el chat con un dropshipper del CRM (o cambia el vínculo). Guarda el número del chat en la ficha de ese dropshipper (como principal si no tiene o como otro
 * número suyo) para que sus próximos mensajes se enlacen solos, y enlaza los demás chats sin enlazar de ese número. El número no viaja a la pantalla.
 */
export async function vincularChat(conversacionId: string, dropshipperId: string): Promise<{ ok: true; mensaje: string } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes acceso." };
  if (!ES_ID(dropshipperId)) return { error: "Dropshipper no válido." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, conversacionId, u, true))) return { error: "Ese chat no existe o no puedes escribir en su área." };
  const [{ data: chat }, { data: ds }] = await Promise.all([
    supabase.from("whatsapp_conversaciones").select("telefono, dropshipper_id").eq("id", conversacionId).maybeSingle(),
    supabase.from("dropshippers").select("id, nombre").eq("id", dropshipperId).maybeSingle(),
  ]);
  if (!chat || !ds) return { error: "No se encontró el chat o el dropshipper." };
  if (chat.dropshipper_id === dropshipperId) return { error: "Ese chat ya está vinculado con ese dropshipper." };

  const telefono = chat.telefono as string;
  // Si estaba vinculado con otro dropshipper (era un error), el número y los chats de ese número pasan al nuevo.
  const anterior = (chat.dropshipper_id as string | null) ?? null;
  if (anterior) {
    await quitarTelefonoDelChat(supabase, anterior, telefono);
    await supabase.from("whatsapp_conversaciones").update({ dropshipper_id: dropshipperId }).eq("telefono", telefono).eq("dropshipper_id", anterior);
  }
  const { error } = await supabase.from("whatsapp_conversaciones").update({ dropshipper_id: dropshipperId }).eq("id", conversacionId);
  if (error) return { error: "No se pudo vincular." };
  const decision = await guardarTelefonoDelChat(supabase, dropshipperId, telefono, u.nombre || u.email || null);
  const otros = await enlazarChatsPorTelefono(supabase, dropshipperId, telefono);
  await registrarAuditoria({ accion: "vincular_chat_dropshipper", entidad: "whatsapp_conversaciones", entidadId: conversacionId, detalle: `Vinculó el chat con ${ds.nombre as string}${decision === "principal" || decision === "alterno" ? " y guardó su número" : ""}` });
  revalidatePath("/crm-dropshippers/bandeja");
  revalidatePath("/crm-dropshippers");
  const extra = otros > 0 ? ` También se enlazó ${otros === 1 ? "otro chat" : `${otros} chats`} con ese número.` : "";
  return { ok: true, mensaje: `Vinculado con ${ds.nombre as string}.${MENSAJE_NUMERO[decision]}${extra}` };
}

/**
 * Quita el vínculo de un chat con su dropshipper (porque era otra persona). También quita el número del chat de la ficha de ese dropshipper y de los otros chats de
 * ese número que seguían enlazados a él: si no, el próximo mensaje lo volvería a enlazar con la persona equivocada.
 */
export async function desvincularChat(conversacionId: string): Promise<{ ok: true; mensaje: string } | { error: string }> {
  const u = await usuarioBandeja(true);
  if (!u) return { error: "No tienes acceso." };
  const supabase = createServiceClient();
  if (!(await conversacionPermitida(supabase, conversacionId, u, true))) return { error: "Ese chat no existe o no puedes escribir en su área." };
  const { data: chat } = await supabase.from("whatsapp_conversaciones").select("telefono, dropshipper_id, dropshippers(nombre)").eq("id", conversacionId).maybeSingle();
  const dropshipperId = (chat?.dropshipper_id as string | null) ?? null;
  if (!chat || !dropshipperId) return { error: "Ese chat no está vinculado." };
  const telefono = chat.telefono as string;

  const { error } = await supabase.from("whatsapp_conversaciones").update({ dropshipper_id: null }).eq("telefono", telefono).eq("dropshipper_id", dropshipperId);
  if (error) return { error: "No se pudo quitar el vínculo." };
  await quitarTelefonoDelChat(supabase, dropshipperId, telefono);
  const ds = chat.dropshippers as { nombre: string } | { nombre: string }[] | null;
  const nombre = (Array.isArray(ds) ? ds[0]?.nombre : ds?.nombre) ?? "un dropshipper";
  await registrarAuditoria({ accion: "desvincular_chat_dropshipper", entidad: "whatsapp_conversaciones", entidadId: conversacionId, detalle: `Quitó el vínculo del chat con ${nombre}` });
  revalidatePath("/crm-dropshippers/bandeja");
  revalidatePath("/crm-dropshippers");
  return { ok: true, mensaje: `Se quitó el vínculo con ${nombre}.` };
}
