"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import {
  anularEnShopify,
  cambiarEtiquetasEnShopify,
  cargarGuiaEnShopify,
  liberarEsperaEnShopify,
  marcarEntregadoEnShopify,
  marcarPagadoEnShopify,
} from "@/lib/tienda/escribir-shopify";
import { esErrorDeVentana, telefonoParaIcomfly } from "@/lib/tienda/chat-tienda";
import { enviarAviso } from "@/lib/tienda/chat-tienda-datos";
import { textoCambio } from "@/lib/tienda/etiquetas-shopify";
import { ETIQUETA_ACREDITADO, leerGuia, lineaCronologia, lineaPaso, mensajeGuiaWhatsapp, planAtc, type AccionAtc, type PasoAtc } from "@/lib/tienda/gestion-atc";
import { conexionesIcomfly } from "@/lib/tienda/icomfly";
import { etiquetasDe, mismaTiendaUnidad } from "@/lib/tienda/ordenes-finanzas";
import { appDeTienda, type AppTienda } from "@/lib/tienda/shopify-app";

// Gestión de tienda › ficha del pedido: el recorrido del manual ATC (24 nov 2026, pedido de Hernán: «el trabajo de los asesores se va a llevar desde el
// sistema para modificar en Shopify»).
//  - `gestionarPedidoAtc`: Confirmar (pone la zona y levanta la espera), Novedad (quita la zona) y Anular (anula en Shopify, deja la zona, UN motivo).
//  - `pasoPedidoAtc`: cargar la guía (con el correo de seguimiento al cliente), marcar entregado, y acreditado + pagado (solo Finanzas).
// Primero Shopify; solo si lo aceptó cambia en el sistema, queda en el historial (de ahí el panel de Asesores) y deja su línea en la cronología del pedido
// (Notas del equipo), que reemplaza al Sheet. Las reglas están en src/lib/tienda/gestion-atc.ts.

const MODULOS_ASESORA = ["tienda-pedidos", "tienda-confirmacion"];
/** Finanzas: quien edita Ventas por tienda o la Reportería de pedidos. */
const MODULOS_FINANZAS = ["ventas-tiendas", "tienda-reporteria"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCIONES: AccionAtc[] = ["confirmar", "novedad", "anular"];
const PASOS: PasoAtc[] = ["guia", "entregado", "acreditar"];
const RUTAS = ["/tienda-pedidos", "/tienda-pedidos/confirmacion", "/tienda-pedidos/logistica", "/tienda-dashboard", "/tienda-pedidos/asesores"];

export type ResultadoGestion = { ok: true; etiquetas: string[]; texto: string; aviso?: string } | { error: string };

const edita = (u: UsuarioActual, modulos: string[]) => modulos.some((m) => u.modulos.includes(m) && !u.modulosSoloLectura.includes(m));
const limpiarNota = (n: unknown) => (typeof n === "string" ? n.replace(/\s+/g, " ").trim().slice(0, 500) : "");

interface Contexto {
  usuario: UsuarioActual;
  orden: { id: string; numero: string; etiquetas: string[]; estadoEntrega: string | null };
  tienda: string;
  tiendaId: string;
  codigoPais: string;
  app: AppTienda;
}

/** El pedido, su tienda y la app de Shopify, con los controles de siempre (sus tiendas, tienda conectada y con «Escribir en Shopify»). */
async function cargarContexto(ordenId: string, modulos: string[]): Promise<Contexto | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !edita(usuario, modulos)) return { error: "No tienes permiso para este paso del pedido." };
  if (!UUID.test(String(ordenId ?? ""))) return { error: "Pedido no válido." };
  const supabase = createServiceClient();
  const { data: o } = await supabase.from("ven_ordenes").select("id, numero, etiquetas, estado_entrega, unidad_id, fin_unidades(nombre, pais_id, clase)").eq("id", ordenId).maybeSingle();
  const unidad = (o ? (Array.isArray(o.fin_unidades) ? o.fin_unidades[0] : o.fin_unidades) : null) as { nombre: string; pais_id: string; clase: string } | null;
  if (!o || !unidad || unidad.clase !== "tienda") return { error: "No se encontró el pedido." };
  if (!puedeVerUnidad(await cargarTiendasPermitidas(), (o.unidad_id as string | null) ?? null)) return { error: "No se encontró el pedido." };
  const [{ data: tiendas, error: eT }, { data: pais }] = await Promise.all([
    supabase.from("tiendas").select("id, nombre, estado, escribe_shopify").eq("pais_id", unidad.pais_id),
    supabase.from("paises").select("codigo").eq("id", unidad.pais_id).maybeSingle(),
  ]);
  if (eT) return { error: "No se pudo leer la tienda." };
  const tienda = (tiendas ?? []).find((t) => mismaTiendaUnidad(t.nombre as string, unidad.nombre));
  if (!tienda || tienda.estado !== "conectada") return { error: "La tienda de este pedido no está conectada a Shopify." };
  if (!tienda.escribe_shopify) return { error: `${tienda.nombre} todavía no tiene encendido «Escribir en Shopify» (lo enciende un administrador en Tiendas Shopify).` };
  const app = appDeTienda(tienda.nombre as string);
  if (!app) return { error: `Faltan las claves de ${tienda.nombre} en Vercel.` };
  return {
    usuario,
    orden: { id: o.id as string, numero: String(o.numero ?? ""), etiquetas: etiquetasDe(o.etiquetas as string | null), estadoEntrega: (o.estado_entrega as string | null) ?? null },
    tienda: tienda.nombre as string,
    tiendaId: tienda.id as string,
    codigoPais: String(pais?.codigo ?? "PA"),
    app,
  };
}

/** Guarda lo que quedó en Shopify, el evento del historial (para Asesores), la línea de la cronología y la auditoría. */
async function registrar(ctx: Contexto, final: string[], linea: string, accion: string, cambios: Record<string, unknown> = {}) {
  const supabase = createServiceClient();
  await supabase.from("ven_ordenes").update({ etiquetas: final.join(", "), ...cambios }).eq("id", ctx.orden.id);
  const quien = (ctx.usuario.nombre || ctx.usuario.email || "Alguien").trim();
  const antes = ctx.orden.etiquetas;
  const agregadas = final.filter((e) => !antes.some((h) => h.toLowerCase() === e.toLowerCase()));
  const quitadas = antes.filter((h) => !final.some((e) => e.toLowerCase() === h.toLowerCase()));
  if (agregadas.length || quitadas.length) {
    const evento = { orden_id: ctx.orden.id, tipo: "etiqueta", detalle: textoCambio(agregadas, quitadas), usuario: quien };
    const { error: eE } = await supabase.from("ven_orden_eventos").insert({ ...evento, usuario_id: ctx.usuario.id, agregadas, quitadas });
    if (eE) {
      const { error: e2 } = await supabase.from("ven_orden_eventos").insert(evento);
      if (e2) await supabase.from("ven_orden_eventos").insert({ ...evento, tipo: "nota" });
    }
  }
  await supabase.from("ven_orden_notas").insert({ orden_id: ctx.orden.id, texto: linea, autor: quien });
  await registrarAuditoria({ accion: `atc_${accion}`, entidad: "ven_ordenes", entidadId: ctx.orden.id, detalle: `${ctx.tienda} ${ctx.orden.numero}: ${linea}`.slice(0, 500) });
  for (const ruta of RUTAS) revalidatePath(ruta);
}

export async function gestionarPedidoAtc(ordenId: string, accionCruda: unknown, datosCrudos: { zona?: unknown; motivo?: unknown; nota?: unknown }): Promise<ResultadoGestion> {
  const accion = ACCIONES.find((a) => a === accionCruda);
  if (!accion) return { error: "Acción no válida." };
  const zona = typeof datosCrudos?.zona === "string" ? datosCrudos.zona.slice(0, 40) : null;
  const motivo = typeof datosCrudos?.motivo === "string" ? datosCrudos.motivo.slice(0, 40) : null;
  const nota = limpiarNota(datosCrudos?.nota);
  // El manual: cada cambio deja una línea en la cronología diciendo por qué. Al confirmar basta la zona; la novedad y la anulación piden el porqué.
  if (accion !== "confirmar" && nota.length < 3) return { error: accion === "novedad" ? "Escribe qué pidió el cliente (por ejemplo, «consulta con su esposo, paga el viernes»)." : "Escribe por qué se anula: queda en la cronología del pedido." };
  const ctx = await cargarContexto(ordenId, MODULOS_ASESORA);
  if ("error" in ctx) return ctx;
  if (ctx.orden.estadoEntrega === "entregada") return { error: "El pedido ya se entregó: no se confirma, ni se pone en novedad, ni se anula." };

  const rol = (ctx.usuario.rolNombre ?? "").toLowerCase().trim();
  const supervision = ["admin", "ceo"].includes(rol) || rol.includes("coordin");
  const plan = planAtc(accion, ctx.orden.etiquetas, { zona, motivo, codigoPais: ctx.codigoPais, supervision });
  if ("error" in plan) return { error: plan.error };

  let final: string[];
  let aviso: string | undefined;
  try {
    // Anular: primero se anula en Shopify (si falla, no se tocan las etiquetas).
    if (accion === "anular") await anularEnShopify(ctx.app, ctx.orden.numero, plan.agregar.at(-1) ?? "");
    const r = await cambiarEtiquetasEnShopify(ctx.app, ctx.orden.numero, plan.agregar, plan.quitar);
    final = r.etiquetas.map((e) => e.trim()).filter(Boolean);
    if (r.error) aviso = `Una parte no entró: ${r.error}`;
    if (accion === "confirmar") {
      const liberada = await liberarEsperaEnShopify(ctx.app, ctx.orden.numero).catch((e: unknown) => {
        aviso = e instanceof Error ? e.message : "Shopify no levantó la espera.";
        return true;
      });
      if (!liberada) aviso = "Si el pedido está «En espera», levántala en Shopify (falta aprobar el permiso de envíos en la app de la tienda).";
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Shopify no aceptó el cambio." };
  }

  // Anulado sin haber salido: ya es cancelado en el sistema (el aviso de Shopify lo confirma después). Si ya había salido, Shopify lo cuenta como devolución.
  const cambios = accion === "anular" && (ctx.orden.estadoEntrega === "pendiente" || ctx.orden.estadoEntrega === null) ? { estado_entrega: "cancelada" } : {};
  const linea = lineaCronologia(accion, { zona: plan.agregar.find((e) => !/^mot-/i.test(e)) ?? zona, motivo: plan.agregar.find((e) => /^mot-/i.test(e)) ?? motivo, nota });
  await registrar(ctx, final, linea, accion, cambios);
  return { ok: true, etiquetas: final, texto: linea, ...(aviso ? { aviso } : {}) };
}

/**
 * La guía por WhatsApp al cliente sin correo, por iComfly. Devuelve la línea de la cronología y, si no salió, el aviso para la asesora. Nunca hace fallar
 * el paso: la guía ya quedó en Shopify.
 */
async function guiaPorWhatsapp(ctx: Contexto, g: { numero: string; url: string }): Promise<{ linea: string; aviso?: string }> {
  const sinEnviar = (porque: string, aviso: string) => ({ linea: `sin correo del cliente; ${porque}: mandar la guía por WhatsApp a mano`, aviso: `La guía quedó en Shopify, pero el cliente no tiene correo y ${aviso}` });
  try {
    const supabase = createServiceClient();
    const [con, { data: cliente }] = await Promise.all([
      conexionesIcomfly(supabase, [ctx.tiendaId]),
      supabase.from("ven_ordenes_clientes").select("nombre, telefono").eq("orden_id", ctx.orden.id).maybeSingle(),
    ]);
    if (!con?.get(ctx.tiendaId)?.conectado) return sinEnviar(`${ctx.tienda} no está conectada a iComfly`, `${ctx.tienda} no está conectada a iComfly: mándale la guía por WhatsApp a mano.`);
    const telefono = telefonoParaIcomfly((cliente?.telefono as string | null) ?? null, ctx.codigoPais);
    if (!telefono) return sinEnviar("el pedido no tiene un teléfono válido", "el pedido no tiene un teléfono válido para WhatsApp.");
    const texto = mensajeGuiaWhatsapp({ cliente: (cliente?.nombre as string | null) ?? null, pedido: ctx.orden.numero, tienda: ctx.tienda, guia: g.numero, url: g.url });
    const quien = (ctx.usuario.nombre || ctx.usuario.email || "Alguien").trim();
    const r = await enviarAviso(supabase, ctx.tiendaId, telefono, texto, { id: ctx.usuario.id, nombre: quien });
    if (r.error)
      return esErrorDeVentana(r.error)
        ? sinEnviar(
            "pasaron más de 24 h desde su último mensaje (WhatsApp solo deja mandar una plantilla)",
            "pasaron más de 24 h desde su último mensaje: WhatsApp solo deja mandar una plantilla. Mándale la guía desde el chat con 📋 Plantillas.",
          )
        : sinEnviar("iComfly no lo mandó", `iComfly no mandó el WhatsApp (${r.error}). Mándale la guía a mano.`);
    await registrarAuditoria({ accion: "chat_tienda_mensaje", entidad: "tiendas", entidadId: ctx.tiendaId, detalle: `${ctx.tienda}: guía del pedido ${ctx.orden.numero} por WhatsApp (iComfly), el cliente no tiene correo` });
    return { linea: "el cliente no tiene correo: se le mandó la guía por WhatsApp (iComfly)" };
  } catch (e) {
    return sinEnviar("no se pudo mandar el WhatsApp", `no se pudo mandar el WhatsApp (${e instanceof Error ? e.message : "error"}). Mándale la guía a mano.`);
  }
}

/**
 * Los pasos después de confirmar: «guia» (la asesora, con el enlace público y el correo al cliente), «entregado» (la coordinadora o la asesora, cuando
 * Servientrega o el reparto local lo reportan) y «acreditar» (Finanzas, con el dinero en el banco: pone «acreditado» y pasa el pago a «Pagado»).
 */
export async function pasoPedidoAtc(ordenId: string, pasoCrudo: unknown, datosCrudos: { guia?: unknown; nota?: unknown }): Promise<ResultadoGestion> {
  const paso = PASOS.find((p) => p === pasoCrudo);
  if (!paso) return { error: "Paso no válido." };
  const nota = limpiarNota(datosCrudos?.nota);
  const ctx = await cargarContexto(ordenId, paso === "acreditar" ? MODULOS_FINANZAS : MODULOS_ASESORA);
  if ("error" in ctx) return paso === "acreditar" && /permiso/.test(ctx.error) ? { error: "Acreditar y pasar a «Pagado» lo hace Finanzas (quien edita Ventas por tienda o la Reportería de pedidos)." } : ctx;
  if (/^mot-/i.test(ctx.orden.etiquetas.find((e) => /^mot-/i.test(e)) ?? "") || ctx.orden.estadoEntrega === "cancelada") return { error: "El pedido está anulado." };

  try {
    if (paso === "guia") {
      const g = leerGuia({ numero: datosCrudos?.guia });
      if ("error" in g) return g;
      const { correo } = await cargarGuiaEnShopify(ctx.app, ctx.orden.numero, g);
      // Sin correo, Shopify no tiene a quién mandar el seguimiento: la guía va por WhatsApp (iComfly), en el número de la tienda (Hernán, 24 nov 2026).
      const wa = correo ? null : await guiaPorWhatsapp(ctx, g);
      const linea = lineaPaso("guia", { guia: g.numero, nota, aviso: wa?.linea ?? null });
      await registrar(ctx, ctx.orden.etiquetas, linea, "guia", { guia: g.numero, transportista: g.empresa });
      return { ok: true, etiquetas: ctx.orden.etiquetas, texto: linea, ...(wa?.aviso ? { aviso: wa.aviso } : {}) };
    }
    if (paso === "entregado") {
      await marcarEntregadoEnShopify(ctx.app, ctx.orden.numero);
      // El estado del pedido en el sistema lo siguen dando Monday y Servientrega (nada se deduce): aquí queda el «Entregado» de Shopify en la cronología.
      const linea = lineaPaso("entregado", { nota });
      await registrar(ctx, ctx.orden.etiquetas, linea, "entregado");
      return { ok: true, etiquetas: ctx.orden.etiquetas, texto: linea };
    }
    await marcarPagadoEnShopify(ctx.app, ctx.orden.numero);
    const r = await cambiarEtiquetasEnShopify(ctx.app, ctx.orden.numero, ctx.orden.etiquetas.some((e) => e.toLowerCase() === ETIQUETA_ACREDITADO) ? [] : [ETIQUETA_ACREDITADO], []);
    const final = r.etiquetas.map((e) => e.trim()).filter(Boolean);
    const linea = lineaPaso("acreditar", { nota });
    await registrar(ctx, final, linea, "acreditar", { estado_pago: "paid" });
    return { ok: true, etiquetas: final, texto: linea, ...(r.error ? { aviso: `Quedó pagado, pero la etiqueta «acreditado» no entró: ${r.error}` } : {}) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Shopify no aceptó el cambio." };
  }
}
