// Chat de WhatsApp del cliente de tienda con iComfly (13 nov 2026): leer y responder el chat de WhatsApp de un cliente en el número de su tienda, por el conector de iComfly. Solo
// servidor; quien llama ya comprobó el permiso. Lo que iComfly no da (cuándo llegó cada mensaje, quién de nosotros lo mandó, si el bot se pausó desde aquí)
// se anota en `tienda_chat_mensajes` y `tienda_chat_conversaciones` (migración 0285).

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  colaTelefono,
  conLoNuestro,
  mensajesDeIcomfly,
  rellenarPlantilla,
  variablesDePlantilla,
  type ChatPendiente,
  type MensajeChat,
} from "./chat-tienda";
import { herramientaIcomfly } from "./icomfly";

export const SIN_MIGRACION_CHATS =
  "Falta correr la migración 0285 (chat de WhatsApp de tienda) en Supabase.";

export interface ChatLeido {
  conversacionId: number | null;
  mensajes: MensajeChat[];
  botPausado: boolean;
  pausadoPor: string | null;
}

/**
 * Anota los mensajes que el sistema no había visto: si es la primera vez que se abre el chat, sin hora (es historial); si no, con la hora de ahora. Devuelve lo
 * anotado de cada mensaje (cuándo y quién).
 */
async function anotarVistos(
  supabase: SupabaseClient,
  tiendaId: string,
  mensajes: MensajeChat[],
): Promise<Map<number, { vistoEn: string | null; autor: string | null }>> {
  const ids = mensajes.map((m) => m.id);
  const nuestros = new Map<
    number,
    { vistoEn: string | null; autor: string | null }
  >();
  if (!ids.length) return nuestros;
  const { data, error } = await supabase
    .from("tienda_chat_mensajes")
    .select("mensaje_id, visto_en, autor_nombre")
    .eq("tienda_id", tiendaId)
    .in("mensaje_id", ids);
  if (error) return nuestros;
  const ya = new Set<number>();
  for (const f of data ?? []) {
    ya.add(Number(f.mensaje_id));
    if (f.visto_en || f.autor_nombre)
      nuestros.set(Number(f.mensaje_id), {
        vistoEn: (f.visto_en as string | null) ?? null,
        autor: (f.autor_nombre as string | null) ?? null,
      });
  }
  const nuevos = mensajes.filter((m) => !ya.has(m.id));
  if (nuevos.length) {
    const primeraVez = ya.size === 0;
    const ahora = new Date().toISOString();
    await supabase.from("tienda_chat_mensajes").upsert(
      nuevos.map((m) => ({
        tienda_id: tiendaId,
        mensaje_id: m.id,
        conversacion_id: m.conversacionId,
        visto_en: primeraVez ? null : ahora,
      })),
      { onConflict: "tienda_id,mensaje_id", ignoreDuplicates: true },
    );
    if (!primeraVez)
      for (const m of nuevos)
        nuestros.set(m.id, { vistoEn: ahora, autor: null });
  }
  return nuestros;
}

/** El chat de un cliente (por su teléfono) en el número de la tienda. */
export async function leerChat(
  supabase: SupabaseClient,
  tiendaId: string,
  telefono: string,
): Promise<ChatLeido | { error: string }> {
  const r = await herramientaIcomfly(
    supabase,
    tiendaId,
    "ver_conversacion_whatsapp",
    { telefono, limite: 80 },
  );
  if ("error" in r)
    return /no se encontr|sin conversaci|not found|no hay/i.test(r.error)
      ? {
          conversacionId: null,
          mensajes: [],
          botPausado: false,
          pausadoPor: null,
        }
      : r;
  const mensajes = mensajesDeIcomfly(r.datos);
  const conversacionId =
    mensajes.find((m) => m.conversacionId !== null)?.conversacionId ?? null;
  const nuestros = await anotarVistos(supabase, tiendaId, mensajes);
  let botPausado = false;
  let pausadoPor: string | null = null;
  if (conversacionId !== null) {
    const { data } = await supabase
      .from("tienda_chat_conversaciones")
      .select("bot_pausado, pausado_por")
      .eq("tienda_id", tiendaId)
      .eq("conversacion_id", conversacionId)
      .maybeSingle();
    botPausado = data?.bot_pausado === true;
    pausadoPor = (data?.pausado_por as string | null) ?? null;
  }
  return {
    conversacionId,
    mensajes: conLoNuestro(mensajes, nuestros),
    botPausado,
    pausadoPor,
  };
}

/** Pausa o reanuda el bot de iComfly en el chat de ese teléfono, y lo anota (iComfly no dice si está pausado). */
export async function pausarBot(
  supabase: SupabaseClient,
  tiendaId: string,
  telefono: string,
  conversacionId: number | null,
  pausar: boolean,
  quien: string,
): Promise<{ error?: string }> {
  const r = await herramientaIcomfly(
    supabase,
    tiendaId,
    "pausar_bot_conversacion",
    {
      ...(conversacionId ? { conversation_id: conversacionId } : { telefono }),
      pausar,
      motivo: `${pausar ? "Lo atiende" : "Lo devolvió al bot"} ${quien} desde el sistema de Ecomfive`,
    },
  );
  if ("error" in r) return r;
  if (conversacionId !== null)
    await supabase
      .from("tienda_chat_conversaciones")
      .upsert(
        {
          tienda_id: tiendaId,
          conversacion_id: conversacionId,
          telefono,
          bot_pausado: pausar,
          pausado_por: pausar ? quien : null,
          pausado_en: pausar ? new Date().toISOString() : null,
          actualizado_en: new Date().toISOString(),
        },
        { onConflict: "tienda_id,conversacion_id" },
      );
  return {};
}

/** Después de mandar: el mensaje nuevo que salió (el más reciente que el sistema no tenía) queda con su autor y su hora. */
async function anotarAutor(
  supabase: SupabaseClient,
  tiendaId: string,
  telefono: string,
  persona: { id: string; nombre: string },
) {
  const r = await herramientaIcomfly(
    supabase,
    tiendaId,
    "ver_conversacion_whatsapp",
    { telefono, limite: 5 },
  );
  if ("error" in r) return;
  const mensajes = mensajesDeIcomfly(r.datos);
  const { data } = await supabase
    .from("tienda_chat_mensajes")
    .select("mensaje_id")
    .eq("tienda_id", tiendaId)
    .in(
      "mensaje_id",
      mensajes.map((m) => m.id),
    );
  const ya = new Set((data ?? []).map((f) => Number(f.mensaje_id)));
  const nuevo = [...mensajes]
    .reverse()
    .find((m) => m.de !== "cliente" && !ya.has(m.id));
  if (!nuevo) return;
  await supabase
    .from("tienda_chat_mensajes")
    .upsert(
      {
        tienda_id: tiendaId,
        mensaje_id: nuevo.id,
        conversacion_id: nuevo.conversacionId,
        visto_en: new Date().toISOString(),
        autor_id: persona.id,
        autor_nombre: persona.nombre,
      },
      { onConflict: "tienda_id,mensaje_id" },
    );
}

/** Manda un texto al cliente. Si el bot está activo en ese chat, primero lo pausa (contesta una persona). */
export async function enviarTexto(
  supabase: SupabaseClient,
  tiendaId: string,
  telefono: string,
  texto: string,
  persona: { id: string; nombre: string },
): Promise<{ error?: string; botPausado?: boolean }> {
  const leido = await leerChat(supabase, tiendaId, telefono);
  let botPausado = "error" in leido ? false : leido.botPausado;
  if (!botPausado) {
    const p = await pausarBot(
      supabase,
      tiendaId,
      telefono,
      "error" in leido ? null : leido.conversacionId,
      true,
      persona.nombre,
    );
    botPausado = !p.error;
  }
  const r = await herramientaIcomfly(
    supabase,
    tiendaId,
    "enviar_mensaje_whatsapp",
    { telefono, mensaje: texto },
  );
  if ("error" in r) return { error: r.error, botPausado };
  await anotarAutor(supabase, tiendaId, telefono, persona);
  return { botPausado };
}

export interface PlantillaChat {
  nombre: string;
  idioma: string;
  categoria: string;
  cuerpo: string;
  variables: number[];
  /** Qué es cada variable, como lo dice iComfly («{{first_name}}», «pedido»…), en el orden de `variables`. */
  etiquetas: string[];
}

const cachePlantillas = new Map<
  string,
  { vence: number; plantillas: PlantillaChat[] }
>();

/** Las plantillas aprobadas de la tienda, con su texto (guardadas 10 minutos). */
export async function plantillasAprobadas(
  supabase: SupabaseClient,
  tiendaId: string,
): Promise<PlantillaChat[] | { error: string }> {
  const c = cachePlantillas.get(tiendaId);
  if (c && c.vence > Date.now()) return c.plantillas;
  const r = await herramientaIcomfly(
    supabase,
    tiendaId,
    "listar_plantillas_whatsapp",
    { solo_aprobadas: true, limite: 200 },
  );
  if ("error" in r) return r;
  const lista = (
    (r.datos as { plantillas?: Record<string, unknown>[] })?.plantillas ?? []
  ).filter((p) => String(p.status ?? "").toUpperCase() === "APPROVED");
  const plantillas: PlantillaChat[] = [];
  for (let i = 0; i < lista.length; i += 6) {
    const lote = await Promise.all(
      lista.slice(i, i + 6).map(async (p) => {
        const v = await herramientaIcomfly(
          supabase,
          tiendaId,
          "ver_plantilla_whatsapp",
          { nombre: String(p.name), idioma: String(p.language ?? "es") },
        );
        const d = "datos" in v ? (v.datos as Record<string, unknown>) : {};
        const fuente = (d.plantilla ?? d) as Record<string, unknown>;
        const componentes = Array.isArray(fuente.components)
          ? (fuente.components as Record<string, unknown>[])
          : [];
        const cuerpo = String(
          fuente.cuerpo ??
            fuente.body ??
            componentes.find((x) => String(x.type).toUpperCase() === "BODY")
              ?.text ??
            "",
        );
        const variables = variablesDePlantilla(cuerpo);
        const ejemplos = new Map(
          (Array.isArray(fuente.variables)
            ? (fuente.variables as Record<string, unknown>[])
            : []
          ).map((x) => [
            Number(x.n),
            String(x.ejemplo ?? "")
              .replace(/[{}]/g, "")
              .replace(/_/g, " ")
              .trim(),
          ]),
        );
        return {
          nombre: String(p.name),
          idioma: String(p.language ?? "es"),
          categoria: String(p.category ?? ""),
          cuerpo,
          variables,
          etiquetas: variables.map((n) => ejemplos.get(n) || `variable ${n}`),
        };
      }),
    );
    plantillas.push(...lote);
  }
  plantillas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  cachePlantillas.set(tiendaId, {
    vence: Date.now() + 10 * 60_000,
    plantillas,
  });
  return plantillas;
}

/** Manda una plantilla aprobada (sirve fuera de las 24 h). */
export async function enviarPlantilla(
  supabase: SupabaseClient,
  tiendaId: string,
  telefono: string,
  plantilla: {
    nombre: string;
    idioma: string;
    valores: string[];
    cuerpo: string;
  },
  persona: { id: string; nombre: string },
): Promise<{ error?: string; texto?: string }> {
  const r = await herramientaIcomfly(
    supabase,
    tiendaId,
    "enviar_template_whatsapp",
    {
      telefono,
      template_name: plantilla.nombre,
      idioma: plantilla.idioma,
      parametros_body: plantilla.valores,
    },
  );
  if ("error" in r) return { error: r.error };
  await anotarAutor(supabase, tiendaId, telefono, persona);
  return { texto: rellenarPlantilla(plantilla.cuerpo, plantilla.valores) };
}

/** Una nota interna en la conversación (el cliente no la ve y la IA de iComfly no la lee). */
export async function notaInterna(
  supabase: SupabaseClient,
  tiendaId: string,
  conversacionId: number,
  texto: string,
  quien: string,
): Promise<{ error?: string }> {
  const r = await herramientaIcomfly(supabase, tiendaId, "agregar_nota_chat", {
    conversation_id: conversacionId,
    note: `${texto} — ${quien}`,
  });
  return "error" in r ? r : {};
}

/**
 * Los chats de WhatsApp de la tienda con mensajes pendientes, para el numerito de la lista de pedidos: los sin leer de cada chat (o 1 si el cliente espera
 * respuesta y ya se leyó). iComfly da el número oculto: va solo con sus 4 últimos dígitos y el nombre del contacto.
 */
export async function chatsPendientes(
  supabase: SupabaseClient,
  tiendaId: string,
): Promise<ChatPendiente[] | { error: string }> {
  const [recientes, sinResponder] = await Promise.all([
    herramientaIcomfly(supabase, tiendaId, "listar_conversaciones_recientes", {
      limite: 100,
    }),
    herramientaIcomfly(supabase, tiendaId, "mensajes_sin_responder", {
      limite: 100,
    }),
  ]);
  if ("error" in recientes) return recientes;
  const espera = new Set<number>();
  if ("datos" in sinResponder)
    for (const p of (
      sinResponder.datos as { pendientes?: Record<string, unknown>[] }
    )?.pendientes ?? [])
      espera.add(Number(p.conversation_id));
  const res: ChatPendiente[] = [];
  for (const c of (
    recientes.datos as { conversaciones?: Record<string, unknown>[] }
  )?.conversaciones ?? []) {
    if (c.platform && String(c.platform).toLowerCase() !== "whatsapp") continue;
    const cola = colaTelefono(String(c.phone_number ?? ""));
    const cuenta = Math.max(
      Number(c.unread_count ?? 0) || 0,
      c.pendiente_respuesta === true || espera.has(Number(c.id)) ? 1 : 0,
    );
    if (cola && cuenta > 0)
      res.push({ cola, nombre: String(c.display_name ?? ""), cuenta });
  }
  return res;
}

/** Marca el chat como leído en iComfly (se abrió en el sistema), para que el numerito de la lista se borre. */
export async function marcarLeido(
  supabase: SupabaseClient,
  tiendaId: string,
  conversacionId: number,
): Promise<void> {
  await herramientaIcomfly(supabase, tiendaId, "marcar_chat_leido", {
    conversation_id: conversacionId,
    leido: true,
  });
}
