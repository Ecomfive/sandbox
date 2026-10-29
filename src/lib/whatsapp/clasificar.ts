// El motivo de cada chat que espera respuesta, leído por la IA (migración 0189). Se llama al guardar los mensajes que llegan por el webhook y desde «Clasificar» en la bandeja.
// Lo puro (grupos, plazos, qué se pide y cuándo) vive en ./prioridad.ts. Sin la migración o sin clave de IA no hace nada.

import type { ContextoConsumo } from "@/lib/ia/consumo";
import { pedirIA, proveedorTexto } from "@/lib/publicaciones/ia/proveedor";
import type { createServiceClient } from "@/lib/supabase/server";
import { textoParaIA, type MensajeActividad } from "./actividad";
import { mensajesOcultos } from "./ocultos";
import { EJEMPLOS_DE_CORRECCION, esGrupo, hayQueClasificar, MENSAJES_PARA_MOTIVO, normalizarMotivo, pedidoMotivo, type CorreccionEjemplo, type EstadoMotivo } from "./prioridad";

type Supabase = ReturnType<typeof createServiceClient>;

/** Lo que se le da a la IA para contestar; si tarda más, se deja para el próximo mensaje. */
const ESPERA_IA_MS = 25_000;
const COLUMNAS = "id, esperando_desde, ultimo_entrante_en, motivo_grupo, motivo_por, motivo_en, motivo_pedido_en";

type FilaEstado = { id: string } & Record<string, unknown>;
const estadoDe = (f: FilaEstado): EstadoMotivo => ({
  esperandoDesde: (f.esperando_desde as string | null) ?? null,
  ultimoEntranteEn: (f.ultimo_entrante_en as string | null) ?? null,
  motivoGrupo: (f.motivo_grupo as string | null) ?? null,
  motivoPor: (f.motivo_por as "ia" | "persona" | null) ?? null,
  motivoEn: (f.motivo_en as string | null) ?? null,
  motivoPedidoEn: (f.motivo_pedido_en as string | null) ?? null,
});

/** Las últimas correcciones del equipo, de ejemplo para la IA. */
async function correcciones(supabase: Supabase): Promise<CorreccionEjemplo[]> {
  const { data, error } = await supabase.from("whatsapp_motivo_correcciones").select("texto_cliente, grupo_nuevo").order("creado_en", { ascending: false }).limit(EJEMPLOS_DE_CORRECCION);
  if (error) return [];
  return (data ?? []).filter((c) => c.texto_cliente && esGrupo(c.grupo_nuevo)).map((c) => ({ texto: c.texto_cliente as string, grupo: c.grupo_nuevo as CorreccionEjemplo["grupo"] }));
}

/** Los últimos mensajes del chat (sin notas internas ni lo que se autorizó ocultar), del más viejo al más nuevo. */
async function ultimosMensajes(supabase: Supabase, id: string): Promise<MensajeActividad[]> {
  const [ocultos, { data }] = await Promise.all([
    mensajesOcultos(supabase, id),
    supabase
      .from("whatsapp_mensajes")
      .select("id, direccion, tipo, texto, momento")
      .eq("conversacion_id", id)
      .neq("direccion", "nota")
      .neq("tipo", "reaccion")
      .order("momento", { ascending: false })
      .limit(MENSAJES_PARA_MOTIVO + 5),
  ]);
  return ((data ?? []) as MensajeActividad[])
    .filter((m) => !ocultos.has(m.id))
    .slice(0, MENSAJES_PARA_MOTIVO)
    .reverse();
}

/** El último mensaje del cliente, limpio, para guardar junto a una corrección del equipo. */
export async function ultimoTextoDelCliente(supabase: Supabase, id: string): Promise<string | null> {
  const ms = await ultimosMensajes(supabase, id);
  const m = [...ms].reverse().find((x) => x.direccion === "entrante");
  return m ? textoParaIA(m).slice(0, 200) : null;
}

const conTiempo = <T>(p: Promise<T>, ms: number): Promise<T | null> => Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

/** Pide y guarda el motivo de un chat ya reservado. Devuelve true si quedó guardado. */
async function clasificarUno(supabase: Supabase, id: string, ejemplos: CorreccionEjemplo[], consumo: ContextoConsumo): Promise<boolean> {
  const leidoEn = new Date().toISOString();
  const mensajes = await ultimosMensajes(supabase, id);
  const liberar = () => supabase.from("whatsapp_conversaciones").update({ motivo_pedido_en: null }).eq("id", id);
  if (!mensajes.some((m) => m.direccion === "entrante")) {
    await liberar();
    return false;
  }
  const pedido = pedidoMotivo(mensajes, ejemplos);
  const r = await conTiempo(pedirIA({ instrucciones: pedido.instrucciones, texto: pedido.texto, imagenes: [] }, false, { ...consumo, referencia: id }), ESPERA_IA_MS);
  const motivo = r && !("error" in r) ? normalizarMotivo(r.texto) : null;
  if (!motivo) {
    if (r && "error" in r) console.error("WhatsApp: la IA no pudo leer el motivo de un chat", id, r.error);
    await liberar();
    return false;
  }
  // No pisa lo que una persona puso mientras la IA leía.
  const { data } = await supabase
    .from("whatsapp_conversaciones")
    .update({ motivo_grupo: motivo.grupo, motivo: motivo.motivo, motivo_resumen: motivo.resumen || null, motivo_por: "ia", motivo_por_nombre: null, motivo_en: leidoEn, motivo_pedido_en: null })
    .eq("id", id)
    .or(`motivo_por.is.null,motivo_por.eq.ia,motivo_en.lt."${leidoEn}"`)
    .select("id");
  const fila = data?.[0];
  if (!fila) await liberar();
  return !!fila;
}

/**
 * Lee el motivo de los chats que lo necesitan (`hayQueClasificar`): los reserva para no pedir dos veces a la vez y los pide en paralelo. Si mientras la IA leía llegó otro mensaje,
 * se vuelve a leer una vez. Devuelve cuántos quedaron con motivo.
 */
export async function clasificarChats(supabase: Supabase, ids: string[], consumo: Omit<ContextoConsumo, "referencia">): Promise<number> {
  if (!ids.length || proveedorTexto() === null) return 0;
  const { data, error } = await supabase.from("whatsapp_conversaciones").select(COLUMNAS).in("id", ids);
  if (error) return 0;
  const ahora = Date.now();
  const pendientes = ((data ?? []) as FilaEstado[]).filter((f) => hayQueClasificar(estadoDe(f), ahora)).map((f) => f.id);
  if (!pendientes.length) return 0;
  const reservado = new Date(ahora).toISOString();
  const haceUnRato = new Date(ahora - 60_000).toISOString();
  const { data: reservados } = await supabase
    .from("whatsapp_conversaciones")
    .update({ motivo_pedido_en: reservado })
    .in("id", pendientes)
    .or(`motivo_pedido_en.is.null,motivo_pedido_en.lt."${haceUnRato}"`)
    .select("id");
  const mios = (reservados ?? []).map((f) => f.id as string);
  if (!mios.length) return 0;
  const ejemplos = await correcciones(supabase);
  const ctx = { ...consumo, operacion: "motivo_chat_whatsapp", modulo: "crm-dropshippers" };
  let hechos = 0;
  await Promise.all(
    mios.map(async (id) => {
      const inicio = new Date().toISOString();
      if (!(await clasificarUno(supabase, id, ejemplos, ctx))) return;
      hechos++;
      // Llegó otro mensaje mientras la IA leía: una lectura más con todo.
      const { data: d } = await supabase.from("whatsapp_conversaciones").select("ultimo_entrante_en, esperando_desde").eq("id", id).maybeSingle();
      const ultimo = (d?.ultimo_entrante_en as string | null) ?? null;
      if (d?.esperando_desde && ultimo && ultimo > inicio) {
        const { data: otra } = await supabase.from("whatsapp_conversaciones").update({ motivo_pedido_en: new Date().toISOString() }).eq("id", id).is("motivo_pedido_en", null).eq("motivo_por", "ia").select("id");
        if (otra?.length) await clasificarUno(supabase, id, ejemplos, ctx);
      }
    }),
  );
  return hechos;
}

/** Los chats de esos teléfonos que esperan respuesta, para leer su motivo al llegar un mensaje. */
export async function clasificarPorTelefonos(supabase: Supabase, telefonos: string[]): Promise<number> {
  if (!telefonos.length || proveedorTexto() === null) return 0;
  const { data, error } = await supabase.from("whatsapp_conversaciones").select("id").in("telefono", telefonos).not("esperando_desde", "is", null).is("oculta_en", null).limit(20);
  if (error || !data?.length) return 0;
  return clasificarChats(
    supabase,
    data.map((c) => c.id as string),
    { operacion: "motivo_chat_whatsapp", modulo: "crm-dropshippers", usuario: null },
  );
}
