"use server";

import { getUsuarioActual } from "@/lib/auth";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { plataformasDePais } from "@/lib/plataformas";
import { NOMBRE_PLATAFORMA_VENTAS, resumenVentasPlataforma, type PlataformaVentas } from "@/lib/publicaciones/ventas-plataformas";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerVentasDropiProducto } from "./ventas-dropi-actions";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/** Lo vendido por un producto en una plataforma del país, para la tabla «Ventas globales del país». */
export interface VentasEnPlataforma {
  plataforma: PlataformaVentas | "dropi";
  nombre: string;
  /** Sus publicaciones en esa plataforma: «ID 2565», «ID-ONWAG», «#837». */
  ids: string[];
  netas30: number;
  netasTotal: number;
  /** El stock allá; en Drop incluye los exclusivos de clientes (`exclusivo`). */
  stock: number;
  /** Drop: cuántas de `stock` son exclusivas de un cliente («Producto exclusivo» de su ficha, migración 0277); 0 en las demás. */
  exclusivo: number;
  primeraVenta: string | null;
  ultimaVenta: string | null;
  /** Hasta qué día llegan los datos de esa plataforma en el país; null si todavía no se leyeron sus ventas. */
  corte: string | null;
}

const MODULOS = ["producto", "inventario", "publicaciones-dropi", "publicaciones-drop", "publicaciones-effi", "publicaciones-dunamixfy"];

/** De dónde sale cada plataforma: su tabla de publicaciones, cómo se nombra su ID y su stock. */
const FUENTE: Record<PlataformaVentas, { tabla: string; columnas: string; id: (f: Record<string, unknown>) => string; etiqueta: (f: Record<string, unknown>) => string; stock: (f: Record<string, unknown>) => number; exclusivo?: (f: Record<string, unknown>) => number; activa: (f: Record<string, unknown>) => boolean }> = {
  // Drop: su «Inventario» más lo que guarda aparte para clientes (12 nov 2026, pedido de Hernán: «tiene que reconocer también las exclusivas»; el Aceite reafirmante
  // magic tenía 0 de inventario y 144 exclusivas para Nuvo Costa Rica y salía «Sin stock»).
  drop: {
    tabla: "drop_publicaciones",
    columnas: "drop_id, codigo, inventario, inventario_exclusivo, en_drop",
    id: (f) => String(f.drop_id),
    etiqueta: (f) => String(f.codigo || f.drop_id),
    stock: (f) => Math.max(0, Number(f.inventario ?? 0)) + Math.max(0, Number(f.inventario_exclusivo ?? 0)),
    exclusivo: (f) => Math.max(0, Number(f.inventario_exclusivo ?? 0)),
    activa: (f) => f.en_drop !== false,
  },
  effi: { tabla: "effi_publicaciones", columnas: "effi_id, stock_principal, en_effi", id: (f) => String(f.effi_id), etiqueta: (f) => `ID ${f.effi_id}`, stock: (f) => Number(f.stock_principal ?? 0), activa: (f) => f.en_effi !== false },
  dunamixfy: { tabla: "dunamixfy_publicaciones", columnas: "dunamixfy_id, stock, en_dunamixfy", id: (f) => String(f.dunamixfy_id), etiqueta: (f) => `#${f.dunamixfy_id}`, stock: (f) => Number(f.stock ?? 0), activa: (f) => f.en_dunamixfy !== false },
};

/**
 * Las ventas de un producto (y sus variantes) en cada plataforma de un país (12 nov 2026, pedido de Hernán: «mostrar las ventas por plataforma en las fichas de los productos»):
 * Dropi (todos sus IDs, lo mismo que «Ventas en Dropi») y Drop, Effi y Dunamixfy (`plataforma_ventas_diarias` de sus publicaciones vinculadas). Solo en un país con más de una
 * plataforma; una plataforma donde el producto no tiene publicación no sale. Netas = lo que salió − lo devuelto.
 */
export async function obtenerVentasPlataformasProducto(id: string, codigoPais: string): Promise<{ filas: VentasEnPlataforma[] } | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !MODULOS.some((m) => usuario.modulos.includes(m))) return { error: "No tienes acceso." };
  const codigo = String(codigoPais ?? "").toUpperCase();
  if (!ES_ID(id) || !/^[A-Z]{2}$/.test(codigo)) return { error: "Datos no válidos." };
  if (!puedeVerPais(usuario.paisesPermitidos, codigo)) return { error: "No tienes acceso a ese país." };
  const otras = plataformasDePais(codigo)
    .map((p) => p.id)
    .filter((p): p is PlataformaVentas => p !== "dropi");
  if (!otras.length) return { filas: [] };

  const supabase = createServiceClient();
  const { data: pais } = await supabase.from("paises").select("id").eq("codigo", codigo).maybeSingle();
  if (!pais) return { error: "País no válido." };
  const { data: variantes } = await supabase.from("skus_maestros").select("id").eq("padre_id", id);
  const skus = [id, ...(variantes ?? []).map((v) => v.id as string)];

  const filas: VentasEnPlataforma[] = [];
  const [dropi, ...resto] = await Promise.all([
    obtenerVentasDropiProducto(id, codigo).catch(() => ({ error: "x" })),
    ...otras.map(async (plataforma): Promise<VentasEnPlataforma | null> => {
      const f = FUENTE[plataforma];
      const leer = (columnas: string) => supabase.from(f.tabla).select(columnas).eq("pais_id", pais.id).in("sku_maestro_id", skus);
      // Sin la migración 0277 (exclusivos de Drop) se lee como antes.
      let { data: pubs, error } = await leer(f.columnas);
      if (error && f.columnas.includes("inventario_exclusivo")) ({ data: pubs, error } = await leer(f.columnas.replace(" inventario_exclusivo,", "")));
      if (error || !pubs?.length) return null;
      const lista = pubs as unknown as Record<string, unknown>[];
      const ids = lista.map(f.id);
      const [ventas, ultimo] = await Promise.all([
        traerTodasConError<{ dia: string; salidas: number; devueltas: number }>((d, h) =>
          supabase.from("plataforma_ventas_diarias").select("dia, salidas, devueltas").eq("pais_id", pais.id).eq("plataforma", plataforma).in("producto_id", ids).order("dia").order("producto_id").range(d, h),
        ),
        supabase.from("plataforma_ventas_diarias").select("dia").eq("pais_id", pais.id).eq("plataforma", plataforma).order("dia", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const corte = ultimo.error ? null : ((ultimo.data?.dia as string | undefined) ?? null);
      const r = resumenVentasPlataforma(ventas.error ? [] : (ventas.data ?? []).map((v) => ({ dia: v.dia, salidas: Number(v.salidas), devueltas: Number(v.devueltas) })), corte);
      return {
        plataforma,
        nombre: NOMBRE_PLATAFORMA_VENTAS[plataforma],
        ids: lista.map(f.etiqueta),
        netas30: r.netas30,
        netasTotal: r.netasTotal,
        stock: lista.filter(f.activa).reduce((t, x) => t + Math.max(0, f.stock(x)), 0),
        exclusivo: f.exclusivo ? lista.filter(f.activa).reduce((t, x) => t + f.exclusivo!(x), 0) : 0,
        primeraVenta: r.primeraVenta,
        ultimaVenta: r.ultimaVenta,
        corte,
      };
    }),
  ]);
  if (dropi && "paises" in dropi && dropi.paises[0]) {
    const v = dropi.paises[0];
    filas.push({ plataforma: "dropi", nombre: "Dropi", ids: v.ids.map((i) => `ID ${i.id}`), netas30: v.netas30, netasTotal: v.netasTotal, stock: v.stock, exclusivo: 0, primeraVenta: v.primeraVenta, ultimaVenta: v.ultimaVenta, corte: v.corte });
  }
  for (const r of resto) if (r) filas.push(r);
  return { filas };
}
