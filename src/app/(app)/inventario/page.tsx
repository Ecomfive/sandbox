import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { cargarCodigosProductos } from "@/lib/wms/codigos-producto";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { leerStockPlataformas } from "./datos-plataformas";
import type { FilaStock } from "./def-stock";
import { ListaStock } from "./lista-stock";

export const metadata = { title: "Inventario" };

export const dynamic = "force-dynamic";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Inventario por cubetas (WMS, fase B): cada SKU maestro con lo que hay en las bodegas del país (o en una). Nace vacío: los
 * productos están todos, en cero, y las cantidades llegan con entradas, salidas y sincronizaciones. Un combo no guarda
 * stock: sale de sus componentes.
 */
export default async function InventarioPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { bodega } = await searchParams;
  const bodegaPedida = typeof bodega === "string" && ES_ID(bodega) ? bodega : null;

  const { data: bodegasPais } = await supabase
    .from("wms_bodegas")
    .select("id, nombre, tipo, activa, codigo")
    .eq("pais_id", pais.id)
    .order("tipo")
    .order("nombre");
  // Las desactivadas (Effi, Boxfull… en Panamá) no se ofrecen.
  const todas = bodegasPais ?? [];
  const bodegas = todas.filter((b) => b.activa);
  // Solo vale una bodega del país actual.
  const bodegaElegida = bodegaPedida && bodegas.some((b) => b.id === bodegaPedida) ? bodegaPedida : "";

  const idsPropias = bodegas.filter((b) => b.tipo === "propia" && b.activa).map((b) => b.id as string);
  const [resumen, ubicaciones, fotos, padres, codigos] = await Promise.all([
    // Paginado: cada consulta trae 1 000 filas como máximo y hay más productos (2 nov 2026: la lista se cortaba en 1 000).
    traerTodasConError<Record<string, unknown>>((desde, hasta) => supabase.rpc("wms_stock_resumen", { p_pais: pais.id, p_bodega: bodegaElegida || null }).range(desde, hasta)),
    idsPropias.length > 0
      ? supabase.from("wms_ubicaciones").select("id, bodega_id, codigo, propiedad").in("bodega_id", idsPropias).eq("activa", true).order("codigo")
      : Promise.resolve({ data: [] as { id: string; bodega_id: string; codigo: string; propiedad: string }[] }),
    // Sin la migración 0086 no hay columna de foto: el inventario se carga igual, sin fotos.
    traerTodasConError<{ id: string; foto_url: string }>((desde, hasta) => supabase.from("skus_maestros").select("id, foto_url").not("foto_url", "is", null).order("id").range(desde, hasta)),
    traerTodasConError<{ id: string }>((desde, hasta) => supabase.from("skus_maestros").select("id").not("opciones_variantes", "is", null).order("id").range(desde, hasta)),
    // El N.º y el código de barras de cada producto (7 nov 2026, pedido de Hernán).
    cargarCodigosProductos(supabase),
  ]);
  const fotoPorId = new Map(((fotos.data ?? []) as { id: string; foto_url: string }[]).map((f) => [f.id, f.foto_url]));
  // Las cajas de cada producto, de las bodegas que se están viendo (migración 0236; sin ella, en cero).
  const bodegasVistas = bodegaElegida ? [bodegaElegida] : bodegas.map((b) => b.id as string);
  const { data: filasCajas } = bodegasVistas.length
    ? await traerTodasConError<{ sku_maestro_id: string; cajas: number; unidades_por_caja: number }>((d, h) => supabase.from("wms_cajas").select("sku_maestro_id, cajas, unidades_por_caja").in("bodega_id", bodegasVistas).order("id").range(d, h))
    : { data: [] };
  const cajasPorSku = new Map<string, { cajas: number; unidades: number }>();
  for (const c of filasCajas ?? []) {
    const x = cajasPorSku.get(c.sku_maestro_id) ?? { cajas: 0, unidades: 0 };
    x.cajas += c.cajas;
    x.unidades += c.cajas * c.unidades_por_caja;
    cajasPorSku.set(c.sku_maestro_id, x);
  }

  // Las unidades de cada producto en cada bodega propia (9 nov 2026): para filtrar por bodega y para las columnas del Excel.
  const { data: filasPorBodega } = idsPropias.length
    ? await traerTodasConError<{ sku_maestro_id: string; bodega_id: string; fisico: number }>((d, h) => supabase.from("wms_stock").select("sku_maestro_id, bodega_id, fisico").in("bodega_id", idsPropias).order("sku_maestro_id").range(d, h))
    : { data: [] };
  const porBodegaPorSku = new Map<string, { bodegaId: string; fisico: number }[]>();
  for (const s of filasPorBodega ?? []) porBodegaPorSku.set(s.sku_maestro_id, [...(porBodegaPorSku.get(s.sku_maestro_id) ?? []), { bodegaId: s.bodega_id, fisico: Number(s.fisico) }]);

  const conVariantes = new Set(((padres.data ?? []) as { id: string }[]).map((p) => p.id));
  // Lo que hay en las plataformas (6 nov 2026 en Costa Rica; en todos los países desde el 7 nov, pedido de Hernán): se lee de sus publicaciones, no de `wms_stock`.
  // Cuenta como stock: un producto con unidades en Dropi, Effi o Drop no está «sin stock».
  const plataformas = await leerStockPlataformas(supabase, pais.id);

  // Un producto con variantes no lleva stock: se ven sus variantes. Sale solo si le viene algo en camino (una compra hecha al producto general) o si una plataforma lo tiene publicado así.
  const filas: FilaStock[] = ((resumen.data ?? []) as Record<string, unknown>[]).filter((r) => !conVariantes.has(String(r.sku_maestro_id)) || Number(r.en_camino) > 0 || !!plataformas?.porProducto.has(String(r.sku_maestro_id))).map((r) => ({
    id: String(r.sku_maestro_id),
    codigo: String(r.codigo),
    nombre: String(r.nombre),
    numero: codigos.get(String(r.sku_maestro_id))?.numero ?? null,
    barras: codigos.get(String(r.sku_maestro_id))?.barras ?? null,
    tipo: String(r.tipo),
    clase: String(r.clase ?? "fisico"),
    fisico: Number(r.fisico),
    reservado: Number(r.reservado),
    disponible: Number(r.disponible),
    danado: Number(r.danado),
    inspeccion: Number(r.inspeccion),
    retenido: Number(r.retenido),
    enCamino: Number(r.en_camino),
    vencido: Number(r.vencido ?? 0),
    manejaVencimiento: r.maneja_vencimiento === true,
    foto: fotoPorId.get(String(r.sku_maestro_id)) ?? null,
    cajas: cajasPorSku.get(String(r.sku_maestro_id))?.cajas ?? 0,
    unidadesEnCajas: cajasPorSku.get(String(r.sku_maestro_id))?.unidades ?? 0,
    plataformas: plataformas?.porProducto.get(String(r.sku_maestro_id)) ?? null,
    porBodega: porBodegaPorSku.get(String(r.sku_maestro_id)) ?? [],
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Inventario" oculto />
      {resumen.error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudo cargar el inventario.
        </p>
      ) : (
        <ListaStock
          key={bodegaElegida}
          filas={filas}
          bodegas={bodegas.map((b) => ({ id: b.id as string, nombre: b.nombre as string, externa: b.tipo === "externa" }))}
          bodegaElegida={bodegaElegida}
          bodegasPropias={bodegas.filter((b) => b.tipo === "propia" && b.activa).map((b) => ({ id: b.id as string, nombre: b.nombre as string }))}
          ubicaciones={(ubicaciones.data ?? []).map((u) => ({ id: u.id, bodegaId: u.bodega_id, codigo: u.codigo, propiedad: u.propiedad }))}
          puedeEscribir={!usuario.modulosSoloLectura.includes("inventario")}
          codigoPais={pais.codigo}
          bodegasExternas={bodegas.filter((b) => b.tipo === "externa").map((b) => ({ id: b.id as string, nombre: b.nombre as string }))}
          lecturas={plataformas?.lecturas ?? null}
          lecturasFallaron={plataformas?.fallaron ?? false}
          esAdmin={esAdministrador(usuario)}
        />
      )}
    </Pagina>
  );
}
