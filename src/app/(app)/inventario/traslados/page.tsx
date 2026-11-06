import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import type { CajaGuardada } from "@/lib/wms/cajas";
import { numeroTraslado, textoCajasTraslado } from "@/lib/wms/traslado";
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

  // Qué cajas se movieron en cada línea (migración 0238; sin ella, nada).
  const ids = (data ?? []).map((t) => t.id as string);
  const { data: conCajas } = ids.length ? await supabase.from("wms_traslado_items").select("traslado_id, sku_maestro_id, cajas, skus_maestros(codigo)").in("traslado_id", ids) : { data: [] };
  const cajasDeLinea = new Map(
    (conCajas ?? []).map((c) => [`${c.traslado_id}|${uno(c.skus_maestros as { codigo: string } | { codigo: string }[] | null)?.codigo}`, textoCajasTraslado(c.cajas)]),
  );

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
      return { codigo: s?.codigo ?? "—", nombre: s?.nombre ?? "", foto: s?.foto_url ?? null, cantidad: Number(l.cantidad), cajas: cajasDeLinea.get(`${t.id}|${s?.codigo}`) ?? null };
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
  // Las cajas de cada producto y las ubicaciones de cada bodega, para mover las cajas con el traslado (migraciones 0236 y 0238).
  const idsPropias = propias.map((b) => b.id);
  const { data: guardadas } =
    puedeEscribir && idsPropias.length
      ? await traerTodasConError<{ id: string; bodega_id: string; sku_maestro_id: string; cajas: number; unidades_por_caja: number; observacion: string | null; wms_ubicaciones: unknown }>((d, h) =>
          supabase.from("wms_cajas").select("id, bodega_id, sku_maestro_id, cajas, unidades_por_caja, observacion, wms_ubicaciones(codigo, notas)").in("bodega_id", idsPropias).order("id").range(d, h),
        )
      : { data: [] };
  const cajas: Record<string, Record<string, CajaGuardada[]>> = {};
  for (const c of guardadas ?? []) {
    const u = uno(c.wms_ubicaciones as { codigo: string; notas: string | null } | { codigo: string; notas: string | null }[] | null);
    ((cajas[c.bodega_id] ??= {})[c.sku_maestro_id] ??= []).push({ id: c.id, ubicacion: u?.codigo ?? "—", lugar: u?.notas ?? null, cajas: Number(c.cajas), porCaja: Number(c.unidades_por_caja), observacion: c.observacion });
  }
  for (const porSku of Object.values(cajas)) for (const lista of Object.values(porSku)) lista.sort((a, b) => a.ubicacion.localeCompare(b.ubicacion) || b.porCaja - a.porCaja);
  const { data: filasUbicacion } = idsPropias.length ? await supabase.from("wms_ubicaciones").select("id, bodega_id, codigo, notas").in("bodega_id", idsPropias).eq("activa", true).order("codigo") : { data: [] };
  const ubicaciones: Record<string, { id: string; codigo: string; notas: string | null }[]> = {};
  for (const u of filasUbicacion ?? []) (ubicaciones[u.bodega_id as string] ??= []).push({ id: u.id as string, codigo: u.codigo as string, notas: (u.notas as string | null) ?? null });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Traslados" oculto />
      {puedeEscribir && (
        <div className="flex justify-end">
          <NuevoTraslado bodegas={propias} productos={opciones} stock={stock} cajas={cajas} ubicaciones={ubicaciones} />
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
