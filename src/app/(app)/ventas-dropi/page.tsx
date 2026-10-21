import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { resumirProductos, restarDias, totalesPorDia, totalesPorMes, type ProductoDropi, type VentaDia } from "@/lib/publicaciones/ventas";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { TableroVentas, type DropshipperVentas, type ProductoVentas } from "./tablero-ventas";

export const metadata = { title: "Ventas Dropi" };

export const dynamic = "force-dynamic";

/** Los meses que muestra la gráfica: el último año y algo más (Dropi Panamá empieza en septiembre de 2025). */
const MESES_ATRAS = 13;

/**
 * Desempeño › Ventas Dropi: cuánto vende cada producto de ECOMFIVE en Dropi (del país de la barra), qué se está acabando, qué
 * crece y qué cae, y quién vende. Sale del Historial de Existencia de Dropi que carga scripts/importar-ventas-dropi.ts
 * (migración 0120); muestra la última carga.
 */
export default async function VentasDropiPage() {
  await requireModulo("ventas-dropi");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: carga, error: errorCarga } = await supabase.from("dropi_ventas_cargas").select("corte, productos, movimientos").eq("pais_id", pais.id).order("corte", { ascending: false }).limit(1).maybeSingle();
  if (errorCarga || !carga) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Ventas Dropi" oculto />
        <p role={errorCarga ? "alert" : "status"} className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {errorCarga ? "No se pudieron cargar las ventas. Falta correr en Supabase la migración 0120." : `Todavía no hay ventas de Dropi cargadas para ${pais.nombre}.`}
        </p>
      </Pagina>
    );
  }

  const corte = new Date(new Date(carga.corte as string).getTime() - 5 * 3600e3).toISOString().slice(0, 10);
  const [productosR, diasR, dsR, pubsR] = await Promise.all([
    traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("dropi_ventas_productos").select("dropi_producto_id, nombre, lista, privado, variable, stock, primera_venta, ultima_venta").eq("pais_id", pais.id).order("dropi_producto_id").range(d, h)),
    traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("dropi_ventas_diarias").select("dropi_producto_id, dia, pedidas, ordenes, canceladas, rechazadas, devueltas").eq("pais_id", pais.id).order("dropi_producto_id").order("dia").range(d, h)),
    traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("dropi_ventas_dropshippers").select("dropi_usuario_id, nombre, pedidas, ordenes, no_efectivas, netas_30d, productos, ultima_orden").eq("pais_id", pais.id).order("dropi_usuario_id").range(d, h)),
    traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("dropi_publicaciones").select("dropi_id, skus_maestros(codigo)").eq("pais_id", pais.id).not("sku_maestro_id", "is", null).order("id").range(d, h)),
  ]);
  if (productosR.error || diasR.error || dsR.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Ventas Dropi" oculto />
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las ventas. Vuelve a intentarlo.
        </p>
      </Pagina>
    );
  }

  // El SKU del sistema de cada producto de Dropi, por el vínculo de Gestión de IDs Dropi.
  const skuDe = new Map<number, string>();
  for (const p of pubsR.data ?? []) {
    const codigo = (p.skus_maestros as { codigo: string } | null)?.codigo;
    if (!codigo) continue;
    for (const id of String(p.dropi_id ?? "").match(/\d{3,6}/g) ?? []) skuDe.set(Number(id), codigo);
  }

  const productos: ProductoDropi[] = (productosR.data ?? []).map((p) => ({
    id: Number(p.dropi_producto_id),
    nombre: p.nombre as string,
    lista: p.lista === "archivado" ? "archivado" : "activo",
    privado: !!p.privado,
    variable: !!p.variable,
    stock: Number(p.stock),
    primeraVenta: (p.primera_venta as string | null) ?? null,
    ultimaVenta: (p.ultima_venta as string | null) ?? null,
  }));
  const dias: VentaDia[] = (diasR.data ?? []).map((d) => ({
    producto: Number(d.dropi_producto_id),
    dia: d.dia as string,
    pedidas: Number(d.pedidas),
    ordenes: Number(d.ordenes),
    canceladas: Number(d.canceladas),
    rechazadas: Number(d.rechazadas),
    devueltas: Number(d.devueltas),
  }));
  const resumen: ProductoVentas[] = resumirProductos(productos, dias, corte).map((r) => ({ ...r, sku: skuDe.get(r.id) ?? null }));
  const desdeMes = restarDias(`${corte.slice(0, 7)}-15`, MESES_ATRAS * 30.5);
  const dropshippers: DropshipperVentas[] = (dsR.data ?? []).map((d) => ({
    id: Number(d.dropi_usuario_id),
    nombre: d.nombre as string,
    pedidas: Number(d.pedidas),
    ordenes: Number(d.ordenes),
    noEfectivas: Number(d.no_efectivas),
    netas: Number(d.pedidas) - Number(d.no_efectivas),
    netas30: Number(d.netas_30d),
    productos: Number(d.productos),
    ultimaOrden: (d.ultima_orden as string | null) ?? null,
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Ventas Dropi" oculto />
      <TableroVentas
        corte={corte}
        movimientos={Number(carga.movimientos)}
        productos={resumen}
        meses={totalesPorMes(dias, `${desdeMes.slice(0, 7)}-01`, corte)}
        dias={totalesPorDia(dias, corte, 90)}
        dropshippers={dropshippers}
      />
    </Pagina>
  );
}
