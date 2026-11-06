import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { numeroTraslado } from "@/lib/wms/traslado";
import { ListaTraslados, type FilaTraslado } from "./lista-traslados";
import { NuevoTraslado } from "./nuevo-traslado";

export const metadata = { title: "Traslados" };

export const dynamic = "force-dynamic";

const uno = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/** Traslados entre las bodegas propias del país (migración 0235): el historial de qué se movió, de dónde a dónde, y sus notas. */
export default async function TrasladosPage() {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("inventario");

  const { data: bodegas } = await supabase.from("wms_bodegas").select("id, nombre").eq("pais_id", pais.id).eq("tipo", "propia").eq("activa", true).order("orden").order("nombre");
  const propias = (bodegas ?? []).map((b) => ({ id: b.id as string, nombre: b.nombre as string }));

  const { data, error } = await supabase
    .from("wms_traslados")
    .select(
      "id, numero, creado_en, creado_por_nombre, notas, origen:wms_bodegas!wms_traslados_bodega_origen_id_fkey!inner(nombre, pais_id), destino:wms_bodegas!wms_traslados_bodega_destino_id_fkey(nombre), wms_traslado_items(cantidad, skus_maestros(codigo, nombre, foto_url))",
    )
    .eq("origen.pais_id", pais.id)
    .order("creado_en", { ascending: false })
    .limit(300);

  const filas: FilaTraslado[] = (data ?? []).map((t) => ({
    id: t.id as string,
    numero: numeroTraslado(t.numero as number),
    fecha: t.creado_en as string,
    desde: uno(t.origen as { nombre: string } | { nombre: string }[] | null)?.nombre ?? "—",
    hacia: uno(t.destino as { nombre: string } | { nombre: string }[] | null)?.nombre ?? "—",
    quien: (t.creado_por_nombre as string | null) ?? null,
    notas: (t.notas as string | null) ?? "",
    lineas: ((t.wms_traslado_items as { cantidad: number; skus_maestros: unknown }[] | null) ?? []).map((l) => {
      const s = uno(l.skus_maestros as { codigo: string; nombre: string; foto_url: string | null } | { codigo: string; nombre: string; foto_url: string | null }[] | null);
      return { codigo: s?.codigo ?? "—", nombre: s?.nombre ?? "", foto: s?.foto_url ?? null, cantidad: Number(l.cantidad) };
    }),
  }));

  // Solo se traslada lo que hay: un compuesto o un producto con variantes no llevan stock propio.
  const [conStock, productos] =
    puedeEscribir && propias.length
      ? await Promise.all([
          traerTodasConError<{ bodega_id: string; sku_maestro_id: string; disponible: number }>((d, h) =>
            supabase.from("wms_stock").select("bodega_id, sku_maestro_id, disponible").in("bodega_id", propias.map((b) => b.id)).gt("disponible", 0).order("sku_maestro_id").range(d, h),
          ),
          traerTodasConError<{ id: string; codigo: string; nombre: string; estado: string; numero: number | null; foto_url: string | null }>((d, h) =>
            supabase.from("skus_maestros").select("id, codigo, nombre, estado, numero, foto_url").neq("tipo", "combo").is("opciones_variantes", null).order("codigo").range(d, h),
          ),
        ])
      : [{ data: [] }, { data: [] }];
  const stock: Record<string, Record<string, number>> = {};
  for (const s of conStock.data ?? []) (stock[s.bodega_id] ??= {})[s.sku_maestro_id] = Number(s.disponible);
  const opciones = (productos.data ?? []).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.estado, numero: p.numero, foto: p.foto_url }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Traslados" oculto />
      {puedeEscribir && (
        <div className="flex justify-end">
          <NuevoTraslado bodegas={propias} productos={opciones} stock={stock} />
        </div>
      )}
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {/wms_traslado/.test(error.message) ? "Falta correr la migración 0235 en la base." : "No se pudieron cargar los traslados."}
        </p>
      ) : (
        <ListaTraslados filas={filas} bodegas={propias.map((b) => b.nombre)} puedeEscribir={puedeEscribir} />
      )}
    </Pagina>
  );
}
