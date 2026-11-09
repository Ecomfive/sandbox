"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { sinAccesoARegistros, sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { createServiceClient } from "@/lib/supabase/server";
import { RESULTADOS_CONTACTO, esFranja, etiquetaFranja, limpiarEtiquetasOrden, horaLocalPais, dentroDeHorario, leerUmbrales, repartirEntrePersonas, type PaisOp, type ResultadoContacto } from "@/lib/ventas/operacion";
import { avisarOrden } from "@/lib/ventas/avisar-whatsapp";
import { type PlantillaAviso } from "@/lib/ventas/chatmaid";
import { reingresar } from "@/lib/ventas/stock";
import { hashToken, nuevoToken } from "@/lib/ventas/mensajero";

const MODULO = "ventas-tiendas";
const RUTA = "/ventas-tiendas/pipeline";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Resultado = { error: string } | { ok: true; aviso?: string };
const falla = (e: unknown): { error: string } => ({ error: e instanceof Error ? e.message : "No se pudo guardar." });
const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const falta0957 = (m: string) => (/ven_(orden_contactos|orden_notas|cobertura|mensajero_config|incidencias|cierres|aprobaciones|clientes_lista|config|devoluciones)|asignada_a|congelada|anulada/.test(m) ? "Falta correr la migración 0957 en Supabase." : m);

/** Revisa permiso de escritura y acceso a la orden; devuelve quién actúa y el cliente de base de datos. */
async function entrar(ordenId: string) {
  const usuario = await requireModuloEscritura(MODULO);
  if (!UUID.test(ordenId)) throw new Error("Orden inválida.");
  const supabase = createServiceClient();
  const acceso = await sinAccesoARegistros(supabase, "ven_ordenes", [ordenId]);
  if (acceso) throw new Error(acceso);
  return { supabase, quien: usuario.nombre ?? usuario.email ?? "—" };
}

async function evento(supabase: ReturnType<typeof createServiceClient>, ordenId: string, detalle: string, quien: string) {
  await supabase.from("ven_orden_eventos").insert({ orden_id: ordenId, tipo: "nota", detalle, usuario: quien });
}

/** Anota un intento de contacto con el cliente (llamada o WhatsApp) y su resultado. */
export async function registrarContacto(ordenId: string, canal: string, resultado: string, nota?: string | null): Promise<Resultado> {
  try {
    const { supabase, quien } = await entrar(ordenId);
    if (!["llamada", "whatsapp", "sms", "otro"].includes(canal)) return { error: "Canal inválido." };
    if (!(RESULTADOS_CONTACTO as readonly string[]).includes(resultado)) return { error: "Resultado inválido." };
    const { error } = await supabase.from("ven_orden_contactos").insert({ orden_id: ordenId, canal, resultado: resultado as ResultadoContacto, nota: texto(nota, 300), por: quien });
    if (error) return { error: falta0957(error.message) };
    if (resultado === "cambio_datos") await supabase.from("ven_ordenes").update({ confirmada_con_cambios: true }).eq("id", ordenId);
    await evento(supabase, ordenId, `Contacto por ${canal}: ${resultado.replace("_", " ")}${nota ? ` · ${String(nota).slice(0, 120)}` : ""}`, quien);
    const { data: o } = await supabase.from("ven_ordenes").select("unidad_id").eq("id", ordenId).maybeSingle();
    let aviso: string | undefined;
    if (o) {
      const { data: u } = await supabase.from("fin_unidades").select("pais").eq("id", o.unidad_id).maybeSingle();
      const pais = (u?.pais as PaisOp | undefined) ?? "PA";
      const { data: cfg } = await supabase.from("ven_config").select("valor").eq("clave", "horario_contacto").maybeSingle();
      const h = (cfg?.valor as Record<string, { desde: number; hasta: number }> | undefined)?.[pais];
      if (!dentroDeHorario(horaLocalPais(pais), h?.desde, h?.hasta)) aviso = "Ojo: es fuera del horario de contacto de ese país.";
    }
    revalidatePath(RUTA);
    return { ok: true, aviso };
  } catch (e) {
    return falla(e);
  }
}

export async function agregarNota(ordenId: string, textoNota: string, menciones: string[] = []): Promise<Resultado> {
  try {
    const { supabase, quien } = await entrar(ordenId);
    const t = texto(textoNota, 2000);
    if (!t) return { error: "Escribe la nota." };
    const { error } = await supabase.from("ven_orden_notas").insert({ orden_id: ordenId, texto: t, autor: quien, menciones: menciones.filter((m) => typeof m === "string").slice(0, 10) });
    if (error) return { error: falta0957(error.message) };
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

/** Pone o quita al cliente de la orden en la lista negra o blanca (por su teléfono). */
export async function marcarClienteLista(ordenId: string, tipo: "negra" | "blanca" | null, nota?: string | null): Promise<Resultado> {
  try {
    const { supabase, quien } = await entrar(ordenId);
    const { data: c } = await supabase.from("ven_ordenes_clientes").select("telefono_clave").eq("orden_id", ordenId).maybeSingle();
    const clave = c?.telefono_clave as string | null | undefined;
    if (!clave) return { error: "La orden no tiene un teléfono válido guardado." };
    const r = tipo
      ? await supabase.from("ven_clientes_lista").upsert({ telefono_clave: clave, tipo, nota: texto(nota, 200), por: quien }, { onConflict: "telefono_clave" })
      : await supabase.from("ven_clientes_lista").delete().eq("telefono_clave", clave);
    if (r.error) return { error: falta0957(r.error.message) };
    await registrarAuditoria({ accion: "lista_cliente_venta", entidad: "ven_clientes_lista", entidadId: ordenId, detalle: tipo ? `Lista ${tipo}` : "Quitó de la lista" });
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

/** Congela una orden (no se puede mover) mientras se aclara algo; con motivo vacío la descongela. */
export async function congelarOrden(ordenId: string, motivo: string | null): Promise<Resultado> {
  try {
    const { supabase, quien } = await entrar(ordenId);
    const m = texto(motivo, 200);
    const { error } = await supabase.from("ven_ordenes").update({ congelada: !!m, congelada_motivo: m }).eq("id", ordenId);
    if (error) return { error: falta0957(error.message) };
    await evento(supabase, ordenId, m ? `Congelada: ${m}` : "Descongelada", quien);
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

/** Etiquetas y franja horaria de entrega de una orden (mejora 54, migración 0968). */
export async function guardarEtiquetasFranja(ordenId: string, etiquetas: unknown, franja: unknown): Promise<Resultado> {
  try {
    const { supabase, quien } = await entrar(ordenId);
    const lista = limpiarEtiquetasOrden(etiquetas);
    const f = franja === "" || franja === null || franja === undefined ? null : esFranja(franja) ? franja : undefined;
    if (f === undefined) return { error: "Franja inválida." };
    const { error } = await supabase.from("ven_ordenes").update({ etiquetas_equipo: lista, franja: f }).eq("id", ordenId);
    if (error) return { error: /etiquetas_equipo|franja/.test(error.message) ? "Falta correr la migración 0968 en Supabase." : error.message };
    await evento(supabase, ordenId, `Etiquetas: ${lista.join(", ") || "ninguna"} · entrega: ${etiquetaFranja(f)}`, quien);
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

/** Asigna las órdenes a una persona de confirmación; con `repartir` las reparte parejo entre varias. */
export async function asignarConfirmacion(ordenIds: string[], personas: string[]): Promise<Resultado> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const ids = [...new Set(ordenIds)].filter((x) => UUID.test(x)).slice(0, 500);
    const nombres = [...new Set(personas.map((p) => texto(p, 80)).filter((p): p is string => !!p))].slice(0, 20);
    if (!ids.length || !nombres.length) return { error: "Elige órdenes y a quién asignarlas." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "ven_ordenes", ids);
    if (acceso) return { error: acceso };
    const { data: ya } = await supabase.from("ven_ordenes").select("asignada_a").eq("fase", "por_confirmar").not("asignada_a", "is", null);
    const cuenta = new Map<string, number>();
    for (const r of (ya ?? []) as { asignada_a: string }[]) cuenta.set(r.asignada_a, (cuenta.get(r.asignada_a) ?? 0) + 1);
    const plan = repartirEntrePersonas(ids, nombres.map((n) => ({ nombre: n, ya: cuenta.get(n) ?? 0 })));
    for (const [id, nombre] of plan) {
      const { error } = await supabase.from("ven_ordenes").update({ asignada_a: nombre }).eq("id", id);
      if (error) return { error: falta0957(error.message) };
    }
    await registrarAuditoria({ accion: "asignar_confirmacion", entidad: "ven_ordenes", entidadId: ids[0], detalle: `${ids.length} órdenes → ${nombres.join(", ")} (${usuario.nombre ?? usuario.email})` });
    revalidatePath(RUTA);
    return { ok: true, aviso: `${ids.length} órdenes asignadas.` };
  } catch (e) {
    return falla(e);
  }
}

/** Cambia con quién se envía una orden ya confirmada o despachada, dejando el motivo. */
export async function reasignarEnvio(ordenId: string, repartidorId: string | null, transportista: string | null, motivo: string): Promise<Resultado> {
  try {
    const { supabase, quien } = await entrar(ordenId);
    const m = texto(motivo, 200);
    if (!m) return { error: "Anota por qué se cambia." };
    if (!repartidorId && !texto(transportista, 80)) return { error: "Elige el mensajero o la transportadora." };
    if (repartidorId && !UUID.test(repartidorId)) return { error: "Mensajero inválido." };
    const { data: o } = await supabase.from("ven_ordenes").select("fase, congelada").eq("id", ordenId).maybeSingle();
    if (!o || !["confirmada", "despachada", "fallida"].includes(String(o.fase))) return { error: "Solo se reasigna una orden confirmada o en camino." };
    if (o.congelada) return { error: "La orden está congelada." };
    let nombre = texto(transportista, 80);
    if (repartidorId) {
      const { data: rep } = await supabase.from("del_repartidores").select("nombre, activo").eq("id", repartidorId).maybeSingle();
      if (!rep?.activo) return { error: "Ese mensajero no existe o está inactivo." };
      nombre = String(rep.nombre);
    }
    const { error } = await supabase.from("ven_ordenes").update({ repartidor_id: repartidorId, transportista: repartidorId ? nombre : texto(transportista, 80) }).eq("id", ordenId);
    if (error) return { error: error.message };
    await evento(supabase, ordenId, `Reasignada a ${nombre}: ${m}`, quien);
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

// ---------- Cobertura y mensajeros ----------

export async function guardarCobertura(d: { pais: string; zona: string; repartidorId?: string | null; transportista?: string | null; tarifa?: number | null; prioridad?: number }): Promise<Resultado> {
  try {
    await requireModuloEscritura(MODULO);
    const denegado = await sinAccesoTodaLaEmpresa();
    if (denegado) return { error: denegado };
    const zona = texto(d.zona, 80);
    if (!zona || !["PA", "CR", "MX"].includes(d.pais)) return { error: "Indica el país y la zona." };
    const rep = d.repartidorId && UUID.test(d.repartidorId) ? d.repartidorId : null;
    const trans = texto(d.transportista, 80);
    if (!rep && !trans) return { error: "Elige un mensajero o una transportadora." };
    const tarifa = d.tarifa === null || d.tarifa === undefined || d.tarifa === ("" as unknown) ? null : Number(d.tarifa);
    if (tarifa !== null && (!Number.isFinite(tarifa) || tarifa < 0)) return { error: "Tarifa inválida." };
    const { error } = await createServiceClient().from("ven_cobertura").insert({ pais: d.pais, zona, repartidor_id: rep, transportista: trans, tarifa, prioridad: Math.min(Math.max(Math.round(d.prioridad ?? 1), 1), 9) });
    if (error) return { error: /duplicate/.test(error.message) ? "Esa zona ya está asignada a esa persona." : falta0957(error.message) };
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

export async function borrarCobertura(id: string): Promise<Resultado> {
  try {
    await requireModuloEscritura(MODULO);
    const denegado = await sinAccesoTodaLaEmpresa();
    if (denegado) return { error: denegado };
    if (!UUID.test(id)) return { error: "Cobertura inválida." };
    const { error } = await createServiceClient().from("ven_cobertura").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

export async function guardarConfigMensajero(repartidorId: string, d: { capacidad?: number | null; limiteEfectivo?: number | null; comision?: number | null }): Promise<Resultado> {
  try {
    await requireModuloEscritura(MODULO);
    const denegado = await sinAccesoTodaLaEmpresa();
    if (denegado) return { error: denegado };
    if (!UUID.test(repartidorId)) return { error: "Mensajero inválido." };
    const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
    const cap = num(d.capacidad);
    const lim = num(d.limiteEfectivo);
    const com = num(d.comision);
    if ((cap !== null && (!Number.isInteger(cap) || cap <= 0)) || (lim !== null && !(lim > 0)) || (com !== null && !(com >= 0))) return { error: "Revisa los números." };
    const { error } = await createServiceClient().from("ven_mensajero_config").upsert({ repartidor_id: repartidorId, capacidad_diaria: cap, limite_efectivo: lim, comision_entrega: com, actualizado_en: new Date().toISOString() }, { onConflict: "repartidor_id" });
    if (error) return { error: falta0957(error.message) };
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

// ---------- Tienda ----------

export async function guardarAjustesTienda(unidadId: string, d: { pausada?: boolean; bodegaId?: string | null; pasarelaPct?: number; pasarelaFijo?: number; itbmsTasa?: number }): Promise<Resultado> {
  try {
    await requireModuloEscritura(MODULO);
    const denegado = await sinAccesoTodaLaEmpresa();
    if (denegado) return { error: denegado };
    if (!UUID.test(unidadId)) return { error: "Tienda inválida." };
    const set: Record<string, unknown> = {};
    if (d.pausada !== undefined) set.pausada = !!d.pausada;
    if (d.bodegaId !== undefined) {
      if (d.bodegaId && !UUID.test(d.bodegaId)) return { error: "Bodega inválida." };
      set.bodega_id = d.bodegaId || null;
    }
    for (const [k, col, max] of [["pasarelaPct", "pasarela_pct", 20], ["pasarelaFijo", "pasarela_fijo", 5], ["itbmsTasa", "itbms_tasa", 0.5]] as const) {
      const v = d[k];
      if (v === undefined) continue;
      if (!Number.isFinite(v) || v < 0 || v > max) return { error: `Valor fuera de rango en ${col}.` };
      set[col] = v;
    }
    const { error } = await createServiceClient().from("ven_tiendas_conexion").update(set).eq("unidad_id", unidadId);
    if (error) return { error: falta0957(error.message) };
    await registrarAuditoria({ accion: "ajustes_tienda_shopify", entidad: "ven_tiendas_conexion", entidadId: unidadId, detalle: Object.keys(set).join(", ") });
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

// ---------- Incidencias, devoluciones, cierre, aprobaciones ----------

export async function crearIncidencia(ordenId: string, d: { tipo: string; descripcion?: string | null; costo?: number; responsable?: string | null }): Promise<Resultado> {
  try {
    const { supabase, quien } = await entrar(ordenId);
    if (!["producto_danado", "paquete_perdido", "faltante_efectivo", "direccion_erronea", "otro"].includes(d.tipo)) return { error: "Tipo inválido." };
    const costo = Number(d.costo ?? 0);
    if (!Number.isFinite(costo) || costo < 0) return { error: "Costo inválido." };
    const { error } = await supabase.from("ven_incidencias").insert({ orden_id: ordenId, tipo: d.tipo, descripcion: texto(d.descripcion, 400), costo, responsable: texto(d.responsable, 80), creada_por: quien });
    if (error) return { error: falta0957(error.message) };
    await evento(supabase, ordenId, `Incidencia: ${d.tipo.replace("_", " ")}${costo ? ` · ${costo.toFixed(2)}` : ""}`, quien);
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

export async function resolverIncidencia(id: string): Promise<Resultado> {
  try {
    await requireModuloEscritura(MODULO);
    if (!UUID.test(id)) return { error: "Incidencia inválida." };
    const supabase = createServiceClient();
    const { data: inc } = await supabase.from("ven_incidencias").select("orden_id").eq("id", id).maybeSingle();
    if (!inc) return { error: "No encontré la incidencia." };
    const acceso = await sinAccesoARegistros(supabase, "ven_ordenes", [String(inc.orden_id)]);
    if (acceso) return { error: acceso };
    const { error } = await supabase.from("ven_incidencias").update({ estado: "resuelta", resuelta_en: new Date().toISOString() }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

/** Recibe en bodega una orden devuelta y decide qué pasa con el producto (reingresar, dañado o descartar). */
export async function recibirDevolucion(ordenId: string, decision: string, nota?: string | null): Promise<Resultado> {
  try {
    const { supabase, quien } = await entrar(ordenId);
    if (!["reingresar", "danado", "descartar"].includes(decision)) return { error: "Decisión inválida." };
    const { data: o } = await supabase.from("ven_ordenes").select("numero, unidad_id, fase, stock_descontado").eq("id", ordenId).maybeSingle();
    if (!o || o.fase !== "devuelta") return { error: "Solo se recibe una orden devuelta." };
    const { data: ya } = await supabase.from("ven_devoluciones_recepcion").select("orden_id").eq("orden_id", ordenId).maybeSingle();
    if (ya) return { error: "Esta devolución ya se recibió." };
    let aviso: string | undefined;
    if (decision === "reingresar" && o.stock_descontado) {
      const r = await reingresar(supabase, String(o.unidad_id), ordenId, String(o.numero));
      if (r.error) return { error: `Inventario: ${r.error}` };
      aviso = r.aviso;
    }
    const { error } = await supabase.from("ven_devoluciones_recepcion").insert({ orden_id: ordenId, decision, nota: texto(nota, 300), recibida_por: quien });
    if (error) return { error: falta0957(error.message) };
    await evento(supabase, ordenId, `Devolución recibida: ${decision}`, quien);
    revalidatePath(RUTA);
    return { ok: true, aviso };
  } catch (e) {
    return falla(e);
  }
}

/** Cierra un mes (primer día): después no se mueven sus órdenes ni se anotan remesas con fecha de ese mes. */
export async function cerrarMes(periodo: string): Promise<Resultado> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const denegado = await sinAccesoTodaLaEmpresa();
    if (denegado) return { error: denegado };
    if (!/^\d{4}-\d{2}-01$/.test(periodo)) return { error: "Mes inválido." };
    const hoy = new Date().toISOString().slice(0, 7) + "-01";
    if (periodo >= hoy) return { error: "Solo se cierra un mes que ya terminó." };
    const { error } = await createServiceClient().from("ven_cierres").upsert({ periodo, pais: "TODOS", cerrado_por: usuario.nombre ?? usuario.email }, { onConflict: "periodo,pais" });
    if (error) return { error: falta0957(error.message) };
    await registrarAuditoria({ accion: "cerrar_mes_ventas", entidad: "ven_cierres", entidadId: periodo, detalle: `Cerró ${periodo.slice(0, 7)}` });
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

/** Anula una remesa mal registrada (con motivo). Si el monto pasa del umbral, otra persona debe aprobarlo antes. */
export async function anularRemesa(remesaId: string, motivo: string): Promise<Resultado> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (!UUID.test(remesaId)) return { error: "Remesa inválida." };
    const m = texto(motivo, 300);
    if (!m || m.length < 5) return { error: "Anota por qué se anula (5 letras o más)." };
    const supabase = createServiceClient();
    const quien = usuario.nombre ?? usuario.email ?? "—";
    const { data: r } = await supabase.from("ven_cod_remesas").select("total, anulada_en").eq("id", remesaId).maybeSingle();
    if (!r) return { error: "No encontré la remesa." };
    if (r.anulada_en) return { error: "Ya está anulada." };
    const { data: ords } = await supabase.from("ven_cod_remesa_ordenes").select("orden_id").eq("remesa_id", remesaId);
    const acceso = await sinAccesoARegistros(supabase, "ven_ordenes", ((ords ?? []) as { orden_id: string }[]).map((x) => x.orden_id));
    if (acceso) return { error: acceso };
    const { data: cfg } = await supabase.from("ven_config").select("valor").eq("clave", "umbrales").maybeSingle();
    const u = leerUmbrales(cfg?.valor);
    if (Number(r.total) >= u.montoAprobacion) {
      const { data: ok } = await supabase.from("ven_aprobaciones").select("id, solicitada_por, resuelta_por").eq("accion", "anular_remesa").eq("referencia", remesaId).eq("estado", "aprobada").maybeSingle();
      if (!ok) {
        const { data: pend } = await supabase.from("ven_aprobaciones").select("id").eq("accion", "anular_remesa").eq("referencia", remesaId).eq("estado", "pendiente").maybeSingle();
        if (!pend) await supabase.from("ven_aprobaciones").insert({ accion: "anular_remesa", referencia: remesaId, detalle: m, monto: Number(r.total), solicitada_por: quien });
        revalidatePath(RUTA);
        return { ok: true, aviso: "Por el monto, otra persona debe aprobar la anulación antes de aplicarse." };
      }
    }
    const { error } = await supabase.rpc("ven_anular_remesa", { p_remesa: remesaId, p_motivo: m, p_usuario: quien });
    if (error) return { error: falta0957(error.message.replace(/^.*?exception:\s*/i, "")) };
    await registrarAuditoria({ accion: "anular_remesa_cod", entidad: "ven_cod_remesas", entidadId: remesaId, detalle: m });
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

/** Una persona distinta a quien lo pidió aprueba o rechaza una acción pendiente. Aprobar no la aplica: se vuelve a pulsar. */
export async function resolverAprobacion(id: string, aprobar: boolean): Promise<Resultado> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const denegado = await sinAccesoTodaLaEmpresa();
    if (denegado) return { error: denegado };
    if (!UUID.test(id)) return { error: "Aprobación inválida." };
    const supabase = createServiceClient();
    const quien = usuario.nombre ?? usuario.email ?? "—";
    const { data: a } = await supabase.from("ven_aprobaciones").select("solicitada_por, estado").eq("id", id).maybeSingle();
    if (!a || a.estado !== "pendiente") return { error: "Ya no está pendiente." };
    if (a.solicitada_por === quien) return { error: "Otra persona debe aprobarla: no puedes aprobar lo que pediste." };
    const { error } = await supabase.from("ven_aprobaciones").update({ estado: aprobar ? "aprobada" : "rechazada", resuelta_por: quien, resuelta_en: new Date().toISOString() }).eq("id", id).eq("estado", "pendiente");
    if (error) return { error: error.message };
    await registrarAuditoria({ accion: aprobar ? "aprobar_accion_venta" : "rechazar_accion_venta", entidad: "ven_aprobaciones", entidadId: id });
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

export interface DetalleOrden {
  contactos: { canal: string; resultado: string; nota: string | null; por: string | null; en: string }[];
  notas: { texto: string; autor: string | null; en: string }[];
  eventos: { tipo: string; detalle: string | null; de: string | null; a: string | null; por: string | null; en: string; monto: number | null }[];
  incidencias: { id: string; tipo: string; descripcion: string | null; costo: number; estado: string }[];
  lista: "negra" | "blanca" | null;
  whatsapp: { direccion: string; plantilla: string | null; cuerpo: string | null; estado: string; error: string | null; por: string | null; en: string }[];
  /** Mejora 54; null = falta la migración 0968. */
  etiquetas: string[] | null;
  franja: string | null;
}

/** Manda un aviso por WhatsApp al cliente de la orden (el teléfono no sale del servidor). */
export async function enviarWhatsappOrden(ordenId: string, plantilla: PlantillaAviso): Promise<Resultado> {
  try {
    const { supabase, quien } = await entrar(ordenId);
    const r = await avisarOrden(supabase, ordenId, plantilla, quien);
    if ("error" in r) return { error: r.error };
    await registrarAuditoria({ accion: "whatsapp_orden_venta", entidad: "ven_ordenes", entidadId: ordenId, detalle: `Aviso ${plantilla}` });
    revalidatePath(RUTA);
    return { ok: true };
  } catch (e) {
    return falla(e);
  }
}

/** Historial completo de una orden: contactos, notas, línea de tiempo e incidencias (sin datos del cliente). */
export async function obtenerDetalleOrden(ordenId: string): Promise<DetalleOrden | { error: string }> {
  try {
    await requireModulo(MODULO);
    if (!UUID.test(ordenId)) return { error: "Orden inválida." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "ven_ordenes", [ordenId]);
    if (acceso) return { error: acceso };
    const [c, n, e, i, cl, w] = await Promise.all([
      supabase.from("ven_orden_contactos").select("canal, resultado, nota, por, creado_en").eq("orden_id", ordenId).order("creado_en", { ascending: false }).limit(50),
      supabase.from("ven_orden_notas").select("texto, autor, creado_en").eq("orden_id", ordenId).order("creado_en", { ascending: false }).limit(50),
      supabase.from("ven_orden_eventos").select("tipo, detalle, fase_antes, fase_despues, usuario, creado_en, monto").eq("orden_id", ordenId).order("creado_en", { ascending: false }).limit(100),
      supabase.from("ven_incidencias").select("id, tipo, descripcion, costo, estado").eq("orden_id", ordenId).order("creado_en", { ascending: false }),
      supabase.from("ven_ordenes_clientes").select("telefono_clave").eq("orden_id", ordenId).maybeSingle(),
      supabase.from("ven_whatsapp_mensajes").select("direccion, plantilla, cuerpo, estado, error, por, creado_en").eq("orden_id", ordenId).order("creado_en", { ascending: false }).limit(30),
    ]);
    if (c.error) return { error: falta0957(c.error.message) };
    const ef = await supabase.from("ven_ordenes").select("etiquetas_equipo, franja").eq("id", ordenId).maybeSingle();
    let lista: "negra" | "blanca" | null = null;
    const clave = cl.data?.telefono_clave as string | null | undefined;
    if (clave) {
      const { data: l } = await supabase.from("ven_clientes_lista").select("tipo").eq("telefono_clave", clave).maybeSingle();
      lista = (l?.tipo as "negra" | "blanca" | undefined) ?? null;
    }
    return {
      contactos: ((c.data ?? []) as { canal: string; resultado: string; nota: string | null; por: string | null; creado_en: string }[]).map((x) => ({ canal: x.canal, resultado: x.resultado, nota: x.nota, por: x.por, en: x.creado_en })),
      notas: ((n.data ?? []) as { texto: string; autor: string | null; creado_en: string }[]).map((x) => ({ texto: x.texto, autor: x.autor, en: x.creado_en })),
      eventos: ((e.data ?? []) as { tipo: string; detalle: string | null; fase_antes: string | null; fase_despues: string | null; usuario: string | null; creado_en: string; monto: number | string | null }[]).map((x) => ({ tipo: x.tipo, detalle: x.detalle, de: x.fase_antes, a: x.fase_despues, por: x.usuario, en: x.creado_en, monto: x.monto === null ? null : Number(x.monto) })),
      incidencias: ((i.data ?? []) as { id: string; tipo: string; descripcion: string | null; costo: number | string; estado: string }[]).map((x) => ({ id: x.id, tipo: x.tipo, descripcion: x.descripcion, costo: Number(x.costo), estado: x.estado })),
      lista,
      whatsapp: ((w.data ?? []) as { direccion: string; plantilla: string | null; cuerpo: string | null; estado: string; error: string | null; por: string | null; creado_en: string }[]).map((x) => ({ direccion: x.direccion, plantilla: x.plantilla, cuerpo: x.cuerpo, estado: x.estado, error: x.error, por: x.por, en: x.creado_en })),
      etiquetas: ef.error ? null : ((ef.data?.etiquetas_equipo as string[] | null) ?? []),
      franja: ef.error ? null : ((ef.data?.franja as string | null) ?? null),
    };
  } catch (e) {
    return falla(e);
  }
}

/** Crea (o reemplaza) el enlace secreto de la web app de un mensajero. El código se devuelve una sola vez: en la base solo queda su hash. */
export async function generarEnlaceMensajero(repartidorId: string): Promise<{ error: string } | { token: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const denegado = await sinAccesoTodaLaEmpresa();
    if (denegado) return { error: denegado };
    if (!UUID.test(repartidorId)) return { error: "Mensajero inválido." };
    const supabase = createServiceClient();
    const { data: rep } = await supabase.from("del_repartidores").select("id, nombre, activo").eq("id", repartidorId).maybeSingle();
    if (!rep || !rep.activo) return { error: "Mensajero no encontrado o inactivo." };
    const token = nuevoToken();
    const { error } = await supabase.from("ven_mensajero_enlaces").upsert({ repartidor_id: repartidorId, token_hash: hashToken(token), creado_por: usuario.nombre ?? usuario.email, creado_en: new Date().toISOString(), ultimo_uso: null }, { onConflict: "repartidor_id" });
    if (error) return { error: error.message.includes("ven_mensajero_enlaces") ? "Falta correr la migración 0961." : error.message };
    await registrarAuditoria({ accion: "enlace_mensajero", entidad: "del_repartidores", entidadId: repartidorId, detalle: `Nuevo enlace de la app para ${rep.nombre}` });
    return { token };
  } catch (e) {
    return falla(e);
  }
}
