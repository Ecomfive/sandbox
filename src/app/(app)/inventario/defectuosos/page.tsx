import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { alcanceInventario } from "@/lib/permisos/inventario";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { cargarCodigosProductos } from "@/lib/wms/codigos-producto";
import { claveDanado, diasDesde, marcasDeDanado, type MovimientoDanado } from "@/lib/wms/defectuosos";
import type { FilaDefectuoso } from "./def-defectuosos";
import { TablaDefectuosos } from "./tabla-defectuosos";

export const metadata = { title: "Defectuosos" };

export const dynamic = "force-dynamic";

const trozos = <T,>(l: T[], n: number): T[][] => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));

/**
 * Inventario › Defectuosos (27 nov 2026, pedido de Hernán; prototipo aprobado https://claude.ai/artifact/CA1rvg4UsenLpzmVJeuLYw): lo dañado de cada bodega propia del país (la cubeta «dañado» de `wms_stock`), con el
 * día en que se marcó (la última vez que entraron unidades a dañado en el libro de movimientos), el motivo y quién. La persona a cargo del inventario lo puede transferir a otra bodega (migración 0372).
 */
export default async function DefectuososPage() {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

  const { data: bodegasF, error: eB } = await supabase.from("wms_bodegas").select("id, nombre, tipo, activa").eq("pais_id", pais.id).eq("tipo", "propia").order("nombre");
  // Lo dañado se lista de todas las bodegas propias del país; solo se transfiere a las activas.
  const bodegas = (bodegasF ?? []) as { id: string; nombre: string; activa: boolean | null }[];
  const ids = bodegas.map((b) => b.id);
  const stock = ids.length
    ? await traerTodasLasFilas<{ sku_maestro_id: string; bodega_id: string; danado: number }>((a, b) => supabase.from("wms_stock").select("sku_maestro_id, bodega_id, danado").in("bodega_id", ids).gt("danado", 0).order("sku_maestro_id").range(a, b)).catch(() => [])
    : [];
  const skus = [...new Set(stock.map((s) => s.sku_maestro_id))];

  // Los productos, sus códigos y lo que dice el libro de cada uno (solo los movimientos que tocaron lo dañado).
  const maestros = new Map<string, { codigo: string; nombre: string; foto: string | null; vencimiento: boolean }>();
  const movimientos: MovimientoDanado[] = [];
  for (const parte of trozos(skus, 150)) {
    const [{ data: m }, movs] = await Promise.all([
      supabase.from("skus_maestros").select("id, codigo, nombre, foto_url, maneja_vencimiento").in("id", parte),
      traerTodasLasFilas<{ sku_maestro_id: string; bodega_id: string; cambios: Record<string, unknown> | null; creado_en: string; motivo: string | null; referencia: string | null; usuario_id: string | null }>((a, b) =>
        supabase.from("wms_movimientos").select("sku_maestro_id, bodega_id, cambios, creado_en, motivo, referencia, usuario_id").in("sku_maestro_id", parte).in("bodega_id", ids).not("cambios->danado", "is", null).order("creado_en", { ascending: false }).range(a, b),
      ).catch(() => []),
    ]);
    for (const x of m ?? []) maestros.set(x.id as string, { codigo: x.codigo as string, nombre: x.nombre as string, foto: (x.foto_url as string | null) ?? null, vencimiento: !!x.maneja_vencimiento });
    for (const v of movs) movimientos.push({ skuId: v.sku_maestro_id, bodegaId: v.bodega_id, danado: Number(v.cambios?.danado ?? 0), creadoEn: v.creado_en, motivo: v.motivo, referencia: v.referencia, usuarioId: v.usuario_id });
  }
  const marcas = marcasDeDanado(movimientos);
  const usuarios = [...new Set([...marcas.values()].map((x) => x.usuarioId).filter((x): x is string => !!x))];
  const { data: perfiles } = usuarios.length ? await supabase.from("perfiles").select("id, nombre").in("id", usuarios) : { data: [] };
  const nombreDe = new Map(((perfiles ?? []) as { id: string; nombre: string | null }[]).map((p) => [p.id, p.nombre]));
  const codigos = await cargarCodigosProductos(supabase, skus);
  const nombreBodega = new Map(bodegas.map((b) => [b.id, b.nombre]));

  const filas: FilaDefectuoso[] = stock
    .map((s): FilaDefectuoso => {
      const m = maestros.get(s.sku_maestro_id);
      const marca = marcas.get(claveDanado(s.sku_maestro_id, s.bodega_id));
      return {
        id: claveDanado(s.sku_maestro_id, s.bodega_id),
        skuId: s.sku_maestro_id,
        sku: m?.codigo ?? "—",
        producto: m?.nombre ?? "Producto",
        foto: m?.foto ?? null,
        numero: codigos.get(s.sku_maestro_id)?.numero ?? null,
        barras: codigos.get(s.sku_maestro_id)?.barras ?? null,
        bodegaId: s.bodega_id,
        bodega: nombreBodega.get(s.bodega_id) ?? "Bodega",
        danado: Number(s.danado),
        marcadoEn: marca?.fecha ?? null,
        primeraEn: marca?.primera ?? null,
        dias: marca ? diasDesde(marca.fecha, hoy) : null,
        motivo: marca?.motivo ?? null,
        referencia: marca?.referencia ?? null,
        por: marca?.usuarioId ? (nombreDe.get(marca.usuarioId) ?? null) : null,
        conVencimiento: !!m?.vencimiento,
      };
    })
    .sort((a, b) => (b.marcadoEn ?? "").localeCompare(a.marcadoEn ?? "") || b.danado - a.danado);

  const puedeTransferir = alcanceInventario(usuario) === "total";

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Defectuosos" oculto />
      {eB ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las bodegas.
        </p>
      ) : (
        <TablaDefectuosos filas={filas} bodegas={bodegas.filter((b) => b.activa !== false).map((b) => ({ id: b.id, nombre: b.nombre }))} puedeTransferir={puedeTransferir} />
      )}
    </Pagina>
  );
}
