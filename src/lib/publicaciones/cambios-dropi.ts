// La cola de cambios del sistema en Dropi (migración 0137): hoy, el nombre de un producto y el de su guía de envío, que deja «Usar
// este título» del Asistente de IA. Dropi rechaza (403) las llamadas que salen de un servidor, así que no se aplican desde aquí: los
// aplica el favorito «Aplicar en Dropi» desde la pestaña de Dropi (marcador-aplicar-dropi.ts) y la ventana que abre guarda el
// resultado (aplicar-actions.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatosCrearDropi, FotoCrear } from "./crear-dropi";
import { MAX_NOMBRE_DROPI } from "./dropi-guardado";
import { normalizarDatosPrivatizar, type DatosPrivatizar } from "./privatizar-dropi";
import { idsDeDropi } from "./sincronizar-dropi";
import { normalizarDatosStock, type DatosStock } from "./stock-dropi";

export type EstadoCambioDropi = "pendiente" | "aplicado" | "error" | "reemplazado";

/** El último cambio en Dropi de una publicación, para la ficha. */
export interface CambioDropiVista {
  id: string;
  /**
   * «cambio» = nombre, precios, descripción y/o fotos; «republicar» = crear el producto de nuevo en Dropi (migración 0145); «apagar» = sacar el
   * stock y archivar (0148); «archivar» = archivar o sacar de Archivados (0151); «crear» = publicar una publicación nueva en Dropi (0151);
   * «privatizar» = dejarle unidades del producto a un dropshipper en un producto privado nuevo (0155); «stock» = dejar una bodega con unas unidades (0173).
   */
  tipo: "cambio" | "republicar" | "apagar" | "archivar" | "crear" | "privatizar" | "stock";
  /** «stock»: la bodega, las unidades que deben quedar y las que había. */
  stock: DatosStock | null;
  /** «privatizar»: a quién, cuántas unidades y bajo qué nombre. */
  privatizacion: Pick<DatosPrivatizar, "correo" | "dropshipper" | "unidades" | "nombre"> | null;
  /** «archivar»: true = sacarlo de Archivados. */
  restaurar: boolean;
  /** «cambio»: la descripción nueva y cuántas fotos se suben. */
  descripcion: string | null;
  fotos: number;
  /** El ID del producto nuevo de una republicación, cuando Dropi ya lo creó. */
  nuevoDropiId: number | null;
  estado: EstadoCambioDropi;
  /** null si el cambio no toca el nombre (solo el precio). */
  nombre: string | null;
  nombreGuia: string | null;
  precio: number | null;
  precioSugerido: number | null;
  error: string | null;
  creadoEn: string;
  aplicadoEn: string | null;
}

/** Lo que lleva un cambio para Dropi. Lo que no se pone (`undefined`) se conserva del cambio pendiente que ya hubiera. */
export interface CambioDropi {
  nombre?: string | null;
  nombreGuia?: string | null;
  precio?: number | null;
  precioSugerido?: number | null;
  /** El precio que tenía antes (para mostrar «de … a …»). */
  precioAntes?: number | null;
  precioSugeridoAntes?: number | null;
  /** El nombre que tenía la publicación antes de este cambio (migración 0149): para volver a él si se deshace el cambio pendiente. */
  nombreAntes?: string | null;
  /** La descripción nueva (HTML ya limpio) y la que tenía el sistema antes (migración 0151). */
  descripcion?: string | null;
  descripcionAntes?: string | null;
  /** Fotos que se suman al producto en Dropi (migración 0151); si ya había otras esperando, se suman. */
  fotos?: FotoCrear[] | null;
}

/**
 * Deja un cambio en la cola de «Aplicar en Dropi» (migración 0137; precio y precio sugerido desde la 0139). Si la publicación ya
 * tenía un cambio esperando (pendiente o con error), se juntan en uno nuevo y el anterior queda «reemplazado»: así un nombre y un
 * precio pendientes van juntos a Dropi. Necesita un ID de Dropi; con dos («8165/7409») va al primero.
 */
export async function encolarCambio(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  cambio: CambioDropi,
  por: { id: string; nombre: string },
): Promise<{ id: string } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  const conPrecio = cambio.precio !== undefined || cambio.precioSugerido !== undefined;
  // Una republicación esperando (migración 0145) no se junta con un cambio de nombre o de precio.
  const consulta = (columnas: string, sinRepublicar: boolean) => {
    const q = supabase.from("dropi_cambios_pendientes").select(columnas).eq("publicacion_id", pub.id).in("estado", ["pendiente", "error"]);
    return (sinRepublicar ? q.eq("tipo", "cambio") : q).order("creado_en", { ascending: false }).limit(1).maybeSingle();
  };
  const leer = async (columnas: string) => {
    const r = await consulta(columnas, true);
    return r.error ? consulta(columnas, false) : r;
  };
  // Sin la migración 0149 no se guarda el nombre de antes (el cambio igual se encola; solo no se podrá volver al nombre anterior al deshacerlo).
  const hayNombreAntes = !(await supabase.from("dropi_cambios_pendientes").select("nombre_antes").limit(1)).error;
  const conNombreAntes = hayNombreAntes ? ", nombre_antes" : "";
  // Sin la migración 0151 no hay descripción ni fotos: un cambio normal sigue funcionando, uno con descripción o fotos avisa.
  const hayDescripcion = !(await supabase.from("dropi_cambios_pendientes").select("descripcion, fotos").limit(1)).error;
  if ((cambio.descripcion !== undefined || cambio.fotos !== undefined) && !hayDescripcion) return { error: "Falta correr en Supabase la migración 0151 para mandar descripciones y fotos a Dropi." };
  const conDescripcion = hayDescripcion ? ", descripcion, descripcion_antes, fotos" : "";
  let previo = await leer(`id, nombre, nombre_guia, precio, precio_sugerido, precio_antes, precio_sugerido_antes${conNombreAntes}${conDescripcion}`);
  const hayPrecios = !previo.error;
  if (!hayPrecios) {
    if (conPrecio) return { error: "Falta correr en Supabase la migración 0139 para mandar precios a Dropi." };
    previo = await leer(`id, nombre, nombre_guia${conNombreAntes}${conDescripcion}`);
  }
  const p = (previo.data ?? null) as Record<string, unknown> | null;
  const elegir = <T,>(nuevo: T | undefined, viejo: unknown): T | null => (nuevo !== undefined ? nuevo : ((viejo as T | null | undefined) ?? null));
  const fila: Record<string, unknown> = {
    pais_id: pub.pais_id,
    publicacion_id: pub.id,
    dropi_producto_id: productoId,
    nombre: elegir(cambio.nombre, p?.nombre),
    nombre_guia: elegir(cambio.nombreGuia, p?.nombre_guia),
    creado_por: por.id,
    creado_por_nombre: por.nombre,
  };
  // El nombre de antes es el de la primera vez que se pidió el cambio (el que tenía el sistema antes de tocarlo).
  if (hayNombreAntes && (cambio.nombre !== undefined || p?.nombre_antes != null)) fila.nombre_antes = p?.nombre_antes ?? cambio.nombreAntes ?? null;
  if (hayPrecios) {
    fila.precio = elegir(cambio.precio, p?.precio);
    fila.precio_sugerido = elegir(cambio.precioSugerido, p?.precio_sugerido);
    // El «antes» es el de la primera vez que se pidió el cambio (el que de verdad tenía Dropi).
    fila.precio_antes = p?.precio_antes ?? cambio.precioAntes ?? null;
    fila.precio_sugerido_antes = p?.precio_sugerido_antes ?? cambio.precioSugeridoAntes ?? null;
  }
  if (hayDescripcion) {
    fila.descripcion = elegir(cambio.descripcion, p?.descripcion);
    // La descripción de antes es la de la primera vez que se pidió el cambio (la que tenía el sistema antes de tocarla).
    fila.descripcion_antes = p?.descripcion_antes ?? cambio.descripcionAntes ?? null;
    // Las fotos se suman a las que ya esperaban (sin repetir la misma dirección).
    const previas = Array.isArray(p?.fotos) ? (p?.fotos as FotoCrear[]) : [];
    const nuevas = cambio.fotos === undefined ? [] : (cambio.fotos ?? []);
    const todas = [...previas, ...nuevas.filter((f) => !previas.some((x) => x.url === f.url))];
    fila.fotos = todas.length ? todas : null;
  }
  if (p?.id) await supabase.from("dropi_cambios_pendientes").update({ estado: "reemplazado" }).eq("id", p.id as string);
  const { data, error } = await supabase.from("dropi_cambios_pendientes").insert(fila).select("id").single();
  if (error || !data) return { error: /does not exist|schema cache/i.test(error?.message ?? "") ? "Falta correr en Supabase la migración 0137." : "No se pudo dejar el cambio para Dropi." };
  return { id: data.id as string };
}

/**
 * «Republicar» (pedido de Hernán, 23 oct 2026; migración 0145): deja en la cola de «Aplicar en Dropi» que se cree de nuevo el
 * producto en Dropi (mismos datos, fotos y stock) y se archive el viejo sin stock. Si ya había una esperando, no se agrega otra.
 */
export async function encolarRepublicar(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  por: { id: string; nombre: string },
  /** El precio del producto nuevo (27 oct 2026: se elige al republicar; el sugerido va igual) y el que tenía. Sin él, se copia el del viejo. */
  precio?: { precio: number; precioAntes: number | null },
): Promise<{ id: string; yaEstaba: boolean } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  const falta = (m: string) => /tipo|column|does not exist|schema cache/i.test(m);
  const previo = await supabase.from("dropi_cambios_pendientes").select("id").eq("publicacion_id", pub.id).eq("tipo", "republicar").in("estado", ["pendiente", "error"]).limit(1).maybeSingle();
  if (previo.error) return { error: falta(previo.error.message) ? "Falta correr en Supabase la migración 0145." : "No se pudo dejar la republicación para Dropi." };
  const precios = precio ? { precio: precio.precio, precio_sugerido: precio.precio, precio_antes: precio.precioAntes } : {};
  if (previo.data) {
    // Ya esperaba: si ahora se eligió un precio, se le pone (todavía no se creó el producto nuevo).
    if (precio) await supabase.from("dropi_cambios_pendientes").update(precios).eq("id", previo.data.id as string).is("nuevo_dropi_id", null);
    return { id: previo.data.id as string, yaEstaba: true };
  }
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .insert({ pais_id: pub.pais_id, publicacion_id: pub.id, dropi_producto_id: productoId, tipo: "republicar", ...precios, creado_por: por.id, creado_por_nombre: por.nombre })
    .select("id")
    .single();
  if (error || !data) return { error: error && falta(error.message) ? "Falta correr en Supabase la migración 0145." : "No se pudo dejar la republicación para Dropi." };
  return { id: data.id as string, yaEstaba: false };
}

/**
 * «Apagar en Dropi» (pedido de Hernán, 23 oct 2026; migración 0148): deja en la cola que se saque todo el stock del producto en Dropi
 * (con `quitarPrivados`, también su privatización) y se archive. Si ya había un apagado esperando, no se agrega otro (el pendiente
 * se reintenta solo en cada «Aplicar en Dropi»; si antes no pedía quitar privados y ahora sí, se actualiza).
 */
export async function encolarApagar(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  opciones: { quitarPrivados: boolean },
  por: { id: string; nombre: string },
): Promise<{ id: string; yaEstaba: boolean } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  const falta = (m: string) => /tipo|column|does not exist|schema cache|quitar_privados/i.test(m);
  const previo = await supabase.from("dropi_cambios_pendientes").select("id, quitar_privados").eq("publicacion_id", pub.id).eq("tipo", "apagar").in("estado", ["pendiente", "error"]).limit(1).maybeSingle();
  if (previo.error) return { error: falta(previo.error.message) ? "Falta correr en Supabase la migración 0148." : "No se pudo dejar el apagado para Dropi." };
  if (previo.data) {
    if (opciones.quitarPrivados && !previo.data.quitar_privados) await supabase.from("dropi_cambios_pendientes").update({ quitar_privados: true }).eq("id", previo.data.id as string);
    return { id: previo.data.id as string, yaEstaba: true };
  }
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .insert({ pais_id: pub.pais_id, publicacion_id: pub.id, dropi_producto_id: productoId, tipo: "apagar", quitar_privados: opciones.quitarPrivados, creado_por: por.id, creado_por_nombre: por.nombre })
    .select("id")
    .single();
  if (error || !data) return { error: error && falta(error.message) ? "Falta correr en Supabase la migración 0148." : "No se pudo dejar el apagado para Dropi." };
  return { id: data.id as string, yaEstaba: false };
}

/**
 * «Archivar» y «Sacar de Archivados» en Dropi (pedido de Jhokser, 24 oct 2026; migración 0151): el sistema ya cambió la publicación y deja en la
 * cola que Dropi haga lo mismo (`archiveProduct` / `activateProduct`). `antes` es cómo estaba la publicación, para devolverla a eso si se deshace
 * el cambio pendiente. Si ya había uno esperando: el mismo no se repite, y el contrario lo cancela (Dropi nunca se tocó): vuelve `cancelo`
 * con el estado de antes de ese cambio, para que la publicación quede exactamente como estaba.
 */
export async function encolarArchivar(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  opciones: { restaurar: boolean },
  antes: { estado: string | null; estado_publicacion: string | null },
  por: { id: string; nombre: string },
): Promise<{ id: string; yaEstaba: boolean } | { cancelo: { estado: string | null; estado_publicacion: string | null } } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  const falta = (m: string) => /tipo|column|does not exist|schema cache|restaurar|estado_antes/i.test(m);
  const previo = await supabase
    .from("dropi_cambios_pendientes")
    .select("id, restaurar, intentos, estado_antes, estado_publicacion_antes")
    .eq("publicacion_id", pub.id)
    .eq("tipo", "archivar")
    .in("estado", ["pendiente", "error"])
    .limit(1)
    .maybeSingle();
  if (previo.error) return { error: falta(previo.error.message) ? "Falta correr en Supabase la migración 0151." : "No se pudo dejar el cambio para Dropi." };
  if (previo.data) {
    if (previo.data.restaurar === opciones.restaurar) return { id: previo.data.id as string, yaEstaba: true };
    if (Number(previo.data.intentos) === 0) {
      await supabase.from("dropi_cambios_pendientes").update({ estado: "reemplazado" }).eq("id", previo.data.id as string);
      return { cancelo: { estado: (previo.data.estado_antes as string | null) ?? null, estado_publicacion: (previo.data.estado_publicacion_antes as string | null) ?? null } };
    }
  }
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .insert({
      pais_id: pub.pais_id,
      publicacion_id: pub.id,
      dropi_producto_id: productoId,
      tipo: "archivar",
      restaurar: opciones.restaurar,
      estado_antes: antes.estado,
      estado_publicacion_antes: antes.estado_publicacion,
      creado_por: por.id,
      creado_por_nombre: por.nombre,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error && falta(error.message) ? "Falta correr en Supabase la migración 0151." : "No se pudo dejar el cambio para Dropi." };
  return { id: data.id as string, yaEstaba: false };
}

/**
 * «Publicar en Dropi» (pedido de Jhokser, 24 oct 2026; migración 0151): deja en la cola que se cree en Dropi el producto de una publicación que
 * todavía no existe allá (`estado_publicacion = 'borrador'`). Lleva una copia de todo lo que Dropi pide (`datos`); si ya había una publicación
 * pendiente, se actualiza con los datos nuevos. No necesita ID de Dropi: se llena al crearlo.
 */
export async function encolarCrear(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string },
  datos: DatosCrearDropi,
  por: { id: string; nombre: string },
): Promise<{ id: string; yaEstaba: boolean } | { error: string }> {
  const falta = (m: string) => /tipo|column|does not exist|schema cache|datos/i.test(m);
  const previo = await supabase.from("dropi_cambios_pendientes").select("id, intentos, nuevo_dropi_id").eq("publicacion_id", pub.id).eq("tipo", "crear").in("estado", ["pendiente", "error"]).limit(1).maybeSingle();
  if (previo.error) return { error: falta(previo.error.message) ? "Falta correr en Supabase la migración 0151." : "No se pudo dejar la publicación para Dropi." };
  if (previo.data) {
    // Ya creado en Dropi a medias: los datos ya no cambian lo que Dropi tiene; se sigue desde donde quedó.
    if (previo.data.nuevo_dropi_id == null) await supabase.from("dropi_cambios_pendientes").update({ datos, nombre: datos.nombre.slice(0, MAX_NOMBRE_DROPI) }).eq("id", previo.data.id as string);
    return { id: previo.data.id as string, yaEstaba: true };
  }
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .insert({ pais_id: pub.pais_id, publicacion_id: pub.id, tipo: "crear", nombre: datos.nombre.slice(0, MAX_NOMBRE_DROPI), datos, creado_por: por.id, creado_por_nombre: por.nombre })
    .select("id")
    .single();
  if (error || !data) return { error: error && falta(error.message) ? "Falta correr en Supabase la migración 0151." : "No se pudo dejar la publicación para Dropi." };
  return { id: data.id as string, yaEstaba: false };
}

/**
 * «Privatizar en Dropi» (pedido de Jhokser, 26 oct 2026; migración 0155): deja en la cola que se cree en Dropi un producto privado del público de
 * `pub` y se le asigne a un dropshipper con unas unidades que salen del público. Va en la publicación pública. Si ya había una privatización
 * esperando para el mismo correo, no se agrega otra (`yaEstaba`); a otro correo sí (se puede privatizar a varios).
 */
export async function encolarPrivatizar(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  datos: DatosPrivatizar,
  por: { id: string; nombre: string },
): Promise<{ id: string; yaEstaba: boolean } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  const falta = (m: string) => /tipo|column|does not exist|schema cache|datos/i.test(m);
  const previo = await supabase.from("dropi_cambios_pendientes").select("id, datos").eq("publicacion_id", pub.id).eq("tipo", "privatizar").in("estado", ["pendiente", "error"]);
  if (previo.error) return { error: falta(previo.error.message) ? "Falta correr en Supabase la migración 0155." : "No se pudo dejar la privatización para Dropi." };
  const igual = (previo.data ?? []).find((f) => normalizarDatosPrivatizar(f.datos).correo === datos.correo);
  if (igual) return { id: igual.id as string, yaEstaba: true };
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .insert({ pais_id: pub.pais_id, publicacion_id: pub.id, dropi_producto_id: productoId, tipo: "privatizar", nombre: datos.nombre, datos, creado_por: por.id, creado_por_nombre: por.nombre })
    .select("id")
    .single();
  if (error || !data) return { error: error && falta(error.message) ? "Falta correr en Supabase la migración 0155." : "No se pudo dejar la privatización para Dropi." };
  return { id: data.id as string, yaEstaba: false };
}

/**
 * «Cambiar stock en Dropi» (pedido de Alcides, 28 oct 2026; migración 0173): deja en la cola que una bodega de ECOMFIVE quede con `datos.unidades`.
 * Un solo cambio de stock por publicación y bodega: si ya había uno esperando, se le ponen las unidades nuevas (se conserva el «antes» de la primera
 * vez, que es lo que de verdad tenía Dropi) y vuelve a quedar pendiente.
 */
export async function encolarStock(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  datos: DatosStock,
  por: { id: string; nombre: string },
): Promise<{ id: string; yaEstaba: boolean } | { error: string }> {
  const productoId = idsDeDropi(pub.dropi_id)[0];
  if (!productoId) return { error: "La publicación no tiene ID de Dropi." };
  const falta = (m: string) => /tipo|column|does not exist|schema cache|datos|check constraint/i.test(m);
  const previo = await supabase.from("dropi_cambios_pendientes").select("id, datos").eq("publicacion_id", pub.id).eq("tipo", "stock").in("estado", ["pendiente", "error"]);
  if (previo.error) return { error: falta(previo.error.message) ? "Falta correr en Supabase la migración 0173." : "No se pudo dejar el stock para Dropi." };
  const igual = (previo.data ?? []).find((f) => normalizarDatosStock(f.datos).bodega === datos.bodega);
  if (igual) {
    const antes = normalizarDatosStock(igual.datos).antes;
    const { error } = await supabase
      .from("dropi_cambios_pendientes")
      .update({ datos: { ...datos, antes: antes ?? datos.antes }, estado: "pendiente", error: null, creado_por: por.id, creado_por_nombre: por.nombre })
      .eq("id", igual.id as string);
    if (error) return { error: "No se pudo dejar el stock para Dropi." };
    return { id: igual.id as string, yaEstaba: true };
  }
  const { data, error } = await supabase
    .from("dropi_cambios_pendientes")
    .insert({ pais_id: pub.pais_id, publicacion_id: pub.id, dropi_producto_id: productoId, tipo: "stock", datos, creado_por: por.id, creado_por_nombre: por.nombre })
    .select("id")
    .single();
  if (error || !data) return { error: error && falta(error.message) ? "Falta correr en Supabase la migración 0173." : "No se pudo dejar el stock para Dropi." };
  return { id: data.id as string, yaEstaba: false };
}

/** El cambio de nombre (y el de la guía) para Dropi; se junta con un cambio de precio pendiente si lo hay. */
export async function encolarCambioNombre(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  cambio: { nombre: string; nombreGuia: string | null; nombreAntes?: string | null },
  por: { id: string; nombre: string },
): Promise<{ id: string } | { error: string }> {
  return encolarCambio(supabase, pub, { nombre: cambio.nombre, nombreGuia: cambio.nombreGuia, nombreAntes: cambio.nombreAntes }, por);
}

/**
 * Un precio nuevo, también para Dropi (22 oct 2026): al aceptar «Subir precio» o «Bajar precio frente a la competencia», o al
 * cambiarlo en la ficha. Queda en la cola y lo aplica «Aplicar en Dropi».
 */
export async function enviarPrecioADropi(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null },
  precio: number,
  precioAntes: number | null,
  por: { id: string; nombre: string },
): Promise<{ estado: "pendiente" | "error"; detalle: string }> {
  // El sugerido va siempre igual al precio (decisión de Alcides, 23 oct 2026): así Dropi no le impide al dropshipper vender por debajo.
  const r = await encolarCambio(supabase, pub, { precio, precioAntes, precioSugerido: precio }, por);
  if ("error" in r) return { estado: "error", detalle: r.error };
  return { estado: "pendiente", detalle: `Precio $${precio.toFixed(2)} para Dropi: pulsa «Aplicar en Dropi» con Dropi abierto.` };
}

/**
 * Un nombre nuevo, también para Dropi (pedido de Hernán, 22 oct 2026): «Nombre del producto» = el nombre y «Nombre del producto en
 * la guía de envío» = el código del SKU vinculado (lo que ve despacho). Queda pendiente y lo aplica el favorito «Aplicar en Dropi».
 * Lo usan «Usar este título» del Asistente de IA y la edición del nombre en la ficha.
 */
export async function enviarNombreADropi(
  supabase: SupabaseClient,
  pub: { id: string; pais_id: string; dropi_id: string | null; sku_maestro_id: string | null },
  nombre: string,
  por: { id: string; nombre: string },
  /** El nombre que tenía la publicación antes de este cambio (para poder deshacerlo). */
  nombreAntes?: string | null,
): Promise<{ estado: "pendiente" | "error"; detalle: string }> {
  const { data: sku } = pub.sku_maestro_id ? await supabase.from("skus_maestros").select("codigo").eq("id", pub.sku_maestro_id).maybeSingle() : { data: null };
  const codigo = (sku?.codigo as string | undefined)?.trim() || null;
  const nombreGuia = codigo && codigo.length <= MAX_NOMBRE_DROPI ? codigo : null;
  const encolado = await encolarCambioNombre(supabase, pub, { nombre, nombreGuia, nombreAntes }, por);
  if ("error" in encolado) return { estado: "error", detalle: encolado.error };
  return { estado: "pendiente", detalle: `Para Dropi${nombreGuia ? ` (guía: ${nombreGuia})` : ""}: pulsa «Aplicar en Dropi» con Dropi abierto.` };
}

/** El último cambio en Dropi de cada publicación del país y cuántos siguen pendientes. Sin la migración 0137, vacío. */
export async function cargarCambiosDropi(
  supabase: SupabaseClient,
  paisId: string,
): Promise<{
  porPublicacion: Map<string, CambioDropiVista>;
  pendientes: number;
  apagando: Map<string, number>;
  archivando: Map<string, boolean>;
  creando: Map<string, number>;
  /** Privatizaciones esperando por publicación pública (pendientes o con error), con a quién y cuántas unidades. */
  privatizando: Map<string, Pick<DatosPrivatizar, "correo" | "dropshipper" | "unidades" | "nombre">[]>;
  /** Cambios de stock esperando por publicación (pendientes o con error): bodega y unidades que deben quedar. */
  ajustandoStock: Map<string, DatosStock[]>;
}> {
  const porPublicacion = new Map<string, CambioDropiVista>();
  // Las publicaciones con un apagado esperando (pendiente, a medias o con error): en el sistema ya se ven como apagadas. El valor es cuántas
  // veces se intentó en Dropi: con 0, Dropi todavía no se tocó y el apagado se puede deshacer sin consecuencias.
  const apagando = new Map<string, number>();
  // Archivar (true = sacar de Archivados) y publicar (veces que se intentó) pendientes: la fila los muestra.
  const archivando = new Map<string, boolean>();
  const creando = new Map<string, number>();
  const privatizando = new Map<string, Pick<DatosPrivatizar, "correo" | "dropshipper" | "unidades" | "nombre">[]>();
  const ajustandoStock = new Map<string, DatosStock[]>();
  const leer = (columnas: string) =>
    supabase.from("dropi_cambios_pendientes").select(columnas).eq("pais_id", paisId).neq("estado", "reemplazado").order("creado_en", { ascending: false }).limit(2000);
  let r = await leer("id, publicacion_id, tipo, restaurar, descripcion, fotos, datos, nuevo_dropi_id, intentos, estado, nombre, nombre_guia, precio, precio_sugerido, error, creado_en, aplicado_en");
  // Sin la migración 0151, sin archivar, descripción ni fotos; sin la 0145, sin republicaciones; sin la 0139, sin precios.
  if (r.error) r = await leer("id, publicacion_id, tipo, nuevo_dropi_id, intentos, estado, nombre, nombre_guia, precio, precio_sugerido, error, creado_en, aplicado_en");
  if (r.error) r = await leer("id, publicacion_id, estado, nombre, nombre_guia, precio, precio_sugerido, error, creado_en, aplicado_en");
  if (r.error) r = await leer("id, publicacion_id, estado, nombre, nombre_guia, error, creado_en, aplicado_en");
  const { data, error } = r as unknown as { data: Record<string, unknown>[] | null; error: unknown };
  if (error) return { porPublicacion, pendientes: 0, apagando, archivando, creando, privatizando, ajustandoStock };
  let pendientes = 0;
  for (const f of data ?? []) {
    if (f.estado === "pendiente") pendientes++;
    if (f.tipo === "privatizar" && (f.estado === "pendiente" || f.estado === "error")) {
      const d = normalizarDatosPrivatizar(f.datos);
      privatizando.set(f.publicacion_id as string, [...(privatizando.get(f.publicacion_id as string) ?? []), { correo: d.correo, dropshipper: d.dropshipper, unidades: d.unidades, nombre: d.nombre }]);
    }
    if (f.tipo === "stock" && (f.estado === "pendiente" || f.estado === "error"))
      ajustandoStock.set(f.publicacion_id as string, [...(ajustandoStock.get(f.publicacion_id as string) ?? []), normalizarDatosStock(f.datos)]);
    if (f.tipo === "apagar" && (f.estado === "pendiente" || f.estado === "error")) apagando.set(f.publicacion_id as string, Number(f.intentos ?? 0));
    if (f.tipo === "archivar" && (f.estado === "pendiente" || f.estado === "error") && !archivando.has(f.publicacion_id as string)) archivando.set(f.publicacion_id as string, f.restaurar === true);
    if (f.tipo === "crear" && (f.estado === "pendiente" || f.estado === "error")) creando.set(f.publicacion_id as string, Number(f.intentos ?? 0));
    if (porPublicacion.has(f.publicacion_id as string)) continue;
    porPublicacion.set(f.publicacion_id as string, {
      id: f.id as string,
      tipo: f.tipo === "republicar" ? "republicar" : f.tipo === "apagar" ? "apagar" : f.tipo === "archivar" ? "archivar" : f.tipo === "crear" ? "crear" : f.tipo === "privatizar" ? "privatizar" : f.tipo === "stock" ? "stock" : "cambio",
      stock: f.tipo === "stock" ? normalizarDatosStock(f.datos) : null,
      privatizacion: f.tipo === "privatizar" ? (({ correo, dropshipper, unidades, nombre }) => ({ correo, dropshipper, unidades, nombre }))(normalizarDatosPrivatizar(f.datos)) : null,
      restaurar: f.restaurar === true,
      descripcion: (f.descripcion as string | null | undefined) ?? null,
      fotos: Array.isArray(f.fotos) ? f.fotos.length : 0,
      nuevoDropiId: f.nuevo_dropi_id === null || f.nuevo_dropi_id === undefined ? null : Number(f.nuevo_dropi_id),
      estado: f.estado as EstadoCambioDropi,
      nombre: (f.nombre as string | null) ?? null,
      nombreGuia: (f.nombre_guia as string | null) ?? null,
      precio: f.precio === null || f.precio === undefined ? null : Number(f.precio),
      precioSugerido: f.precio_sugerido === null || f.precio_sugerido === undefined ? null : Number(f.precio_sugerido),
      error: (f.error as string | null) ?? null,
      creadoEn: f.creado_en as string,
      aplicadoEn: (f.aplicado_en as string | null) ?? null,
    });
  }
  return { porPublicacion, pendientes, apagando, archivando, creando, privatizando, ajustandoStock };
}
