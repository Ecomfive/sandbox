"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireAlgunModulo } from "@/lib/auth";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import { anularEnShopify, cambiarEtiquetasEnShopify, liberarEsperaEnShopify } from "@/lib/tienda/escribir-shopify";
import { textoCambio } from "@/lib/tienda/etiquetas-shopify";
import { lineaCronologia, planAtc, type AccionAtc } from "@/lib/tienda/gestion-atc";
import { etiquetasDe, mismaTiendaUnidad } from "@/lib/tienda/ordenes-finanzas";
import { appDeTienda } from "@/lib/tienda/shopify-app";

// Gestión de tienda › ficha del pedido: los tres botones del manual ATC (24 nov 2026, pedido de Hernán: «el trabajo de los asesores se va a llevar desde el
// sistema para modificar en Shopify»). Confirmar (pone la zona y levanta la espera), Novedad (quita la zona) y Anular (anula el pedido en Shopify, deja la
// zona y pone UN motivo). Primero Shopify; solo si lo aceptó cambia en el sistema, queda en el historial (de ahí el panel de Asesores) y deja su línea en la
// cronología del pedido (Notas del equipo), que reemplaza al Sheet. Las reglas están en src/lib/tienda/gestion-atc.ts.

const MODULOS = ["tienda-pedidos", "tienda-confirmacion"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCIONES: AccionAtc[] = ["confirmar", "novedad", "anular"];
const RUTAS = ["/tienda-pedidos", "/tienda-pedidos/confirmacion", "/tienda-pedidos/logistica", "/tienda-dashboard"];

export type ResultadoGestion = { ok: true; etiquetas: string[]; texto: string; aviso?: string } | { error: string };

export async function gestionarPedidoAtc(ordenId: string, accionCruda: unknown, datosCrudos: { zona?: unknown; motivo?: unknown; nota?: unknown }): Promise<ResultadoGestion> {
  let usuario;
  try {
    usuario = await requireAlgunModulo(MODULOS, true);
  } catch {
    return { error: "No tienes permiso para gestionar pedidos." };
  }
  const accion = ACCIONES.find((a) => a === accionCruda);
  if (!accion || !UUID.test(String(ordenId ?? ""))) return { error: "Acción no válida." };
  const zona = typeof datosCrudos?.zona === "string" ? datosCrudos.zona.slice(0, 40) : null;
  const motivo = typeof datosCrudos?.motivo === "string" ? datosCrudos.motivo.slice(0, 40) : null;
  const nota = typeof datosCrudos?.nota === "string" ? datosCrudos.nota.replace(/\s+/g, " ").trim().slice(0, 500) : "";
  // El manual: cada cambio deja una línea en la cronología diciendo por qué. Al confirmar basta la zona; la novedad y la anulación piden el porqué.
  if (accion !== "confirmar" && nota.length < 3) return { error: accion === "novedad" ? "Escribe qué pidió el cliente (por ejemplo, «consulta con su esposo, paga el viernes»)." : "Escribe por qué se anula: queda en la cronología del pedido." };

  const supabase = createServiceClient();
  const { data: o } = await supabase.from("ven_ordenes").select("id, numero, etiquetas, estado_entrega, unidad_id, fin_unidades(nombre, pais_id, clase)").eq("id", ordenId).maybeSingle();
  const unidad = (o ? (Array.isArray(o.fin_unidades) ? o.fin_unidades[0] : o.fin_unidades) : null) as { nombre: string; pais_id: string; clase: string } | null;
  if (!o || !unidad || unidad.clase !== "tienda") return { error: "No se encontró el pedido." };
  if (!puedeVerUnidad(await cargarTiendasPermitidas(), (o.unidad_id as string | null) ?? null)) return { error: "No se encontró el pedido." };
  if (o.estado_entrega === "entregada") return { error: "El pedido ya se entregó: no se confirma, ni se pone en novedad, ni se anula." };

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

  const rol = (usuario.rolNombre ?? "").toLowerCase();
  const supervision = ["admin", "ceo"].includes(rol.trim()) || rol.includes("coordin");
  const antes = etiquetasDe(o.etiquetas as string | null);
  const plan = planAtc(accion, antes, { zona, motivo, codigoPais: String(pais?.codigo ?? "PA"), supervision });
  if ("error" in plan) return { error: plan.error };

  const numero = String(o.numero ?? "");
  let final: string[];
  let aviso: string | undefined;
  try {
    // Anular: primero se anula en Shopify (si falla, no se tocan las etiquetas).
    if (accion === "anular") await anularEnShopify(app, numero, plan.agregar.at(-1) ?? "");
    const r = await cambiarEtiquetasEnShopify(app, numero, plan.agregar, plan.quitar);
    final = r.etiquetas.map((e) => e.trim()).filter(Boolean);
    if (r.error) aviso = `Una parte no entró: ${r.error}`;
    if (accion === "confirmar") {
      const liberada = await liberarEsperaEnShopify(app, numero).catch((e: unknown) => {
        aviso = e instanceof Error ? e.message : "Shopify no levantó la espera.";
        return true;
      });
      if (!liberada) aviso = "Si el pedido está «En espera», levántala en Shopify (falta aprobar el permiso de envíos en la app de la tienda).";
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Shopify no aceptó el cambio." };
  }

  const cambios: Record<string, unknown> = { etiquetas: final.join(", ") };
  // Anulado sin haber salido: ya es cancelado en el sistema (el aviso de Shopify lo confirma después). Si ya había salido, Shopify lo cuenta como devolución.
  if (accion === "anular" && (o.estado_entrega === "pendiente" || o.estado_entrega === null)) cambios.estado_entrega = "cancelada";
  await supabase.from("ven_ordenes").update(cambios).eq("id", o.id);

  const quien = (usuario.nombre || usuario.email || "Alguien").trim();
  const agregadas = final.filter((e) => !antes.some((h) => h.toLowerCase() === e.toLowerCase()));
  const quitadas = antes.filter((h) => !final.some((e) => e.toLowerCase() === h.toLowerCase()));
  const evento = { orden_id: o.id, tipo: "etiqueta", detalle: textoCambio(agregadas, quitadas), usuario: quien };
  const { error: eE } = await supabase.from("ven_orden_eventos").insert({ ...evento, usuario_id: usuario.id, agregadas, quitadas });
  if (eE) {
    const { error: e2 } = await supabase.from("ven_orden_eventos").insert(evento);
    if (e2) await supabase.from("ven_orden_eventos").insert({ ...evento, tipo: "nota" });
  }
  const linea = lineaCronologia(accion, { zona: plan.agregar.find((e) => !/^mot-/i.test(e)) ?? zona, motivo: plan.agregar.find((e) => /^mot-/i.test(e)) ?? motivo, nota });
  await supabase.from("ven_orden_notas").insert({ orden_id: o.id, texto: linea, autor: quien });
  await registrarAuditoria({ accion: `atc_${accion}`, entidad: "ven_ordenes", entidadId: o.id as string, detalle: `${tienda.nombre} ${numero}: ${linea}`.slice(0, 500) });
  for (const ruta of RUTAS) revalidatePath(ruta);
  return { ok: true, etiquetas: final, texto: linea, ...(aviso ? { aviso } : {}) };
}
