"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual, requireAlgunModulo } from "@/lib/auth";
import { unidadesBajadas, unirCoincidencias, type CambioStock } from "@/lib/competencia/analisis";
import { certezaIgual } from "@/lib/competencia/certeza";
import { clavesDistintas, MOTIVO_A_MANO, separarDescartados } from "@/lib/competencia/descartar";
import { puedeVerPaisId } from "@/lib/seguridad/pais-acceso";
import { idsDropi } from "@/lib/publicaciones/publicacion";
import { indexar, todasLasCoincidencias } from "@/lib/scraping/cruces";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMINIO: Record<string, string> = { PA: "pa", CR: "cr", MX: "mx", CO: "co" };

export interface CompetidorDeProducto {
  id: string;
  proveedor: string;
  urlProveedor: string;
  nombre: string;
  foto: string | null;
  precio: number | null;
  stock: number | null;
  vendido7: number;
  vendido30: number;
  porFoto: boolean;
  parecido: number;
}

export interface CompetenciaDeProducto {
  pais: string;
  /** El código del país (para su bandera). */
  codigo: string;
  /** Nuestro producto en ese Dropi (ECOMFIVE), si está. */
  nuestro: { nombre: string; precio: number | null; stock: number | null; foto: string | null } | null;
  /** Nuestras filas del análisis en ese país (con dos IDs de Dropi pueden ser dos): con ellas se guarda «No es el mismo». */
  nuestrosIds: string[];
  /** Solo los que venden **el mismo** producto (`certezaIgual`, o «Es el mismo» de una persona o la IA): con estos se comparan precios (9 nov 2026, pedido de Hernán). */
  competidores: CompetidorDeProducto[];
  /** Los que se parecen sin ser seguro que sean el mismo: se muestran aparte y no cuentan; una persona puede decir «Es el mismo» o «No es el mismo». */
  dudosos: (CompetidorDeProducto & { motivo: string | null })[];
  /** Los que alguien (o la IA) dijo que no son el mismo producto (8 nov 2026): ya no cuentan, pero se pueden volver a contar. */
  descartados: (CompetidorDeProducto & { motivo: string | null })[];
}

interface Fila {
  id: string;
  dropi_producto_id: number | string;
  pais_id: string;
  proveedor_dropi_id: number;
  proveedor_nombre: string;
  nombre: string;
  foto_url: string | null;
  foto_huella: string | null;
  precio: string | null;
  stock: number | null;
  es_nuestro: boolean;
  igual_a: string | null;
  igual_metodo: string | null;
}

/**
 * La competencia de un producto de Producto (también se pide desde una línea de una compra): en cada país con Análisis de
 * competencia, los productos de Dropi que son el mismo por nombre o por foto (y los iguales a nuestro producto de ECOMFIVE,
 * si está), con su precio, stock y lo que vendieron en 7 y 30 días. Basta poder abrir Producto, Compras, Gestión de
 * publicaciones Dropi o Análisis de competencia. Devuelve el error como valor.
 */
export async function obtenerCompetenciaProducto(skuId: string, codigoPais?: string): Promise<{ datos?: CompetenciaDeProducto[]; error?: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "No hay sesión activa." };
  if (!["producto", "compras", "analisis-competencia", "publicaciones-dropi"].some((m) => usuario.modulos.includes(m))) return { error: "No tienes acceso." };
  if (!UUID.test(skuId)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: sku } = await supabase.from("skus_maestros").select("nombre, foto_huella").eq("id", skuId).maybeSingle();
  if (!sku) return { error: "El producto ya no existe." };
  // Solo un país (8 nov 2026, pedido de Alcides: en Gestión de IDs interesa la competencia del país que se revisa): se lee solo ese catálogo.
  let soloPais: string | null = null;
  if (codigoPais) {
    if (!/^[A-Z]{2}$/i.test(codigoPais)) return { error: "País no válido." };
    const { data: p } = await supabase.from("paises").select("id").eq("codigo", codigoPais.toUpperCase()).maybeSingle();
    if (!p) return { datos: [] };
    soloPais = p.id as string;
  }

  const { data: filas, error } = await traerTodasConError<Fila>((a, b) =>
    supabase
      .from("competencia_productos")
      .select("id, dropi_producto_id, pais_id, proveedor_dropi_id, proveedor_nombre, nombre, foto_url, foto_huella, precio, stock, es_nuestro, igual_a, igual_metodo")
      .eq("estado", "activo")
      .match(soloPais ? { pais_id: soloPais } : {})
      .order("id")
      .range(a, b),
  );
  if (error) return { datos: [] }; // Sin la migración 0108 no hay competencia que mostrar.
  const todas = filas ?? [];
  // Las publicaciones de Dropi vinculadas a este producto (migración 0116; sin ella, nada): su ID de Dropi une el producto con nuestra
  // fila del análisis aunque los nombres no se parezcan, y su nombre en Dropi sirve para buscar a los competidores.
  const { data: publicaciones } = await supabase.from("dropi_publicaciones").select("pais_id, nombre, dropi_id").eq("sku_maestro_id", skuId);
  const { data: paises } = await supabase.from("paises").select("id, codigo, nombre");
  const paisDe = new Map((paises ?? []).map((p) => [p.id, p]));
  const n = (v: string | null) => (v === null ? null : Number(v));

  const salida: CompetenciaDeProducto[] = [];
  for (const paisId of new Set(todas.map((f) => f.pais_id))) {
    const delPais = todas.filter((f) => f.pais_id === paisId);
    const indice = indexar(delPais.map((f) => ({ tipo: "producto" as const, id: f.id, nombre: f.nombre, huella: f.foto_huella, detalle: "" })));
    const porId = new Map(delPais.map((f) => [f.id, f]));
    const deEstePais = (publicaciones ?? []).filter((p) => p.pais_id === paisId);
    const idsPublicados = new Set(deEstePais.flatMap((p) => idsDropi(p.dropi_id as string | null)));
    const nombres = [...new Set([sku.nombre, ...deEstePais.map((p) => String(p.nombre ?? "")).filter(Boolean)])];
    const coincidencias = unirCoincidencias(nombres.map((nombre) => todasLasCoincidencias(nombre, sku.foto_huella ?? null, indice)));
    // Nuestra fila: la de su publicación de Dropi (por el ID) y, si no hay, la que se parece por nombre o foto.
    const delID = delPais.filter((f) => f.es_nuestro && idsPublicados.has(Number(f.dropi_producto_id)));
    const nuestra = delID[0] ?? coincidencias.map((c) => porId.get(c.id)!).find((f) => f.es_nuestro) ?? null;
    const nuestrasIds = new Set([...delID.map((f) => f.id), ...(nuestra ? [nuestra.id] : [])]);
    const elegidos = new Map<string, { porFoto: boolean; parecido: number }>();
    for (const c of coincidencias) if (!porId.get(c.id)!.es_nuestro) elegidos.set(c.id, { porFoto: c.porFoto, parecido: Math.round(c.parecido * 100) });
    // Los que ya están emparejados con nuestro producto de ECOMFIVE cuentan aunque el nombre de Producto sea distinto.
    if (nuestra) for (const f of delPais) if (f.igual_a && nuestrasIds.has(f.igual_a) && !elegidos.has(f.id)) elegidos.set(f.id, { porFoto: f.igual_metodo === "foto", parecido: 0 });
    if (!nuestra && !elegidos.size) continue;

    const ids = [...elegidos.keys()];
    // Lo que se descartó como «No es el mismo» (a mano o por la IA, migración 0246; sin ella, nada) no cuenta.
    const { data: verif } = ids.length && nuestrasIds.size ? await supabase.from("competencia_verificaciones").select("producto_id, nuestro_id, veredicto, motivo").eq("plataforma", "dropi").in("producto_id", ids).in("nuestro_id", [...nuestrasIds]) : { data: [] };
    const distintas = clavesDistintas(verif ?? []);
    const motivoDe = new Map((verif ?? []).filter((v) => v.veredicto === "distinto").map((v) => [v.producto_id as string, (v.motivo as string | null) ?? null]));
    const cambios = new Map<string, CambioStock[]>();
    if (ids.length) {
      const desde = new Date(Date.now() - 31 * 86_400_000).toISOString();
      const { data: hist } = await supabase.from("competencia_historial").select("producto_id, fecha, stock, stock_antes").in("producto_id", ids).eq("evento", "stock").gte("fecha", desde);
      for (const h of hist ?? []) {
        if (h.stock === null || h.stock_antes === null) continue;
        cambios.set(h.producto_id, [...(cambios.get(h.producto_id) ?? []), { fecha: h.fecha, stock: h.stock, stockAntes: h.stock_antes }]);
      }
    }
    const pais = paisDe.get(paisId);
    const dominio = DOMINIO[pais?.codigo ?? ""] ?? (pais?.codigo ?? "pa").toLowerCase();
    const todos = ids
        .map((id) => {
          const f = porId.get(id)!;
          const c = cambios.get(id) ?? [];
          return {
            id,
            proveedor: f.proveedor_nombre,
            urlProveedor: `https://app.dropi.${dominio}/dashboard/provider/${f.proveedor_dropi_id}/${encodeURIComponent(f.proveedor_nombre)}`,
            nombre: f.nombre,
            foto: f.foto_url,
            precio: n(f.precio),
            stock: f.stock,
            vendido7: unidadesBajadas(c, 7),
            vendido30: unidadesBajadas(c, 30),
            ...elegidos.get(id)!,
          };
        })
        .sort((a, b) => (a.precio ?? 1e9) - (b.precio ?? 1e9));
    const { cuentan, descartados } = separarDescartados(todos, [...nuestrasIds], distintas);
    // De los que cuentan, solo el mismo producto se compara: contra nuestra fila de Dropi, el nombre del producto y sus nombres en Dropi, con las fotos. Lo que
    // una persona o la IA ya confirmó («mismo») vale; lo que la IA dijo «parecido» queda dudoso con su motivo.
    const referencias = [...(nuestra ? [{ nombre: nuestra.nombre, huella: nuestra.foto_huella }] : []), ...nombres.map((nombre) => ({ nombre, huella: sku.foto_huella ?? null }))];
    const confirmados = new Set((verif ?? []).filter((v) => v.veredicto === "mismo").map((v) => v.producto_id as string));
    const parecidos = new Map((verif ?? []).filter((v) => v.veredicto === "parecido").map((v) => [v.producto_id as string, (v.motivo as string | null) ?? null]));
    const exacto = (c: CompetidorDeProducto) =>
      confirmados.has(c.id) ||
      (!parecidos.has(c.id) && referencias.some((ref) => certezaIgual(ref, { nombre: c.nombre, huella: porId.get(c.id)?.foto_huella ?? null }, c.porFoto ? "foto" : "nombre") === "exacto"));
    salida.push({
      pais: pais?.nombre ?? "—",
      codigo: pais?.codigo ?? "",
      nuestro: nuestra ? { nombre: nuestra.nombre, precio: n(nuestra.precio), stock: nuestra.stock, foto: nuestra.foto_url } : null,
      nuestrosIds: [...nuestrasIds],
      competidores: cuentan.filter(exacto),
      dudosos: cuentan.filter((c) => !exacto(c)).map((c) => ({ ...c, motivo: parecidos.get(c.id) ?? null })),
      descartados: descartados.map((c) => ({ ...c, motivo: motivoDe.get(c.id) ?? null })),
    });
  }
  return { datos: salida };
}

export interface EventoCompetencia {
  fecha: string;
  evento: string;
  precio: number | null;
  stock: number | null;
  precioAntes: number | null;
  stockAntes: number | null;
}

/** El historial de un producto (para la comparación lado a lado), del más nuevo al más viejo. Drop y Effi tienen sus propias tablas: todo producto tiene su fila «primera vez», así que se busca en cada una hasta encontrarlo. */
export async function obtenerHistorialCompetencia(productoId: string): Promise<{ eventos?: EventoCompetencia[]; error?: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["producto", "compras", "analisis-competencia"].some((m) => usuario.modulos.includes(m))) return { error: "No tienes acceso." };
  if (!UUID.test(productoId)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const leer = (tabla: string) => supabase.from(tabla).select("fecha, evento, precio, stock, precio_antes, stock_antes").eq("producto_id", productoId).order("fecha", { ascending: false }).limit(200);
  const dropi = await leer("competencia_historial");
  const drop = dropi.data?.length ? dropi : await leer("drop_competencia_historial");
  const effi = drop.data?.length ? drop : await leer("effi_competencia_historial");
  const { data, error } = effi.data?.length ? effi : await leer("dunamixfy_competencia_historial");
  if (error) return { error: error.message };
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return { eventos: (data ?? []).map((e) => ({ fecha: e.fecha, evento: e.evento, precio: n(e.precio), stock: e.stock, precioAntes: n(e.precio_antes), stockAntes: e.stock_antes })) };
}

/**
 * «No es el mismo» / «Volver a contar» de la competencia de un producto (8 nov 2026, pedido de Alcides): guarda (o quita) el veredicto «distinto» del par
 * competidor–nuestro en `competencia_verificaciones`, para cada una de nuestras filas del país. Así deja de contar en la ficha, en «Competidor más barato», en
 * las recomendaciones de precio y en Análisis de competencia. La IA no vuelve a revisar un par que ya tiene veredicto. Pide modificar Gestión de IDs Dropi o
 * Análisis de competencia; los ids de nuestras filas se vuelven a comprobar aquí (los manda el navegador).
 */
export async function descartarCompetidor(skuId: string, competidorId: string, nuestrosIds: string[], modo: boolean | "mismo" = false): Promise<{ error?: string; detalle?: string }> {
  // `true` vuelve a contar uno descartado; «mismo» confirma que un dudoso es el mismo producto (9 nov 2026: entonces se compara aunque los nombres no calcen).
  const volver = modo === true;
  const mismo = modo === "mismo";
  let usuario;
  try {
    usuario = await requireAlgunModulo(["publicaciones-dropi", "analisis-competencia"], true);
  } catch {
    return { error: "No tienes permiso para esto." };
  }
  if (!UUID.test(skuId) || !UUID.test(competidorId) || !Array.isArray(nuestrosIds) || !nuestrosIds.length || nuestrosIds.length > 10 || !nuestrosIds.every((i) => typeof i === "string" && UUID.test(i)))
    return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const [{ data: otro }, { data: nuestras }, { data: sku }] = await Promise.all([
    supabase.from("competencia_productos").select("id, pais_id, es_nuestro, nombre, proveedor_nombre").eq("id", competidorId).maybeSingle(),
    supabase.from("competencia_productos").select("id, pais_id").eq("es_nuestro", true).in("id", nuestrosIds),
    supabase.from("skus_maestros").select("nombre").eq("id", skuId).maybeSingle(),
  ]);
  if (!otro || otro.es_nuestro) return { error: "Ese producto de la competencia ya no existe." };
  if (!sku) return { error: "El producto ya no existe." };
  const validas = (nuestras ?? []).filter((x) => x.pais_id === otro.pais_id).map((x) => x.id as string);
  if (!validas.length) return { error: "Este producto no aparece como nuestro en el catálogo de Dropi de ese país." };
  if (!(await puedeVerPaisId(supabase, usuario.paisesPermitidos, otro.pais_id))) return { error: "No es de tus países." };

  if (mismo) {
    const filas = validas.map((nuestro_id) => ({ plataforma: "dropi", producto_id: competidorId, nuestro_id, veredicto: "mismo", motivo: `Confirmado a mano: es el mismo producto (${usuario.nombre ?? "sin nombre"})`, creado_por: usuario.id }));
    const { error } = await supabase.from("competencia_verificaciones").upsert(filas, { onConflict: "plataforma,producto_id,nuestro_id" });
    if (error) return { error: "No se pudo guardar (¿falta la migración 0246?)." };
  } else if (volver) {
    const { error } = await supabase.from("competencia_verificaciones").delete().eq("plataforma", "dropi").eq("producto_id", competidorId).in("nuestro_id", validas).eq("veredicto", "distinto");
    if (error) return { error: "No se pudo guardar (¿falta la migración 0246?)." };
  } else {
    const filas = validas.map((nuestro_id) => ({ plataforma: "dropi", producto_id: competidorId, nuestro_id, veredicto: "distinto", motivo: `${MOTIVO_A_MANO} (${usuario.nombre ?? "sin nombre"})`, creado_por: usuario.id }));
    const { error } = await supabase.from("competencia_verificaciones").upsert(filas, { onConflict: "plataforma,producto_id,nuestro_id" });
    if (error) return { error: "No se pudo guardar (¿falta la migración 0246?)." };
  }
  const { data: pais } = await supabase.from("paises").select("nombre").eq("id", otro.pais_id).maybeSingle();
  await registrarAuditoria({
    accion: mismo ? "competencia_es_el_mismo" : volver ? "competencia_volver_a_contar" : "competencia_no_es_el_mismo",
    entidad: "skus_maestros",
    entidadId: skuId,
    detalle: `${sku.nombre}: ${mismo ? "es el mismo" : volver ? "vuelve a contar" : "no es el mismo"} «${otro.nombre}» de ${otro.proveedor_nombre} · ${pais?.nombre ?? ""}`,
  });
  revalidatePath("/publicaciones-dropi");
  revalidatePath("/analisis-competencia");
  return {
    detalle: mismo
      ? `«${otro.nombre}» es el mismo producto: ya se compara.`
      : volver
        ? `«${otro.nombre}» vuelve a contar como competencia.`
        : `«${otro.nombre}» ya no cuenta como competencia de este producto.`,
  };
}
