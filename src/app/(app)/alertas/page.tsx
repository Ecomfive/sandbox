import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { calcularPendientes } from "@/lib/alertas/pendientes";
import { TablaAlertas, type AlertaFila } from "./tabla-alertas";
import { TablaPendientes } from "./tabla-pendientes";
import { requireModulo } from "@/lib/auth";

export const metadata = { title: "Alertas de inventario" };

export const dynamic = "force-dynamic";

export default async function AlertasPage() {
  const usuario = await requireModulo("alertas");
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

  const puedeEscribir = !usuario.modulosSoloLectura.includes("alertas");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Alertas de inventario" oculto />

      <div>
        <h2 className="mb-3 text-sm font-semibold tracking-tight">Pendiente de retorno</h2>
        <TablaPendientes
          pendientes={pendientes.map((p) => ({
            productoId: p.producto_id,
            paisId: p.pais_id,
            sku: p.sku,
            nombre: p.nombre,
            pendiente: p.pendiente,
          }))}
          puedeEscribir={puedeEscribir}
        />
      </div>

      <TablaAlertas alertas={alertas} codigoPais={pais.codigo} puedeEscribir={puedeEscribir} />
    </Pagina>
  );
}
