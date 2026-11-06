import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { bloqueoDeLinea, ETAPAS_POR_RECIBIR, PAISES_CON_RECEPCION } from "@/lib/wms/recepcion";
import { Recepcion, type CompraPorRecibir, type LineaPorRecibir } from "./recepcion";

export const metadata = { title: "Recepción" };

export const dynamic = "force-dynamic";

const uno = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

interface FilaItem {
  id: string;
  compra_id: string;
  cantidad_pedida: number;
  lote_numero: number;
  skus_maestros: unknown;
}

/** Recepción de compras (migración 0241): las compras del país que están en camino o ya llegaron, con lo que falta por recibir. Las completadas no salen: quedaron dentro del levantamiento. */
export default async function RecepcionPage() {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!PAISES_CON_RECEPCION.includes(pais.codigo)) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Recepción" oculto />
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">La recepción de compras por ahora es solo para Costa Rica. Elige ese país arriba para verla.</p>
      </Pagina>
    );
  }

  const [{ data: compras, error }, { data: bodegas }] = await Promise.all([
    supabase.from("wms_compras").select("id, codigo, nombre, etapa, proveedor, fecha_llegada").eq("pais_id", pais.id).in("etapa", ETAPAS_POR_RECIBIR).is("anulada_en", null).order("fecha_llegada", { nullsFirst: false }).order("creado_en", { ascending: false }).limit(500),
    supabase.from("wms_bodegas").select("id, nombre").eq("pais_id", pais.id).eq("tipo", "propia").eq("activa", true).order("orden").order("nombre"),
  ]);
  const propias = (bodegas ?? []).map((b) => ({ id: b.id as string, nombre: b.nombre as string }));
  const ids = (compras ?? []).map((c) => c.id as string);
  const { data: items } = ids.length
    ? await traerTodasConError<FilaItem>((d, h) =>
        supabase
          .from("wms_compra_items")
          .select("id, compra_id, cantidad_pedida, lote_numero, skus_maestros(codigo, nombre, foto_url, tipo, clase, maneja_vencimiento, opciones_variantes)")
          .in("compra_id", ids)
          .is("cantidad_recibida", null)
          .order("id")
          .range(d, h),
      )
    : { data: [] as FilaItem[] };
  const { data: ubicaciones } = propias.length
    ? await supabase.from("wms_ubicaciones").select("id, bodega_id, codigo").in("bodega_id", propias.map((b) => b.id)).eq("activa", true).order("codigo")
    : { data: [] };

  const lineasDe = new Map<string, LineaPorRecibir[]>();
  for (const i of items ?? []) {
    const s = uno(i.skus_maestros as { codigo: string; nombre: string; foto_url: string | null; tipo: string; clase: string; maneja_vencimiento: boolean; opciones_variantes: unknown } | null);
    if (!s) continue;
    const linea: LineaPorRecibir = {
      id: i.id,
      codigo: s.codigo,
      nombre: s.nombre,
      foto: s.foto_url,
      pedida: i.cantidad_pedida,
      lote: i.lote_numero,
      manejaVencimiento: s.maneja_vencimiento === true,
      bloqueo: bloqueoDeLinea({ tipo: s.tipo, clase: s.clase, conVariantes: s.opciones_variantes !== null }),
    };
    lineasDe.set(i.compra_id, [...(lineasDe.get(i.compra_id) ?? []), linea]);
  }
  const porRecibir: CompraPorRecibir[] = (compras ?? []).flatMap((c) => {
    const lineas = lineasDe.get(c.id as string);
    return lineas ? [{ id: c.id as string, codigo: (c.codigo as string | null) ?? "Compra", nombre: c.nombre as string, etapa: c.etapa as string, proveedor: (c.proveedor as string | null) ?? null, llegada: (c.fecha_llegada as string | null) ?? null, lineas }] : [];
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Recepción" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las compras.
        </p>
      ) : (
        <Recepcion
          compras={porRecibir}
          bodegas={propias}
          ubicaciones={(ubicaciones ?? []).map((u) => ({ id: u.id as string, bodegaId: u.bodega_id as string, codigo: u.codigo as string }))}
          puedeEscribir={!usuario.modulosSoloLectura.includes("inventario")}
        />
      )}
    </Pagina>
  );
}
