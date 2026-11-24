// Las guías de SISCORE entran solas en Shopify (24 nov 2026, pedido de Hernán: «la guía trae el número de pedido, no hay forma de que el sistema se
// pierda; si hay alguna novedad la pone en el filtro y así se encarga un asesor»). Corre al terminar cada lectura de SISCORE de la tienda:
//  - toma las guías emitidas desde el 24 nov 2026 (últimos 10 días), en ruta o con novedad, con su pedido, que todavía no se cargaron;
//  - carga cada una en el envío del pedido en Shopify con su enlace de rastreo y el correo de seguimiento; sin correo, la guía va por WhatsApp (iComfly);
//  - si el pedido ya tenía una guía en Shopify, no la pisa ni le vuelve a escribir al cliente;
//  - lo que no entra (no preparado, anulado, Shopify no la aceptó) o cuyo aviso no salió va a Pedidos de tienda › «Guía sin cargar», con el motivo.
// Solo en las tiendas con «Escribir en Shopify». Si falta el permiso de envíos, no marca nada y lo avisa. Solo servidor.

import { registrarAuditoriaLote, type EntradaAuditoria } from "@/lib/auditoria";
import type { createServiceClient } from "@/lib/supabase/server";
import { cargarGuiaSiFalta } from "./escribir-shopify";
import { MOTIVOS_GUIA_SIN_CARGAR, desdeGuiasSolas, guiaSolaSinShopify, leerGuia, lineaPaso } from "./gestion-atc";
import { guiaPorWhatsapp } from "./guia-cliente";
import { etiquetasDe } from "./ordenes-finanzas";
import { appDeTienda } from "./shopify-app";

type Supabase = ReturnType<typeof createServiceClient>;

export interface ResultadoGuiasSolas {
  cargadas: number;
  yaTenian: number;
  pendientes: number;
  /** Las que no alcanzó a ver (se acabó el tiempo): entran en la próxima lectura. */
  quedan: number;
  /** Algo que frenó todo (sin permiso, sin migración, tienda sin escritura); null si corrió. */
  aviso: string | null;
}

const AUTOR = "Sistema (guía de SISCORE)";
const vacio = (aviso: string | null): ResultadoGuiasSolas => ({ cargadas: 0, yaTenian: 0, pendientes: 0, quedan: 0, aviso });

export async function cargarGuiasSolas(supabase: Supabase, tiendaId: string, persona: { id: string; nombre: string }, hasta: number): Promise<ResultadoGuiasSolas> {
  const { data: tienda } = await supabase.from("tiendas").select("id, nombre, estado, escribe_shopify, pais_id").eq("id", tiendaId).maybeSingle();
  // Sin escritura en Shopify (ClickSi, tiendas de solo lectura) no se intenta nada ni se marca nada.
  if (!tienda || tienda.estado !== "conectada" || !tienda.escribe_shopify) return vacio(null);
  const nombre = tienda.nombre as string;
  const app = appDeTienda(nombre);
  if (!app) return vacio(`${nombre}: faltan las claves de Shopify en Vercel; las guías no se cargaron solas.`);
  const { data: pais } = await supabase.from("paises").select("codigo").eq("id", tienda.pais_id as string).maybeSingle();
  const codigoPais = String(pais?.codigo ?? "PA");

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const { data: guias, error } = await supabase
    .from("tienda_guias")
    .select("guia, orden_id, fecha_emision, shopify_estado")
    .eq("tienda_id", tiendaId)
    .gte("fecha_emision", desdeGuiasSolas(hoy))
    .in("estado_grupo", ["en_ruta", "novedad"])
    .not("orden_id", "is", null)
    .or("shopify_estado.is.null,shopify_estado.eq.pendiente")
    .limit(500);
  if (error) return vacio(/shopify_estado/.test(error.message) ? "Falta correr en Supabase la migración 0361 (guías solas en Shopify)." : `No se pudieron leer las guías: ${error.message}`);
  if (!guias?.length) return vacio(null);
  // Primero las que nunca se intentaron, de la más nueva a la más vieja.
  const lista = [...guias].sort((a, b) => Number(!!a.shopify_estado) - Number(!!b.shopify_estado) || String(b.fecha_emision ?? "").localeCompare(String(a.fecha_emision ?? "")));

  const ids = [...new Set(lista.map((g) => g.orden_id as string))];
  const ordenes = new Map<string, { numero: string; etiquetas: string[]; estadoEntrega: string | null; guia: string | null }>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("ven_ordenes").select("id, numero, etiquetas, estado_entrega, guia").in("id", ids.slice(i, i + 200));
    for (const o of data ?? [])
      ordenes.set(o.id as string, { numero: String(o.numero ?? ""), etiquetas: etiquetasDe(o.etiquetas as string | null), estadoEntrega: (o.estado_entrega as string | null) ?? null, guia: (o.guia as string | null) ?? null });
  }

  const r = vacio(null);
  const auditoria: EntradaAuditoria[] = [];
  const marcar = (guia: string, cambios: Record<string, unknown>) => supabase.from("tienda_guias").update({ ...cambios, shopify_en: new Date().toISOString() }).eq("guia", guia);
  const pendiente = async (guia: string, motivo: string) => {
    await marcar(guia, { shopify_estado: "pendiente", shopify_motivo: motivo.slice(0, 300) });
    r.pendientes++;
  };

  for (let i = 0; i < lista.length; i++) {
    if (Date.now() > hasta) {
      r.quedan = lista.length - i;
      break;
    }
    const fila = lista[i];
    const guia = String(fila.guia);
    const orden = ordenes.get(fila.orden_id as string);
    if (!orden?.numero) continue;
    const antes = guiaSolaSinShopify(orden, guia);
    if (antes?.estado === "ya_tenia") {
      await marcar(guia, { shopify_estado: "ya_tenia", shopify_motivo: null });
      r.yaTenian++;
      continue;
    }
    if (antes) {
      await pendiente(guia, antes.motivo ?? "");
      continue;
    }
    const g = leerGuia({ numero: guia });
    if ("error" in g) {
      await pendiente(guia, g.error);
      continue;
    }
    let carga;
    try {
      carga = await cargarGuiaSiFalta(app, orden.numero, g);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Shopify no aceptó la guía.";
      // Sin el permiso de envíos no se marca nada: entran todas cuando se apruebe.
      if (/permiso|write_/i.test(msg)) {
        r.aviso = `${nombre}: ${msg}`;
        r.quedan = lista.length - i;
        break;
      }
      await pendiente(guia, msg);
      continue;
    }
    if (carga.resultado === "no_preparado") {
      await pendiente(guia, MOTIVOS_GUIA_SIN_CARGAR.noPreparado);
      continue;
    }
    if (carga.resultado === "anulado") {
      await pendiente(guia, MOTIVOS_GUIA_SIN_CARGAR.anuladoShopify);
      continue;
    }
    if (carga.resultado === "ya_tenia") {
      await marcar(guia, { shopify_estado: "ya_tenia", shopify_motivo: carga.guia === guia ? null : `Shopify ya tenía la guía ${carga.guia}` });
      r.yaTenian++;
      continue;
    }
    // Entró: el aviso al cliente (correo de Shopify o WhatsApp), la guía en el pedido y su línea en la cronología.
    const wa = carga.correo ? null : await guiaPorWhatsapp(supabase, { ordenId: fila.orden_id as string, numero: orden.numero, tienda: nombre, tiendaId, codigoPais, persona }, g);
    const linea = lineaPaso("guia", { guia: g.numero, aviso: wa?.linea ?? null, nota: "sola, de la lectura de SISCORE" });
    await marcar(guia, {
      shopify_estado: "cargada",
      // Si el WhatsApp no salió, la guía sigue en «Guía sin cargar» para que la asesora se la mande a mano.
      shopify_motivo: wa && !wa.enviado ? (wa.aviso ?? "mandarle la guía al cliente a mano").slice(0, 300) : null,
      aviso_cliente: carga.correo ? "correo" : wa?.enviado ? "whatsapp" : "a_mano",
    });
    await supabase.from("ven_ordenes").update({ guia: g.numero, transportista: g.empresa }).eq("id", fila.orden_id as string);
    await supabase.from("ven_orden_notas").insert({ orden_id: fila.orden_id as string, texto: linea, autor: AUTOR });
    auditoria.push({ accion: "atc_guia", entidad: "ven_ordenes", entidadId: fila.orden_id as string, detalle: `${nombre} ${orden.numero}: ${linea}`.slice(0, 500) });
    r.cargadas++;
  }
  await registrarAuditoriaLote(auditoria).catch(() => null);
  return r;
}

/** El motivo de «Guía sin cargar» de cada pedido de esas tiendas: las que no entraron y las que entraron pero el aviso al cliente no salió. */
export async function guiasSinCargar(supabase: Supabase, tiendaIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!tiendaIds.length) return mapa;
  const { data, error } = await supabase
    .from("tienda_guias")
    .select("orden_id, guia, shopify_estado, shopify_motivo")
    .in("tienda_id", tiendaIds)
    .or("shopify_estado.eq.pendiente,aviso_cliente.eq.a_mano")
    .not("orden_id", "is", null)
    .limit(2000);
  if (error) return mapa;
  for (const g of data ?? []) {
    const motivo = g.shopify_estado === "pendiente" ? `Guía ${g.guia}: ${g.shopify_motivo ?? "no entró en Shopify"}` : `Guía ${g.guia} en Shopify; ${g.shopify_motivo ?? "mandarle la guía al cliente a mano"}`;
    mapa.set(g.orden_id as string, motivo);
  }
  return mapa;
}
