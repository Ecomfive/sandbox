"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { conectarTienda, registrarAvisos, revisarTienda, urlDelSistema } from "@/lib/tienda/conectar-shopify";
import { desconectarIcomfly, guardarUrlConector, probarIcomfly } from "@/lib/tienda/icomfly";
import { leerUrlConector } from "@/lib/tienda/icomfly-oauth";
import { accesoDeApp, appDeTienda, olvidarAcceso, permisosNoPermitidos, puedeEscribirPedidos } from "@/lib/tienda/shopify-app";

// Gestión de tienda › Tiendas (12 nov 2026): conectar una tienda de Shopify en vivo y revisarla a mano. Solo un administrador: conectar pide a Shopify
// los avisos de pedidos de la tienda. Desde el 19 nov 2026 un administrador también enciende «Escribir en Shopify» por tienda (las etiquetas del pedido
// desde la ficha) y «Quitar la nota del bot»; los dos piden que la tienda haya aprobado `write_orders` en la app.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function soloAdmin() {
  const usuario = await requireModuloEscritura("tienda-tiendas");
  return esAdministrador(usuario) ? usuario : null;
}

export async function conectarTiendaShopify(tiendaId: string): Promise<{ error?: string; resumen?: string }> {
  if (!(await soloAdmin())) return { error: "Solo un administrador conecta una tienda." };
  if (!UUID.test(tiendaId)) return { error: "Tienda no válida." };
  const supabase = createServiceClient();
  try {
    const r = await conectarTienda(supabase, tiendaId);
    await registrarAuditoria({
      accion: "conectar_tienda_shopify",
      entidad: "tiendas",
      entidadId: tiendaId,
      detalle: `${r.tienda}: ${r.avisos.creados} avisos de pedidos pedidos a Shopify (${r.avisos.yaEstaban} ya estaban) · ${r.traidos}`,
    });
    revalidatePath("/tienda-tiendas");
    revalidatePath("/tienda-pedidos");
    const avisos = r.avisos.creados ? `se pidieron ${r.avisos.creados} avisos a Shopify` : "los avisos ya estaban";
    return { resumen: `${r.tienda} conectada: ${avisos}. ${r.traidos}.${r.completa ? "" : " Falta traer una parte: pulsa «Revisar ahora»."}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo conectar la tienda." };
  }
}

export async function revisarTiendaShopify(tiendaId: string): Promise<{ error?: string; resumen?: string }> {
  if (!(await soloAdmin())) return { error: "Solo un administrador revisa la conexión." };
  if (!UUID.test(tiendaId)) return { error: "Tienda no válida." };
  const supabase = createServiceClient();
  const { data: t } = await supabase.from("tiendas").select("id, nombre, estado").eq("id", tiendaId).maybeSingle();
  if (!t || t.estado !== "conectada") return { error: "La tienda no está conectada." };
  try {
    // Los avisos de pedidos son de cada app (20 nov 2026: Nuvo pasó a una app nueva para escribir etiquetas): a mano, la revisión vuelve a pedirle a Shopify
    // los de la app que está en Vercel. Los que ya estaban no se repiten. Sin esto, con otra app los avisos seguían siendo los de la vieja y se rechazaban.
    let avisos = "";
    const app = appDeTienda(t.nombre as string);
    const urlBase = urlDelSistema();
    if (app && urlBase) {
      const a = await registrarAvisos(app, (await accesoDeApp(app)).token, urlBase);
      if (a.creados) avisos = ` Se pidieron ${a.creados} avisos de pedidos a Shopify con la app actual.`;
      await supabase.from("tiendas").update({ dominio: app.dominio }).eq("id", t.id);
    }
    // 50 segundos (la página tiene 60): con una tienda recién conectada, cada pulsación trae el doble de historial (14 nov 2026).
    const r = await revisarTienda(supabase, { id: t.id as string, nombre: t.nombre as string }, 50_000);
    if (avisos) await registrarAuditoria({ accion: "conectar_tienda_shopify", entidad: "tiendas", entidadId: t.id as string, detalle: `${t.nombre}:${avisos} · ${r.texto}` });
    revalidatePath("/tienda-tiendas");
    revalidatePath("/tienda-pedidos");
    return { resumen: `${r.texto}.${avisos}${r.completa ? "" : " Falta una parte: vuelve a pulsar «Revisar ahora»."}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo revisar la tienda." };
  }
}

// iComfly (13 nov 2026): el bot de WhatsApp de las tiendas. Un administrador pega la dirección del conector de la tienda y autoriza en iComfly
// (/api/icomfly/conectar); aquí se guarda la dirección, se prueba la conexión y se desconecta. Los tokens nunca pasan por aquí.

export async function guardarConectorIcomfly(tiendaId: string, url: string): Promise<{ error?: string }> {
  if (!(await soloAdmin())) return { error: "Solo un administrador conecta una tienda." };
  if (!UUID.test(String(tiendaId))) return { error: "Tienda no válida." };
  const limpia = leerUrlConector(url);
  if (!limpia) return { error: "Pega la «URL del servidor MCP» de iComfly › Conector Claude (https://api.icomfly.com/mcp/c_…)." };
  const r = await guardarUrlConector(createServiceClient(), tiendaId, limpia);
  if (r.error) return r;
  revalidatePath("/tienda-tiendas");
  return {};
}

export async function probarIcomflyTienda(tiendaId: string): Promise<{ resumen: string } | { error: string }> {
  if (!(await soloAdmin())) return { error: "Solo un administrador prueba la conexión." };
  if (!UUID.test(String(tiendaId))) return { error: "Tienda no válida." };
  const r = await probarIcomfly(createServiceClient(), tiendaId);
  revalidatePath("/tienda-tiendas");
  return r;
}

export async function desconectarIcomflyTienda(tiendaId: string): Promise<{ error?: string }> {
  if (!(await soloAdmin())) return { error: "Solo un administrador desconecta una tienda." };
  if (!UUID.test(String(tiendaId))) return { error: "Tienda no válida." };
  const r = await desconectarIcomfly(createServiceClient(), tiendaId);
  if (!r.error) await registrarAuditoria({ accion: "desconectar_icomfly", entidad: "tiendas", entidadId: tiendaId, detalle: "Se borraron los tokens de iComfly" });
  revalidatePath("/tienda-tiendas");
  return r;
}

// Escribir en Shopify (19 nov 2026, etapa 1: etiquetas del pedido). Encender revisa con Shopify, con un token nuevo, que la tienda haya aprobado
// write_orders y que la app no tenga otros permisos de escritura. Apagar siempre se puede. Queda en la Actividad.

async function revisarPermisoDeEscritura(nombre: string): Promise<string | null> {
  const app = appDeTienda(nombre);
  if (!app) return `Faltan las claves de ${nombre} en Vercel.`;
  olvidarAcceso(app);
  let scope: string;
  try {
    scope = (await accesoDeApp(app)).scope;
  } catch (e) {
    return e instanceof Error ? e.message : "Shopify no dio acceso.";
  }
  const otros = permisosNoPermitidos(scope);
  if (otros.length) return `La app de ${nombre} tiene permisos de escritura que el sistema no usa (${otros.join(", ")}): quítaselos en el Dev Dashboard (solo debe quedar write_orders).`;
  if (!puedeEscribirPedidos(scope)) return `La tienda ${nombre} todavía no aprobó el permiso write_orders: agrégalo en una versión nueva de la app (Dev Dashboard → Versions → Scopes → Release) y apruébalo en el admin de la tienda.`;
  return null;
}

export async function cambiarEscrituraShopify(tiendaId: string, encender: boolean): Promise<{ error?: string; resumen?: string }> {
  const usuario = await soloAdmin();
  if (!usuario) return { error: "Solo un administrador enciende la escritura en Shopify." };
  if (!UUID.test(tiendaId)) return { error: "Tienda no válida." };
  const supabase = createServiceClient();
  const { data: t, error: e0 } = await supabase.from("tiendas").select("id, nombre, estado, escribe_shopify").eq("id", tiendaId).maybeSingle();
  if (e0) return { error: /escribe_shopify/.test(e0.message) ? "Falta correr en Supabase la migración 0337 (escribir etiquetas en Shopify)." : "No se pudo leer la tienda." };
  if (!t) return { error: "La tienda ya no existe." };
  if (encender) {
    if (t.estado !== "conectada") return { error: "Primero hay que conectar la tienda." };
    const problema = await revisarPermisoDeEscritura(t.nombre as string);
    if (problema) return { error: problema };
  }
  const cambio = encender
    ? { escribe_shopify: true, escribe_shopify_por: usuario.id, escribe_shopify_en: new Date().toISOString() }
    : { escribe_shopify: false, escribe_shopify_por: usuario.id, escribe_shopify_en: new Date().toISOString(), quitar_nota_bot: false };
  let { error } = await supabase.from("tiendas").update(encender ? cambio : { ...cambio, ia_pone_etiqueta: false }).eq("id", tiendaId);
  // Sin la migración 0348 no existe `ia_pone_etiqueta`: se apaga igual lo demás.
  if (error && !encender && /ia_pone_etiqueta|schema cache/i.test(error.message)) ({ error } = await supabase.from("tiendas").update(cambio).eq("id", tiendaId));
  if (error) return { error: "No se pudo guardar." };
  await registrarAuditoria({ accion: encender ? "encender_escritura_shopify" : "apagar_escritura_shopify", entidad: "tiendas", entidadId: tiendaId, detalle: `${t.nombre}: ${encender ? "escribe las etiquetas del pedido en Shopify" : "vuelve a solo lectura"}` });
  revalidatePath("/tienda-tiendas");
  revalidatePath("/tienda-pedidos");
  return { resumen: encender ? `${t.nombre}: ya se pueden cambiar las etiquetas de los pedidos desde el sistema.` : `${t.nombre} vuelve a solo lectura.` };
}

/** La nota que el bot de iComfly deja en los pedidos (automatización de jhokserg, 16 nov 2026, #678): con la escritura encendida, se quita de Shopify. */
export async function cambiarQuitarNotaBot(tiendaId: string, encender: boolean): Promise<{ error?: string; resumen?: string }> {
  if (!(await soloAdmin())) return { error: "Solo un administrador cambia esto." };
  if (!UUID.test(tiendaId)) return { error: "Tienda no válida." };
  const supabase = createServiceClient();
  const { data: t, error: e0 } = await supabase.from("tiendas").select("id, nombre, escribe_shopify").eq("id", tiendaId).maybeSingle();
  if (e0 || !t) return { error: "No se pudo leer la tienda." };
  if (encender && !t.escribe_shopify) return { error: "Primero enciende «Escribir en Shopify» en esta tienda." };
  const { error } = await supabase.from("tiendas").update({ quitar_nota_bot: encender }).eq("id", tiendaId);
  if (error) return { error: "No se pudo guardar (¿falta la migración 0303?)." };
  await registrarAuditoria({ accion: encender ? "encender_quitar_nota_bot" : "apagar_quitar_nota_bot", entidad: "tiendas", entidadId: tiendaId, detalle: `${t.nombre}: ${encender ? "se quita de Shopify la nota del bot" : "la nota del bot se deja en Shopify"}` });
  revalidatePath("/tienda-tiendas");
  return { resumen: encender ? `${t.nombre}: la nota del bot se quitará de los pedidos nuevos.` : `${t.nombre}: la nota del bot ya no se quita.` };
}

/**
 * «La IA pone la etiqueta de zona» (21 nov 2026, pedido de Jhokser: prueba controlada, una tienda a la vez): con esto encendido, la confirmación con IA pone en Shopify la etiqueta CIUDAD o
 * INTERIOR/SERVIENTREGA de un pedido que acaba de confirmarse y quedó «Listo». Solo un administrador, y solo con «Escribir en Shopify» encendido (migración 0348).
 */
export async function cambiarIaPoneEtiqueta(tiendaId: string, encender: boolean): Promise<{ error?: string; resumen?: string }> {
  const usuario = await soloAdmin();
  if (!usuario) return { error: "Solo un administrador cambia esto." };
  if (!UUID.test(tiendaId)) return { error: "Tienda no válida." };
  const supabase = createServiceClient();
  const { data: t, error: e0 } = await supabase.from("tiendas").select("id, nombre, escribe_shopify, pais_id").eq("id", tiendaId).maybeSingle();
  if (e0 || !t) return { error: "No se pudo leer la tienda." };
  if (encender && !t.escribe_shopify) return { error: "Primero enciende «Escribir en Shopify» en esta tienda." };
  const { error } = await supabase.from("tiendas").update({ ia_pone_etiqueta: encender, ia_pone_etiqueta_por: usuario.id, ia_pone_etiqueta_en: new Date().toISOString() }).eq("id", tiendaId);
  if (error) return { error: "No se pudo guardar (¿falta la migración 0348?)." };
  await registrarAuditoria({ accion: encender ? "encender_ia_pone_etiqueta" : "apagar_ia_pone_etiqueta", entidad: "tiendas", entidadId: tiendaId, detalle: `${t.nombre}: ${encender ? "la IA pone la etiqueta de zona en Shopify" : "la IA solo propone la etiqueta de zona"}` });
  revalidatePath("/tienda-tiendas");
  // Aviso útil: la IA solo analiza sola si la confirmación automática del país está encendida.
  let aviso = "";
  if (encender) {
    const { data: cfg } = await supabase.from("confirmacion_ia_config").select("activa").eq("pais_id", t.pais_id as string).maybeSingle();
    if (cfg?.activa !== true) aviso = " Ojo: la «Confirmación automática» del país está apagada; enciéndela en Confirmación con IA para que analice los pedidos que se confirmen.";
  }
  return { resumen: encender ? `${t.nombre}: la IA pondrá la etiqueta de zona en los pedidos que se confirmen desde ahora.${aviso}` : `${t.nombre}: la IA ya no pone etiquetas, solo las propone.` };
}
