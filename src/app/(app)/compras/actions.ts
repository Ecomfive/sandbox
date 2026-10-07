"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura, getUsuarioActual } from "@/lib/auth";
import { mencionadosValidos, notificarMenciones } from "@/lib/menciones";
import { ESTADOS_COMPRA, ETAPAS_COMPRA, PRIORIDADES, VIAS_ENVIO } from "./def-compras";
import { CAMPOS_EDITABLES, campoEditable, normalizarValor, textoDeValor } from "./def-edicion-compras";

const ETAPAS_VALIDAS: Set<string> = new Set(ETAPAS_COMPRA.map((e) => e.valor));
const ESTADOS_VALIDOS: Set<string> = new Set(ESTADOS_COMPRA.map((e) => e.valor));
const PRIORIDADES_VALIDAS: Set<string> = new Set(PRIORIDADES.map((p) => p.valor));
const VIAS_VALIDAS: Set<string> = new Set(VIAS_ENVIO.map((v) => v.valor));
const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/** «a, b ,c» → ["a", "b", "c"] (sin vacíos ni repetidos). */
const listaDeTexto = (texto: string | null): string[] => [...new Set((texto ?? "").split(",").map((x) => x.trim()).filter(Boolean))];

// La foto del producto vive en el mismo bucket público que Filtros y las fichas de producto Shopify/Dropi.
const BUCKET_FOTOS = "wms-productos";
const PREFIJO_URL_PUBLICA = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;

/** Da permiso (URL firmada) para subir la foto directo desde el navegador, sin pasar el archivo por la acción. */
export async function prepararSubidaFotoCompra(nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  await requireModuloEscritura("compras");
  if (typeof nombreArchivo !== "string" || !nombreArchivo.trim()) return { error: "El archivo no tiene nombre." };

  const ruta = `compras/${crypto.randomUUID()}/${Date.now()}-${nombreArchivo.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-120)}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET_FOTOS).createSignedUploadUrl(ruta);
  if (error || !data) return { error: error?.message ?? "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

/** Borra del bucket una foto que ya no queda referenciada (se reemplazó o se quitó). Nunca lanza. */
async function borrarFotoSiEsNuestra(url: string | null) {
  if (!url || !url.startsWith(PREFIJO_URL_PUBLICA)) return;
  const ruta = url.slice(PREFIJO_URL_PUBLICA.length);
  await createServiceClient().storage.from(BUCKET_FOTOS).remove([ruta]);
}

const numeroOptativo = (formData: FormData, campo: string): number | null => {
  const texto = formData.get(campo) as string | null;
  return texto && texto !== "" ? Number(texto) : null;
};

const textoOptativo = (formData: FormData, campo: string): string | null => {
  const texto = (formData.get(campo) as string | null)?.trim();
  return texto ? texto : null;
};

const fechaOptativa = (formData: FormData, campo: string): string | null => (formData.get(campo) as string) || null;

/** Los campos comunes a crear y actualizar (todo lo que no sea el nombre, la etapa o el país). */
function leerCambios(formData: FormData) {
  return {
    foto_url: textoOptativo(formData, "foto_url"),
    proveedor: textoOptativo(formData, "proveedor"),
    cliente: textoOptativo(formData, "cliente"),
    tienda: textoOptativo(formData, "tienda"),
    track_id: textoOptativo(formData, "track_id"),
    orden: textoOptativo(formData, "orden"),
    producto_relacionado: textoOptativo(formData, "producto_relacionado"),
    qty_total: numeroOptativo(formData, "qty_total"),
    monto_total: numeroOptativo(formData, "monto_total"),
    primer_pago: numeroOptativo(formData, "primer_pago"),
    segundo_pago: numeroOptativo(formData, "segundo_pago"),
    pagado_a_proveedor: numeroOptativo(formData, "pagado_a_proveedor"),
    pago_pendiente: numeroOptativo(formData, "pago_pendiente"),
    cobrado_cliente: numeroOptativo(formData, "cobrado_cliente"),
    pendiente_cliente: numeroOptativo(formData, "pendiente_cliente"),
    pago_cliente: textoOptativo(formData, "pago_cliente"),
    cuenta_receptora: textoOptativo(formData, "cuenta_receptora"),
    factura: formData.get("factura") === "on",
    financiamiento: formData.get("financiamiento") === "on",
    fecha_limite: fechaOptativa(formData, "fecha_limite"),
    fecha_llegada: fechaOptativa(formData, "fecha_llegada"),
    fecha_pago_1: fechaOptativa(formData, "fecha_pago_1"),
    fecha_pago_2: fechaOptativa(formData, "fecha_pago_2"),
    fecha_envio: fechaOptativa(formData, "fecha_envio"),
    planificacion: textoOptativo(formData, "planificacion"),
    documentos: textoOptativo(formData, "documentos"),
    prioridad: PRIORIDADES_VALIDAS.has(String(formData.get("prioridad") ?? "")) ? String(formData.get("prioridad")) : null,
    via_envio: formData.getAll("via_envio").map(String).filter((v) => VIAS_VALIDAS.has(v)),
    etiquetas: listaDeTexto(textoOptativo(formData, "etiquetas")),
    url_producto: textoOptativo(formData, "url_producto"),
    descripcion: textoOptativo(formData, "descripcion"),
  };
}

/**
 * Tipo y país de la compra: una de país lleva su país (por código); una de Importadora nunca lleva país (es un servicio a
 * un cliente, no una compra nuestra) y guarda a dónde se entrega en `paises_destino`.
 */
async function leerTipoYPais(formData: FormData): Promise<{ tipo: string; pais_id: string | null; paises_destino: string[] } | { error: string }> {
  const tipo = formData.get("tipo") === "importacion" ? "importacion" : "pais";
  if (tipo === "importacion") return { tipo, pais_id: null, paises_destino: listaDeTexto(textoOptativo(formData, "paises_destino")) };
  const codigo = String(formData.get("pais") ?? "");
  if (!codigo) return { error: "Elige el país de la compra." };
  const { data } = await createServiceClient().from("paises").select("id").eq("codigo", codigo).maybeSingle();
  if (!data) return { error: "País no válido." };
  return { tipo, pais_id: data.id as string, paises_destino: [] };
}

/**
 * El código de una compra nueva: el siguiente del correlativo de su país, o de Importadora («ECOM01-0450»). Sin prefijo
 * configurado para ese país (Configuración › Países) la compra se crea sin código.
 */
async function siguienteCodigo(tipo: string, paisId: string | null): Promise<string | null> {
  const supabase = createServiceClient();
  let clave = "importacion";
  if (tipo === "pais") {
    const { data } = await supabase.from("paises").select("codigo").eq("id", paisId).maybeSingle();
    if (!data) return null;
    clave = data.codigo as string;
  }
  const { data } = await supabase.rpc("wms_siguiente_codigo_compra", { p_clave: clave });
  return (data as string | null) ?? null;
}

/** Un cambio de un dato de una compra para su Actividad: el campo y los valores ya en palabras («—» si no había). */
interface CambioActividad {
  campo: string;
  antes: string | null;
  despues: string | null;
}

/**
 * Anota en la Actividad de una compra cualquier cambio (que no sea etapa ni estado, que van con `anotarEventos`), con quién
 * lo hizo y la hora, como la actividad de ClickUp. Lo usan la ficha, las celdas de la lista y el bloque «Productos».
 */
async function anotarCambios(compraId: string, cambios: CambioActividad[]) {
  const reales = cambios.filter((c) => c.antes !== c.despues);
  if (reales.length === 0) return;
  const usuario = await getUsuarioActual();
  const autor = usuario?.nombre || usuario?.email || null;
  const ahora = Date.now();
  // Varios cambios del mismo guardado llevan milisegundos distintos (la base no repite campo + valor + hora).
  await createServiceClient()
    .from("wms_compra_eventos")
    .insert(reales.map((c, i) => ({ compra_id: compraId, campo: c.campo, valor_antes: c.antes, valor_despues: c.despues, ocurrido_en: new Date(ahora + i).toISOString(), autor, origen: "sistema" })));
}

const dinero = (n: number) => n.toLocaleString("es-PA", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** «1.040 u. · $1.270,00» (sin costo, solo las unidades). */
const textoLinea = (cantidad: number, costo: number | null) =>
  `${cantidad.toLocaleString("es-PA")} u.${costo !== null ? ` · ${dinero(Math.round(cantidad * costo * 100) / 100)}` : ""}`;

/** Otros datos de la ficha (fuera de las celdas de la lista) que también quedan en la Actividad. */
const OTROS_CAMPOS: { campo: string; columna: string }[] = [
  { campo: "nombre", columna: "nombre" },
  { campo: "descripcion", columna: "descripcion" },
  { campo: "urlProducto", columna: "url_producto" },
  { campo: "documentos", columna: "documentos" },
  { campo: "foto", columna: "foto_url" },
  { campo: "paisesDestino", columna: "paises_destino" },
];
/** Una lista en orden fijo, para que el mismo contenido en otro orden (vías de envío, etiquetas) no cuente como cambio. */
const ordenada = (v: unknown) => (Array.isArray(v) ? [...v].map(String).sort() : v);
const textoSimple = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v));

/** Anota los cambios de etapa y de estado con su hora: de ahí salen los tiempos por etapa del tablero de compras. */
async function anotarEventos(compraId: string, antes: { etapa: string; estado: string } | null, despues: { etapa: string; estado: string }) {
  const usuario = await getUsuarioActual();
  const autor = usuario?.nombre || usuario?.email || null;
  const filas = (["etapa", "estado"] as const)
    .filter((campo) => !antes || antes[campo] !== despues[campo])
    .map((campo) => ({ compra_id: compraId, campo, valor_antes: antes ? antes[campo] : null, valor_despues: despues[campo], autor, origen: "sistema" }));
  if (filas.length) await createServiceClient().from("wms_compra_eventos").insert(filas);
}

/** Devuelve el error como valor, no lo lanza: en producción Next.js oculta el mensaje de una excepción de una acción. */
export async function crearCompra(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const nombre = (formData.get("nombre") as string).trim();
  const etapa = (formData.get("etapa") as string) || "backlog";
  const estado = (formData.get("estado") as string) || "backlog";

  if (!nombre) return { error: "Escribe el nombre de la compra." };
  if (!ETAPAS_VALIDAS.has(etapa)) return { error: "Elige una etapa válida." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };

  const tipoYPais = await leerTipoYPais(formData);
  if ("error" in tipoYPais) return tipoYPais;

  const supabase = createServiceClient();
  const codigo = await siguienteCodigo(tipoYPais.tipo, tipoYPais.pais_id);
  const { data, error } = await supabase
    .from("wms_compras")
    .insert({ ...tipoYPais, nombre, etapa, estado, ...leerCambios(formData), codigo })
    .select("id")
    .single();
  if (error) return { error: error.message };
  await anotarEventos(data.id, null, { etapa, estado });

  await registrarAuditoria({ accion: "crear_compra", entidad: "wms_compras", entidadId: data.id, detalle: codigo ? `${codigo} · ${nombre}` : nombre });
  revalidatePath("/compras");
  return {};
}

/** Edita cualquier dato de una compra ya creada — todo junto, desde su ficha. */
export async function actualizarCompra(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string).trim();
  const etapa = formData.get("etapa") as string;
  const estado = formData.get("estado") as string;

  if (!nombre) return { error: "Escribe el nombre de la compra." };
  if (!ETAPAS_VALIDAS.has(etapa)) return { error: "Elige una etapa válida." };
  if (!ESTADOS_VALIDOS.has(estado)) return { error: "Elige un estado válido." };

  if (!ES_ID(id)) return { error: "Compra no válida." };
  const tipoYPais = await leerTipoYPais(formData);
  if ("error" in tipoYPais) return tipoYPais;

  const supabase = createServiceClient();
  const { data: actualCompleta } = await supabase.from("wms_compras").select("*").eq("id", id).single();
  const actual = actualCompleta as Record<string, unknown> & { foto_url: string | null; etapa: string; estado: string } | null;
  const { qty_total, monto_total, ...resto } = leerCambios(formData);
  // Con productos vinculados, la cantidad y el monto los calcula el bloque «Productos»: el formulario no los pisa.
  const { count: lineas } = await supabase.from("wms_compra_items").select("id", { count: "exact", head: true }).eq("compra_id", id);
  const cambios = (lineas ?? 0) > 0 ? resto : { ...resto, qty_total, monto_total };
  // Al cerrar (completado o descartado) se sella la fecha de cierre; al reabrir se quita.
  const cierra = etapa === "completado" || etapa === "descartado";
  const cerrado_en = cierra ? (actual && (actual.etapa === "completado" || actual.etapa === "descartado") ? undefined : new Date().toISOString()) : null;
  const { error } = await supabase
    .from("wms_compras")
    .update({ ...tipoYPais, nombre, etapa, estado, ...cambios, ...(cerrado_en !== undefined ? { cerrado_en } : {}), actualizado_en: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  if (actual) {
    await anotarEventos(id, { etapa: actual.etapa, estado: actual.estado }, { etapa, estado });
    // Lo demás que cambió en la ficha, en palabras, para la Actividad.
    const nuevo: Record<string, unknown> = { ...actual, ...tipoYPais, nombre, ...cambios };
    await anotarCambios(id, [
      ...Object.entries(CAMPOS_EDITABLES)
        .filter(([clave]) => clave !== "etapa" && clave !== "estado")
        .map(([clave, def]) => ({ campo: clave, antes: textoDeValor(def, ordenada(actual[def.columna])), despues: textoDeValor(def, ordenada(nuevo[def.columna])) })),
      ...OTROS_CAMPOS.map((c) => ({ campo: c.campo, antes: textoSimple(actual[c.columna]), despues: textoSimple(nuevo[c.columna]) })),
    ]);
  }

  if (actual && actual.foto_url !== cambios.foto_url) await borrarFotoSiEsNuestra(actual.foto_url);

  revalidatePath("/compras");
  return {};
}

/**
 * Cambia **un solo dato** de una compra, desde su celda en la lista (la ficha, en cambio, guarda todo junto). Lo que llega se
 * vuelve a validar aquí con las mismas reglas de la celda (`normalizarValor`). Cambiar la etapa hace lo mismo que en la
 * ficha: sella o quita la fecha de cierre y deja el evento con su hora. No llama a `revalidatePath`: la lista ya muestra el
 * cambio y rearmar toda la página de Compras por cada celda la haría lenta. Devuelve el error como valor.
 */
export async function actualizarCampoCompra(id: string, campo: string, bruto: unknown): Promise<{ error?: string; cerradoEn?: string | null }> {
  await requireModuloEscritura("compras");
  if (typeof id !== "string" || !ES_ID(id)) return { error: "Compra no válida." };
  const def = campoEditable(String(campo));
  if (!def) return { error: "Ese dato no se edita aquí." };
  const normalizado = normalizarValor(def, bruto);
  if ("error" in normalizado) return normalizado;

  const supabase = createServiceClient();
  const { data } = await supabase.from("wms_compras").select(`${def.columna}, etapa, estado`).eq("id", id).maybeSingle();
  const actual = data as unknown as Record<string, unknown> | null;
  if (!actual) return { error: "La compra ya no existe." };

  if (def.soloSinProductos) {
    const { count } = await supabase.from("wms_compra_items").select("id", { count: "exact", head: true }).eq("compra_id", id);
    if ((count ?? 0) > 0) return { error: "Con productos vinculados, esto se calcula de ellos." };
  }

  const cambios: Record<string, unknown> = { [def.columna]: normalizado.valor, actualizado_en: new Date().toISOString() };
  let cerradoEn: string | null | undefined;
  if (campo === "etapa") {
    const cierra = normalizado.valor === "completado" || normalizado.valor === "descartado";
    const yaCerrada = actual.etapa === "completado" || actual.etapa === "descartado";
    cerradoEn = cierra ? (yaCerrada ? undefined : new Date().toISOString()) : null;
    if (cerradoEn !== undefined) cambios.cerrado_en = cerradoEn;
  }

  const { error } = await supabase.from("wms_compras").update(cambios).eq("id", id);
  if (error) return { error: error.message.length < 200 ? error.message : "No se pudo guardar el cambio." };

  if (campo === "etapa" || campo === "estado") {
    await anotarEventos(
      id,
      { etapa: String(actual.etapa), estado: String(actual.estado) },
      { etapa: campo === "etapa" ? String(normalizado.valor) : String(actual.etapa), estado: campo === "estado" ? String(normalizado.valor) : String(actual.estado) },
    );
  }
  if (campo !== "etapa" && campo !== "estado") {
    await anotarCambios(id, [{ campo, antes: textoDeValor(def, actual[def.columna]), despues: textoDeValor(def, normalizado.valor) }]);
  }
  await registrarAuditoria({
    accion: "editar_campo_compra",
    entidad: "wms_compras",
    entidadId: id,
    antes: { [def.etiqueta]: textoDeValor(def, actual[def.columna]) },
    despues: { [def.etiqueta]: textoDeValor(def, normalizado.valor) },
  });
  return cerradoEn === undefined ? {} : { cerradoEn };
}

export async function eliminarCompra(formData: FormData) {
  await requireModuloEscritura("compras");
  const id = formData.get("id") as string;
  const nombre = formData.get("nombre") as string;

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("wms_compras").select("foto_url").eq("id", id).single();
  const { error } = await supabase.from("wms_compras").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (actual?.foto_url) await borrarFotoSiEsNuestra(actual.foto_url);

  await registrarAuditoria({ accion: "eliminar_compra", entidad: "wms_compras", entidadId: id, detalle: nombre });
  revalidatePath("/compras");
}

export interface ActividadCompra {
  comentarios: { id: string; autor: string | null; texto: string; creadoEn: string }[];
  subtareas: { id: string; nombre: string; estado: string | null; responsable: string | null; creadoEn: string; cerradoEn: string | null }[];
  adjuntos: { id: string; nombre: string; clase: string; url: string | null; creadoEn: string }[];
  eventos: { id: string; campo: string; antes: string | null; despues: string | null; ocurridoEn: string; autor: string | null; origen: string }[];
}

const BUCKET_COMPRAS = "wms-compras";

/**
 * Lo que cuelga de una compra para su ficha: comentarios, subtareas, adjuntos (fotos y documentos con un enlace firmado de
 * una hora; los videos, con su enlace de ClickUp) y el historial de cambios de etapa y estado. Basta poder abrir Compras.
 */
export async function obtenerActividadCompra(id: string): Promise<ActividadCompra | { error: string }> {
  await requireModulo("compras");
  if (!ES_ID(id)) return { error: "Compra no válida." };
  const supabase = createServiceClient();
  const [comentarios, subtareas, adjuntos, eventos] = await Promise.all([
    supabase.from("wms_compra_comentarios").select("id, autor, texto, creado_en").eq("compra_id", id).order("creado_en", { ascending: false }).limit(500),
    supabase.from("wms_compra_subtareas").select("id, nombre, estado, responsable_nombre, creado_en, cerrado_en").eq("compra_id", id).order("creado_en"),
    supabase.from("wms_compra_adjuntos").select("id, nombre, clase, ruta, url_clickup, creado_en").eq("compra_id", id).order("creado_en"),
    supabase.from("wms_compra_eventos").select("id, campo, valor_antes, valor_despues, ocurrido_en, autor, origen").eq("compra_id", id).order("ocurrido_en", { ascending: false }),
  ]);
  if (comentarios.error || subtareas.error || adjuntos.error || eventos.error) return { error: "No se pudo cargar la actividad." };

  const rutas = (adjuntos.data ?? []).map((a) => a.ruta as string | null).filter((r): r is string => !!r);
  const firmadas = new Map<string, string>();
  if (rutas.length) {
    const { data } = await supabase.storage.from(BUCKET_COMPRAS).createSignedUrls(rutas, 3600);
    for (const f of data ?? []) if (f.path && f.signedUrl) firmadas.set(f.path, f.signedUrl);
  }
  return {
    comentarios: (comentarios.data ?? []).map((c) => ({ id: c.id, autor: c.autor, texto: c.texto, creadoEn: c.creado_en })),
    subtareas: (subtareas.data ?? []).map((t) => ({ id: t.id, nombre: t.nombre, estado: t.estado, responsable: t.responsable_nombre, creadoEn: t.creado_en, cerradoEn: t.cerrado_en })),
    adjuntos: (adjuntos.data ?? []).map((a) => ({
      id: a.id,
      nombre: a.nombre,
      clase: a.clase,
      url: (a.ruta && firmadas.get(a.ruta)) || a.url_clickup || null,
      creadoEn: a.creado_en,
    })),
    eventos: (eventos.data ?? []).map((e) => ({ id: e.id, campo: e.campo, antes: e.valor_antes, despues: e.valor_despues, ocurridoEn: e.ocurrido_en, autor: e.autor, origen: e.origen })),
  };
}

/**
 * Agrega un comentario a una compra (queda con el nombre de quien lo escribe y la hora). Las personas etiquetadas con «@»
 * (`menciones`) reciben un aviso «Para ti» que abre esta compra en ese comentario. Devuelve el error como valor.
 */
export async function comentarCompra(id: string, texto: string, menciones: string[] = []): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("compras");
  if (!ES_ID(id)) return { error: "Compra no válida." };
  const limpio = String(texto ?? "").trim().slice(0, 5000);
  if (!limpio) return { error: "Escribe el comentario." };
  const autor = usuario.nombre || usuario.email;
  const supabase = createServiceClient();
  const { data, error } = await supabase.from("wms_compra_comentarios").insert({ compra_id: id, autor, texto: limpio }).select("id").single();
  if (error || !data) return { error: "No se pudo guardar el comentario." };

  const mencionados = await mencionadosValidos(menciones, limpio, usuario.id);
  if (mencionados.length) {
    const { data: compra } = await supabase.from("wms_compras").select("numero, nombre, tipo, paises(codigo)").eq("id", id).maybeSingle();
    const pais = (Array.isArray(compra?.paises) ? compra?.paises[0] : compra?.paises) as { codigo: string } | null | undefined;
    const ver = compra?.tipo === "importacion" ? "importacion" : (pais?.codigo ?? "todos");
    const oc = compra ? `OC-${String(compra.numero).padStart(4, "0")}` : "una compra";
    await notificarMenciones({
      mencionados,
      autorId: usuario.id,
      autorNombre: autor,
      titulo: `${autor} te mencionó en la compra ${oc}${compra?.nombre ? ` · ${compra.nombre}` : ""}`,
      texto: limpio,
      href: `/compras/lista?ver=${encodeURIComponent(ver)}&abrir=${id}&comentario=${data.id}`,
    });
  }
  return {};
}

/** Un producto de una orden de compra, para su ficha. */
export interface ItemCompra {
  id: string;
  skuId: string;
  codigo: string;
  nombre: string;
  cantidadPedida: number;
  costoUnitario: number | null;
  loteNumero: number;
  cantidadRecibida: number | null;
  fechaRecepcion: string | null;
  origen: string;
}

/** Un producto de la ficha que se puede agregar a una compra (los compuestos no: no se compran, salen de sus componentes). */
export interface ProductoComprable {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
  clase: string;
  /** Si es una variante, su producto padre; un producto con variantes se compra por variante. */
  padreId: string | null;
  opciones: Record<string, string> | null;
}

/** Los productos de una compra y los que se le pueden agregar. Basta poder abrir Compras. */
export async function obtenerProductosCompra(compraId: string): Promise<{ items: ItemCompra[]; productos: ProductoComprable[] } | { error: string }> {
  await requireModulo("compras");
  if (!ES_ID(compraId)) return { error: "Compra no válida." };
  const supabase = createServiceClient();
  const [items, productos] = await Promise.all([
    supabase
      .from("wms_compra_items")
      .select("id, sku_maestro_id, cantidad_pedida, costo_unitario, lote_numero, cantidad_recibida, fecha_recepcion, origen, skus_maestros(codigo, nombre)")
      .eq("compra_id", compraId)
      .order("creado_en"),
    supabase.from("skus_maestros").select("id, codigo, nombre, estado, clase, padre_id, opciones").neq("tipo", "combo").order("nombre"),
  ]);
  if (items.error || productos.error) return { error: "No se pudieron cargar los productos." };
  return {
    items: (items.data ?? []).map((i) => {
      const sku = (Array.isArray(i.skus_maestros) ? i.skus_maestros[0] : i.skus_maestros) as { codigo: string; nombre: string } | null;
      return {
        id: i.id,
        skuId: i.sku_maestro_id,
        codigo: sku?.codigo ?? "",
        nombre: sku?.nombre ?? "",
        cantidadPedida: i.cantidad_pedida,
        costoUnitario: i.costo_unitario === null ? null : Number(i.costo_unitario),
        loteNumero: i.lote_numero,
        cantidadRecibida: i.cantidad_recibida,
        fechaRecepcion: i.fecha_recepcion,
        origen: i.origen,
      };
    }),
    productos: (productos.data ?? []).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.estado, clase: p.clase, padreId: p.padre_id, opciones: p.opciones })),
  };
}

const ES_CANTIDAD = (n: number) => Number.isInteger(n) && n > 0 && n <= 10_000_000;
const ES_COSTO = (n: number | null) => n === null || (Number.isFinite(n) && n >= 0 && n <= 100_000_000);

/**
 * El total de una compra con productos: la QTY Total es la suma de lo pedido y el Monto Total la de cada línea (cantidad ×
 * costo unitario, en centavos) de las que tienen costo. Sin ninguna línea con costo, el Monto Total no se toca.
 */
async function sincronizarCantidad(compraId: string) {
  const supabase = createServiceClient();
  const { data } = await supabase.from("wms_compra_items").select("cantidad_pedida, costo_unitario").eq("compra_id", compraId);
  const lineas = data ?? [];
  const unidades = lineas.reduce((suma, i) => suma + Number(i.cantidad_pedida), 0);
  const conCosto = lineas.filter((i) => i.costo_unitario !== null);
  const monto = conCosto.reduce((suma, i) => suma + Math.round(Number(i.cantidad_pedida) * Number(i.costo_unitario) * 100) / 100, 0);
  await supabase
    .from("wms_compras")
    .update({
      qty_total: lineas.length ? unidades : null,
      ...(conCosto.length ? { monto_total: Math.round(monto * 100) / 100 } : {}),
      actualizado_en: new Date().toISOString(),
    })
    .eq("id", compraId);
}

// Las acciones de las líneas de una compra no llaman a `revalidatePath`: rearmar toda la página de Compras (más de mil
// compras con sus productos) antes de responder hacía lenta cada edición. El bloque «Productos» recarga sus líneas y pide al
// navegador refrescar la tabla en segundo plano (`router.refresh()` dentro de una transición).

/**
 * Agrega un producto de la ficha a una compra de país, con lo pedido y su costo unitario. Toma el número de lote siguiente
 * de ese producto en el país de la compra (Lote #1, #2…). Un producto en Test no se compra: primero pasa a Activo
 * (`useConfirmarProductoActivo`).
 */
export async function agregarProductoCompra(compraId: string, skuId: string, cantidad: number, costo: number | null): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("compras");
  if (!ES_ID(compraId) || !ES_ID(skuId)) return { error: "Datos no válidos." };
  if (!ES_CANTIDAD(cantidad)) return { error: "La cantidad debe ser un número entero mayor que cero." };
  if (!ES_COSTO(costo)) return { error: "El costo unitario no es válido." };
  const supabase = createServiceClient();
  const { data: sku } = await supabase.from("skus_maestros").select("codigo, nombre, tipo, clase").eq("id", skuId).maybeSingle();
  if (!sku) return { error: "El producto no existe." };
  if (sku.tipo === "combo") return { error: "Un producto compuesto no se compra: se compran sus componentes." };
  if (sku.clase === "test") return { error: "El producto está en Test: pásalo a Activo para comprarlo." };
  const { count: variantes } = await supabase.from("skus_maestros").select("id", { count: "exact", head: true }).eq("padre_id", skuId);
  if ((variantes ?? 0) > 0) return { error: "Ese producto tiene variantes: se compra por variante." };
  const { error } = await supabase.rpc("wms_agregar_item_compra", {
    p_compra: compraId,
    p_sku: skuId,
    p_cantidad: cantidad,
    p_costo: costo,
    p_lote: null,
    p_origen: "sistema",
    p_usuario: usuario.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "Ese producto ya está en la compra: cambia su cantidad." };
    return { error: error.message.length < 200 ? error.message : "No se pudo agregar el producto." };
  }
  await sincronizarCantidad(compraId);
  await anotarCambios(compraId, [{ campo: "productoAgregado", antes: null, despues: `${sku.codigo} · ${sku.nombre} · ${textoLinea(cantidad, costo)}` }]);
  await registrarAuditoria({ accion: "agregar_producto_compra", entidad: "wms_compras", entidadId: compraId, detalle: `${sku.codigo} · ${cantidad} u.` });
  return {};
}

/** Cambia lo pedido o el costo unitario de un producto de una compra. */
export async function actualizarProductoCompra(itemId: string, cantidad: number, costo: number | null): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  if (!ES_ID(itemId)) return { error: "Producto no válido." };
  if (!ES_CANTIDAD(cantidad)) return { error: "La cantidad debe ser un número entero mayor que cero." };
  if (!ES_COSTO(costo)) return { error: "El costo unitario no es válido." };
  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("wms_compra_items").select("cantidad_pedida, costo_unitario, skus_maestros(codigo, nombre)").eq("id", itemId).maybeSingle();
  const { data, error } = await supabase
    .from("wms_compra_items")
    .update({ cantidad_pedida: cantidad, costo_unitario: costo, actualizado_en: new Date().toISOString() })
    .eq("id", itemId)
    .select("compra_id")
    .single();
  if (error || !data) return { error: "No se pudo guardar el cambio." };
  await sincronizarCantidad(data.compra_id);
  if (antes) {
    const sku = (Array.isArray(antes.skus_maestros) ? antes.skus_maestros[0] : antes.skus_maestros) as { codigo: string; nombre: string } | null;
    const previo = textoLinea(Number(antes.cantidad_pedida), antes.costo_unitario === null ? null : Number(antes.costo_unitario));
    const ahora = textoLinea(cantidad, costo);
    if (previo !== ahora) await anotarCambios(data.compra_id, [{ campo: "productoCambiado", antes: `${sku?.codigo ?? ""} · ${sku?.nombre ?? ""} · ${previo}`, despues: ahora }]);
  }
  return {};
}

/** Quita un producto de una compra, si todavía no se recibió nada de él. */
export async function quitarProductoCompra(itemId: string): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  if (!ES_ID(itemId)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: item } = await supabase
    .from("wms_compra_items")
    .select("compra_id, cantidad_recibida, cantidad_pedida, costo_unitario, skus_maestros(codigo, nombre)")
    .eq("id", itemId)
    .maybeSingle();
  if (!item) return { error: "El producto ya no está en la compra." };
  if (item.cantidad_recibida !== null) return { error: "Ya se recibió mercancía de este producto: no se puede quitar." };
  const { error } = await supabase.from("wms_compra_items").delete().eq("id", itemId);
  if (error) return { error: "No se pudo quitar el producto." };
  await sincronizarCantidad(item.compra_id);
  const sku = (Array.isArray(item.skus_maestros) ? item.skus_maestros[0] : item.skus_maestros) as { codigo: string; nombre: string } | null;
  await anotarCambios(item.compra_id, [
    {
      campo: "productoQuitado",
      antes: `${sku?.codigo ?? ""} · ${sku?.nombre ?? ""} · ${textoLinea(Number(item.cantidad_pedida), item.costo_unitario === null ? null : Number(item.costo_unitario))}`,
      despues: null,
    },
  ]);
  await registrarAuditoria({ accion: "quitar_producto_compra", entidad: "wms_compras", entidadId: item.compra_id, detalle: sku?.codigo ?? itemId });
  return {};
}

/** Elige el color de una etiqueta de Compras (como en ClickUp): vale para todas las compras que la tengan. */
export async function guardarColorEtiqueta(nombre: string, color: string): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  const limpio = String(nombre ?? "").trim().slice(0, 40);
  if (!limpio) return { error: "Etiqueta no válida." };
  if (!/^#[0-9a-fA-F]{6}$/.test(String(color))) return { error: "Color no válido." };
  const { error } = await createServiceClient()
    .from("wms_compras_etiquetas")
    .upsert({ nombre: limpio, color, actualizado_en: new Date().toISOString() }, { onConflict: "nombre" });
  if (error) return { error: "No se pudo guardar el color." };
  return {};
}
