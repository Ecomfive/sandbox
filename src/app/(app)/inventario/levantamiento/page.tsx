import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { pideMotivo, puedeMoverAMano } from "@/lib/wms/recepcion";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { Levantamiento, type ProductoConteo } from "./levantamiento";

export const metadata = { title: "Levantamiento" };

export const dynamic = "force-dynamic";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/**
 * Levantamiento de inventario (conteo físico) por bodega: se elige una bodega propia del país, se escribe lo que se contó de
 * cada producto y, al guardar, cada uno queda en lo contado (la diferencia se anota como ajuste en el libro). Un producto con
 * variantes no sale: no lleva stock propio y la base rechazaría todo el conteo; se cuenta cada variante.
 */
export default async function LevantamientoPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { bodega } = await searchParams;

  const { data: bodegasPais } = await supabase
    .from("wms_bodegas")
    .select("id, nombre")
    .eq("pais_id", pais.id)
    .eq("tipo", "propia")
    .eq("activa", true)
    .order("orden")
    .order("nombre");
  const bodegas = (bodegasPais ?? []).map((b) => ({ id: b.id as string, nombre: b.nombre as string }));
  const pedida = typeof bodega === "string" && ES_ID(bodega) ? bodega : "";
  const elegida = bodegas.some((b) => b.id === pedida) ? pedida : (bodegas[0]?.id ?? "");

  const [productos, stock, lotes, ultimo] = await Promise.all([
    traerTodasConError<{ id: string; codigo: string; nombre: string; clase: string | null; maneja_vencimiento: boolean | null; foto_url: string | null; numero: number | null; codigo_barras: string | null }>((d, h) =>
      supabase.from("skus_maestros").select("id, codigo, nombre, clase, maneja_vencimiento, foto_url, numero, codigo_barras").neq("tipo", "combo").neq("clase", "test").is("opciones_variantes", null).order("codigo").range(d, h),
    ),
    elegida
      ? traerTodasConError<{ sku_maestro_id: string; fisico: number }>((d, h) => supabase.from("wms_stock").select("sku_maestro_id, fisico").eq("bodega_id", elegida).order("sku_maestro_id").range(d, h))
      : Promise.resolve({ data: [], error: null }),
    elegida
      ? traerTodasConError<{ cantidad: number; wms_lotes: { sku_maestro_id: string; codigo: string; fecha_vencimiento: string } | { sku_maestro_id: string; codigo: string; fecha_vencimiento: string }[] | null }>((d, h) =>
          supabase.from("wms_stock_lote").select("cantidad, wms_lotes(sku_maestro_id, codigo, fecha_vencimiento)").eq("bodega_id", elegida).neq("cantidad", 0).order("lote_id").range(d, h),
        )
      : Promise.resolve({ data: [], error: null }),
    elegida
      ? supabase.from("wms_conteos").select("creado_en, referencia, productos").eq("bodega_id", elegida).order("creado_en", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const enBodega = new Map((stock.data ?? []).map((s) => [s.sku_maestro_id, Number(s.fisico)]));
  // Los lugares de la bodega y las cajas guardadas (migración 0236; sin ella, sin cajas).
  const [lugares, guardadas] = elegida
    ? await Promise.all([
        supabase.from("wms_ubicaciones").select("id, codigo, notas").eq("bodega_id", elegida).eq("activa", true).order("codigo"),
        traerTodasConError<{ id: string; sku_maestro_id: string; ubicacion_id: string; cajas: number; unidades_por_caja: number; observacion: string | null }>((d, h) =>
          supabase.from("wms_cajas").select("id, sku_maestro_id, ubicacion_id, cajas, unidades_por_caja, observacion").eq("bodega_id", elegida).order("id").range(d, h),
        ),
      ])
    : [{ data: [] }, { data: [] }];
  const cajasPorSku = new Map<string, ProductoConteo["cajas"]>();
  for (const c of guardadas.data ?? []) cajasPorSku.set(c.sku_maestro_id, [...(cajasPorSku.get(c.sku_maestro_id) ?? []), { ubicacion: c.ubicacion_id, cajas: String(c.cajas), porCaja: String(c.unidades_por_caja), observacion: c.observacion ?? "" }]);
  const lotesPorSku = new Map<string, { codigo: string; vencimiento: string; cantidad: number }[]>();
  for (const l of lotes.data ?? []) {
    const lote = Array.isArray(l.wms_lotes) ? l.wms_lotes[0] : l.wms_lotes;
    if (!lote) continue;
    const lista = lotesPorSku.get(lote.sku_maestro_id) ?? [];
    lista.push({ codigo: lote.codigo, vencimiento: lote.fecha_vencimiento, cantidad: Number(l.cantidad) });
    lotesPorSku.set(lote.sku_maestro_id, lista);
  }
  const filas: ProductoConteo[] = (productos.data ?? []).map((p) => ({
    id: p.id,
    codigo: p.codigo,
    nombre: p.nombre,
    clase: p.clase ?? "fisico",
    manejaVencimiento: p.maneja_vencimiento === true,
    foto: p.foto_url,
    numero: p.numero ?? null,
    barras: p.codigo_barras || null,
    enSistema: enBodega.get(p.id) ?? 0,
    lotes: lotesPorSku.get(p.id) ?? [],
    cajas: cajasPorSku.get(p.id) ?? [],
  }));
  const ultimoConteo = ultimo.data as { creado_en: string; referencia: string | null; productos: number } | null;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Levantamiento" oculto />
      {productos.error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar los productos.
        </p>
      ) : bodegas.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Este país no tiene bodegas propias activas.</p>
      ) : (
        <Levantamiento
          ubicaciones={(lugares.data ?? []).map((u) => ({ id: u.id as string, codigo: u.codigo as string, nombre: (u.notas as string | null) ?? null }))}
          key={elegida}
          bodegas={bodegas}
          bodegaElegida={elegida}
          productos={filas}
          ultimo={ultimoConteo ? { fecha: ultimoConteo.creado_en, referencia: ultimoConteo.referencia, productos: ultimoConteo.productos } : null}
          puedeEscribir={!usuario.modulosSoloLectura.includes("inventario")}
          puedeRestar={puedeMoverAMano("salida", pais.codigo, esAdministrador(usuario))}
          restarPideMotivo={pideMotivo("salida", pais.codigo)}
        />
      )}
    </Pagina>
  );
}
