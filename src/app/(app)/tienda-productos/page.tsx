import { AvisoConexion, BarraTienda, FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { ProveedorSkusMaestros } from "@/components/ui/selector-sku-maestro";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { prepararContexto } from "@/lib/publicaciones/vincular";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { cargarTiendas, cargarVariantes, tiendaElegida } from "@/lib/tienda/datos";
import { nombreVariante, sugerirParaVariante } from "@/lib/tienda/vincular-variante";
import { obtenerOpcionesSkuMaestro } from "@/lib/wms/skus-maestros";
import { TraerProductos } from "./traer-productos";
import { VinculosTienda, type FilaVinculo } from "./vinculos-tienda";

export const metadata = { title: "Productos de Shopify" };

export const dynamic = "force-dynamic";

/**
 * Gestión de tienda › Productos de Shopify ↔ Producto (3 nov 2026): cada variante de Shopify de las tiendas del país se une a uno de nuestros productos.
 * El SKU de Shopify puede ser distinto al nuestro: la unión se guarda aquí y en Shopify no se cambia nada. El sistema sugiere (SKU o nombre igual,
 * nombre parecido o misma foto, con las reglas de Gestión de IDs Dropi) y una persona confirma. Con eso cada pedido sabe qué producto sale de bodega.
 */
export default async function ProductosTiendaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("tienda-productos");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, faltaMigracion } = await cargarTiendas(supabase, pais.id);
  const tienda = tiendaElegida(tiendas, sp.tienda);
  const miradas = tienda ? [tienda] : tiendas;
  const variantes = await cargarVariantes(
    supabase,
    miradas.map((t) => t.id),
  );
  const puedeEscribir = !usuario.modulosSoloLectura.includes("tienda-productos");

  // Los productos nuestros (para mostrar el vinculado y elegir otro) y, solo si hay variantes sin unir, la sugerencia de cada una.
  const opciones = variantes.length ? await obtenerOpcionesSkuMaestro(supabase) : [];
  const porId = new Map(opciones.map((o) => [o.id, o]));
  const sinUnir = variantes.filter((v) => !v.skuMaestroId && !v.noFisico);
  let sugeridos = new Map<string, { skuId: string; tipo: string; metodo: string | null }>();
  if (sinUnir.length) {
    const [skus, comps] = await Promise.all([
      traerTodasLasFilas<{ id: string; codigo: string; nombre: string; tipo: string; foto_huella: string | null }>((d, h) =>
        supabase.from("skus_maestros").select("id, codigo, nombre, tipo, foto_huella").is("padre_id", null).order("id").range(d, h),
      ),
      traerTodasLasFilas<{ combo_id: string; componente_id: string; cantidad: number }>((d, h) =>
        supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").order("combo_id").order("componente_id").range(d, h),
      ),
    ]);
    const ctx = prepararContexto(
      skus.map((s) => ({ id: s.id, codigo: s.codigo, nombre: s.nombre, tipo: s.tipo, huella: s.foto_huella })),
      comps.map((c) => ({ comboId: c.combo_id, componenteId: c.componente_id, cantidad: Number(c.cantidad) })),
    );
    sugeridos = new Map(
      sinUnir.flatMap((v) => {
        const s = sugerirParaVariante({ productoTitulo: v.productoTitulo, varianteTitulo: v.varianteTitulo, sku: v.sku, huella: v.huella }, ctx);
        return s.skuId && s.tipo !== "falta_compuesto" ? [[v.id, { skuId: s.skuId, tipo: s.tipo, metodo: s.metodo }] as const] : [];
      }),
    );
  }
  const nombreTienda = new Map(tiendas.map((t) => [t.id, t.nombre]));
  // «Traer de Shopify» (12 nov 2026): para las tiendas conectadas que se miran, con la última vez que se trajeron.
  const conectadas = miradas.filter((t) => t.estado === "conectada");
  const { data: ultimaFila } = conectadas.length
    ? await supabase.from("tienda_variantes").select("actualizado_en").in("tienda_id", conectadas.map((t) => t.id)).order("actualizado_en", { ascending: false }).limit(1).maybeSingle()
    : { data: null };
  const filas: FilaVinculo[] = variantes.map((v) => {
    const s = sugeridos.get(v.id);
    const sugerido = s ? porId.get(s.skuId) : undefined;
    return {
      id: v.id,
      tienda: nombreTienda.get(v.tiendaId) ?? "",
      nombre: nombreVariante(v),
      sku: v.sku,
      foto: v.foto,
      enShopify: v.enShopify,
      noFisico: v.noFisico,
      skuMaestroId: v.skuMaestroId,
      sugerencia: sugerido && s ? { id: sugerido.id, codigo: sugerido.codigo, nombre: sugerido.nombre, exacta: s.tipo === "seguro", metodo: s.metodo } : null,
    };
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Productos de Shopify" oculto>
        Cada variante de Shopify se une a uno de nuestros productos. El SKU de Shopify puede ser distinto al nuestro: la unión se guarda aquí y en Shopify no se cambia nada.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <FaltaMigracionTienda />
      ) : !tiendas.length ? (
        <SinTiendas pais={pais.nombre} />
      ) : (
        <>
          <BarraTienda ruta="/tienda-productos" tiendas={tiendas} tiendaId={tienda?.id ?? null} />
          <AvisoConexion tiendas={miradas} />
          {puedeEscribir && conectadas.length > 0 && (
            <TraerProductos tiendas={conectadas.map((t) => ({ id: t.id, nombre: t.nombre }))} ultima={(ultimaFila?.actualizado_en as string | undefined) ?? null} />
          )}
          <ProveedorSkusMaestros opciones={opciones}>
            <VinculosTienda filas={filas} varias={miradas.length > 1} puedeEscribir={puedeEscribir} />
          </ProveedorSkusMaestros>
        </>
      )}
    </Pagina>
  );
}
