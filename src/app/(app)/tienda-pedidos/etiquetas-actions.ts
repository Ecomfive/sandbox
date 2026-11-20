"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireAlgunModulo } from "@/lib/auth";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import { cambiarEtiquetasEnShopify } from "@/lib/tienda/escribir-shopify";
import { limpiarEtiqueta, planCambio, textoCambio } from "@/lib/tienda/etiquetas-shopify";
import { etiquetasDe, mismaTiendaUnidad } from "@/lib/tienda/ordenes-finanzas";
import { appDeTienda } from "@/lib/tienda/shopify-app";

// Gestión de tienda › ficha del pedido (19 nov 2026, etapa 1 de escribir en Shopify): agregar y quitar etiquetas del pedido, y «Confirmar pedido»
// (= la etiqueta «Confirmada»). Primero se cambia en Shopify; solo si Shopify lo aceptó cambia en el sistema y queda en el historial del pedido.
// Pueden quienes editan Pedidos o Confirmación de tienda, y cada persona solo en sus tiendas (la de Nuvo en Nuvo: `tiendas_permitidas`).

const MODULOS = ["tienda-pedidos", "tienda-confirmacion"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUTAS = ["/tienda-pedidos", "/tienda-pedidos/confirmacion", "/tienda-pedidos/logistica", "/tienda-dashboard"];

export type ResultadoEtiquetas = { ok: true; etiquetas: string[]; aviso?: string } | { error: string };

export async function cambiarEtiquetasPedido(ordenId: string, agregarCrudo: unknown[], quitarCrudo: unknown[]): Promise<ResultadoEtiquetas> {
  let usuario;
  try {
    usuario = await requireAlgunModulo(MODULOS, true);
  } catch {
    return { error: "No tienes permiso para cambiar etiquetas de pedidos." };
  }
  if (!UUID.test(String(ordenId ?? ""))) return { error: "Pedido no válido." };
  if (!Array.isArray(agregarCrudo) || !Array.isArray(quitarCrudo) || agregarCrudo.length + quitarCrudo.length > 10) return { error: "Cambio no válido." };
  const agregar = agregarCrudo.map(limpiarEtiqueta);
  if (agregar.some((e) => e === null)) return { error: "La etiqueta está vacía o es muy larga (máximo 40 letras)." };
  const quitar = quitarCrudo.map((e) => String(e ?? "").trim()).filter(Boolean);

  const supabase = createServiceClient();
  const { data: o } = await supabase.from("ven_ordenes").select("id, numero, etiquetas, unidad_id, fin_unidades(nombre, pais_id, clase)").eq("id", ordenId).maybeSingle();
  const unidad = (o ? (Array.isArray(o.fin_unidades) ? o.fin_unidades[0] : o.fin_unidades) : null) as { nombre: string; pais_id: string; clase: string } | null;
  if (!o || !unidad || unidad.clase !== "tienda") return { error: "No se encontró el pedido." };
  // Cada persona solo en sus tiendas (17 nov 2026): un pedido de otra tienda es como si no existiera.
  if (!puedeVerUnidad(await cargarTiendasPermitidas(), (o.unidad_id as string | null) ?? null)) return { error: "No se encontró el pedido." };

  const { data: tiendas, error: eT } = await supabase.from("tiendas").select("id, nombre, estado, escribe_shopify").eq("pais_id", unidad.pais_id);
  if (eT) return { error: /escribe_shopify/.test(eT.message) ? "Falta correr en Supabase la migración 0337 (escribir etiquetas en Shopify)." : "No se pudo leer la tienda." };
  const tienda = (tiendas ?? []).find((t) => mismaTiendaUnidad(t.nombre as string, unidad.nombre));
  if (!tienda || tienda.estado !== "conectada") return { error: "La tienda de este pedido no está conectada a Shopify." };
  if (!tienda.escribe_shopify) return { error: `${tienda.nombre} todavía no tiene encendido «Escribir en Shopify» (lo enciende un administrador en Tiendas Shopify).` };
  const app = appDeTienda(tienda.nombre as string);
  if (!app) return { error: `Faltan las claves de ${tienda.nombre} en Vercel.` };

  const plan = planCambio(etiquetasDe(o.etiquetas as string | null), agregar as string[], quitar);
  if (!plan.agregar.length && !plan.quitar.length) return { ok: true, etiquetas: plan.final };

  let r: { etiquetas: string[]; error: string | null };
  try {
    r = await cambiarEtiquetasEnShopify(app, String(o.numero ?? ""), plan.agregar, plan.quitar);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Shopify no aceptó el cambio." };
  }

  // Lo que quedó en Shopify es lo que vale (también lo que otra persona o una app pusieron mientras tanto). El aviso de Shopify lo vuelve a guardar igual.
  const final = r.etiquetas.map((e) => e.trim()).filter(Boolean);
  await supabase.from("ven_ordenes").update({ etiquetas: final.join(", ") }).eq("id", o.id);
  const quien = (usuario.nombre || usuario.email || "Alguien").trim();
  // El historial dice lo que de verdad cambió (comparando con lo que había antes).
  const antes = etiquetasDe(o.etiquetas as string | null);
  const agregadas = final.filter((e) => !antes.some((h) => h.toLowerCase() === e.toLowerCase()));
  const quitadas = antes.filter((h) => !final.some((e) => e.toLowerCase() === h.toLowerCase()));
  const detalle = textoCambio(agregadas, quitadas);
  const evento = { orden_id: o.id, tipo: "etiqueta", detalle, usuario: quien };
  // Quién fue y qué etiquetas (20 nov 2026, migración 0344): de aquí sale el rendimiento de cada asesor (Pedidos de tienda › Asesores).
  const { error: eE } = await supabase.from("ven_orden_eventos").insert({ ...evento, usuario_id: usuario.id, agregadas, quitadas });
  // Sin la migración 0344, sin esas columnas; sin la 0337, el tipo «etiqueta» no existe y queda como nota del historial.
  if (eE) {
    const { error: e2 } = await supabase.from("ven_orden_eventos").insert(evento);
    if (e2) await supabase.from("ven_orden_eventos").insert({ ...evento, tipo: "nota" });
  }
  await registrarAuditoria({ accion: "etiquetas_shopify", entidad: "ven_ordenes", entidadId: o.id as string, detalle: `${tienda.nombre} ${o.numero ?? ""}: ${detalle}`.slice(0, 500) });
  for (const ruta of RUTAS) revalidatePath(ruta);
  return { ok: true, etiquetas: final, ...(r.error ? { aviso: `Una parte no entró: ${r.error}` } : {}) };
}
