import type { SupabaseClient } from "@supabase/supabase-js";
import { aDolares, monedaDePais, tasasUsd } from "@/lib/moneda/tipo-cambio";
import { motivoYaVisto, yaVisto } from "@/lib/scraping/cruces";
import { esNuevo, recomendar, ventasEstimadas, type EventoStock } from "@/lib/scraping/recomendar";
import { cargarReferencias, cargarRepetidos } from "@/lib/scraping/referencias";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { FilaScraping, Movimiento } from "./def-scraping";
import type { BusquedaResumen, ProveedorResumen, Registro } from "./vista-scraping";

const DIAS = 30;

interface FilaProducto {
  id: string;
  proveedor_id: string;
  dropi_producto_id: number;
  sku: string | null;
  nombre: string;
  foto_url: string | null;
  privado: boolean;
  precio: string | null;
  precio_sugerido: string | null;
  stock: number | null;
  categoria: string | null;
  estado: "activo" | "desaparecido";
  motivo_desaparicion: "agotado" | "privatizado" | "desconocido" | null;
  vinculado_a: string | null;
  vinculo_parecido: string | null;
  vinculo_seguro: boolean;
  primera_vez: string;
  ultima_vez: string;
  creado_en_dropi: string | null;
  foto_huella?: string | null;
}

interface FilaHistorial {
  producto_id: string;
  busqueda_id: string | null;
  fecha: string;
  evento: string;
  precio: string | null;
  stock: number | null;
  precio_antes: string | null;
  stock_antes: number | null;
}

const n = (v: string | null) => (v === null ? null : Number(v));

export interface DatosScraping {
  proveedores: ProveedorResumen[];
  registros: Registro[];
  busquedas: BusquedaResumen[];
  filas: FilaScraping[];
  /** Unidades de cada moneda por 1 dólar y de qué día. */
  tasas: { porUsd: Record<string, number>; fecha: string | null };
}

/**
 * Scraping de proveedores (rediseño del 26 oct 2026, como Gestión de IDs Dropi): TODOS los productos de TODOS los proveedores
 * referentes activos, de cualquier país, con sus ventas estimadas de 30 días (lo que bajó el stock, `ventasEstimadas`), los cruces
 * (ya testeado, en Producto, en Selección, en otros proveedores) y la recomendación (`recomendar`). `null` sin la migración 0105.
 */
export async function cargarScraping(supabase: SupabaseClient): Promise<DatosScraping | null> {
  const [provs, regs, busq] = await Promise.all([
    supabase.from("scraping_proveedores").select("id, nombre, pais, dropi_url, dropi_id").eq("activo", true).order("creado_en"),
    supabase.from("scraping_proveedor_registros").select("proveedor_id, fecha, ordenes, productos, dropshippers, origen").order("fecha"),
    supabase.from("scraping_busquedas").select("id, proveedor_id, inicio, fin, estado, productos_vistos, nuevos, desaparecidos, duracion_ms").order("inicio", { ascending: false }).limit(500),
  ]);
  if (provs.error) return null;

  const registros: Registro[] = (regs.data ?? []).map((r) => ({ proveedorId: r.proveedor_id, fecha: r.fecha, ordenes: r.ordenes, productos: r.productos, dropshippers: r.dropshippers, origen: r.origen }));
  const busquedas: BusquedaResumen[] = (busq.data ?? []).map((b) => ({
    id: b.id,
    proveedorId: b.proveedor_id,
    inicio: b.inicio,
    fin: b.fin,
    estado: b.estado,
    vistos: b.productos_vistos,
    nuevos: b.nuevos,
    desaparecidos: b.desaparecidos,
    duracionMs: b.duracion_ms,
  }));
  const proveedores: ProveedorResumen[] = (provs.data ?? []).map((x) => ({ id: x.id, nombre: x.nombre, pais: x.pais, url: x.dropi_url, dropiId: x.dropi_id }));
  const porId = new Map(proveedores.map((p) => [p.id, p]));
  if (!proveedores.length) return { proveedores, registros, busquedas, filas: [], tasas: { porUsd: { USD: 1 }, fecha: null } };

  const ahora = new Date().toISOString();
  const desde = new Date(Date.now() - DIAS * 86_400_000).toISOString();
  const desde7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [prods, hist, tasas, indice, repetidosEn, enviados] = await Promise.all([
    traerTodasConError<FilaProducto>((a, b) =>
      supabase
        .from("scraping_productos")
        // Con «*» trae también `foto_huella` (migración 0107) sin fallar si todavía no existe.
        .select("*")
        .in("proveedor_id", proveedores.map((p) => p.id))
        .order("id")
        .range(a, b),
    ),
    traerTodasConError<FilaHistorial>((a, b) =>
      supabase
        .from("scraping_producto_historial")
        .select("producto_id, busqueda_id, fecha, evento, precio, stock, precio_antes, stock_antes")
        .in("evento", ["primera_vez", "stock", "precio"])
        .gte("fecha", desde)
        .order("fecha")
        .order("id")
        .range(a, b),
    ),
    tasasUsd(supabase),
    cargarReferencias(supabase),
    cargarRepetidos(supabase),
    traerTodasConError<{ scraping_producto_id: string; numero: number; estado: string }>((a, b) =>
      supabase.from("wms_seleccion_productos").select("scraping_producto_id, numero, estado").not("scraping_producto_id", "is", null).order("id").range(a, b),
    ),
  ]);
  const enSeleccion = new Map((enviados.data ?? []).map((e) => [e.scraping_producto_id, { numero: e.numero, estado: e.estado }]));

  // La última búsqueda terminada de cada proveedor: sus eventos dicen qué subió, bajó o cambió de precio «desde la anterior».
  const ultimaDe = new Map<string, string>();
  for (const b of busquedas) if (b.estado === "lista" && !ultimaDe.has(b.proveedorId)) ultimaDe.set(b.proveedorId, b.id);
  const ultimasBusquedas = new Set(ultimaDe.values());
  const serie = new Map<string, number[]>();
  const ultimos = new Map<string, FilaHistorial[]>();
  const eventosStock = new Map<string, EventoStock[]>();
  for (const h of hist.data ?? []) {
    if ((h.evento === "primera_vez" || h.evento === "stock") && h.stock !== null) {
      const s = serie.get(h.producto_id) ?? [];
      // Antes de la primera búsqueda del periodo, el stock era el de «antes» del primer cambio.
      if (!s.length && h.evento === "stock" && h.stock_antes !== null) s.push(h.stock_antes);
      s.push(h.stock);
      serie.set(h.producto_id, s);
    }
    if (h.evento === "stock") eventosStock.set(h.producto_id, [...(eventosStock.get(h.producto_id) ?? []), { fecha: h.fecha, stock: h.stock, stockAntes: h.stock_antes }]);
    if (h.busqueda_id && ultimasBusquedas.has(h.busqueda_id)) ultimos.set(h.producto_id, [...(ultimos.get(h.producto_id) ?? []), h]);
  }

  const datos = (prods.data ?? []).filter((d) => porId.has(d.proveedor_id));
  // Desde cuándo se sigue a cada proveedor (lo primero que se vio de él): lo que ya estaba entonces no es «nuevo».
  const inicioDe = new Map<string, string>();
  for (const d of datos) if (!inicioDe.has(d.proveedor_id) || d.primera_vez < inicioDe.get(d.proveedor_id)!) inicioDe.set(d.proveedor_id, d.primera_vez);
  const nombrePorId = new Map(datos.map((d) => [d.id, d.nombre]));
  // Los privados de cada producto publicado (los vinculados por nombre y las sugerencias).
  const privadosDe = new Map<string, FilaScraping["privados"]>();
  for (const d of datos) {
    if (!d.privado || !d.vinculado_a || d.estado !== "activo") continue;
    privadosDe.set(d.vinculado_a, [
      ...(privadosDe.get(d.vinculado_a) ?? []),
      { id: d.id, nombre: d.nombre, precio: n(d.precio), stock: d.stock, parecido: Number(d.vinculo_parecido ?? 0), seguro: d.vinculo_seguro },
    ]);
  }

  const filas: FilaScraping[] = datos.map((d) => {
    const prov = porId.get(d.proveedor_id)!;
    const moneda = monedaDePais(prov.pais);
    const evs = ultimos.get(d.id) ?? [];
    const st = evs.find((e) => e.evento === "stock");
    const pr = evs.find((e) => e.evento === "precio");
    const movimientos: Movimiento[] = [];
    if (d.estado === "activo") {
      if (st && st.stock !== null && st.stock_antes !== null) movimientos.push(st.stock > st.stock_antes ? "subio" : "bajo");
      if (pr) movimientos.push("precio");
      if (evs.some((e) => e.evento === "primera_vez")) movimientos.push("nuevo");
    }
    const estado = d.estado === "desaparecido" ? "desaparecido" : d.privado ? "privado" : "activo";
    const ventas30 = ventasEstimadas(eventosStock.get(d.id) ?? [], desde);
    const ventas7 = ventasEstimadas(eventosStock.get(d.id) ?? [], desde7);
    const visto = (() => {
      const v = yaVisto(d.nombre, d.foto_huella ?? null, indice);
      return v ? { tipo: v.tipo, nombre: v.nombre, motivo: motivoYaVisto(v) } : null;
    })();
    const repetidoEn = [...(repetidosEn.get(d.id) ?? [])];
    const seleccion = enSeleccion.get(d.id) ?? null;
    const nuevoHaceDias = esNuevo(d.primera_vez, inicioDe.get(d.proveedor_id) ?? d.primera_vez, ahora);
    const rec = recomendar({ estado, motivo: d.motivo_desaparicion, ventas30, repetidoEn, yaVisto: visto, enSeleccion: !!seleccion, nuevoHaceDias });
    return {
      id: d.id,
      proveedorId: prov.id,
      proveedor: prov.nombre,
      pais: prov.pais,
      dropiId: Number(d.dropi_producto_id),
      sku: d.sku,
      nombre: d.nombre,
      foto: d.foto_url,
      categoria: d.categoria,
      precio: n(d.precio),
      precioAntes: pr ? n(pr.precio_antes) : null,
      precioSugerido: n(d.precio_sugerido),
      stock: d.stock,
      stockAntes: st ? st.stock_antes : null,
      estado,
      motivo: d.motivo_desaparicion,
      movimientos,
      vinculo: d.vinculado_a ? { nombre: nombrePorId.get(d.vinculado_a) ?? "", parecido: Number(d.vinculo_parecido ?? 0), seguro: d.vinculo_seguro } : null,
      ultimaVez: d.ultima_vez,
      primeraVez: d.primera_vez,
      creadoEnDropi: d.creado_en_dropi,
      nuevo: nuevoHaceDias !== null,
      serie: serie.get(d.id) ?? (d.stock !== null ? [d.stock] : []),
      ventas30,
      ventas7,
      recomendacion: rec.tipo,
      porQue: rec.porQue,
      precioUsd: aDolares(n(d.precio), moneda, tasas.porUsd),
      precioSugeridoUsd: aDolares(n(d.precio_sugerido), moneda, tasas.porUsd),
      yaVisto: visto,
      repetidoEn,
      privados: privadosDe.get(d.id) ?? [],
      seleccion,
    };
  });
  // Lo más vendido primero.
  filas.sort((a, b) => b.ventas30 - a.ventas30 || (b.creadoEnDropi ?? "").localeCompare(a.creadoEnDropi ?? ""));
  return { proveedores, registros, busquedas, filas, tasas: { porUsd: tasas.porUsd, fecha: tasas.fecha } };
}
