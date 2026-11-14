"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { autorizadaParaSalidaManual } from "@/lib/permisos/salida-manual";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { indexar, parecidos, todasLasCoincidencias } from "@/lib/scraping/cruces";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { revisarCajas } from "@/lib/wms/cajas";
import { pideMotivo, puedeMoverAMano, SOLO_ADMIN_MOVIMIENTO } from "@/lib/wms/recepcion";
import { numeroTraslado } from "@/lib/wms/traslado";
import { itemsParaSumar, MAX_LINEAS_IMPORTADAS, revisarConteo, revisarTransferencias, varianteDeLinea, type ItemConteo } from "@/lib/wms/levantamiento";

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;

const revisarLista = (lista: unknown): { items: ItemConteo[] } | { error: string } => (Array.isArray(lista) && lista.length === 0 ? { items: [] } : revisarConteo(lista));

const refrescar = () => {
  revalidatePath("/inventario");
  revalidatePath("/inventario/levantamiento");
  revalidatePath("/inventario/remisiones");
};

/** Lo que ya quedó guardado cuando un paso posterior falla: la pantalla suelta lo guardado y deja escrito solo lo que falta. */
export interface HechoLevantamiento {
  contados: boolean;
  sumas: boolean;
  restas: boolean;
  /** Los productos ya transferidos. */
  trasladados: string[];
}

export interface ResultadoLevantamiento {
  error?: string;
  hecho?: HechoLevantamiento;
  productos?: number;
  ajustes?: number;
  cajas?: number;
  sumados?: number;
  restados?: number;
  /** Los números de los traslados hechos («TRA-0007»). */
  traslados?: string[];
}

/**
 * Guarda todo lo escrito en un levantamiento de una bodega propia, en este orden (7 nov 2026, pedido de Hernán: un solo botón para contar, añadir, restar y transferir): lo contado
 * deja cada producto en esa cantidad y la diferencia se anota como ajuste (`wms_registrar_conteo`, migración 0214); lo de `sumas` entra además de lo que ya había
 * (`wms_sumar_levantamiento`, 0235); lo de `restas` sale de lo que había (`wms_restar_levantamiento`, 0245; en Costa Rica una salida a mano es de un administrador y lleva motivo, la
 * referencia); y lo de `transferencias` pasa a otra bodega propia (`wms_crear_traslado`, 0235 y 0238: un traslado, con su número, por cada destino). Cada paso es todo o nada, pero no son
 * una sola transacción: si uno falla, `hecho` dice qué ya quedó guardado (se puede repetir sin problema). Devuelve el error como valor.
 */
export async function guardarLevantamiento(
  bodegaId: string,
  referencia: string,
  items: unknown,
  sumas: unknown,
  /** Las cajas de los productos que se tocaron (migración 0236): deben sumar lo que queda en la bodega. */
  cajas?: unknown,
  restas?: unknown,
  transferencias?: unknown,
): Promise<ResultadoLevantamiento> {
  const usuario = await requireModuloEscritura("inventario");
  if (!ES_ID.test(bodegaId)) return { error: "Elige la bodega." };
  const revisadasCajas = revisarCajas(cajas);
  if ("error" in revisadasCajas) return { error: revisadasCajas.error };
  const revisado = revisarLista(items);
  if ("error" in revisado) return { error: revisado.error };
  const revisadoSumas = revisarLista(sumas);
  if ("error" in revisadoSumas) return { error: revisadoSumas.error };
  const porSumar = itemsParaSumar(revisadoSumas.items);
  const revisadoRestas = revisarLista(restas);
  if ("error" in revisadoRestas) return { error: revisadoRestas.error };
  const porRestar = itemsParaSumar(revisadoRestas.items);
  const revisadoTraslados = revisarTransferencias(transferencias, bodegaId);
  if ("error" in revisadoTraslados) return { error: revisadoTraslados.error };
  const porTrasladar = revisadoTraslados.traslados;
  const contados = new Set(revisado.items.map((i) => i.sku));
  if (porSumar.some((i) => contados.has(i.sku))) return { error: "Un producto viene dos veces." };
  const ref = referencia.replace(/\s+/g, " ").trim().slice(0, 120);

  const supabase = createServiceClient();
  if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, bodegaId))) return { error: "No tienes acceso al país de esa bodega." };
  for (const t of porTrasladar) if (!(await puedeVerBodega(supabase, usuario.paisesPermitidos, t.destino))) return { error: "No tienes acceso al país de la bodega de destino." };
  const conCajas = revisadasCajas.cajas.length > 0;
  const conConteo = conCajas || revisado.items.length > 0;
  if (!conConteo && !porSumar.length && !porRestar.length && !porTrasladar.length) return { error: "No hay nada que guardar." };

  // Restar es una salida a mano: donde toda salida va con remisión (Costa Rica), es de un administrador y lleva motivo (la referencia).
  if (porRestar.length) {
    const { data: bodegaFila } = await supabase.from("wms_bodegas").select("paises(codigo)").eq("id", bodegaId).maybeSingle();
    const pais = bodegaFila?.paises as { codigo: string } | { codigo: string }[] | null | undefined;
    const codigoPais = (Array.isArray(pais) ? pais[0] : pais)?.codigo;
    if (!puedeMoverAMano("salida", codigoPais, autorizadaParaSalidaManual(usuario))) return { error: SOLO_ADMIN_MOVIMIENTO };
    if (pideMotivo("salida", codigoPais) && !ref) return { error: "Para restar, escribe el motivo en «Referencia»." };
  }

  const hecho: HechoLevantamiento = { contados: false, sumas: false, restas: false, trasladados: [] };
  const falla = (motivo: string): ResultadoLevantamiento => {
    if (hecho.contados || hecho.sumas || hecho.restas || hecho.trasladados.length) refrescar();
    const yaGuardado = [hecho.contados && "lo contado", hecho.sumas && "lo añadido", hecho.restas && "lo restado", hecho.trasladados.length > 0 && "lo transferido"].filter(Boolean);
    return { error: yaGuardado.length ? `Ya se guardó ${yaGuardado.join(", ")}, pero no el resto: ${motivo}` : motivo, hecho };
  };
  const motivoDe = (mensaje: string, funcion: string, migracion: string, generico: string) =>
    new RegExp(funcion).test(mensaje) ? `Falta correr la migración ${migracion} en la base.` : mensaje.length < 200 ? mensaje : generico;

  let r: { productos?: number; ajustes?: number; cajas?: number } = {};
  if (conConteo) {
    const { data, error } = conCajas
      ? await supabase.rpc("wms_registrar_conteo_cajas", { p_bodega: bodegaId, p_items: revisado.items, p_cajas: revisadasCajas.cajas, p_referencia: ref || null, p_usuario: usuario.id })
      : await supabase.rpc("wms_registrar_conteo", { p_bodega: bodegaId, p_items: revisado.items, p_referencia: ref || null, p_usuario: usuario.id });
    if (error) {
      if (/wms_registrar_conteo_cajas/.test(error.message)) return falla("Falta correr la migración 0236 en la base.");
      if (/wms_registrar_conteo/.test(error.message)) return falla("Falta correr la migración 0214 en la base.");
      return falla(error.message.length < 200 ? error.message : "No se pudo guardar el levantamiento.");
    }
    r = (data ?? {}) as typeof r;
    hecho.contados = true;
    await registrarAuditoria({
      accion: "levantamiento_inventario",
      entidad: "wms_bodegas",
      entidadId: bodegaId,
      detalle: `Levantamiento${ref ? ` «${ref}»` : ""}: ${r.productos ?? 0} productos contados, ${r.ajustes ?? 0} con diferencia${r.cajas ? `, cajas de ${r.cajas} productos` : ""}`,
    });
  }

  let sumados = 0;
  if (porSumar.length) {
    const { data, error } = await supabase.rpc("wms_sumar_levantamiento", { p_bodega: bodegaId, p_items: porSumar, p_referencia: ref || null, p_usuario: usuario.id });
    if (error) return falla(motivoDe(error.message, "wms_sumar_levantamiento", "0235", "No se pudo añadir."));
    sumados = ((data ?? {}) as { productos?: number }).productos ?? 0;
    hecho.sumas = true;
    await registrarAuditoria({ accion: "levantamiento_inventario", entidad: "wms_bodegas", entidadId: bodegaId, detalle: `Suma al inventario${ref ? ` «${ref}»` : ""}: ${sumados} productos` });
  }

  let restados = 0;
  if (porRestar.length) {
    const { data, error } = await supabase.rpc("wms_restar_levantamiento", { p_bodega: bodegaId, p_items: porRestar, p_referencia: ref || null, p_usuario: usuario.id });
    if (error) return falla(motivoDe(error.message, "wms_restar_levantamiento", "0245", "No se pudo restar."));
    restados = ((data ?? {}) as { productos?: number }).productos ?? 0;
    hecho.restas = true;
    await registrarAuditoria({ accion: "levantamiento_inventario", entidad: "wms_bodegas", entidadId: bodegaId, detalle: `Resta del inventario${ref ? ` «${ref}»` : ""}: ${restados} productos` });
  }

  const traslados: string[] = [];
  for (const t of porTrasladar) {
    const { data, error } = await supabase.rpc("wms_crear_traslado", {
      p_desde: bodegaId,
      p_hacia: t.destino,
      p_items: t.items,
      p_notas: ref || "Desde el levantamiento",
      p_usuario: usuario.id,
      p_nombre: usuario.nombre || usuario.email,
    });
    if (error) return falla(motivoDe(error.message, "wms_crear_traslado", "0235", "No se pudo transferir."));
    const creado = data as { id: string; numero: number };
    const numero = numeroTraslado(creado.numero);
    traslados.push(numero);
    hecho.trasladados.push(...t.items.map((i) => i.sku));
    const unidades = t.items.reduce((suma, i) => suma + i.cantidad, 0);
    await registrarAuditoria({
      accion: "traslado_inventario",
      entidad: "wms_traslados",
      entidadId: creado.id,
      detalle: `${numero}: ${t.items.length} ${t.items.length === 1 ? "producto" : "productos"}, ${unidades.toLocaleString("es-PA")} unidades · desde el levantamiento`,
    });
  }
  refrescar();
  revalidatePath("/inventario/traslados");
  return { productos: r.productos ?? 0, ajustes: r.ajustes ?? 0, cajas: r.cajas ?? 0, sumados, restados, traslados };
}

export interface SugerenciaLinea {
  /** El producto elegido de entrada (null si no se encontró ninguno). */
  skuId: string | null;
  /** «seguro»: el SKU o el nombre calzan; «revisar»: se parece pero conviene mirarlo; «sin»: no se encontró. */
  estado: "seguro" | "revisar" | "sin";
  /** Otros productos parecidos para elegir (el primero es el sugerido). */
  opciones: { id: string; codigo: string; nombre: string }[];
}

const normal = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Para «Importar lista» del levantamiento: busca el producto de cada línea (por SKU, por nombre igual o por parecido del nombre,
 * el mismo cruce de Testing Lab) entre los productos simples que no están en Test ni tienen variantes (se cuenta cada variante). No guarda nada.
 */
export async function sugerirProductosParaLista(nombres: string[]): Promise<{ sugerencias: SugerenciaLinea[] } | { error: string }> {
  await requireModulo("inventario");
  if (!Array.isArray(nombres) || nombres.length === 0) return { error: "La lista está vacía." };
  if (nombres.length > MAX_LINEAS_IMPORTADAS) return { error: `Son demasiadas líneas (máximo ${MAX_LINEAS_IMPORTADAS}).` };
  const supabase = createServiceClient();
  const { data, error } = await traerTodasConError<{ id: string; codigo: string; nombre: string; padre_id: string | null; opciones: Record<string, string> | null }>((d, h) =>
    supabase.from("skus_maestros").select("id, codigo, nombre, padre_id, opciones").neq("tipo", "combo").neq("clase", "test").is("opciones_variantes", null).order("codigo").range(d, h),
  );
  if (error || !data) return { error: "No se pudieron cargar los productos." };
  const porId = new Map(data.map((p) => [p.id, p]));
  const porCodigo = new Map(data.map((p) => [normal(p.codigo), p]));
  const porNombre = new Map(data.map((p) => [normal(p.nombre), p]));
  const indice = indexar(data.map((p) => ({ tipo: "producto" as const, id: p.id, nombre: p.nombre, huella: null, detalle: p.codigo })));
  const opcion = (id: string) => {
    const p = porId.get(id)!;
    return { id: p.id, codigo: p.codigo, nombre: p.nombre };
  };
  // Si lo encontrado es una variante, se elige la que dice la línea y se ofrecen todas sus hermanas (el parecido del nombre no distingue una talla de otra).
  const hermanasDe = new Map<string, typeof data>();
  for (const p of data) if (p.padre_id) hermanasDe.set(p.padre_id, [...(hermanasDe.get(p.padre_id) ?? []), p]);
  const conVariante = (nombre: string, ids: string[]): SugerenciaLinea | null => {
    const padre = porId.get(ids[0])?.padre_id;
    const hermanas = padre ? (hermanasDe.get(padre) ?? []) : [];
    if (!hermanas.length) return null;
    const id = varianteDeLinea(nombre, hermanas);
    return { skuId: id ?? hermanas[0].id, estado: id ? "seguro" : "revisar", opciones: hermanas.map((h) => opcion(h.id)) };
  };
  const sugerencias = nombres.map((bruto): SugerenciaLinea => {
    const nombre = String(bruto ?? "").slice(0, 200);
    const exacto = porCodigo.get(normal(nombre)) ?? porNombre.get(normal(nombre));
    if (exacto) return { skuId: exacto.id, estado: "seguro", opciones: [opcion(exacto.id)] };
    const iguales = todasLasCoincidencias(nombre, null, indice);
    if (iguales.length > 0) {
      const ids = [...new Set(iguales.map((c) => c.id))].slice(0, 5);
      const variante = conVariante(nombre, ids);
      if (variante) return variante;
      return { skuId: ids[0], estado: ids.length === 1 ? "seguro" : "revisar", opciones: ids.map(opcion) };
    }
    const cerca = [...new Set(parecidos(nombre, null, indice, 4).map((c) => c.id))];
    if (cerca.length > 0) return conVariante(nombre, cerca) ?? { skuId: cerca[0], estado: "revisar", opciones: cerca.map(opcion) };
    return { skuId: null, estado: "sin", opciones: [] };
  });
  return { sugerencias };
}
