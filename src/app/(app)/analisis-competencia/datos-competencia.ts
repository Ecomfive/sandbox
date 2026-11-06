import type { SupabaseClient } from "@supabase/supabase-js";
import { unidadesBajadas, vigiladoDe, type CambioStock } from "@/lib/competencia/analisis";
import { idDeProveedorDrop } from "@/lib/competencia/drop";
import type { PlataformaId } from "@/lib/plataformas";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { AlertaC, BitacoraC, CompetidorC, DatosCompetencia, ProductoC, VentaC } from "./def-competencia";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const DOMINIO: Record<string, string> = { PA: "pa", CR: "cr", MX: "mx", CO: "co" };

/** Las tablas de cada plataforma: las de Dropi (0108) y las de Drop (0234), iguales salvo por cómo se identifica un producto y su proveedor. */
const TABLAS: Record<PlataformaId, Record<"productos" | "busquedas" | "historial" | "alertas" | "ids", string>> = {
  dropi: { productos: "competencia_productos", busquedas: "competencia_busquedas", historial: "competencia_historial", alertas: "competencia_alertas", ids: "dropi_producto_id, proveedor_dropi_id" },
  drop: { productos: "drop_competencia_productos", busquedas: "drop_competencia_busquedas", historial: "drop_competencia_historial", alertas: "drop_competencia_alertas", ids: "drop_producto_id" },
};

/** El catálogo de Drop no tiene una página por proveedor. */
const CATALOGO_DROP = "https://app.soydrop.com/dropshipping";

interface FilaProducto {
  id: string;
  dropi_producto_id?: number;
  proveedor_dropi_id?: number;
  proveedor_nombre: string;
  nombre: string;
  foto_url: string | null;
  foto_huella: string | null;
  precio: string | null;
  stock: number | null;
  categoria: string | null;
  es_nuestro: boolean;
  estado: "activo" | "desaparecido";
  igual_a: string | null;
  igual_parecido: string | null;
  igual_metodo: string | null;
  primera_vez: string;
  ultima_vez: string;
}

type FilaBitacora = { fecha: string; evento: string; precio: string | null; stock: number | null; precio_antes: string | null; stock_antes: number | null } & Record<string, unknown>;

/** Drop sin datos (falta la migración 0234): las pestañas se dibujan igual que las de Dropi, en cero. */
export function datosCompetenciaVacios(plataforma: DatosCompetencia["plataforma"], paisNombre: string): DatosCompetencia {
  return { plataforma, pais: paisNombre, productos: [], competidores: [], alertas: [], bitacora: [], ultima: null, busquedas: 0, corte: null, ventas: [] };
}

/**
 * Todo lo que muestran las pestañas de Análisis de competencia para un país: los productos (nuestros y de la competencia) con
 * sus iguales, el stock vendido en 1/7/30 días, los competidores, las alertas, la bitácora y las
 * ventas por día (bajadas de stock) para el dashboard. `null` si falta la migración de esa plataforma (0108 Dropi, 0234 Drop).
 */
export async function cargarDatosCompetencia(supabase: SupabaseClient, pais: { id: string; codigo: string; nombre: string }, plataforma: PlataformaId = "dropi"): Promise<DatosCompetencia | null> {
  const desde31 = new Date(Date.now() - 31 * 86_400_000).toISOString();
  const t = TABLAS[plataforma];
  const esDrop = plataforma === "drop";
  // Como `string`: armadas con el nombre de la tabla, el tipo de Supabase no sabe leerlas.
  const columnasProducto: string = `id, ${t.ids}, proveedor_nombre, nombre, foto_url, foto_huella, precio, stock, categoria, es_nuestro, estado, igual_a, igual_parecido, igual_metodo, primera_vez, ultima_vez`;
  const columnasStock: string = `producto_id, fecha, stock, stock_antes, ${t.productos}!inner(pais_id)`;
  const columnasBitacora: string = `fecha, evento, precio, stock, precio_antes, stock_antes, ${t.productos}!inner(pais_id, nombre, proveedor_nombre, es_nuestro)`;

  const [prods, busq, alertasR, stockR, bitacoraR] = await Promise.all([
    traerTodasConError<FilaProducto>((a, b) =>
      supabase
        .from(t.productos)
        .select<string, FilaProducto>(columnasProducto)
        .eq("pais_id", pais.id)
        .order("id")
        .range(a, b),
    ),
    supabase.from(t.busquedas).select("inicio, fin, estado, productos, proveedores, duracion_ms, cambios").eq("pais_id", pais.id).order("inicio", { ascending: false }).limit(60),
    supabase.from(t.alertas).select("id, fecha, tipo, titulo, detalle, vista, producto_id, nuestro_id").eq("pais_id", pais.id).order("fecha", { ascending: false }).limit(400),
    traerTodasConError<{ producto_id: string; fecha: string; stock: number; stock_antes: number }>((a, b) =>
      supabase
        .from(t.historial)
        .select<string, { producto_id: string; fecha: string; stock: number; stock_antes: number }>(columnasStock)
        .eq(`${t.productos}.pais_id`, pais.id)
        .eq("evento", "stock")
        .gte("fecha", desde31)
        .order("id")
        .range(a, b),
    ),
    supabase
      .from(t.historial)
      .select<string, FilaBitacora>(columnasBitacora)
      .eq(`${t.productos}.pais_id`, pais.id)
      .neq("evento", "primera_vez")
      .order("fecha", { ascending: false })
      .limit(500),
  ]);

  if (prods.error || busq.error) return null;

  const ahora = new Date();
  const cambiosDe = new Map<string, CambioStock[]>();
  const ventas: VentaC[] = [];
  for (const c of stockR.data ?? []) {
    if (c.stock === null || c.stock_antes === null) continue;
    cambiosDe.set(c.producto_id, [...(cambiosDe.get(c.producto_id) ?? []), { fecha: c.fecha, stock: c.stock, stockAntes: c.stock_antes }]);
    if (c.stock < c.stock_antes) ventas.push({ fecha: c.fecha, productoId: c.producto_id, unidades: c.stock_antes - c.stock });
  }
  const dominio = DOMINIO[pais.codigo] ?? pais.codigo.toLowerCase();
  const filas = prods.data ?? [];
  const aProducto = (p: FilaProducto): ProductoC => {
    const cambios = cambiosDe.get(p.id) ?? [];
    return {
      id: p.id,
      dropiId: esDrop ? 0 : Number(p.dropi_producto_id),
      proveedorId: esDrop ? idDeProveedorDrop(p.proveedor_nombre) : Number(p.proveedor_dropi_id),
      proveedor: p.proveedor_nombre,
      nombre: p.nombre,
      foto: p.foto_url,
      precio: n(p.precio),
      stock: p.stock,
      categoria: p.categoria,
      estado: p.estado,
      esNuestro: p.es_nuestro,
      igualA: p.igual_a,
      parecido: n(p.igual_parecido),
      metodo: p.igual_metodo,
      primeraVez: p.primera_vez,
      ultimaVez: p.ultima_vez,
      bajo1: unidadesBajadas(cambios, 1, ahora),
      bajo7: unidadesBajadas(cambios, 7, ahora),
      bajo30: unidadesBajadas(cambios, 30, ahora),
      urlProveedor: esDrop ? CATALOGO_DROP : `https://app.dropi.${dominio}/dashboard/provider/${p.proveedor_dropi_id}/${encodeURIComponent(p.proveedor_nombre)}`,
    };
  };
  const productos = filas.map(aProducto);

  // La primera búsqueda marca desde cuándo un producto de un competidor cuenta como «nuevo» suyo.
  const listas = (busq.data ?? []).filter((b) => b.estado === "lista");
  const corte = listas[listas.length - 1]?.fin ?? null;

  // Competidores: sus productos, cuántos son iguales a los nuestros, los nuevos de la semana y cuánto bajó su stock.
  const porProveedor = new Map<number, CompetidorC>();
  const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  for (const p of productos) {
    if (p.esNuestro || p.estado !== "activo") continue;
    const c = porProveedor.get(p.proveedorId) ?? { id: p.proveedorId, nombre: p.proveedor, url: p.urlProveedor, enlace: esDrop ? "Abrir el catálogo de Drop ↗" : "Abrir su página en Dropi ↗", productos: 0, iguales: 0, nuevos7: 0, bajo1: 0, bajo7: 0, bajo30: 0, primeraVez: p.primeraVez, vigilado: vigiladoDe(pais.codigo, p.proveedorId) };
    c.productos++;
    if (p.igualA) c.iguales++;
    if (corte && p.primeraVez > corte && p.primeraVez > hace7) c.nuevos7++;
    c.bajo1 += p.bajo1;
    c.bajo7 += p.bajo7;
    c.bajo30 += p.bajo30;
    if (p.primeraVez < c.primeraVez) c.primeraVez = p.primeraVez;
    porProveedor.set(p.proveedorId, c);
  }

  const alertas: AlertaC[] = (alertasR.error ? [] : (alertasR.data ?? [])).map((a) => ({ id: a.id, fecha: a.fecha, tipo: a.tipo, titulo: a.titulo, detalle: a.detalle, vista: a.vista, productoId: a.producto_id, nuestroId: a.nuestro_id }));
  const bitacora: BitacoraC[] = (bitacoraR.error ? [] : (bitacoraR.data ?? [])).map((h) => {
    const unido = h[t.productos];
    const p = (Array.isArray(unido) ? unido[0] : unido) as { nombre: string; proveedor_nombre: string; es_nuestro: boolean };
    return { fecha: h.fecha, evento: h.evento, producto: p.nombre, proveedor: p.proveedor_nombre, esNuestro: p.es_nuestro, precio: n(h.precio), stock: h.stock, precioAntes: n(h.precio_antes), stockAntes: h.stock_antes };
  });

  const ultima = (busq.data ?? [])[0] ?? null;
  const datos: DatosCompetencia = {
    plataforma,
    pais: pais.nombre,
    productos,
    competidores: [...porProveedor.values()].sort((a, b) => b.bajo7 - a.bajo7 || b.productos - a.productos),
    alertas,
    bitacora,
    ultima: ultima ? { inicio: ultima.inicio, estado: ultima.estado, duracionMs: ultima.duracion_ms, productos: ultima.productos, proveedores: ultima.proveedores } : null,
    busquedas: listas.length,
    corte,
    ventas,
  };

  return datos;
}
