// Confirmación con IA › poner la etiqueta de zona en Shopify (21 nov 2026, pedido de Jhokser: prueba controlada del lunes, una tienda a la vez). Solo servidor, con el cliente de servicio.
// La IA solo escribe cuando se cumple todo esto: el pedido quedó «Listo» con zona, la tienda tiene encendidos «Escribir en Shopify» (`escribe_shopify`) y «La IA pone la etiqueta de zona»
// (`ia_pone_etiqueta`, migración 0348) y el pedido no trae ya una etiqueta de zona. Primero escribe en Shopify y solo si Shopify aceptó guarda lo que quedó allá y deja la línea en el
// historial del pedido. Nunca lanza: el análisis ya se guardó y un fallo queda anotado (`etiqueta_error`).

import type { SupabaseClient } from "@supabase/supabase-js";
import { cambiarEtiquetasEnShopify } from "@/lib/tienda/escribir-shopify";
import { planCambio, textoCambio } from "@/lib/tienda/etiquetas-shopify";
import { etiquetasDe } from "@/lib/tienda/ordenes-finanzas";
import { appDeTienda } from "@/lib/tienda/shopify-app";

/** El nombre con que queda en el historial del pedido. */
export const AUTOR_IA = "Confirmación con IA";

/**
 * Si al poner la etiqueta de zona se quita la de «Confirmada». En la primera prueba **no**: solo se agrega la zona (lo que lee `estadoDesdeFinanzas` y lo que hace el equipo con «Confirmada»
 * no cambia). Si se decide quitarla, es un cambio aquí.
 */
export const QUITAR_CONFIRMADA = false;

export type ResultadoPonerEtiqueta =
  | { estado: "puesta"; etiqueta: string }
  | { estado: "omitida"; motivo: string }
  | { estado: "error"; motivo: string };

/** ¿Hay que escribir? Solo con la tienda encendida; en cualquier otro caso se omite sin ruido. Pura, con prueba. */
export function motivoParaNoEscribir(t: { estado: unknown; escribe_shopify: unknown; ia_pone_etiqueta: unknown } | null | undefined, zonaYaPuesta: boolean): string | null {
  if (!t) return "No se encontró la tienda.";
  if (t.estado !== "conectada") return "La tienda no está conectada a Shopify.";
  if (t.escribe_shopify !== true) return "La tienda no tiene encendido «Escribir en Shopify».";
  if (t.ia_pone_etiqueta !== true) return "La tienda no tiene encendido «La IA pone la etiqueta de zona».";
  if (zonaYaPuesta) return "El pedido ya tiene etiqueta de zona.";
  return null;
}

export async function ponerEtiquetaDeZona(
  supabase: SupabaseClient,
  d: { ordenId: string; numero: string | null; tiendaId: string | null; etiqueta: string; zonaYaPuesta: (etiquetas: string | null) => boolean },
): Promise<ResultadoPonerEtiqueta> {
  try {
    if (!d.tiendaId) return { estado: "omitida", motivo: "No se encontró la tienda." };
    const { data: t, error } = await supabase.from("tiendas").select("id, nombre, estado, escribe_shopify, ia_pone_etiqueta").eq("id", d.tiendaId).maybeSingle();
    // Sin la migración 0348 no existe el interruptor: nada se escribe.
    if (error) return { estado: "omitida", motivo: "Falta la migración 0348 (La IA pone la etiqueta)." };
    const { data: o } = await supabase.from("ven_ordenes").select("etiquetas").eq("id", d.ordenId).maybeSingle();
    const actuales = etiquetasDe((o?.etiquetas as string | null) ?? null);
    const motivo = motivoParaNoEscribir(t, d.zonaYaPuesta((o?.etiquetas as string | null) ?? null));
    if (motivo) return { estado: "omitida", motivo };
    if (!d.numero) return { estado: "omitida", motivo: "El pedido no tiene número." };
    const app = appDeTienda(String(t!.nombre));
    if (!app) return { estado: "error", motivo: `Faltan las claves de ${t!.nombre} en Vercel.` };

    const plan = planCambio(actuales, [d.etiqueta], QUITAR_CONFIRMADA ? actuales.filter((e) => /^confirmad[ao]$/i.test(e)) : []);
    if (!plan.agregar.length && !plan.quitar.length) return { estado: "puesta", etiqueta: d.etiqueta };
    const r = await cambiarEtiquetasEnShopify(app, d.numero, plan.agregar, plan.quitar);

    // Lo que quedó en Shopify es lo que vale (también lo que otra persona o una app pusieron mientras tanto).
    const final = r.etiquetas.map((e) => e.trim()).filter(Boolean);
    await supabase.from("ven_ordenes").update({ etiquetas: final.join(", ") }).eq("id", d.ordenId);
    const agregadas = final.filter((e) => !actuales.some((h) => h.toLowerCase() === e.toLowerCase()));
    const quitadas = actuales.filter((h) => !final.some((e) => e.toLowerCase() === h.toLowerCase()));
    const evento = { orden_id: d.ordenId, tipo: "etiqueta", detalle: textoCambio(agregadas, quitadas), usuario: AUTOR_IA };
    const { error: eE } = await supabase.from("ven_orden_eventos").insert({ ...evento, agregadas, quitadas });
    if (eE) {
      const { error: e2 } = await supabase.from("ven_orden_eventos").insert(evento);
      if (e2) await supabase.from("ven_orden_eventos").insert({ ...evento, tipo: "nota" });
    }
    if (r.error) return { estado: "error", motivo: `Una parte no entró: ${r.error}`.slice(0, 300) };
    if (!final.some((e) => e.toLowerCase() === d.etiqueta.toLowerCase())) return { estado: "error", motivo: "Shopify no dejó la etiqueta en el pedido." };
    return { estado: "puesta", etiqueta: d.etiqueta };
  } catch (e) {
    return { estado: "error", motivo: (e instanceof Error ? e.message : "Shopify no aceptó el cambio.").slice(0, 300) };
  }
}
