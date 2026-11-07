import type { SupabaseClient } from "@supabase/supabase-js";
import { unidadesBajadas, vigiladoDe, type CambioStock } from "@/lib/competencia/analisis";
import { certezaIgual } from "@/lib/competencia/certeza";
import { claveVerificacion } from "@/lib/competencia/verificar-ia";
import { idDeProveedorDrop } from "@/lib/competencia/drop";
import type { PlataformaId } from "@/lib/plataformas";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { AlertaC, BitacoraC, CompetidorC, DatosCompetencia, ProductoC, VentaC } from "./def-competencia";

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const DOMINIO: Record<string, string> = { PA: "pa", CR: "cr", MX: "mx", CO: "co" };

/** Las tablas de cada plataforma: Dropi (0108), Drop (0234) y Effi (0239), iguales salvo por cómo se identifica un producto y su proveedor. */
const TABLAS: Record<PlataformaId, Record<"productos" | "busquedas" | "historial" | "alertas" | "ids", string>> = {
  dropi: { productos: "competencia_productos", busquedas: "competencia_busquedas", historial: "competencia_historial", alertas: "competencia_alertas", ids: "dropi_producto_id, proveedor_dropi_id" },
  drop: { productos: "drop_competencia_productos", busquedas: "drop_competencia_busquedas", historial: "drop_competencia_historial", alertas: "drop_competencia_alertas", ids: "drop_producto_id" },
  effi: { productos: "effi_competencia_productos", busquedas: "effi_competencia_busquedas", historial: "effi_competencia_historial", alertas: "effi_competencia_alertas", ids: "proveedor_effi_id, ventas" },
};

/** El catálogo de Drop no tiene una página por proveedor. */
const CATALOGO_DROP = "https://app.soydrop.com/dropshipping";

interface FilaProducto {
  id: string;
  dropi_producto_id?: number;
  proveedor_dropi_id?: number;
  proveedor_effi_id?: number;
  ventas?: number | null;
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

/** Drop o Effi sin datos (falta su migración, 0234 o 0239): las pestañas se dibujan igual que las de Dropi, en cero. */
export function datosCompetenciaVacios(plataforma: DatosCompetencia["plataforma"], paisNombre: string): DatosCompetencia {
  return { plataforma, pais: paisNombre, productos: [], competidores: [], alertas: [], bitacora: [], ultima: null, busquedas: 0, corte: null, ventas: [], dudososSinRevisar: 0 };
}

/**
 * Todo lo que muestran las pestañas de Análisis de competencia para un país: los productos (nuestros y de la competencia) con
 * sus iguales, el stock vendido en 1/7/30 días, los competidores, las alertas, la bitácora y las
 * ventas por día (bajadas de stock) para el dashboard. `null` si falta la migración de esa plataforma (0108 Dropi, 0234 Drop, 0239 Effi). Effi dice las ventas de cada
 * artículo: lo vendido sale de lo que subieron entre lecturas (evento `ventas`), no de las bajadas de stock, que también serían reposiciones al revés.
 */
export async function cargarDatosCompetencia(supabase: SupabaseClient, pais: { id: string; codigo: string; nombre: string }, plataforma: PlataformaId = "dropi"): Promise<DatosCompetencia | null> {
  const desde31 = new Date(Date.now() - 31 * 86_400_000).toISOString();
  const t = TABLAS[plataforma];
  const esDrop = plataforma === "drop";
  const esEffi = plataforma === "effi";
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
        .eq("evento", esEffi ? "ventas" : "stock")
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
    // Las ventas de Effi suben: con el signo contrario, `unidadesBajadas` las cuenta como cualquier otra salida.
    const [despues, antes] = esEffi ? [-c.stock, -c.stock_antes] : [c.stock, c.stock_antes];
    cambiosDe.set(c.producto_id, [...(cambiosDe.get(c.producto_id) ?? []), { fecha: c.fecha, stock: despues, stockAntes: antes }]);
    if (despues < antes) ventas.push({ fecha: c.fecha, productoId: c.producto_id, unidades: antes - despues });
  }
  const dominio = DOMINIO[pais.codigo] ?? pais.codigo.toLowerCase();
  const filas = prods.data ?? [];
  const aProducto = (p: FilaProducto): ProductoC => {
    const cambios = cambiosDe.get(p.id) ?? [];
    return {
      id: p.id,
      dropiId: esDrop ? 0 : Number(p.dropi_producto_id),
      proveedorId: esDrop ? idDeProveedorDrop(p.proveedor_nombre) : esEffi ? Number(p.proveedor_effi_id) : Number(p.proveedor_dropi_id),
      proveedor: p.proveedor_nombre,
      nombre: p.nombre,
      foto: p.foto_url,
      precio: n(p.precio),
      stock: p.stock,
      categoria: p.categoria,
      estado: p.estado,
      esNuestro: p.es_nuestro,
      igualA: p.igual_a,
      dudosoDe: null,
      revision: null,
      parecido: n(p.igual_parecido),
      metodo: p.igual_metodo,
      primeraVez: p.primera_vez,
      ultimaVez: p.ultima_vez,
      bajo1: unidadesBajadas(cambios, 1, ahora),
      bajo7: unidadesBajadas(cambios, 7, ahora),
      bajo30: unidadesBajadas(cambios, 30, ahora),
      ventasTotal: esEffi ? (p.ventas ?? null) : null,
      urlProveedor: esDrop ? CATALOGO_DROP : esEffi ? `https://effi.com.co/app/articulo_dropshipping?proveedor=${p.proveedor_effi_id}` : `https://app.dropi.${dominio}/dashboard/provider/${p.proveedor_dropi_id}/${encodeURIComponent(p.proveedor_nombre)}`,
    };
  };
  const productos = filas.map(aProducto);
  // Solo el mismo producto cuenta como igual (7 nov 2026, pedido de Hernán): el que solo se parece queda como dudoso y no se compara.
  // Con las fotos también, no solo los nombres. Lo que ya revisó la IA (migración 0246; sin ella, nada) manda sobre la regla.
  const porIdProducto = new Map(productos.map((p) => [p.id, p]));
  const huellaDe = new Map(filas.map((f) => [f.id, f.foto_huella]));
  const { data: verificaciones } = await supabase.from("competencia_verificaciones").select("producto_id, nuestro_id, veredicto, motivo").eq("plataforma", plataforma).limit(10000);
  const revisado = new Map((verificaciones ?? []).map((v) => [claveVerificacion(v.producto_id, v.nuestro_id), { veredicto: v.veredicto as "mismo" | "parecido" | "distinto", motivo: v.motivo as string | null }]));
  for (const p of productos) {
    if (!p.igualA) continue;
    const r = revisado.get(claveVerificacion(p.id, p.igualA)) ?? null;
    p.revision = r;
    if (r?.veredicto === "mismo") continue;
    if (r?.veredicto === "distinto") {
      p.igualA = null;
      continue;
    }
    const nuestro = porIdProducto.get(p.igualA);
    if (!r && nuestro && certezaIgual({ nombre: nuestro.nombre, huella: huellaDe.get(nuestro.id) }, { nombre: p.nombre, huella: huellaDe.get(p.id) }, p.metodo) === "exacto") continue;
    p.dudosoDe = p.igualA;
    p.igualA = null;
  }
  const dudososSinRevisar = productos.filter((p) => p.dudosoDe && !p.revision && p.estado === "activo" && p.foto && porIdProducto.get(p.dudosoDe)?.foto).length;

  // La primera búsqueda marca desde cuándo un producto de un competidor cuenta como «nuevo» suyo.
  const listas = (busq.data ?? []).filter((b) => b.estado === "lista");
  const corte = listas[listas.length - 1]?.fin ?? null;

  // Competidores: sus productos, cuántos son iguales a los nuestros, los nuevos de la semana y cuánto bajó su stock.
  const porProveedor = new Map<number, CompetidorC>();
  const hace7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  for (const p of productos) {
    if (p.esNuestro || p.estado !== "activo") continue;
    const c = porProveedor.get(p.proveedorId) ?? { id: p.proveedorId, nombre: p.proveedor, url: p.urlProveedor, enlace: esDrop ? "Abrir el catálogo de Drop ↗" : esEffi ? "Abrir su catálogo en Effi ↗" : "Abrir su página en Dropi ↗", ventasTotal: esEffi ? 0 : null, productos: 0, iguales: 0, nuevos7: 0, bajo1: 0, bajo7: 0, bajo30: 0, primeraVez: p.primeraVez, vigilado: vigiladoDe(pais.codigo, p.proveedorId) };
    c.productos++;
    if (p.igualA) c.iguales++;
    if (corte && p.primeraVez > corte && p.primeraVez > hace7) c.nuevos7++;
    c.bajo1 += p.bajo1;
    c.bajo7 += p.bajo7;
    c.bajo30 += p.bajo30;
    if (c.ventasTotal !== null) c.ventasTotal += p.ventasTotal ?? 0;
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
    competidores: [...porProveedor.values()].sort((a, b) => b.bajo7 - a.bajo7 || (b.ventasTotal ?? 0) - (a.ventasTotal ?? 0) || b.productos - a.productos),
    alertas,
    bitacora,
    ultima: ultima ? { inicio: ultima.inicio, estado: ultima.estado, duracionMs: ultima.duracion_ms, productos: ultima.productos, proveedores: ultima.proveedores } : null,
    busquedas: listas.length,
    corte,
    ventas,
    dudososSinRevisar,
  };

  return datos;
}
