import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { compraCuenta } from "@/lib/compras/cuenta";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { accionesPorPais, armarPorPais, ESTADOS_EXISTE, paisesPorDecidir, type CompraPais, type DecisionPais, type PublicacionPais, type StockPais } from "@/lib/producto/por-pais";
import { esBodegaDropi } from "@/lib/publicaciones/automatico";
import { idsDeDropi } from "@/lib/publicaciones/sincronizar-dropi";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { PAISES_GESTION, type FilaPorPais, type PaisColumna } from "./def-por-pais";

const unoDe = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/**
 * Lee lo que hace falta para «Producto › Por país»: los productos y, por país de la barra que la persona puede ver, sus publicaciones de
 * Dropi y Drop, las compras, el stock de las bodegas, lo descontinuado y las decisiones (migración 0231; sin ella, ninguna).
 */
export async function cargarPorPais(usuario: UsuarioActual, supabase: SupabaseClient): Promise<{ filas: FilaPorPais[]; paises: PaisColumna[]; sinMigracion: boolean }> {
  const codigos = PAISES_GESTION.map((p) => p.codigo).filter((c) => puedeVerPais(usuario.paisesPermitidos, c));
  const { data: filasPaises } = await supabase.from("paises").select("id, codigo, nombre").in("codigo", codigos);
  const codigoPorId = new Map(((filasPaises ?? []) as { id: string; codigo: string }[]).map((p) => [p.id, p.codigo]));
  const paises: PaisColumna[] = codigos
    .map((codigo) => ({ codigo, nombre: PAISES_GESTION.find((p) => p.codigo === codigo)?.nombre ?? codigo, id: [...codigoPorId].find(([, c]) => c === codigo)?.[0] ?? "" }))
    .filter((p) => p.id);
  const paisDe = (id: string | null | undefined) => (id ? (codigoPorId.get(id) ?? null) : null);

  const [productos, fotos, dropi, drop, lineas, stock, descontinuados, decisiones, stockDropi] = await Promise.all([
    traerTodasConError<{ id: string; codigo: string; nombre: string; tipo: string; clase: string; padre_id: string | null; numero: number | null; creado_en: string; codigo_barras: string | null }>((d, h) =>
      supabase.from("skus_maestros").select("id, codigo, nombre, tipo, clase, padre_id, numero, creado_en, codigo_barras").order("id").range(d, h),
    ),
    traerTodasConError<{ id: string; foto_url: string }>((d, h) => supabase.from("skus_maestros").select("id, foto_url").not("foto_url", "is", null).order("id").range(d, h)),
    traerTodasConError<{ id: string; sku_maestro_id: string; dropi_id: string | null; estado: string | null; estado_publicacion: string | null; pais_id: string }>((d, h) =>
      supabase.from("dropi_publicaciones").select("id, sku_maestro_id, dropi_id, estado, estado_publicacion, pais_id").not("sku_maestro_id", "is", null).order("id").range(d, h),
    ),
    traerTodasConError<{ id: string; sku_maestro_id: string; codigo: string | null; estado: string; en_drop: boolean; inventario: number | null; pais_id: string }>((d, h) =>
      supabase.from("drop_publicaciones").select("id, sku_maestro_id, codigo, estado, en_drop, inventario, pais_id").not("sku_maestro_id", "is", null).order("id").range(d, h),
    ),
    traerTodasConError<{ sku_maestro_id: string; compra_id: string; cantidad_pedida: number; wms_compras: unknown }>((d, h) =>
      supabase.from("wms_compra_items").select("sku_maestro_id, compra_id, cantidad_pedida, wms_compras(numero, creado_en, etapa, anulada_en, pais_id)").order("id").range(d, h),
    ),
    traerTodasConError<{ sku_maestro_id: string; fisico: number; wms_bodegas: unknown }>((d, h) =>
      supabase.from("wms_stock").select("sku_maestro_id, bodega_id, fisico, wms_bodegas(nombre, pais_id)").gt("fisico", 0).order("sku_maestro_id").order("bodega_id").range(d, h),
    ),
    supabase.from("skus_descontinuado_pais").select("sku_id, pais_id"),
    supabase.from("producto_pais_decisiones").select("sku_id, pais_id, decision, motivo, decidido_por, decidido_en"),
    // El stock en Dropi de nuestros productos: la última lectura de «Mis productos» de cada país, por bodega.
    traerTodasConError<{ pais_id: string; dropi_producto_id: number; stock: number | null; bodegas: { id: number; stock: number }[] | null }>((d, h) =>
      supabase.from("dropi_productos_proveedor").select("pais_id, dropi_producto_id, stock, bodegas").order("pais_id").order("dropi_producto_id").range(d, h),
    ),
  ]);
  // Real = lo de la bodega de Dropi (B280, B15, B49…); lo de la bodega del proveedor (la B81 de Panamá) es referencial: se pone a mano para
  // la publicación y no es el stock que hay (5 nov 2026, Alcides). Sin el detalle por bodega, el total cuenta como referencial.
  const stockPorDropi = new Map(
    (stockDropi.data ?? []).map((s) => {
      const bodegas = Array.isArray(s.bodegas) ? s.bodegas : null;
      const real = bodegas ? bodegas.filter((b) => esBodegaDropi(b.id)).reduce((t, b) => t + Number(b.stock ?? 0), 0) : 0;
      const referencial = bodegas ? bodegas.filter((b) => !esBodegaDropi(b.id)).reduce((t, b) => t + Number(b.stock ?? 0), 0) : Number(s.stock ?? 0);
      return [`${s.pais_id}:${s.dropi_producto_id}`, { real, referencial }];
    }),
  );
  const stockDeDropi = (paisId: string, dropiId: string | null): { real: number; referencial: number } | null => {
    const valores = idsDeDropi(dropiId).map((id) => stockPorDropi.get(`${paisId}:${id}`)).filter((v): v is { real: number; referencial: number } => v !== undefined);
    return valores.length ? valores.reduce((a, b) => ({ real: a.real + b.real, referencial: a.referencial + b.referencial }), { real: 0, referencial: 0 }) : null;
  };
  if (productos.error) throw new Error("No se pudieron leer los productos.");

  // Una publicación de Dropi en borrador todavía no está en Dropi: no cuenta.
  const publicaciones: PublicacionPais[] = [
    ...(dropi.data ?? [])
      .filter((p) => p.estado_publicacion !== "borrador")
      .map((p) => ({
        skuId: p.sku_maestro_id,
        pais: paisDe(p.pais_id) ?? "",
        plataforma: "dropi" as const,
        idPlataforma: p.dropi_id ?? "sin ID",
        ref: p.id,
        activa: p.estado !== "archivado" && p.estado_publicacion !== "archivado" && !!p.dropi_id,
        stock: stockDeDropi(p.pais_id, p.dropi_id)?.real ?? null,
        stockReferencial: stockDeDropi(p.pais_id, p.dropi_id)?.referencial ?? null,
      })),
    ...(drop.data ?? []).map((p) => ({
      skuId: p.sku_maestro_id,
      pais: paisDe(p.pais_id) ?? "",
      plataforma: "drop" as const,
      idPlataforma: p.codigo ?? "Drop",
      ref: p.id,
      activa: p.en_drop && p.estado === "activo",
      stock: p.inventario ?? null,
    })),
  ];
  const compras: CompraPais[] = [];
  for (const l of lineas.data ?? []) {
    const c = unoDe(l.wms_compras as { numero: number | null; creado_en: string; etapa: string; anulada_en: string | null; pais_id: string | null } | null);
    const pais = paisDe(c?.pais_id);
    if (!c || !pais) continue;
    compras.push({ skuId: l.sku_maestro_id, compraId: l.compra_id, pais, numero: c.numero, unidades: Number(l.cantidad_pedida ?? 0), etapa: c.etapa, anulada: !!c.anulada_en, creada: c.creado_en.slice(0, 10) });
  }
  const stockPais: StockPais[] = [];
  for (const s of stock.data ?? []) {
    const b = unoDe(s.wms_bodegas as { nombre: string; pais_id: string } | null);
    const pais = paisDe(b?.pais_id);
    if (b && pais) stockPais.push({ skuId: s.sku_maestro_id, pais, bodega: b.nombre, unidades: Number(s.fisico) });
  }
  const sinMigracion = !!decisiones.error;
  const listaDecisiones: DecisionPais[] = ((decisiones.error ? [] : decisiones.data) ?? []).flatMap((d) => {
    const pais = paisDe(d.pais_id as string);
    return pais ? [{ skuId: d.sku_id as string, pais, decision: d.decision as DecisionPais["decision"], motivo: (d.motivo as string | null) ?? null, por: (d.decidido_por as string | null) ?? null, en: String(d.decidido_en).slice(0, 10) }] : [];
  });
  const listaDescontinuados = ((descontinuados.error ? [] : descontinuados.data) ?? []).flatMap((d) => {
    const pais = paisDe(d.pais_id as string);
    return pais ? [{ skuId: d.sku_id as string, pais }] : [];
  });

  const base = productos.data ?? [];
  const celdas = armarPorPais(
    base.map((p) => ({ id: p.id, padreId: p.padre_id })),
    paises.map((p) => p.codigo),
    { publicaciones, compras, stock: stockPais, decisiones: listaDecisiones, descontinuados: listaDescontinuados },
    (c) => compraCuenta({ etapa: c.etapa, anulada: c.anulada }),
  );
  const fotoPorId = new Map((fotos.data ?? []).map((f) => [f.id, f.foto_url]));
  const filas: FilaPorPais[] = base
    .filter((p) => !p.padre_id)
    .map((p) => {
      const porPais = celdas.get(p.id) ?? {};
      const existeEn = paises.filter((x) => porPais[x.codigo] && ESTADOS_EXISTE.includes(porPais[x.codigo].estado)).map((x) => x.codigo);
      return {
        id: p.id,
        numero: p.numero ?? null,
        barras: p.codigo_barras || null,
        codigo: p.codigo,
        nombre: p.nombre,
        foto: fotoPorId.get(p.id) ?? null,
        tipo: p.tipo,
        clase: p.clase,
        creado: String(p.creado_en ?? "").slice(0, 10),
        celdas: porPais,
        existeEn,
        acciones: accionesPorPais(porPais, p.clase),
        porDecidir: paisesPorDecidir(porPais, p.clase),
      };
    })
    .sort((a, b) => b.existeEn.length - a.existeEn.length || (b.numero ?? 0) - (a.numero ?? 0));
  return { filas, paises, sinMigracion };
}
