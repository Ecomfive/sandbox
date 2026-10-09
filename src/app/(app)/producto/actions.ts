"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { formatearEventoAuditoria } from "@/lib/auditoria-cambios";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { esCodigoBarrasValido, esCodigoInterno, normalizarCodigoBarras } from "@/lib/wms/codigo-barras";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { descargarPublico } from "@/lib/seguridad/url-externa";
import { primeroLibre, sugerirSku } from "@/lib/wms/sugerir-sku";
import { ETIQUETA_CLASE } from "./def-producto";

const MODULO = "producto";
const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);
const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim();

/**
 * Crea un producto: simple o compuesto, físico o de prueba (test). El código (SKU) es la llave con la que una venta de
 * Dropi o de una tienda de Shopify encuentra el producto para descontar el inventario, así que es obligatorio y único sin
 * importar mayúsculas ni espacios. Un compuesto se arma con productos simples. Devuelve el error como valor, porque en
 * producción Next.js oculta el mensaje de una excepción de una acción.
 */
export async function crearProducto(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura(MODULO);
  const nombre = texto(formData, "nombre");
  const codigo = texto(formData, "codigo");
  const tipo = texto(formData, "tipo");
  const clase = texto(formData, "clase");
  // El código de barras: por defecto uno interno (lo normal es que el producto venga sin código); o el del fabricante, que se
  // escribe; o ninguno (un compuesto). Sin `barras_origen` (otra pantalla), interno solo si se pidió con `generar_barras`.
  const origenBarras = texto(formData, "barras_origen");
  const barras = origenBarras === "interno" || origenBarras === "ninguno" ? "" : normalizarCodigoBarras(texto(formData, "codigo_barras"));
  const generarBarras = origenBarras ? origenBarras === "interno" : texto(formData, "generar_barras") === "1";
  if (origenBarras === "fabricante" && !barras) return { error: "Escribe el código de barras del fabricante (o elige uno interno)." };
  // El interno que ya se vio en la ficha (separado al abrirla); se revisa que sea de verdad uno interno.
  const reservado = normalizarCodigoBarras(texto(formData, "codigo_barras_interno"));
  const internoVisto = generarBarras && esCodigoInterno(reservado) ? reservado : "";
  // Un producto que caduca se controla por lote y fecha de vencimiento; un compuesto no (sale de sus componentes).
  const manejaVencimiento = texto(formData, "maneja_vencimiento") === "1";
  const diasAvisoTexto = texto(formData, "dias_aviso_vencimiento");
  const diasAviso = diasAvisoTexto ? Number(diasAvisoTexto) : null;

  if (!nombre) return { error: "Escribe el nombre del producto." };
  if (nombre.length > 200) return { error: "El nombre es muy largo (máximo 200 caracteres)." };
  if (!codigo) return { error: "Escribe el SKU del producto." };
  const errorSku = await errorDeSku(codigo, null);
  if (errorSku) return { error: errorSku };
  if (tipo !== "simple" && tipo !== "combo") return { error: "Elige si es simple o compuesto." };
  if (clase !== "fisico" && clase !== "test") return { error: "Elige si es físico o de prueba (test)." };
  if (manejaVencimiento && tipo === "combo") return { error: "Un producto compuesto no maneja vencimiento: sale de sus componentes." };
  if (diasAviso !== null && (!Number.isInteger(diasAviso) || diasAviso < 1 || diasAviso > 3650)) return { error: "Los días de aviso deben ser un número entre 1 y 3650." };
  if (barras && generarBarras) return { error: "Escribe el código de barras o pide uno interno, no las dos cosas." };
  if (barras && !esCodigoBarrasValido(barras)) return { error: "El código de barras no es válido: debe ser un EAN-8, UPC-A, EAN-13 o GTIN-14 con su dígito de control correcto." };

  // Un compuesto: pares (componente, cantidad), sin repetir un componente.
  const ids = formData.getAll("componente_id").map(String);
  const cantidades = formData.getAll("cantidad").map(String);
  const componentes = new Map<string, number>();
  if (tipo === "combo") {
    ids.forEach((id, i) => {
      const cantidad = Number(cantidades[i]);
      if (!ES_ID(id) || !Number.isInteger(cantidad) || cantidad <= 0) return;
      componentes.set(id, (componentes.get(id) ?? 0) + cantidad);
    });
    if (componentes.size === 0) return { error: "Un producto compuesto necesita al menos un componente con cantidad mayor a cero." };
  }

  const supabase = createServiceClient();
  if (componentes.size > 0) {
    const { data: simples } = await supabase.from("skus_maestros").select("id").eq("tipo", "simple").in("id", [...componentes.keys()]);
    if ((simples ?? []).length !== componentes.size) return { error: "Un componente no es un producto simple válido." };
    // Un producto con variantes no lleva stock: el compuesto debe llevar la variante (la que se descuenta al vender).
    const { data: conVariantes } = await supabase.from("skus_maestros").select("padre_id").in("padre_id", [...componentes.keys()]).limit(1);
    if ((conVariantes ?? []).length > 0) return { error: "Un componente tiene variantes: elige la variante (por ejemplo el color o la talla) que lleva el compuesto." };
  }

  const { data, error } = await supabase
    .from("skus_maestros")
    .insert({
      codigo,
      nombre,
      tipo,
      clase,
      estado: "aprobado",
      creado_por: usuario.id,
      ...(barras ? { codigo_barras: barras, codigo_barras_origen: "fabricante" } : internoVisto ? { codigo_barras: internoVisto, codigo_barras_origen: "interno" } : {}),
      ...(manejaVencimiento ? { maneja_vencimiento: true, dias_aviso_vencimiento: diasAviso } : {}),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: error.message.includes("barras") ? "Otro producto ya tiene ese código de barras." : "Ya hay un producto con ese SKU." };
    return { error: "No se pudo crear el producto." };
  }

  if (componentes.size > 0) {
    const { error: errorComponentes } = await supabase
      .from("sku_maestro_componentes")
      .insert([...componentes.entries()].map(([componente_id, cantidad]) => ({ combo_id: data.id, componente_id, cantidad })));
    if (errorComponentes) {
      await supabase.from("skus_maestros").delete().eq("id", data.id);
      return { error: "No se pudieron guardar los componentes." };
    }
  }

  // Variantes pedidas al crear: se crean ya con el producto; si no se pueden (un SKU repetido…), el producto tampoco queda.
  const variantesTexto = texto(formData, "variantes");
  if (variantesTexto && tipo === "simple") {
    let armadas: { opciones: OpcionVariante[]; variantes: VarianteNueva[] } | null = null;
    try {
      armadas = JSON.parse(variantesTexto);
    } catch {
      armadas = null;
    }
    const r = armadas ? await crearVariantes(data.id, armadas.opciones, armadas.variantes) : { error: "Las variantes no son válidas." };
    if (r.error) {
      await supabase.from("skus_maestros").delete().eq("id", data.id);
      return { error: `No se creó el producto: ${r.error}` };
    }
  }

  // Si se pidió un código interno y no se pudo generar, el producto queda creado: se genera después desde su ficha.
  if (generarBarras && !internoVisto) await supabase.rpc("wms_asignar_codigo_barras_interno", { p_sku: data.id });

  await registrarAuditoria({
    accion: "crear_producto",
    entidad: "skus_maestros",
    entidadId: data.id,
    detalle: `SKU ${codigo} · ${tipo === "combo" ? `compuesto de ${componentes.size}` : "simple"} · ${ETIQUETA_CLASE[clase]}`,
  });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return {};
}

/**
 * Cambia el estado de un producto: de Test a Activo (se decidió comprarlo) o de Activo a Test. Vuelve a Test solo si nunca
 * tuvo movimientos de inventario: con historia ya no es una prueba. `desde` queda en la actividad («desde Compras»).
 */
async function aplicarEstado(id: string, clase: "fisico" | "test", desde?: string): Promise<{ error?: string }> {
  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("skus_maestros").select("codigo, clase").eq("id", id).maybeSingle();
  if (!actual) return { error: "El producto ya no existe." };
  if (actual.clase === clase) return {};

  if (clase === "test") {
    const { count } = await supabase.from("wms_movimientos").select("id", { count: "exact", head: true }).eq("sku_maestro_id", id);
    if ((count ?? 0) > 0) return { error: "Ya tiene movimientos de inventario: no se puede volver a marcar como test." };
  }

  const { error } = await supabase.from("skus_maestros").update({ clase }).eq("id", id);
  if (error) return { error: "No se pudo cambiar el estado." };
  await registrarAuditoria({
    accion: "cambiar_clase_producto",
    entidad: "skus_maestros",
    entidadId: id,
    antes: { Estado: ETIQUETA_CLASE[actual.clase] ?? actual.clase },
    despues: { Estado: desde ? `${ETIQUETA_CLASE[clase]} (${desde})` : ETIQUETA_CLASE[clase] },
  });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return {};
}

/** El estado de un producto desde su ficha: Activo ('fisico') o Test. Devuelve el error como valor. */
export async function cambiarClaseProducto(id: string, clase: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  if (clase !== "fisico" && clase !== "test") return { error: "Estado no válido." };
  return aplicarEstado(id, clase);
}

/**
 * Para Compras: un producto en Test no se puede comprar. Cuando alguien acepta la advertencia de Compras («este producto
 * debe pasar a Activo»), esta acción lo pasa a Activo en su ficha. Basta poder modificar Compras: aceptar es la decisión
 * de comprarlo. Si ya estaba activo no hace nada. Devuelve el error como valor.
 */
export async function activarProductoParaCompra(id: string): Promise<{ error?: string }> {
  await requireModuloEscritura("compras");
  if (!ES_ID(id)) return { error: "Producto no válido." };
  return aplicarEstado(id, "fisico", "desde Compras");
}

/** La actividad de un producto (creación, cambios de clase) para su ficha. Basta poder abrir Producto. */
export async function obtenerHistorialProducto(id: string): Promise<{ eventos: { id: string; evento: string; creadoEn: string }[] } | { error: string }> {
  await requireModulo(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };

  const { data, error } = await createServiceClient()
    .from("historial_auditoria")
    .select("id, accion, usuario_nombre, detalle, antes, despues, creado_en")
    .eq("entidad", "skus_maestros")
    .eq("entidad_id", id)
    .order("creado_en", { ascending: false })
    .limit(30);
  if (error) return { error: "No se pudo cargar la actividad." };
  return { eventos: (data ?? []).map((e) => ({ id: e.id, evento: formatearEventoAuditoria(e), creadoEn: e.creado_en })) };
}

/** Vincula un producto que llega en los pedidos de Dropi (tabla `productos`) con un producto del sistema (o lo desvincula). */
export async function vincularProductoASku(formData: FormData) {
  await requireModuloEscritura(MODULO);
  const productoId = formData.get("producto_id") as string;
  const skuMaestroId = (formData.get("sku_maestro_id") as string) || null;

  const supabase = createServiceClient();
  const { error } = await supabase.from("productos").update({ sku_maestro_id: skuMaestroId }).eq("id", productoId);
  if (error) throw new Error(error.message);
  revalidatePath("/productos");
}

/**
 * Separa el siguiente código de barras interno (EAN-13 con prefijo 20) para verlo en la ficha de un producto nuevo antes de
 * crearlo; al crear se guarda ese mismo. Si la ficha se cierra sin crear, ese número queda sin usar (no hace falta que sean
 * seguidos).
 */
export async function reservarCodigoBarrasInterno(): Promise<{ codigo?: string; error?: string }> {
  await requireModuloEscritura(MODULO);
  const { data, error } = await createServiceClient().rpc("wms_generar_codigo_barras");
  if (error || !data) return { error: "No se pudo generar el código de barras." };
  return { codigo: String(data) };
}

/**
 * Guarda el código de barras del fabricante (EAN-8, UPC-A, EAN-13 o GTIN-14) de un producto, o lo quita si llega vacío. Se
 * comprueba el dígito de control: un código mal escrito se rechaza. Devuelve el error como valor.
 */
export async function guardarCodigoBarras(id: string, codigoTexto: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const codigo = normalizarCodigoBarras(codigoTexto);
  if (codigo && !esCodigoBarrasValido(codigo)) {
    return { error: "El código no es válido: debe ser un EAN-8, UPC-A, EAN-13 o GTIN-14 con su dígito de control correcto." };
  }

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("skus_maestros").select("codigo, codigo_barras").eq("id", id).maybeSingle();
  if (!actual) return { error: "El producto ya no existe." };
  if ((actual.codigo_barras ?? "") === codigo) return {};

  const { error } = await supabase
    .from("skus_maestros")
    .update({ codigo_barras: codigo || null, codigo_barras_origen: codigo ? "fabricante" : null })
    .eq("id", id);
  if (error) return { error: error.code === "23505" ? "Otro producto ya tiene ese código de barras." : "No se pudo guardar el código de barras." };

  await registrarAuditoria({
    accion: "guardar_codigo_barras",
    entidad: "skus_maestros",
    entidadId: id,
    antes: { "Código de barras": actual.codigo_barras ?? "—" },
    despues: { "Código de barras": codigo || "—" },
  });
  revalidatePath("/producto");
  return {};
}

/**
 * Le genera a un producto que no tiene código de barras uno INTERNO (EAN-13 con prefijo 20, reservado por GS1 para uso interno),
 * para poder manejarlo en la bodega con escáner. Lo hace la base en una sola operación: dos personas a la vez no obtienen el
 * mismo código. Devuelve el código, o el error como valor.
 */
export async function generarCodigoBarrasInterno(id: string): Promise<{ codigo?: string; error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const { data, error } = await createServiceClient().rpc("wms_asignar_codigo_barras_interno", { p_sku: id });
  if (error) return { error: error.message.length < 200 ? error.message : "No se pudo generar el código de barras." };
  await registrarAuditoria({
    accion: "generar_codigo_barras",
    entidad: "skus_maestros",
    entidadId: id,
    detalle: `código interno ${data}`,
  });
  revalidatePath("/producto");
  return { codigo: String(data) };
}

/**
 * Activa o desactiva el control de vencimiento de un producto (se lleva por lote y fecha de caducidad) y fija con cuántos días
 * de anticipación se avisa de un lote por vencer (sin dato, 60). La base lo rechaza si el producto ya tiene stock sin lote (al
 * activarlo) o lotes con unidades (al desactivarlo). Devuelve el error como valor.
 */
export async function configurarVencimiento(id: string, maneja: boolean, diasAviso: number | null): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  if (diasAviso !== null && (!Number.isInteger(diasAviso) || diasAviso < 1 || diasAviso > 3650)) return { error: "Los días de aviso deben ser un número entre 1 y 3650." };

  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("skus_maestros").select("codigo, tipo, maneja_vencimiento, dias_aviso_vencimiento").eq("id", id).maybeSingle();
  if (!actual) return { error: "El producto ya no existe." };
  if (maneja && actual.tipo === "combo") return { error: "Un producto compuesto no maneja vencimiento: sale de sus componentes." };

  const { error } = await supabase.from("skus_maestros").update({ maneja_vencimiento: maneja, dias_aviso_vencimiento: maneja ? diasAviso : null }).eq("id", id);
  if (error) return { error: error.message.length < 200 ? error.message : "No se pudo cambiar el control de vencimiento." };

  await registrarAuditoria({
    accion: "configurar_vencimiento",
    entidad: "skus_maestros",
    entidadId: id,
    antes: { Vencimiento: actual.maneja_vencimiento ? `Sí (aviso ${actual.dias_aviso_vencimiento ?? 60} días)` : "No" },
    despues: { Vencimiento: maneja ? `Sí (aviso ${diasAviso ?? 60} días)` : "No" },
  });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return {};
}

/** Lo que manda el bloque «Envío» de la ficha (los números llegan como texto, tal como se escribieron). */
export interface DatosEnvio {
  esFisico: boolean;
  embalaje: string;
  largo: string;
  ancho: string;
  alto: string;
  unidadMedida: string;
  peso: string;
  unidadPeso: string;
  paisOrigen: string;
  codigoSa: string;
}

/**
 * Guarda el bloque «Envío» de un producto: si es físico y, entonces, su embalaje, tamaño empacado, peso, país de origen y
 * código SA. Con «físico» apagado los datos se conservan (por si se vuelve a encender). Devuelve el error como valor.
 */
export async function guardarEnvio(id: string, d: DatosEnvio): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };

  const medida = (v: string, nombre: string): number | null | { error: string } => {
    const t = String(v ?? "").trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 99_999_999) return { error: `${nombre} debe ser un número positivo.` };
    return n;
  };
  const valores: Record<string, number | null> = {};
  for (const [campo, nombre] of [["largo", "El largo"], ["ancho", "El ancho"], ["alto", "El alto"], ["peso", "El peso"]] as const) {
    const r = medida(d[campo], nombre);
    if (r !== null && typeof r === "object") return r;
    valores[campo] = r;
  }
  if (!["cm", "in"].includes(d.unidadMedida)) return { error: "Unidad de medida no válida." };
  if (!["kg", "g", "lb", "oz"].includes(d.unidadPeso)) return { error: "Unidad de peso no válida." };
  const codigoSa = String(d.codigoSa ?? "").trim();
  if (codigoSa && !/^[0-9]{4}([.]?[0-9]{2}){0,3}$/.test(codigoSa)) return { error: "El código SA debe tener de 4 a 10 cifras (Ej: 8424.89)." };

  const nuevo = {
    es_fisico: d.esFisico === true,
    embalaje: String(d.embalaje ?? "").trim().slice(0, 120) || null,
    largo: valores.largo,
    ancho: valores.ancho,
    alto: valores.alto,
    unidad_medida: d.unidadMedida,
    peso: valores.peso,
    unidad_peso: d.unidadPeso,
    pais_origen: String(d.paisOrigen ?? "").trim().slice(0, 80) || null,
    codigo_sa: codigoSa || null,
  };

  const supabase = createServiceClient();
  const { data: actual } = await supabase
    .from("skus_maestros")
    .select("es_fisico, embalaje, largo, ancho, alto, unidad_medida, peso, unidad_peso, pais_origen, codigo_sa")
    .eq("id", id)
    .maybeSingle();
  if (!actual) return { error: "El producto ya no existe." };

  const { error } = await supabase.from("skus_maestros").update(nuevo).eq("id", id);
  if (error) return { error: error.message.length < 200 ? error.message : "No se pudo guardar el envío." };

  const tamano = (r: { largo: unknown; ancho: unknown; alto: unknown; unidad_medida: unknown }) =>
    r.largo === null && r.ancho === null && r.alto === null ? "—" : `${r.largo ?? 0} × ${r.ancho ?? 0} × ${r.alto ?? 0} ${r.unidad_medida}`;
  const resumen = (r: typeof nuevo | typeof actual) => ({
    "Producto físico": r.es_fisico ? "Sí" : "No",
    Embalaje: r.embalaje || "—",
    Tamaño: tamano(r),
    Peso: r.peso === null ? "—" : `${r.peso} ${r.unidad_peso}`,
    "País de origen": r.pais_origen || "—",
    "Código SA": r.codigo_sa || "—",
  });
  const antes = resumen(actual);
  const despues = resumen(nuevo);
  const cambiaron = (Object.keys(despues) as (keyof typeof despues)[]).filter((k) => String(antes[k]) !== String(despues[k]));
  if (cambiaron.length > 0) {
    await registrarAuditoria({
      accion: "guardar_envio",
      entidad: "skus_maestros",
      entidadId: id,
      antes: Object.fromEntries(cambiaron.map((k) => [k, antes[k]])),
      despues: Object.fromEntries(cambiaron.map((k) => [k, despues[k]])),
    });
  }
  revalidatePath("/producto");
  return {};
}

/** Una opción de las variantes de un producto (Color, Talla…) con sus valores. */
export interface OpcionVariante {
  nombre: string;
  valores: string[];
}

/** Una variante a crear: sus valores (uno por opción), su SKU y su nombre. */
export interface VarianteNueva {
  opciones: Record<string, string>;
  codigo: string;
  nombre: string;
}

const limpiar = (t: string) => String(t ?? "").trim().replace(/\s+/g, " ");

/**
 * Crea variantes de un producto (cada una es un producto simple con su SKU, su stock y sus lotes) y guarda en el padre sus
 * opciones con los valores. Las variantes heredan del padre el estado (Activo/Test), el vencimiento y los datos de envío. El
 * padre deja de tener stock propio: para darle variantes no puede tener unidades. Una variante no tiene variantes y un
 * compuesto tampoco. Devuelve el error como valor.
 */
export async function crearVariantes(padreId: string, opciones: OpcionVariante[], variantes: VarianteNueva[]): Promise<{ error?: string; creadas?: number }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!ES_ID(padreId)) return { error: "Producto no válido." };

  // Las opciones: 1 a 3, con nombre y al menos un valor, sin repetir.
  const ops = (opciones ?? []).map((o) => ({ nombre: limpiar(o.nombre).slice(0, 40), valores: [...new Set((o.valores ?? []).map((v) => limpiar(v).slice(0, 40)).filter(Boolean))] }));
  if (ops.length === 0 || ops.length > 3) return { error: "Las variantes llevan de 1 a 3 opciones (por ejemplo Color y Talla)." };
  if (ops.some((o) => !o.nombre || o.valores.length === 0)) return { error: "Cada opción necesita un nombre y al menos un valor." };
  if (new Set(ops.map((o) => o.nombre.toLowerCase())).size !== ops.length) return { error: "Hay dos opciones con el mismo nombre." };

  const nuevas = (variantes ?? []).map((v) => ({ opciones: v.opciones ?? {}, codigo: limpiar(v.codigo), nombre: limpiar(v.nombre).slice(0, 200) }));
  if (nuevas.length === 0) return { error: "No hay variantes nuevas para crear." };
  if (nuevas.length > 200) return { error: "Son demasiadas variantes de una vez (máximo 200)." };
  for (const v of nuevas) {
    if (!v.codigo || v.codigo.length > 60 || /\s/.test(v.codigo)) return { error: `El SKU «${v.codigo || "(vacío)"}» no es válido: sin espacios y hasta 60 caracteres.` };
    if (!v.nombre) return { error: `Falta el nombre de la variante ${v.codigo}.` };
    for (const o of ops) if (!o.valores.includes(v.opciones[o.nombre])) return { error: `La variante ${v.codigo} no tiene un valor válido de ${o.nombre}.` };
  }
  if (new Set(nuevas.map((v) => v.codigo.toLowerCase())).size !== nuevas.length) return { error: "Hay dos variantes con el mismo SKU." };

  const supabase = createServiceClient();
  const { data: padre } = await supabase
    .from("skus_maestros")
    .select("id, codigo, tipo, clase, padre_id, maneja_vencimiento, dias_aviso_vencimiento, es_fisico, embalaje, largo, ancho, alto, unidad_medida, peso, unidad_peso, pais_origen, codigo_sa")
    .eq("id", padreId)
    .maybeSingle();
  if (!padre) return { error: "El producto ya no existe." };
  if (padre.tipo === "combo") return { error: "Un producto compuesto no tiene variantes." };
  if (padre.padre_id) return { error: "Una variante no puede tener variantes." };

  const { data: hijas } = await supabase.from("skus_maestros").select("opciones").eq("padre_id", padreId);
  if (!hijas || hijas.length === 0) {
    const { data: stock } = await supabase.from("wms_stock").select("fisico").eq("sku_maestro_id", padreId);
    if ((stock ?? []).some((s) => Number(s.fisico) !== 0)) return { error: "El producto tiene stock: llévalo a cero antes de darle variantes (el stock pasa a llevarse en cada variante)." };
  }
  // Una combinación que ya existe no se vuelve a crear.
  const clave = (o: Record<string, string>) => ops.map((x) => `${x.nombre}=${o?.[x.nombre] ?? ""}`).join("|");
  const existentes = new Set((hijas ?? []).map((h) => clave(h.opciones as Record<string, string>)));
  const aCrear = nuevas.filter((v) => !existentes.has(clave(v.opciones)));
  if (aCrear.length === 0) return { error: "Esas variantes ya existen." };

  const { error: errorPadre } = await supabase.from("skus_maestros").update({ opciones_variantes: ops }).eq("id", padreId);
  if (errorPadre) return { error: "No se pudieron guardar las opciones." };

  const heredado = {
    tipo: "simple",
    clase: padre.clase,
    estado: "aprobado",
    padre_id: padreId,
    creado_por: usuario.id,
    maneja_vencimiento: padre.maneja_vencimiento,
    dias_aviso_vencimiento: padre.dias_aviso_vencimiento,
    es_fisico: padre.es_fisico,
    embalaje: padre.embalaje,
    largo: padre.largo,
    ancho: padre.ancho,
    alto: padre.alto,
    unidad_medida: padre.unidad_medida,
    peso: padre.peso,
    unidad_peso: padre.unidad_peso,
    pais_origen: padre.pais_origen,
    codigo_sa: padre.codigo_sa,
  };
  const { error } = await supabase.from("skus_maestros").insert(aCrear.map((v) => ({ ...heredado, codigo: v.codigo, nombre: v.nombre, opciones: v.opciones })));
  if (error) {
    if (error.code === "23505") return { error: "Uno de esos SKU ya lo tiene otro producto." };
    return { error: error.message.length < 200 ? error.message : "No se pudieron crear las variantes." };
  }
  await registrarAuditoria({
    accion: "crear_variantes",
    entidad: "skus_maestros",
    entidadId: padreId,
    detalle: `${aCrear.length} variante${aCrear.length === 1 ? "" : "s"}: ${aCrear.map((v) => v.codigo).join(", ")}`.slice(0, 500),
  });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return { creadas: aCrear.length };
}

/**
 * Quita una variante que todavía no se usó: sin movimientos de inventario, sin compras y sin fichas enlazadas. Si ya tiene
 * historia, se conserva (se puede pasar a Test o dejar sin stock).
 */
export async function quitarVariante(id: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Variante no válida." };
  const supabase = createServiceClient();
  const { data: v } = await supabase.from("skus_maestros").select("codigo, padre_id").eq("id", id).maybeSingle();
  if (!v || !v.padre_id) return { error: "No es una variante." };
  const { count: enCombos } = await supabase.from("sku_maestro_componentes").select("id", { count: "exact", head: true }).eq("componente_id", id);
  if ((enCombos ?? 0) > 0) return { error: "La variante es parte de un producto compuesto: quítala del compuesto primero." };
  const [movs, compras, shopify, dropi] = await Promise.all([
    supabase.from("wms_movimientos").select("id", { count: "exact", head: true }).eq("sku_maestro_id", id),
    supabase.from("wms_compra_items").select("id", { count: "exact", head: true }).eq("sku_maestro_id", id),
    supabase.from("wms_producto_variantes").select("id", { count: "exact", head: true }).eq("sku_maestro_id", id),
    supabase.from("wms_dropi_productos").select("id", { count: "exact", head: true }).eq("sku_maestro_id", id),
  ]);
  if ((movs.count ?? 0) + (compras.count ?? 0) + (shopify.count ?? 0) + (dropi.count ?? 0) > 0)
    return { error: "La variante ya tiene movimientos, compras o fichas enlazadas: no se puede quitar." };
  const { error } = await supabase.from("skus_maestros").delete().eq("id", id);
  if (error) return { error: "No se pudo quitar la variante." };
  await registrarAuditoria({ accion: "quitar_variante", entidad: "skus_maestros", entidadId: v.padre_id, detalle: v.codigo });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return {};
}

// --- Foto del producto ---------------------------------------------------------------------------------------------
// Vive en el bucket público `wms-productos`, bajo `productos/<id del producto>/`. Se sube directo desde el navegador con una
// dirección firmada (sin pasar el archivo por la acción) y después se guarda su ruta.
const BUCKET_FOTOS = "wms-productos";
const PREFIJO_FOTOS = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;

/** Da permiso para subir la foto de un producto. Devuelve el error como valor. */
export async function prepararSubidaFotoProducto(id: string, nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const nombre = String(nombreArchivo ?? "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "foto";
  const ruta = `productos/${id}/${Date.now()}-${nombre}`;
  const { data, error } = await createServiceClient().storage.from(BUCKET_FOTOS).createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No se pudo preparar la subida." };
  return { ruta, token: data.token };
}

/**
 * Guarda (o quita, con `ruta` null) la foto de un producto. La foto debe estar en la carpeta de ese producto y ser de verdad
 * una imagen (se revisa su contenido, no el nombre). La anterior, si era nuestra, se borra. Devuelve el error como valor.
 */
export async function guardarFotoProducto(id: string, ruta: string | null): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: actual, error: errorActual } = await supabase.from("skus_maestros").select("codigo, foto_url").eq("id", id).single();
  if (errorActual || !actual) return { error: "No se encontró el producto." };

  let url: string | null = null;
  if (ruta !== null) {
    if (typeof ruta !== "string" || !ruta.startsWith(`productos/${id}/`) || ruta.includes("..")) return { error: "Foto no válida." };
    const { data: archivo } = await supabase.storage.from(BUCKET_FOTOS).download(ruta);
    const imagen = archivo ? detectarImagen(new Uint8Array(await archivo.slice(0, 64).arrayBuffer())) : null;
    if (!imagen) {
      await supabase.storage.from(BUCKET_FOTOS).remove([ruta]);
      return { error: "El archivo no es una imagen (JPG, PNG, WebP o GIF)." };
    }
    url = PREFIJO_FOTOS + ruta;
  }

  const { error } = await supabase.from("skus_maestros").update({ foto_url: url }).eq("id", id);
  if (error) return { error: "No se pudo guardar la foto." };
  const anterior = actual.foto_url as string | null;
  if (anterior && anterior !== url && anterior.startsWith(PREFIJO_FOTOS)) await supabase.storage.from(BUCKET_FOTOS).remove([anterior.slice(PREFIJO_FOTOS.length)]);
  await registrarAuditoria({
    accion: "cambiar_foto_producto",
    entidad: "skus_maestros",
    entidadId: id,
    detalle: `SKU ${actual.codigo} · ${url ? (anterior ? "foto cambiada" : "foto agregada") : "foto quitada"}`,
  });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return {};
}

/** Cambia el nombre de un producto (desde su ficha). Queda en su actividad con el nombre de antes y el nuevo. */
export async function renombrarProducto(id: string, nombre: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const limpio = String(nombre ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
  if (!limpio) return { error: "El nombre no puede quedar vacío." };
  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("skus_maestros").select("codigo, nombre").eq("id", id).maybeSingle();
  if (!antes) return { error: "No se encontró el producto." };
  if (antes.nombre === limpio) return {};
  const { error } = await supabase.from("skus_maestros").update({ nombre: limpio }).eq("id", id);
  if (error) return { error: "No se pudo guardar el nombre." };
  await registrarAuditoria({ accion: "renombrar_producto", entidad: "skus_maestros", entidadId: id, antes: { Nombre: antes.nombre }, despues: { Nombre: limpio } });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return {};
}

// --- SKU ------------------------------------------------------------------------------------------------------------
// Lo escribe la persona y no puede repetirse (sin importar mayúsculas ni espacios: lo exige también el índice único de la
// base). Se puede corregir después desde la ficha, siempre por uno que no tenga otro producto.

/** El producto que ya usa ese SKU (sin contar `excepto`), o null. */
async function productoConSku(codigo: string, excepto: string | null): Promise<{ codigo: string; nombre: string } | null> {
  // `ilike` sin comodines: se escapan % y _ (y la barra invertida) para que solo encuentre ese código exacto.
  const patron = codigo.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await createServiceClient().from("skus_maestros").select("id, codigo, nombre").ilike("codigo", patron);
  return (data ?? []).find((p) => p.id !== excepto && String(p.codigo).trim().toLowerCase() === codigo.trim().toLowerCase()) ?? null;
}

/** Por qué ese SKU no sirve (vacío, con espacios, muy largo o de otro producto), o null si sirve. */
async function errorDeSku(codigo: string, excepto: string | null): Promise<string | null> {
  if (!codigo) return "Escribe el SKU del producto.";
  if (codigo.length > 60 || /\s/.test(codigo)) return "El SKU no puede llevar espacios ni pasar de 60 caracteres.";
  const otro = await productoConSku(codigo, excepto);
  return otro ? `Ya existe un producto con el SKU ${otro.codigo}: ${otro.nombre}.` : null;
}

/** Para el campo SKU mientras se escribe: si está libre o quién lo tiene. */
export async function revisarSku(codigo: string, excepto: string | null = null): Promise<{ error?: string }> {
  await requireModulo(MODULO);
  if (excepto !== null && !ES_ID(excepto)) return {};
  const error = await errorDeSku(String(codigo ?? "").trim(), excepto);
  return error ? { error } : {};
}

/**
 * Corrige el SKU de un producto por uno que no exista. Las fichas de Shopify y de Dropi enlazadas toman el SKU nuevo; en las
 * plataformas hay que cambiarlo a mano (las ventas buscan el producto por su SKU). Queda en la actividad del producto.
 */
export async function cambiarSkuProducto(id: string, nuevo: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const codigo = String(nuevo ?? "").trim();
  const supabase = createServiceClient();
  const { data: actual } = await supabase.from("skus_maestros").select("codigo").eq("id", id).maybeSingle();
  if (!actual) return { error: "No se encontró el producto." };
  if (actual.codigo === codigo) return {};
  const errorSku = await errorDeSku(codigo, id);
  if (errorSku) return { error: errorSku };
  const { error } = await supabase.from("skus_maestros").update({ codigo }).eq("id", id);
  if (error) return { error: error.code === "23505" ? "Ya existe un producto con ese SKU." : "No se pudo cambiar el SKU." };
  // Las fichas de canal enlazadas guardan una copia del SKU: se actualiza.
  await Promise.all([
    supabase.from("wms_producto_variantes").update({ sku: codigo }).eq("sku_maestro_id", id),
    supabase.from("wms_dropi_productos").update({ sku: codigo }).eq("sku_maestro_id", id),
  ]);
  await registrarAuditoria({ accion: "cambiar_sku_producto", entidad: "skus_maestros", entidadId: id, antes: { SKU: actual.codigo }, despues: { SKU: codigo } });
  revalidatePath("/producto");
  revalidatePath("/inventario");
  return {};
}

/**
 * La foto del producto desde una imagen de internet (arrastrada desde otra página a la ficha): el servidor la descarga —solo
 * de sitios públicos, hasta 5 MB y revisando que sea de verdad una imagen— y la guarda como la foto del producto.
 */
export async function subirFotoProductoDesdeUrl(id: string, direccion: string): Promise<{ error?: string }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const descarga = await descargarPublico(String(direccion ?? "").trim(), 5 * 1024 * 1024);
  if ("error" in descarga) return descarga;
  const imagen = detectarImagen(descarga.bytes.slice(0, 64));
  if (!imagen) return { error: "Eso no es una imagen JPG, PNG, WebP o GIF." };
  const ruta = `productos/${id}/${Date.now()}-web.${imagen.extension}`;
  const { error } = await createServiceClient().storage.from(BUCKET_FOTOS).upload(ruta, descarga.bytes, { contentType: imagen.tipo });
  if (error) return { error: "No se pudo guardar la imagen." };
  return guardarFotoProducto(id, ruta);
}

/** El SKU sugerido para un nombre (palabras del nombre con barra), ya libre: si existe, con /2, /3… Vacío si no hay sugerencia. */
export async function sugerirSkuLibre(nombre: string): Promise<{ codigo: string }> {
  await requireModulo(MODULO);
  const base = sugerirSku(String(nombre ?? "").slice(0, 200));
  if (!base) return { codigo: "" };
  const { data } = await createServiceClient().from("skus_maestros").select("codigo").ilike("codigo", `${base}%`);
  const usados = new Set((data ?? []).map((p) => String(p.codigo).trim().toUpperCase()));
  return { codigo: primeroLibre(base, (c) => usados.has(c)) };
}
