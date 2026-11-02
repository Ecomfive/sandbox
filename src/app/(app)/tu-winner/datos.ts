import type { SupabaseClient } from "@supabase/supabase-js";
import { yaVisto, type TipoReferencia } from "@/lib/scraping/cruces";
import { cargarReferencias } from "@/lib/scraping/referencias";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { agruparGanadores, contarMenciones } from "@/lib/tuwinner/canales";
import { diaPanama } from "@/lib/tuwinner/ingerir";
import { diasGanando, esPrivado, PAISES_TUWINNER, ventasPorDia, type DiaDeVentas, type PaisTuWinner } from "@/lib/tuwinner/tuwinner";

/** Cómo está un ganador en el sistema: es nuestro (misma publicación de Dropi), ya lo tenemos (Producto, publicado, comprado o testeado), privado o no lo tenemos. */
export type EstadoGanador = "nuestro" | "tenemos" | "privado" | "no";

export interface Ganador {
  pais: PaisTuWinner;
  dropiId: string;
  nombre: string;
  proveedor: string | null;
  plataforma: string | null;
  precio: number | null;
  sugerido: number | null;
  foto: string | null;
  ventas7: number;
  stock: number | null;
  posicion: number;
  diasGanando: number;
  ganadorDesde: string | null;
  dias: DiaDeVentas[];
  estado: EstadoGanador;
  /** Lo que dice la etiqueta: «PUB-0196», «SKU ANTENA/TV/HD», «Test #3…». */
  etiqueta: string | null;
  /** De dónde sale lo nuestro cuando es por el nombre. */
  tipoRef: TipoReferencia | null;
  skuId: string | null;
  /** Nuestras ventas de ese producto en ese país en los últimos 7 días y en cuántas publicaciones (null si no hay cómo saberlo). */
  nos: { ventas: number; pubs: number } | null;
  /** En cuántas fuentes del Testing Lab aparece (Tu Winner de cada país cuenta como una). */
  canales: number;
  /** Su código en Selección de productos (TW-0001) si ya se mandó. */
  enSeleccion: string | null;
}

export interface LecturaVista {
  id: string;
  inicio: string;
  fin: string | null;
  estado: "corriendo" | "listo" | "error";
  quien: string | null;
  resumen: Partial<Record<PaisTuWinner, number>> | null;
  error: string | null;
}

const hoyPanama = () => diaPanama(new Date().toISOString());
const restarDias = (dia: string, n: number) => new Date(Date.parse(`${dia}T12:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** Las últimas lecturas (la primera es la más reciente). */
export async function cargarLecturas(supabase: SupabaseClient, limite = 10): Promise<LecturaVista[] | null> {
  const { data, error } = await supabase.from("tuwinner_lecturas").select("id, inicio, fin, estado, iniciado_por_nombre, resumen, error").order("inicio", { ascending: false }).limit(limite);
  if (error) return null;
  return (data ?? []).map((l) => ({
    id: l.id as string,
    inicio: l.inicio as string,
    fin: (l.fin as string | null) ?? null,
    estado: l.estado as LecturaVista["estado"],
    quien: (l.iniciado_por_nombre as string | null) ?? null,
    resumen: (l.resumen as LecturaVista["resumen"]) ?? null,
    error: (l.error as string | null) ?? null,
  }));
}

type FilaProducto = {
  pais: PaisTuWinner;
  dropi_id: string;
  nombre: string;
  proveedor: string | null;
  plataforma: string | null;
  precio: number | null;
  precio_sugerido: number | null;
  foto_url: string | null;
  ventas_7d: number | null;
  stock: number | null;
  posicion: number | null;
  ganador_desde: string | null;
};

/**
 * Los ganadores de la última lectura de Panamá y México, cruzados con lo nuestro (2 nov 2026). El cruce, del más seguro al menos: la misma publicación de
 * Dropi (es nuestro); la competencia de Dropi enlazada a un producto nuestro (`competencia_productos.igual_a`); y el nombre contra Producto, lo publicado,
 * lo comprado y lo testeado (`yaVisto`, como Testing Lab). null si falta la migración 0223.
 */
export async function cargarGanadores(supabase: SupabaseClient, conCanales = true): Promise<Record<PaisTuWinner, Ganador[]> | null> {
  const { data, error } = await supabase
    .from("tuwinner_productos")
    .select("pais, dropi_id, nombre, proveedor, plataforma, precio, precio_sugerido, foto_url, ventas_7d, stock, posicion, ganador_desde")
    .eq("ganador", true)
    .order("posicion");
  if (error) return null;
  const filas = (data ?? []) as FilaProducto[];
  const vacio: Record<PaisTuWinner, Ganador[]> = { PA: [], MX: [] };
  if (!filas.length) return vacio;
  const hoy = hoyPanama();

  const { data: paises } = await supabase.from("paises").select("id, codigo").in("codigo", PAISES_TUWINNER);
  const paisId = new Map((paises ?? []).map((p) => [p.codigo as PaisTuWinner, p.id as string]));
  const paisDeId = new Map((paises ?? []).map((p) => [p.id as string, p.codigo as PaisTuWinner]));
  const clave = (pais: string, dropi: string) => `${pais}|${dropi}`;
  const ids = [...new Set(filas.map((f) => f.dropi_id))];

  const [diasR, pubsR, compR, selR] = await Promise.all([
    supabase.from("tuwinner_dias").select("pais, dropi_id, dia, stock").in("dropi_id", ids).gte("dia", restarDias(hoy, 10)),
    supabase.from("dropi_publicaciones").select("numero, dropi_id, pais_id, sku_maestro_id").in("pais_id", [...paisId.values()]).in("dropi_id", ids),
    supabase.from("competencia_productos").select("pais_id, dropi_producto_id, igual_a, es_nuestro").in("pais_id", [...paisId.values()]).in("dropi_producto_id", ids.map(Number)),
    supabase.from("wms_seleccion_productos").select("codigo_fuente, tuwinner_clave").in("tuwinner_clave", filas.map((f) => clave(f.pais, f.dropi_id))),
  ]);

  // Lo nuestro por la misma publicación de Dropi.
  const nuestra = new Map<string, { numero: number | null; sku: string | null }>();
  for (const p of pubsR.data ?? []) {
    const pais = paisDeId.get(p.pais_id as string);
    if (pais && p.dropi_id) nuestra.set(clave(pais, String(p.dropi_id)), { numero: (p.numero as number | null) ?? null, sku: (p.sku_maestro_id as string | null) ?? null });
  }
  // La competencia enlazada a un producto nuestro: del competidor a nuestra fila del catálogo, y de ahí a nuestra publicación.
  const igualA = new Map<string, string>();
  for (const c of compR.error ? [] : (compR.data ?? [])) {
    const pais = paisDeId.get(c.pais_id as string);
    if (pais && c.igual_a && !c.es_nuestro) igualA.set(clave(pais, String(c.dropi_producto_id)), c.igual_a as string);
  }
  const skuPorCompetencia = new Map<string, string>();
  if (igualA.size) {
    const { data: nuestrasComp } = await supabase.from("competencia_productos").select("id, pais_id, dropi_producto_id").in("id", [...new Set(igualA.values())]);
    const dropiDe = new Map((nuestrasComp ?? []).map((c) => [c.id as string, { pais: paisDeId.get(c.pais_id as string), dropi: String(c.dropi_producto_id) }]));
    const buscar = [...dropiDe.values()].filter((x) => x.pais);
    if (buscar.length) {
      const { data: pubsNuestras } = await supabase.from("dropi_publicaciones").select("dropi_id, pais_id, sku_maestro_id").in("dropi_id", buscar.map((b) => b.dropi)).not("sku_maestro_id", "is", null);
      const skuDe = new Map((pubsNuestras ?? []).map((p) => [clave(paisDeId.get(p.pais_id as string) ?? "", String(p.dropi_id)), p.sku_maestro_id as string]));
      for (const [k, id] of igualA) {
        const d = dropiDe.get(id);
        const sku = d?.pais ? skuDe.get(clave(d.pais, d.dropi)) : undefined;
        if (sku) skuPorCompetencia.set(k, sku);
      }
    }
  }

  // Por el nombre, como Testing Lab (solo los que no se resolvieron antes y no son privados).
  const faltan = filas.filter((f) => !nuestra.has(clave(f.pais, f.dropi_id)) && !skuPorCompetencia.has(clave(f.pais, f.dropi_id)) && !esPrivado(f.nombre));
  const porNombre = new Map<string, { tipo: TipoReferencia; id: string; detalle: string }>();
  if (faltan.length) {
    const indice = await cargarReferencias(supabase);
    for (const f of faltan) {
      const c = yaVisto(f.nombre, null, indice);
      if (c) porNombre.set(clave(f.pais, f.dropi_id), { tipo: c.tipo, id: c.id, detalle: c.detalle });
    }
  }
  // El SKU de lo que salió por el nombre: un producto es su SKU; una publicación, el SKU que tiene vinculado.
  const pubIds = [...porNombre.values()].filter((x) => x.tipo === "publicacion").map((x) => x.id);
  const skuDePub = new Map<string, string>();
  if (pubIds.length) {
    const { data } = await supabase.from("dropi_publicaciones").select("id, sku_maestro_id").in("id", pubIds).not("sku_maestro_id", "is", null);
    for (const p of data ?? []) skuDePub.set(p.id as string, p.sku_maestro_id as string);
  }
  const skuDe = (f: FilaProducto): string | null => {
    const k = clave(f.pais, f.dropi_id);
    const n = porNombre.get(k);
    return nuestra.get(k)?.sku ?? skuPorCompetencia.get(k) ?? (n?.tipo === "producto" ? n.id : n?.tipo === "publicacion" ? (skuDePub.get(n.id) ?? null) : null);
  };

  // El código de cada SKU y nuestras ventas de 7 días por SKU y país (todas nuestras publicaciones vivas de ese SKU en ese país).
  const skuIds = [...new Set(filas.map(skuDe).filter((x): x is string => !!x))];
  const codigoSku = new Map<string, string>();
  const nosDe = new Map<string, { ventas: number; pubs: number }>();
  if (skuIds.length) {
    const [skusR, pubsSkuR] = await Promise.all([
      supabase.from("skus_maestros").select("id, codigo").in("id", skuIds),
      supabase.from("dropi_publicaciones").select("dropi_id, pais_id, sku_maestro_id, estado_publicacion").in("sku_maestro_id", skuIds).in("pais_id", [...paisId.values()]),
    ]);
    for (const s of skusR.data ?? []) codigoSku.set(s.id as string, s.codigo as string);
    const vivas = (pubsSkuR.data ?? []).filter((p) => p.dropi_id && p.estado_publicacion !== "archivado");
    const desde = restarDias(hoy, 7);
    const ventasR = vivas.length
      ? await supabase.from("dropi_ventas_diarias").select("pais_id, dropi_producto_id, pedidas").in("dropi_producto_id", vivas.map((p) => Number(p.dropi_id))).gte("dia", desde)
      : { data: [] as { pais_id: string; dropi_producto_id: number; pedidas: number }[] };
    const ventasPorPub = new Map<string, number>();
    for (const v of ventasR.data ?? []) {
      const k = clave(paisDeId.get(v.pais_id as string) ?? "", String(v.dropi_producto_id));
      ventasPorPub.set(k, (ventasPorPub.get(k) ?? 0) + Number(v.pedidas ?? 0));
    }
    for (const p of vivas) {
      const pais = paisDeId.get(p.pais_id as string);
      if (!pais) continue;
      const k = clave(pais, p.sku_maestro_id as string);
      const antes = nosDe.get(k) ?? { ventas: 0, pubs: 0 };
      nosDe.set(k, { ventas: antes.ventas + (ventasPorPub.get(clave(pais, String(p.dropi_id))) ?? 0), pubs: antes.pubs + 1 });
    }
  }

  const diasDe = new Map<string, { dia: string; stock: number }[]>();
  for (const d of diasR.data ?? []) {
    const k = clave(d.pais as string, d.dropi_id as string);
    diasDe.set(k, [...(diasDe.get(k) ?? []), { dia: d.dia as string, stock: Number(d.stock) }]);
  }
  const enSeleccion = new Map((selR.error ? [] : (selR.data ?? [])).map((s) => [s.tuwinner_clave as string, s.codigo_fuente as string]));

  const salida: Record<PaisTuWinner, Ganador[]> = { PA: [], MX: [] };
  for (const f of filas) {
    const k = clave(f.pais, f.dropi_id);
    const pub = nuestra.get(k);
    const n = porNombre.get(k);
    const skuId = skuDe(f);
    const estado: EstadoGanador = pub ? "nuestro" : skuId || n ? "tenemos" : esPrivado(f.nombre) ? "privado" : "no";
    const etiqueta = pub
      ? pub.numero
        ? `PUB-${String(pub.numero).padStart(4, "0")}`
        : null
      : skuId && codigoSku.get(skuId)
        ? codigoSku.get(skuId)!
        : (n?.detalle ?? null);
    salida[f.pais].push({
      pais: f.pais,
      dropiId: f.dropi_id,
      nombre: f.nombre,
      proveedor: f.proveedor,
      plataforma: f.plataforma,
      precio: f.precio === null ? null : Number(f.precio),
      sugerido: f.precio_sugerido === null ? null : Number(f.precio_sugerido),
      foto: f.foto_url,
      ventas7: Number(f.ventas_7d ?? 0),
      stock: f.stock === null ? null : Number(f.stock),
      posicion: Number(f.posicion ?? 0),
      diasGanando: diasGanando(f.ganador_desde, hoy),
      ganadorDesde: f.ganador_desde,
      dias: ventasPorDia(diasDe.get(k) ?? []).slice(-8),
      estado,
      etiqueta,
      tipoRef: pub ? null : skuId ? "producto" : (n?.tipo ?? null),
      skuId,
      nos: skuId ? (nosDe.get(clave(f.pais, skuId)) ?? { ventas: 0, pubs: 0 }) : null,
      canales: 0,
      enSeleccion: enSeleccion.get(k) ?? null,
    });
  }
  if (conCanales) {
    const canales = await cargarCanales(supabase, salida);
    for (const g of canales) for (const m of g.miembros) {
      const x = salida[m.pais].find((y) => y.dropiId === m.dropiId);
      if (x) x.canales = g.canales;
    }
  }
  return salida;
}

/** Los días de ventas que cubre la última lectura («del 25 oct al 1 nov»). */
export function rangoDeVentas(ganadores: Record<PaisTuWinner, Ganador[]> | null): { desde: string; hasta: string } | null {
  const dias = ganadores ? [...ganadores.PA, ...ganadores.MX].flatMap((g) => g.dias.map((d) => d.dia)).sort() : [];
  return dias.length ? { desde: dias[0], hasta: dias[dias.length - 1] } : null;
}

export interface FilaCanales {
  clave: string;
  nombre: string;
  skuCodigo: string | null;
  estado: EstadoGanador;
  ventas: Record<PaisTuWinner, number>;
  competencia: number;
  scraping: number;
  anuncios: number;
  dropKiller: number;
  sugerencias: number;
  canales: number;
  /** El ganador que lo representa (para mandarlo a Selección). */
  pais: PaisTuWinner;
  dropiId: string;
  enSeleccion: string | null;
  miembros: { pais: PaisTuWinner; dropiId: string }[];
}

/**
 * «Se repite en varios canales»: los ganadores juntados por producto (Panamá y México) y cuántas veces los nombra cada fuente del Testing Lab: la competencia
 * de Dropi (productos de otros proveedores), Scraping de proveedores, la Biblioteca de anuncios (capturas de Instagram) y Sugerencias de clientes. Drop Killer
 * todavía no está en el sistema. Ordena por cantidad de canales y, a igual cantidad, por ventas.
 */
export async function cargarCanales(supabase: SupabaseClient, ganadores: Record<PaisTuWinner, Ganador[]>): Promise<FilaCanales[]> {
  const todos = [...ganadores.PA, ...ganadores.MX];
  const grupos = agruparGanadores(todos.filter((g) => g.estado !== "privado").map((g) => ({ pais: g.pais, dropiId: g.dropiId, nombre: g.nombre, ventas7: g.ventas7, skuId: g.skuId })));
  const nombres = grupos.flatMap((g) => g.miembros.map((m) => ({ clave: g.clave, nombre: m.nombre })));
  const seguro = async <T,>(f: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await f();
    } catch {
      return [];
    }
  };
  const [competencia, scraping, capturas, sugerencias] = await Promise.all([
    seguro(() => traerTodasLasFilas<{ nombre: string }>((a, b) => supabase.from("competencia_productos").select("nombre").eq("es_nuestro", false).order("id").range(a, b))),
    seguro(() => traerTodasLasFilas<{ nombre: string }>((a, b) => supabase.from("scraping_productos").select("nombre").order("id").range(a, b))),
    seguro(() => traerTodasLasFilas<{ titulo: string | null; texto_mensaje: string | null }>((a, b) => supabase.from("instagram_capturas").select("titulo, texto_mensaje").order("id").range(a, b))),
    seguro(() => traerTodasLasFilas<{ nombre: string }>((a, b) => supabase.from("sugerencias_clientes").select("nombre").order("id").range(a, b))),
  ]);
  // Cada fuente cuenta los textos que nombran a cualquiera de los ganadores del grupo (una vez por texto).
  const contar = (textos: string[]) => contarMenciones(nombres, textos);
  const enCompetencia = contar(competencia.map((c) => c.nombre ?? ""));
  const enScraping = contar(scraping.map((s) => s.nombre ?? ""));
  const enAnuncios = contar(capturas.map((c) => `${c.titulo ?? ""} ${c.texto_mensaje ?? ""}`));
  const enSugerencias = contar(sugerencias.map((s) => s.nombre ?? ""));
  const porClave = new Map(todos.map((g) => [`${g.pais}|${g.dropiId}`, g]));
  return grupos
    .map((g) => {
      const miembros = g.miembros.map((m) => porClave.get(`${m.pais}|${m.dropiId}`)!).filter(Boolean);
      const estado: EstadoGanador = miembros.some((m) => m.estado === "nuestro") ? "nuestro" : miembros.some((m) => m.estado === "tenemos") ? "tenemos" : "no";
      const conSku = miembros.find((m) => m.skuId && m.etiqueta);
      const fila: FilaCanales = {
        clave: g.clave,
        nombre: g.nombre,
        skuCodigo: conSku?.etiqueta && !conSku.etiqueta.startsWith("PUB-") ? conSku.etiqueta : (miembros.find((m) => m.estado === "nuestro")?.etiqueta ?? null),
        estado,
        ventas: g.ventas,
        competencia: enCompetencia.get(g.clave) ?? 0,
        scraping: enScraping.get(g.clave) ?? 0,
        anuncios: enAnuncios.get(g.clave) ?? 0,
        dropKiller: 0,
        sugerencias: enSugerencias.get(g.clave) ?? 0,
        canales: 0,
        pais: g.miembros[0].pais,
        dropiId: g.miembros[0].dropiId,
        enSeleccion: miembros.map((m) => m.enSeleccion).find(Boolean) ?? null,
        miembros: g.miembros.map((m) => ({ pais: m.pais, dropiId: m.dropiId })),
      };
      fila.canales = [fila.ventas.PA, fila.ventas.MX, fila.competencia, fila.scraping, fila.anuncios, fila.dropKiller, fila.sugerencias].filter((x) => x > 0).length;
      return fila;
    })
    .sort((a, b) => b.canales - a.canales || b.ventas.PA + b.ventas.MX - (a.ventas.PA + a.ventas.MX));
}

export interface Seguimiento {
  ganador: Ganador | null;
  producto: { pais: PaisTuWinner; dropiId: string; nombre: string; proveedor: string | null; precio: number | null; sugerido: number | null; stock: number | null; ventas7: number | null; ganador: boolean; ganadorDesde: string | null; primeraVez: string };
  dias: DiaDeVentas[];
  eventos: { momento: string; tipo: "entro" | "salio" | "precio" | "proveedor"; antes: string | null; despues: string | null }[];
}

/** El seguimiento de un producto: sus ventas de cada día (todas las lecturas guardadas), los reabastecimientos y lo que cambió. */
export async function cargarSeguimiento(supabase: SupabaseClient, pais: PaisTuWinner, dropiId: string, ganadores: Record<PaisTuWinner, Ganador[]>): Promise<Seguimiento | null> {
  const [pR, dR, eR] = await Promise.all([
    supabase.from("tuwinner_productos").select("pais, dropi_id, nombre, proveedor, precio, precio_sugerido, stock, ventas_7d, ganador, ganador_desde, primera_vez").eq("pais", pais).eq("dropi_id", dropiId).maybeSingle(),
    supabase.from("tuwinner_dias").select("dia, stock").eq("pais", pais).eq("dropi_id", dropiId).order("dia").limit(400),
    supabase.from("tuwinner_eventos").select("momento, tipo, antes, despues").eq("pais", pais).eq("dropi_id", dropiId).order("momento").limit(200),
  ]);
  const p = pR.data;
  if (!p) return null;
  return {
    ganador: ganadores[pais].find((g) => g.dropiId === dropiId) ?? null,
    producto: {
      pais,
      dropiId,
      nombre: p.nombre as string,
      proveedor: (p.proveedor as string | null) ?? null,
      precio: p.precio === null ? null : Number(p.precio),
      sugerido: p.precio_sugerido === null ? null : Number(p.precio_sugerido),
      stock: p.stock === null ? null : Number(p.stock),
      ventas7: p.ventas_7d === null ? null : Number(p.ventas_7d),
      ganador: !!p.ganador,
      ganadorDesde: (p.ganador_desde as string | null) ?? null,
      primeraVez: p.primera_vez as string,
    },
    dias: ventasPorDia((dR.data ?? []).map((d) => ({ dia: d.dia as string, stock: Number(d.stock) }))),
    eventos: (eR.data ?? []).map((e) => ({ momento: e.momento as string, tipo: e.tipo as Seguimiento["eventos"][number]["tipo"], antes: (e.antes as string | null) ?? null, despues: (e.despues as string | null) ?? null })),
  };
}
