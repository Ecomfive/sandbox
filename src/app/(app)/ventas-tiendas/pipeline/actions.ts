"use server";

import { mesCerrado } from "@/lib/ventas/operacion";
import { moverFase, type CambioFase } from "@/lib/ventas/mover-fase";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { sinAccesoARegistros, sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { PAISES_OPERACION } from "@/lib/finanzas/pais-finanzas";
import { createServiceClient } from "@/lib/supabase/server";
import { FASES, type Fase } from "@/lib/ventas/ciclo";
import { cifrarToken, normalizarDominio, tokenPlausible } from "@/lib/ventas/conexion-tienda";
import { sincronizarTienda, tiendasConfiguradas } from "@/lib/finanzas/sincronizar-shopify";
import { diasRelleno } from "@/lib/ventas/shopify-webhook";

const MODULO = "ventas-tiendas";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RUTA = "/ventas-tiendas/pipeline";
type Resultado = { error: string } | { ok: true; aviso?: string };
const falla = (e: unknown, por = "No se pudo guardar."): { error: string } => ({ error: e instanceof Error ? e.message : por });
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Conecta una tienda con Shopify: país, dirección y token (se prueba contra Shopify y se guarda cifrado). */
export async function conectarTienda(datos: { unidadId?: string; nombre?: string; pais: string; dominio: string; token: string }): Promise<Resultado> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const acceso = await sinAccesoTodaLaEmpresa();
    if (acceso) return { error: acceso };
    const pais = String(datos.pais ?? "").toUpperCase();
    if (!(PAISES_OPERACION as readonly string[]).includes(pais)) return { error: "Elige el país de la tienda." };
    const dominio = normalizarDominio(datos.dominio);
    if (!dominio) return { error: "La dirección debe ser la de Shopify, por ejemplo mi-tienda.myshopify.com." };
    const token = String(datos.token ?? "").trim();
    if (!tokenPlausible(token)) return { error: "El token no parece de Shopify (empieza por shpat_)." };
    const cifrado = cifrarToken(token);
    if (!cifrado) return { error: "Falta INTEGRACIONES_TOKEN_KEY (o QBO_TOKEN_KEY) en las variables del servidor para guardar el token." };
    const supabase = createServiceClient();

    // Se prueba antes de guardar: así un token malo no queda a medias.
    const r = await fetch(`https://${dominio}/admin/api/2024-10/shop.json`, { headers: { "X-Shopify-Access-Token": token }, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!r) return { error: "No se pudo contactar a Shopify." };
    if (r.status === 401 || r.status === 403) return { error: "Shopify rechazó el token: revisa que sea de esa tienda y tenga permiso para leer órdenes." };
    if (!r.ok) return { error: `Shopify respondió ${r.status}.` };

    let unidadId = datos.unidadId && UUID.test(datos.unidadId) ? datos.unidadId : null;
    if (!unidadId) {
      const nombre = texto(datos.nombre, 80)?.toUpperCase();
      if (!nombre) return { error: "Elige la tienda o escribe su nombre." };
      const { data: ya } = await supabase.from("fin_unidades").select("id").eq("nombre", nombre).maybeSingle();
      if (ya) unidadId = String(ya.id);
      else {
        const { data: nueva, error } = await supabase.from("fin_unidades").insert({ nombre, clase: "tienda", pais, recibe_reparto: false }).select("id").single();
        if (error || !nueva) return { error: error?.message ?? "No se pudo crear la tienda." };
        unidadId = String(nueva.id);
      }
    }
    const { error: ep } = await supabase.from("fin_unidades").update({ pais }).eq("id", unidadId);
    if (ep) return { error: ep.message };
    const { error } = await supabase
      .from("ven_tiendas_conexion")
      .upsert({ unidad_id: unidadId, dominio, token_cifrado: cifrado, activo: true, ultimo_error: null, conectado_por: usuario.nombre ?? usuario.email, actualizado_en: new Date().toISOString() }, { onConflict: "unidad_id" });
    if (error) return { error: /ven_tiendas_conexion/.test(error.message) ? "Falta correr la migración 0956 en Supabase." : error.message };
    await registrarAuditoria({ accion: "conectar_tienda_shopify", entidad: "ven_tiendas_conexion", entidadId: unidadId, detalle: `Conectó ${dominio} (${pais})` });
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

export async function desconectarTienda(unidadId: string): Promise<Resultado> {
  try {
    await requireModuloEscritura(MODULO);
    const acceso = await sinAccesoTodaLaEmpresa();
    if (acceso) return { error: acceso };
    if (!UUID.test(unidadId)) return { error: "Tienda inválida." };
    const { error } = await createServiceClient().from("ven_tiendas_conexion").update({ activo: false, actualizado_en: new Date().toISOString() }).eq("unidad_id", unidadId);
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: "desconectar_tienda_shopify", entidad: "ven_tiendas_conexion", entidadId: unidadId });
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

/** «Sincronizar ahora» (sin días) lee lo nuevo desde el cursor; con días, relee hacia atrás para rellenar huecos. */
export async function sincronizarTiendaAhora(unidadId: string, dias?: number): Promise<Resultado> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const acceso = await sinAccesoTodaLaEmpresa();
    if (acceso) return { error: acceso };
    if (!UUID.test(unidadId)) return { error: "Tienda inválida." };
    const supabase = createServiceClient();
    const tienda = (await tiendasConfiguradas(supabase) as ((Awaited<ReturnType<typeof tiendasConfiguradas>>)[number] & { unidadId?: string })[]).find((t) => t.unidadId === unidadId);
    if (!tienda) return { error: "Esa tienda no está conectada (o falta INTEGRACIONES_TOKEN_KEY)." };
    const desde = dias ? new Date(Date.now() - diasRelleno(dias) * 86_400_000).toISOString() : undefined;
    try {
      const r = await sincronizarTienda(supabase, tienda, Date.now() + 45_000, desde);
      await supabase.from("ven_tiendas_conexion").update({ ultima_lectura: new Date().toISOString(), ultimo_error: null }).eq("unidad_id", unidadId);
      await registrarAuditoria({ accion: "sincronizar_tienda_shopify", entidad: "ven_tiendas_conexion", entidadId: unidadId, detalle: `${desde ? `Relleno de ${diasRelleno(dias)} días` : "Sincronización"} por ${usuario.nombre ?? usuario.email}: ${r.texto}` });
      revalidatePath(RUTA);
      return { ok: true, aviso: r.texto + (r.completa ? "" : " · Quedó más por leer: vuelve a pulsar.") };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falló la lectura.";
      await supabase.from("ven_tiendas_conexion").update({ ultimo_error: msg.slice(0, 300) }).eq("unidad_id", unidadId);
      revalidatePath(RUTA);
      return { error: msg };
    }
  } catch (e) {
    return falla(e);
  }
}

export type { CambioFase };

/** Mueve una orden a otra fase del ciclo (solo por el camino permitido) y deja el evento. */
export async function cambiarFase(ordenId: string, fase: Fase, cambio: CambioFase = {}): Promise<Resultado> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!UUID.test(ordenId) || !FASES.includes(fase)) return { error: "Orden o fase inválida." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "ven_ordenes", [ordenId]);
    if (acceso) return { error: acceso };
    return await moverFase(ordenId, fase, cambio, usuario.nombre ?? usuario.email);
  } catch (e) {
    return falla(e);
  }
}

/** Despacha varias órdenes confirmadas con el mismo mensajero o transportadora (cada una con su guía si se pasa). */
export async function despacharVarias(ids: string[], cambio: CambioFase, guias: Record<string, string> = {}): Promise<Resultado> {
  try {
    await requireModuloEscritura(MODULO);
    const lista = [...new Set(ids)].filter((x) => UUID.test(x)).slice(0, 200);
    if (!lista.length) return { error: "No elegiste órdenes." };
    let hechas = 0;
    const errores: string[] = [];
    for (const id of lista) {
      const r = await cambiarFase(id, "despachada", { ...cambio, guia: guias[id] ?? cambio.guia ?? null });
      if ("error" in r) errores.push(r.error);
      else hechas++;
    }
    return { ok: true, aviso: `${hechas} despachadas${errores.length ? `, ${errores.length} no se pudieron: ${errores[0]}` : ""}.` };
  } catch (e) {
    return falla(e);
  }
}

/** Confirma varias órdenes a la vez (solo las que están por confirmar). */
export async function confirmarVarias(ids: string[]): Promise<Resultado> {
  try {
    await requireModuloEscritura(MODULO);
    const lista = [...new Set(ids)].filter((x) => UUID.test(x)).slice(0, 200);
    if (!lista.length) return { error: "No elegiste órdenes." };
    let hechas = 0;
    let fallas = 0;
    for (const id of lista) {
      const r = await cambiarFase(id, "confirmada");
      if ("error" in r) fallas++;
      else hechas++;
    }
    return { ok: true, aviso: `${hechas} confirmadas${fallas ? `, ${fallas} no se pudieron` : ""}.` };
  } catch (e) {
    return falla(e);
  }
}

/** El mensajero (o la transportadora) devuelve plata contra entrega de varias órdenes: todo o nada. */
export async function registrarRemesa(datos: {
  repartidorId?: string | null;
  transportista?: string | null;
  fecha: string;
  referencia?: string | null;
  metodo: string;
  nota?: string | null;
  /** Cuenta del libro: si viene, la remesa se asienta como flujo y el banco la puede emparejar. */
  cuentaId?: string | null;
  ordenes: { orden_id: string; monto: number }[];
}): Promise<Resultado> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return { error: "Fecha inválida." };
    if (!["efectivo", "yappy", "transferencia", "otro"].includes(datos.metodo)) return { error: "Método inválido." };
    const items = (datos.ordenes ?? []).filter((x) => UUID.test(x.orden_id) && Number(x.monto) > 0).slice(0, 300);
    if (!items.length) return { error: "No hay montos para registrar." };
    const repartidor = datos.repartidorId && UUID.test(datos.repartidorId) ? datos.repartidorId : null;
    const transportista = texto(datos.transportista, 80);
    if (!repartidor && !transportista) return { error: "Indica quién devolvió la plata." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "ven_ordenes", items.map((x) => x.orden_id));
    if (acceso) return { error: acceso };
    const quien = usuario.nombre ?? usuario.email;
    const cuentaId = datos.cuentaId && UUID.test(datos.cuentaId) ? datos.cuentaId : null;
    if (cuentaId) {
      if (!usuario.modulos.includes("libro-movimientos") || usuario.modulosSoloLectura.includes("libro-movimientos")) return { error: "Para asentarla en el libro hace falta poder modificar el Libro de movimientos." };
      const [{ data: cta }, { data: cf }] = await Promise.all([
        supabase.from("fin_cuentas").select("id").eq("id", cuentaId).eq("activo", true).maybeSingle(),
        supabase.from("fin_cierres").select("estado").eq("periodo", `${datos.fecha.slice(0, 7)}-01`).maybeSingle(),
      ]);
      if (!cta) return { error: "Esa cuenta ya no existe." };
      if (cf?.estado === "cerrado") return { error: "Ese mes está cerrado en finanzas: usa una fecha de un mes abierto." };
    }
    const { data: cierres } = await supabase.from("ven_cierres").select("periodo");
    if (mesCerrado(datos.fecha, ((cierres ?? []) as { periodo: string }[]).map((c) => c.periodo))) return { error: "Ese mes está cerrado: usa una fecha de un mes abierto." };
    const { data, error } = await supabase.rpc("ven_registrar_remesa", {
      p_repartidor: repartidor,
      p_transportista: transportista,
      p_fecha: datos.fecha,
      p_referencia: texto(datos.referencia, 80),
      p_metodo: datos.metodo,
      p_nota: texto(datos.nota, 300),
      p_usuario: quien,
      p_ordenes: items.map((x) => ({ orden_id: x.orden_id, monto: Math.round(Number(x.monto) * 100) / 100 })),
    });
    if (error) return { error: error.message.replace(/^.*?exception:\s*/i, "") };
    const total = items.reduce((a, x) => a + Number(x.monto), 0);
    let aviso: string | undefined;
    if (cuentaId) {
      const { error: errLibro } = await supabase.rpc("ven_remesa_al_libro", { p_remesa: data, p_cuenta: cuentaId });
      if (errLibro) aviso = `Remesa registrada, pero no quedó en el libro: ${errLibro.message.replace(/^.*?exception:\s*/i, "")}`;
      else revalidatePath("/libro-movimientos", "layout");
    }
    await registrarAuditoria({ accion: "remesa_cod", entidad: "ven_cod_remesas", entidadId: String(data), detalle: `Remesa de ${total.toFixed(2)} (${items.length} órdenes)${cuentaId && !aviso ? ", asentada en el libro" : ""}` });
    revalidatePath(RUTA);
    return { ok: true, aviso };
  } catch (e) {
    return falla(e);
  }
}
