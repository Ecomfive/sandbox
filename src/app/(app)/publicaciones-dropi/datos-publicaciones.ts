import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { accionesPublicacion, enDropi, estaArchivada } from "@/lib/publicaciones/automatico";
import { cargarCambiosPrecio, cargarCompetidores, cargarNuestrosEnDropi, competidorMasBarato, competidorMinimo, ultimoCambioDe } from "@/lib/publicaciones/competencia-publicaciones";
import { notaOptimizacion, revisarPublicacion } from "@/lib/publicaciones/optimizacion";
import { revisionVencida } from "@/lib/publicaciones/publicacion";
import { estadoTarea, etiquetaRecomendacion, pendientes, recomendar, recomendarOptimizacion, tareaCumplida, type Decision } from "@/lib/publicaciones/recomendaciones";
import { nivelMargen, type Reglas } from "@/lib/publicaciones/reglas";
import { cargarReglas, type ReglasGuardadas } from "@/lib/publicaciones/reglas-datos";
import { cargarEnCamino } from "@/lib/publicaciones/en-camino-datos";
import { cargarProductosProveedor } from "@/lib/publicaciones/proveedor-datos";
import { cargarCambiosDropi } from "@/lib/publicaciones/cambios-dropi";
import { bodegaDePublicacion, bodegasDelPais, bodegasEnOrden, productoPrincipal, type ProductoProveedor } from "@/lib/publicaciones/sincronizar-dropi";
import { cargarSugerencias } from "@/lib/publicaciones/sugerencias";
import type { UsuarioActual } from "@/lib/auth";
import { ventasDePublicacion } from "@/lib/publicaciones/ventas";
import { cargarResumenVentas } from "@/lib/publicaciones/ventas-datos";
import { detectarPack } from "@/lib/publicaciones/vincular";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { obtenerOpcionesSkuMaestro } from "@/lib/wms/skus-maestros";
import type { OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import type { DecisionVista, FilaPublicacion } from "./def-publicaciones";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const idsDropi = (d: Fila) => (String(d.dropi_id ?? "").match(/\d{3,6}/g) ?? []).map(Number);

type Fila = Record<string, unknown> & { id: string };

/**
 * Lo que ya no se marca a mano (21 oct 2026): cómo está en Dropi, si va a Archivados, el Tipo y qué necesita, a partir de las
 * ventas de Dropi del país (`ventas`, null si no hay carga), de la competencia y de las reglas. Si la publicación está en la
 * lectura de «Mis productos» (`prov`, 22 oct 2026), el estado y el tipo salen de ahí: es lo más reciente que dice Dropi.
 */
function automatico(
  d: Fila,
  ventas: Awaited<ReturnType<typeof cargarResumenVentas>>,
  competidores: Awaited<ReturnType<typeof cargarCompetidores>>,
  hoy: string,
  reglas: Reglas,
  prov: ProductoProveedor | null,
  /** El stock por ID de la última lectura de «Mis productos»: manda sobre el de la carga de ventas, que puede tener días. */
  stockActual: Map<number, number> | undefined,
): Pick<FilaPublicacion, "ventas" | "enDropi" | "archivada" | "tipoDropi" | "acciones" | "competidorMasBarato" | "competidorMinimo"> {
  const ids = idsDropi(d);
  const v = ventas ? ventasDePublicacion(ids, ventas.resumen, stockActual) : null;
  const estadoDropi = prov
    ? prov.archivado
      ? "archivado"
      : "activo"
    : enDropi({ hayCarga: !!ventas, tieneId: ids.length > 0, dropi: v ? { activo: v.activoEnDropi } : null });
  const manualArchivada = d.estado === "archivado" || d.estado_publicacion === "archivado";
  const archivada = estaArchivada(estadoDropi, manualArchivada);
  const tipo: "publico" | "privado" | null = prov
    ? prov.privado
      ? "privado"
      : "publico"
    : v
      ? v.privadoEnDropi
        ? "privado"
        : "publico"
      : ((d.tipo_publicacion as "publico" | "privado" | null) ?? null);
  const barato = competidorMasBarato({ nombre: d.nombre as string, precio: num(d.precio_venta), idsDropi: ids }, competidores);
  return {
    ventas: v,
    enDropi: estadoDropi,
    archivada,
    tipoDropi: tipo,
    competidorMasBarato: barato,
    competidorMinimo: competidorMinimo({ nombre: d.nombre as string, idsDropi: ids }, competidores),
    acciones: accionesPublicacion(
      {
        archivada,
        // Primero la de Dropi (la primera venta); la anotada, solo si todavía no vendió.
        fechaPublicacion: v?.primeraVenta ?? ((d.fecha_publicacion as string | null) ?? null),
        primeraVenta: v?.primeraVenta ?? null,
        margen: num(d.margen),
        netas30: v ? v.netas30 : null,
        netas30Antes: v ? v.netas30Antes : null,
        // Solo si sigue privada: si Dropi ya la reporta pública, el nombre guardado es de antes.
        privatizadaA: tipo === "publico" ? null : ((d.privatizado_a as string | null) ?? "").trim() || null,
        competidorMasBarato: !!barato,
      },
      hoy,
      reglas,
    ),
  };
}

interface FilaDecision {
  id: string;
  publicacion_id: string;
  tipo: string;
  decision: Decision;
  nota: string | null;
  recomendacion: { titulo?: string; motivo?: string; datos?: { precio?: number | null }; actual?: { precio?: number | null } } | null;
  vigente_hasta: string;
  usuario_nombre: string | null;
  creado_en: string;
  responsable_id?: string | null;
  responsable_nombre?: string | null;
  plazo?: string | null;
  hecha_en?: string | null;
  hecha_por_nombre?: string | null;
  hecha_como?: "manual" | "dropi" | "producto" | null;
  hecha_nota?: string | null;
}

const COLUMNAS_DECISION = "id, publicacion_id, tipo, decision, nota, recomendacion, vigente_hasta, usuario_nombre, creado_en";
// Las de la tarea (migración 0128) van aparte: sin ella, las decisiones se leen igual, sin responsable ni plazo.
const COLUMNAS_TAREA = "responsable_id, responsable_nombre, plazo, hecha_en, hecha_por_nombre, hecha_como, hecha_nota";

/** Las decisiones de las recomendaciones de un país (migraciones 0127 y 0128), de la más nueva a la más vieja; sin la tabla, ninguna. */
async function cargarDecisiones(supabase: SupabaseClient, paisId: string, hoy: string): Promise<{ decisiones: DecisionVista[]; conTareas: boolean }> {
  const leer = (columnas: string) =>
    traerTodasConError<FilaDecision>((desde, hasta) =>
      supabase
        .from("dropi_publicaciones_decisiones")
        .select(`${columnas}, dropi_publicaciones!inner(pais_id)` as "*")
        .eq("dropi_publicaciones.pais_id", paisId)
        .order("creado_en", { ascending: false })
        .range(desde, hasta) as unknown as PromiseLike<{ data: FilaDecision[] | null; error: unknown }>,
    );
  let r = await leer(`${COLUMNAS_DECISION}, ${COLUMNAS_TAREA}`);
  const conTareas = !r.error;
  if (r.error) r = await leer(COLUMNAS_DECISION);
  const decisiones = (r.error ? [] : (r.data ?? [])).map<DecisionVista>((d) => {
    const hechaEn = d.hecha_en ?? null;
    const plazo = d.plazo ?? null;
    return {
      id: d.id,
      publicacionId: d.publicacion_id,
      tipo: d.tipo,
      decision: d.decision,
      nota: d.nota ?? "",
      titulo: d.recomendacion?.titulo ?? "",
      motivo: d.recomendacion?.motivo ?? "",
      vigenteHasta: d.vigente_hasta,
      usuario: d.usuario_nombre ?? "",
      fecha: d.creado_en,
      precioAntes: d.recomendacion?.actual?.precio ?? d.recomendacion?.datos?.precio ?? null,
      responsableId: d.responsable_id ?? null,
      responsable: d.responsable_nombre ?? "",
      plazo,
      hechaEn,
      hechaComo: d.hecha_como ?? null,
      hechaPor: d.hecha_por_nombre ?? "",
      hechaNota: d.hecha_nota ?? "",
      // Solo una aceptada con la migración 0128 es una tarea.
      estado: conTareas && d.decision === "aceptada" ? estadoTarea({ hechaEn, plazo }, hoy) : null,
    };
  });
  return { decisiones, conTareas };
}

/**
 * Guarda como hechas las tareas que el sistema detectó (Dropi ya muestra el precio, o el combo ya está publicado), después de
 * responder la página: solo las que siguen abiertas, y con su línea en la actividad a nombre del sistema.
 */
async function guardarCumplidas(supabase: SupabaseClient, cumplidas: { d: DecisionVista; nombre: string }[]) {
  for (const { d } of cumplidas) {
    await supabase
      .from("dropi_publicaciones_decisiones")
      .update({ hecha_en: d.hechaEn, hecha_por_nombre: "Sistema", hecha_como: d.hechaComo, hecha_nota: d.hechaNota })
      .eq("id", d.id)
      .is("hecha_en", null);
  }
  await supabase.from("historial_auditoria").insert(
    cumplidas.map(({ d }) => ({
      usuario_id: null,
      usuario_nombre: "Sistema",
      accion: "tarea_hecha_publicacion",
      entidad: "dropi_publicaciones",
      entidad_id: d.publicacionId,
      detalle: `Tarea hecha: ${d.titulo || etiquetaRecomendacion(d.tipo)} · ${d.hechaNota}`,
    })),
  );
}

/** Las personas activas del sistema, para elegir quién hace una tarea. */
async function cargarPersonas(supabase: SupabaseClient): Promise<{ id: string; nombre: string }[]> {
  const { data } = await supabase.from("perfiles").select("id, nombre, email").eq("activo", true).order("nombre");
  return (data ?? []).map((p) => ({ id: p.id as string, nombre: ((p.nombre as string | null) || (p.email as string | null) || "Sin nombre").trim() }));
}

export interface DatosPublicaciones {
  filas: FilaPublicacion[];
  opcionesSku: OpcionSkuMaestro[];
  corteVentas: string | null;
  /** Cuándo se leyó «Mis productos» de Dropi por última vez (bodegas, precio, tipo y estado); null si nunca. */
  leidoProveedor: string | null;
  /** Cuántos cambios del sistema esperan para aplicarse en Dropi (migración 0137). */
  pendientesDropi: number;
  reglas: ReglasGuardadas;
  /** Todas las decisiones del país (la más nueva primero), para la pestaña Recomendaciones. */
  decisiones: DecisionVista[];
  /** false si falta la migración 0128: se decide igual, pero sin responsable ni plazo. */
  conTareas: boolean;
  /** A quién se le puede asignar una tarea. */
  personas: { id: string; nombre: string }[];
}

/**
 * Las publicaciones de un país listas para la lista, la ficha y la pestaña Recomendaciones: lo guardado más lo calculado (Dropi,
 * competencia, reglas y recomendaciones pendientes). `null` si falta la migración 0116.
 */
export async function cargarPublicaciones(supabase: SupabaseClient, paisId: string, usuario: UsuarioActual): Promise<DatosPublicaciones | null> {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const [filasR, numerosR, reglas, { decisiones, conTareas }, personas] = await Promise.all([
    traerTodasConError<Fila>((desde, hasta) =>
      supabase
        .from("dropi_publicaciones")
        .select(
          "id, nombre, dropi_id, estado, estado_publicacion, tipo_publicacion, privatizado_a, privatizado_email, precio_venta, costo_mercancia, fulfillment, coste_real, utilidad, margen, estado_venta, ubicacion, estado_reposicion, competencia, fecha_publicacion, ultima_revision, proxima_revision, ultimo_cambio_precio, foto_url, notas, responsable_id, relacionados, clickup_id, sku_maestro_id",
        )
        .eq("pais_id", paisId)
        .order("nombre")
        .range(desde, hasta),
    ),
    // El correlativo va aparte: sin la migración 0123 la columna no existe y la lista se carga igual, sin números.
    traerTodasConError<{ id: string; numero: number }>((desde, hasta) => supabase.from("dropi_publicaciones").select("id, numero").eq("pais_id", paisId).order("id").range(desde, hasta)),
    cargarReglas(supabase),
    cargarDecisiones(supabase, paisId, hoy),
    cargarPersonas(supabase),
  ]);
  if (filasR.error) return null;
  const numeroPorId = new Map(numerosR.error ? [] : (numerosR.data ?? []).map((n) => [n.id, Number(n.numero)]));

  const datos = filasR.data ?? [];
  const nombrePorId = new Map(datos.map((d) => [d.id, d.nombre as string]));
  const [{ skus, sugerencias, combosX2 }, opcionesSku, ventas, competidores, precios, enCaminoPorSku, enDropiCatalogo, proveedor, cambiosDropi] = await Promise.all([
    cargarSugerencias(
      supabase,
      paisId,
      datos.map((d) => ({ id: d.id, nombre: d.nombre as string, dropiId: (d.dropi_id as string | null) ?? "", skuId: (d.sku_maestro_id as string | null) ?? null })),
    ),
    obtenerOpcionesSkuMaestro(supabase),
    cargarResumenVentas(supabase, paisId),
    cargarCompetidores(supabase, paisId),
    cargarCambiosPrecio(supabase, paisId),
    cargarEnCamino(supabase, paisId, usuario),
    cargarNuestrosEnDropi(supabase, paisId),
    cargarProductosProveedor(supabase, paisId),
    cargarCambiosDropi(supabase, paisId),
  ]);
  const r = reglas.reglas;
  // La revisión de optimización: con lo que muestra Dropi (el primer ID que esté en el catálogo); si no se leyó, el título guardado.
  const revisionDe = (d: Fila): Pick<FilaPublicacion, "revisiones" | "nota" | "tituloDropi"> => {
    const cat = idsDropi(d).map((id) => enDropiCatalogo.get(id)).find((x) => !!x) ?? null;
    const revisiones = revisarPublicacion(
      {
        titulo: cat?.nombre ?? (d.nombre as string),
        categoria: cat?.categoria ?? null,
        precio: cat?.precio ?? num(d.precio_venta),
        precioSugerido: cat?.precioSugerido ?? null,
        fotos: cat?.fotos ?? null,
        videos: cat?.videos ?? null,
        descripcionLargo: cat?.descripcionLargo ?? null,
        leidoEnDropi: !!cat,
      },
      r,
    );
    return { revisiones, nota: notaOptimizacion(revisiones), tituloDropi: cat?.nombre ?? null };
  };
  // Las bodegas del país (las que aparecen en «Mis productos»): para deducir la de un producto que hoy no tiene stock.
  const bodegasPais = proveedor ? bodegasDelPais(proveedor.productos.values()) : [];
  const stockActual = proveedor ? new Map([...proveedor.productos.values()].map((p) => [p.id, p.stock])) : undefined;
  const decisionesDe = new Map<string, DecisionVista[]>();
  for (const d of decisiones) decisionesDe.set(d.publicacionId, [...(decisionesDe.get(d.publicacionId) ?? []), d]);

  const filas: FilaPublicacion[] = datos.map((d) => {
    const estado = d.estado as string;
    const proxima = (d.proxima_revision as string | null) ?? null;
    const camino = d.sku_maestro_id ? enCaminoPorSku.get(d.sku_maestro_id as string) : undefined;
    const prov = proveedor ? productoPrincipal(idsDropi(d), proveedor.productos) : null;
    return {
      id: d.id,
      numero: numeroPorId.get(d.id) ?? null,
      nombre: d.nombre as string,
      dropiId: (d.dropi_id as string | null) ?? "",
      estado,
      estadoPublicacion: (d.estado_publicacion as string | null) ?? null,
      tipo: (d.tipo_publicacion as string | null) ?? null,
      privatizadoA: (d.privatizado_a as string | null) ?? "",
      privatizadoEmail: (d.privatizado_email as string | null) ?? "",
      precioVenta: num(d.precio_venta),
      costoMercancia: num(d.costo_mercancia),
      fulfillment: num(d.fulfillment),
      costeReal: num(d.coste_real),
      utilidad: num(d.utilidad),
      margen: num(d.margen),
      nivelMargen: nivelMargen(num(d.margen), r),
      estadoVenta: (d.estado_venta as string | null) ?? null,
      ubicacion: (d.ubicacion as string | null) ?? null,
      estadoReposicion: (d.estado_reposicion as string | null) ?? null,
      competencia: (d.competencia as boolean | null) ?? null,
      fechaPublicacion: (d.fecha_publicacion as string | null) ?? null,
      ultimaRevision: (d.ultima_revision as string | null) ?? null,
      proximaRevision: proxima,
      ultimoCambioPrecio: (d.ultimo_cambio_precio as string | null) ?? null,
      cambioPrecioDropi: ultimoCambioDe(idsDropi(d), precios.cambios),
      lecturaDropiDesde: precios.desde,
      revisionVencida: revisionVencida({ estado, proximaRevision: proxima }, hoy),
      fotoUrl: (d.foto_url as string | null) ?? null,
      notas: (d.notas as string | null) ?? "",
      responsableId: (d.responsable_id as string | null) ?? null,
      relacionados: ((d.relacionados as string[] | null) ?? []).map((x) => nombrePorId.get(x)).filter((x): x is string => !!x),
      deClickup: !!d.clickup_id,
      sku: d.sku_maestro_id ? (skus.get(d.sku_maestro_id as string) ?? null) : null,
      sugerencia: sugerencias.get(d.id) ?? null,
      enCamino: camino?.unidades ?? 0,
      llegadaCamino: camino?.llegada ?? null,
      sinFechaCamino: camino?.sinFecha ?? 0,
      sinEnvioCamino: camino?.sinEnvio ?? 0,
      recomendaciones: [],
      decisiones: decisionesDe.get(d.id) ?? [],
      bodegasDropi: prov ? bodegasEnOrden(prov.bodegas).map((b) => ({ id: b.id, nombre: b.nombre, stock: b.stock })) : null,
      stockProveedor: prov?.stock ?? null,
      stockPrivadoProveedor: prov?.stockPrivado ?? null,
      leidoProveedor: proveedor?.leidoEn ?? null,
      cambioDropi: cambiosDropi.porPublicacion.get(d.id) ?? null,
      bodega: bodegaDePublicacion({ ubicacion: (d.ubicacion as string | null) ?? null, nombre: d.nombre as string }, prov, bodegasPais),
      ...revisionDe(d),
      ...automatico(d, ventas, competidores, hoy, r, prov, stockActual),
    };
  });

  // Las recomendaciones van al final: el combo necesita saber qué compuestos ya están publicados (y no archivados) en el país.
  const publicados = new Set(filas.filter((f) => !f.archivada && f.sku).map((f) => f.sku!.id));
  const cumplidas: { d: DecisionVista; nombre: string }[] = [];
  for (const f of filas) {
    const combo = f.sku ? combosX2.get(f.sku.id) : undefined;
    const comboPublicado = !!combo && publicados.has(combo.id);
    // Las tareas abiertas que los datos ya muestran hechas.
    for (const d of f.decisiones) {
      if (d.estado !== "por_hacer" && d.estado !== "atrasada") continue;
      const c = tareaCumplida({ tipo: d.tipo, fecha: d.fecha, precioAntes: d.precioAntes }, { cambioPrecio: f.cambioPrecioDropi, comboPublicado, revisiones: f.revisiones });
      if (!c) continue;
      d.hechaEn = c.fecha ? `${c.fecha.slice(0, 10)}T12:00:00Z` : new Date().toISOString();
      d.hechaComo = c.como;
      d.hechaPor = "Sistema";
      d.hechaNota = c.detalle;
      d.estado = "hecha";
      cumplidas.push({ d, nombre: f.nombre });
    }
    const pack = detectarPack(f.nombre);
    const recs = recomendar(
      {
        archivada: f.archivada,
        esPack: pack.combo || pack.unidades !== null,
        precio: f.precioVenta,
        costo: f.costoMercancia,
        fulfillment: f.fulfillment,
        margen: f.margen,
        netas30: f.ventas?.netas30 ?? null,
        sku: f.sku ? { tipo: f.sku.tipo } : null,
        combo: combo ? { codigo: combo.codigo, publicado: comboPublicado } : null,
        competidorMasBarato: f.competidorMasBarato,
        competidorMinimo: f.competidorMinimo,
      },
      r,
    );
    f.recomendaciones = pendientes([...recs, ...recomendarOptimizacion(f.revisiones, f.archivada)], f.decisiones, hoy);
  }
  if (cumplidas.length && conTareas) after(() => guardarCumplidas(supabase, cumplidas));

  return { filas, opcionesSku, corteVentas: ventas?.corte ?? null, leidoProveedor: proveedor?.leidoEn ?? null, pendientesDropi: cambiosDropi.pendientes, reglas, decisiones, conTareas, personas };
}
