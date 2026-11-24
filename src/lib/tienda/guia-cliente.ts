// La guía al cliente que no tiene correo: por WhatsApp (iComfly, el número de la tienda) y, fuera de las 24 h, con la plantilla aprobada de la guía
// (24 nov 2026, pedido de Hernán). La usan la «Cargar guía» de la asesora y la carga sola de las guías de SISCORE (24 nov 2026). Solo servidor.

import { registrarAuditoria } from "@/lib/auditoria";
import type { createServiceClient } from "@/lib/supabase/server";
import { esErrorDeVentana, telefonoParaIcomfly } from "./chat-tienda";
import { enviarAviso, enviarPlantilla, plantillasAprobadas } from "./chat-tienda-datos";
import { esperaDeIcomfly, mensajeGuiaWhatsapp, plantillaGuia } from "./gestion-atc";
import { conexionesIcomfly } from "./icomfly";

type Supabase = ReturnType<typeof createServiceClient>;

export interface PedidoDeGuia {
  ordenId: string;
  numero: string;
  tienda: string;
  tiendaId: string;
  codigoPais: string;
  /** Quien queda como autor del mensaje en el chat. */
  persona: { id: string; nombre: string };
}

/** Reintenta (hasta 3 veces) cuando iComfly pide esperar unos segundos entre mensajes. */
async function conEspera<T extends { error?: string | null }>(enviar: () => Promise<T>): Promise<T> {
  let r = await enviar();
  for (let i = 0; i < 3; i++) {
    const ms = esperaDeIcomfly(r.error);
    if (ms === null) break;
    await new Promise((ok) => setTimeout(ok, ms));
    r = await enviar();
  }
  return r;
}

/** Manda la plantilla aprobada de la guía (sirve fuera de las 24 h). Comprueba que la plantilla exista y pida las variables que se le dan. */
async function guiaConPlantilla(supabase: Supabase, p: PedidoDeGuia, g: { numero: string; url: string }, cliente: string | null, telefono: string): Promise<{ nombre: string } | { error: string }> {
  const [{ data: o }, { data: lineas }] = await Promise.all([
    supabase.from("ven_ordenes").select("total, estado_pago").eq("id", p.ordenId).maybeSingle(),
    supabase.from("ven_orden_lineas").select("producto, cantidad, es_servicio").eq("orden_id", p.ordenId).order("linea"),
  ]);
  const elegida = plantillaGuia({
    pagado: /^paid$/i.test(String(o?.estado_pago ?? "")),
    cliente,
    guia: g.numero,
    url: g.url,
    productos: (lineas ?? []).filter((l) => !l.es_servicio).map((l) => ({ producto: (l.producto as string | null) ?? null, cantidad: (l.cantidad as number | null) ?? null })),
    total: o?.total == null ? null : Number(o.total),
  });
  const aprobadas = await plantillasAprobadas(supabase, p.tiendaId);
  if (!Array.isArray(aprobadas)) return { error: aprobadas.error };
  const plantilla = aprobadas.find((x) => x.nombre === elegida.nombre);
  if (!plantilla) return { error: `la tienda no tiene aprobada «${elegida.nombre}»` };
  if (plantilla.variables.length !== elegida.valores.length) return { error: `«${plantilla.nombre}» cambió: pide ${plantilla.variables.length} datos` };
  const r = await conEspera(() => enviarPlantilla(supabase, p.tiendaId, telefono, { nombre: plantilla.nombre, idioma: plantilla.idioma, valores: elegida.valores, cuerpo: plantilla.cuerpo }, p.persona));
  return r.error ? { error: r.error } : { nombre: plantilla.nombre };
}

/**
 * La guía por WhatsApp al cliente sin correo, por iComfly. Devuelve la línea de la cronología y, si no salió, el aviso para la asesora (`enviado: false`).
 * Nunca lanza: la guía ya quedó en Shopify.
 */
export async function guiaPorWhatsapp(supabase: Supabase, p: PedidoDeGuia, g: { numero: string; url: string }): Promise<{ linea: string; aviso?: string; enviado: boolean }> {
  const sinEnviar = (porque: string, aviso: string) => ({
    linea: `sin correo del cliente; ${porque}: mandar la guía por WhatsApp a mano`,
    aviso: `La guía quedó en Shopify, pero el cliente no tiene correo y ${aviso}`,
    enviado: false,
  });
  try {
    const [con, { data: cliente }] = await Promise.all([
      conexionesIcomfly(supabase, [p.tiendaId]),
      supabase.from("ven_ordenes_clientes").select("nombre, telefono").eq("orden_id", p.ordenId).maybeSingle(),
    ]);
    if (!con?.get(p.tiendaId)?.conectado) return sinEnviar(`${p.tienda} no está conectada a iComfly`, `${p.tienda} no está conectada a iComfly: mándale la guía por WhatsApp a mano.`);
    const telefono = telefonoParaIcomfly((cliente?.telefono as string | null) ?? null, p.codigoPais);
    if (!telefono) return sinEnviar("el pedido no tiene un teléfono válido", "el pedido no tiene un teléfono válido para WhatsApp.");
    const nombre = (cliente?.nombre as string | null) ?? null;
    const texto = mensajeGuiaWhatsapp({ cliente: nombre, pedido: p.numero, tienda: p.tienda, guia: g.numero, url: g.url });
    const r = await conEspera(() => enviarAviso(supabase, p.tiendaId, telefono, texto, p.persona));
    let como = "";
    if (r.error) {
      if (!esErrorDeVentana(r.error)) return sinEnviar("iComfly no lo mandó", `iComfly no mandó el WhatsApp (${r.error}). Mándale la guía a mano.`);
      // Fuera de las 24 h: la plantilla aprobada de la guía (contra entrega o ya pagado).
      const pl = await guiaConPlantilla(supabase, p, g, nombre, telefono);
      if ("error" in pl)
        return sinEnviar(
          `pasaron más de 24 h desde su último mensaje y la plantilla no salió (${pl.error})`,
          `pasaron más de 24 h desde su último mensaje y la plantilla de la guía no salió (${pl.error}). Mándasela desde el chat con 📋 Plantillas.`,
        );
      como = ` con la plantilla «${pl.nombre}»`;
    }
    await registrarAuditoria({ accion: "chat_tienda_mensaje", entidad: "tiendas", entidadId: p.tiendaId, detalle: `${p.tienda}: guía del pedido ${p.numero} por WhatsApp (iComfly)${como}, el cliente no tiene correo` });
    return { linea: `el cliente no tiene correo: se le mandó la guía por WhatsApp (iComfly)${como}`, enviado: true };
  } catch (e) {
    return sinEnviar("no se pudo mandar el WhatsApp", `no se pudo mandar el WhatsApp (${e instanceof Error ? e.message : "error"}). Mándale la guía a mano.`);
  }
}
