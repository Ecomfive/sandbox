"use server";

import { accesoCrm, MODULO_ATENCION, MODULO_COMERCIAL, MODULO_DIRECCION, vePresenciaEquipo } from "@/lib/crm/areas";
import { VENTANA_EN_SISTEMA_MS, type PersonaEnSistema } from "@/lib/crm/presencia-chats";
import { paginaDeRuta } from "@/lib/rendimiento/datos";
import { createServiceClient } from "@/lib/supabase/server";
import { personasConModulos } from "@/lib/whatsapp/personas-crm";
import { nombreSinNumero } from "@/lib/whatsapp/telefono-oculto";
import { areasDe, usuarioBandeja } from "./datos-bandeja";

const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-fA-F-]{8,64}$/.test(v);
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/**
 * El nombre de los chats donde hay alguien trabajando y que no vienen en la lista de esta persona (la bandeja trae los 300 más recientes; el panel de Dirección, ninguno).
 * Solo de las áreas que puede ver: de un chat ajeno no sale el nombre y la barra dice «otro chat».
 */
export async function nombresDeChats(ids: unknown): Promise<Record<string, string>> {
  const usuario = await usuarioBandeja(false);
  // Solo para quien ve la presencia del equipo (Atención no ve dónde están los demás).
  if (!usuario || !vePresenciaEquipo(usuario) || !Array.isArray(ids)) return {};
  const validos = ids.filter(ES_ID).slice(0, 50);
  if (!validos.length) return {};
  const { data } = await createServiceClient().from("whatsapp_conversaciones").select("id, nombre_perfil, dropshippers(nombre)").in("id", validos).in("area", areasDe(usuario));
  return Object.fromEntries(
    (data ?? []).map((c) => [c.id as string, uno(c.dropshippers as { nombre: string | null } | { nombre: string | null }[] | null)?.nombre ?? (c.nombre_perfil as string | null) ?? nombreSinNumero(c.id as string)]),
  );
}

/** Para Dirección: quién del CRM (Atención, Comercial o Dirección) está usando el sistema ahora mismo y en qué página, según el aviso de cada minuto. */
export async function equipoEnSistema(): Promise<PersonaEnSistema[]> {
  const usuario = await usuarioBandeja(false);
  if (!usuario || !accesoCrm(usuario).direccion) return [];
  const supabase = createServiceClient();
  const [{ data }, personas] = await Promise.all([
    supabase.from("actividad_minutos").select("usuario_id, ruta").gte("minuto", new Date(Date.now() - VENTANA_EN_SISTEMA_MS).toISOString()).order("minuto", { ascending: false }),
    personasConModulos(supabase, [MODULO_ATENCION, MODULO_COMERCIAL, MODULO_DIRECCION]),
  ]);
  const delCrm = new Set(personas.map((p) => p.id));
  const vistas = new Map<string, string>();
  for (const m of data ?? []) {
    const id = m.usuario_id as string;
    if (delCrm.has(id) && !vistas.has(id)) vistas.set(id, paginaDeRuta(m.ruta as string));
  }
  return [...vistas].map(([id, pagina]) => ({ id, pagina })).sort((a, b) => a.id.localeCompare(b.id));
}
