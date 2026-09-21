import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { calcularPendientes } from "@/lib/alertas/pendientes";
import { TablaAlertas, type AlertaFila } from "./tabla-alertas";
import { TablaPendientes } from "./tabla-pendientes";
import { requireModulo } from "@/lib/auth";
import { linkClass } from "@/components/ui/link";

export const metadata = { title: "Alertas de inventario" };

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  await requireModulo("alertas");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const pendientes = (await calcularPendientes(supabase, pais.id)).sort(
    (a, b) => b.pendiente - a.pendiente
  );

  const { data } = await supabase
    .from("alertas_inventario_no_retornado")
    .select("id, cantidad, fecha_deteccion, fecha_reclamo, estado, productos(sku, nombre)")
    .eq("pais_id", pais.id)
    .order("fecha_deteccion", { ascending: false });

  const alertas: AlertaFila[] = (data ?? []).map((a) => {
    const producto = a.productos as unknown as { sku: string; nombre: string } | null;
    return {
      id: a.id,
      sku: producto?.sku ?? "",
      nombre: producto?.nombre ?? "",
      cantidad: a.cantidad,
      fecha_deteccion: a.fecha_deteccion,
      fecha_reclamo: a.fecha_reclamo,
      estado: a.estado as AlertaFila["estado"],
    };
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <div>
        <EncabezadoPagina titulo="Alertas de inventario" oculto className="mb-4">
          Salidas menos entradas por producto, según lo cargado en{" "}
          <Link href="/inventario" className={linkClass}>
            Inventario
          </Link>
          . Generar una alerta la deja lista para el reclamo quincenal a la plataforma.
        </EncabezadoPagina>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Pendiente de retorno</h2>
        <TablaPendientes
          pendientes={pendientes.map((p) => ({
            productoId: p.producto_id,
            paisId: p.pais_id,
            sku: p.sku,
            nombre: p.nombre,
            pendiente: p.pendiente,
          }))}
        />
      </div>

      <TablaAlertas alertas={alertas} />
    </Pagina>
  );
}
