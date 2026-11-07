import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { motivoNoResolver, numeroNovedad, type EstadoNovedad, type TipoNovedad } from "@/lib/wms/novedades";
import { PAISES_CON_RECEPCION } from "@/lib/wms/recepcion";
import { Novedades, type NovedadVista } from "./novedades";

export const metadata = { title: "Novedades" };

export const dynamic = "force-dynamic";

const uno = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/** Dañados y devoluciones en las plataformas (migración 0243): lo que se registró a mano, primero lo que falta revisar. */
export default async function NovedadesPage() {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!PAISES_CON_RECEPCION.includes(pais.codigo)) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Novedades" oculto />
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">Dañados y devoluciones por ahora son solo para Costa Rica. Elige ese país arriba para verlo.</p>
      </Pagina>
    );
  }
  const puedeEscribir = !usuario.modulosSoloLectura.includes("inventario");
  const [{ data, error }, { data: bodegas }, productos] = await Promise.all([
    supabase
      .from("wms_novedades_plataforma")
      .select("id, numero, tipo, cantidad, referencia, nota, foto_url, retorno_oficina, estado, autoriza_a, creado_por, creado_por_nombre, creado_en, resuelto_por_nombre, resuelto_en, nota_resolucion, bodega_id, wms_bodegas(nombre), skus_maestros(codigo, nombre, foto_url, numero, codigo_barras)")
      .eq("pais_id", pais.id)
      .order("creado_en", { ascending: false })
      .limit(500),
    supabase.from("wms_bodegas").select("id, nombre").eq("pais_id", pais.id).eq("tipo", "externa").eq("activa", true).order("nombre"),
    puedeEscribir
      ? traerTodasConError<{ id: string; codigo: string; nombre: string; estado: string; numero: number | null; foto_url: string | null; codigo_barras: string | null }>((d, h) =>
          supabase.from("skus_maestros").select("id, codigo, nombre, estado, numero, foto_url, codigo_barras").neq("tipo", "combo").is("opciones_variantes", null).order("codigo").range(d, h),
        )
      : Promise.resolve({ data: [] }),
  ]);

  const filas: NovedadVista[] = (data ?? []).map((n) => {
    const sku = uno(n.skus_maestros as { codigo: string; nombre: string; foto_url: string | null; numero: number | null; codigo_barras: string | null } | { codigo: string; nombre: string; foto_url: string | null; numero: number | null; codigo_barras: string | null }[] | null);
    const tipo = n.tipo as TipoNovedad;
    const estado = n.estado as EstadoNovedad;
    return {
      id: n.id as string,
      numero: numeroNovedad(n.numero as number),
      tipo,
      estado,
      cantidad: Number(n.cantidad),
      plataforma: uno(n.wms_bodegas as { nombre: string } | { nombre: string }[] | null)?.nombre ?? "—",
      codigo: sku?.codigo ?? "—",
      nombre: sku?.nombre ?? "",
      foto: sku?.foto_url ?? null,
      numeroProducto: sku?.numero ?? null,
      barras: sku?.codigo_barras ?? null,
      referencia: (n.referencia as string | null) ?? null,
      nota: (n.nota as string | null) ?? null,
      evidencia: (n.foto_url as string | null) ?? null,
      retornoOficina: n.retorno_oficina === true,
      creadoPor: n.creado_por_nombre as string,
      creadoEn: n.creado_en as string,
      resueltoPor: (n.resuelto_por_nombre as string | null) ?? null,
      resueltoEn: (n.resuelto_en as string | null) ?? null,
      notaResolucion: (n.nota_resolucion as string | null) ?? null,
      noPuede: puedeEscribir ? motivoNoResolver({ tipo, estado, autorizaA: (n.autoriza_a as string[] | null) ?? [], creadoPor: (n.creado_por as string | null) ?? null }, usuario.id) : "Solo lectura.",
    };
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Novedades" oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {/wms_novedades_plataforma/.test(error.message) ? "Falta correr la migración 0243 en la base." : "No se pudieron cargar las novedades."}
        </p>
      ) : (
        <Novedades
          filas={filas}
          plataformas={(bodegas ?? []).map((b) => ({ id: b.id as string, nombre: b.nombre as string }))}
          productos={(productos.data ?? []).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.estado, numero: p.numero, barras: p.codigo_barras, foto: p.foto_url }))}
          puedeEscribir={puedeEscribir}
        />
      )}
    </Pagina>
  );
}
