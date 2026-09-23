import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { ComprasIcon } from "@/lib/nav-icons";
import { TablaCompras } from "./tabla-compras";
import type { FilaCompra } from "./def-compras";

export const metadata = { title: "Compras" };

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  const usuario = await requireModulo("compras");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: compras } = await supabase
    .from("wms_compras")
    .select(
      "id, nombre, etapa, proveedor, cliente, tienda, track_id, orden, producto_relacionado, qty_total, monto_total, primer_pago, segundo_pago, pagado_a_proveedor, pago_pendiente, cobrado_cliente, pendiente_cliente, pago_cliente, cuenta_receptora, factura, financiamiento, revisado_aa, fecha_limite, fecha_llegada, fecha_pago_1, fecha_pago_2, fecha_envio, inconveniente, planificacion, documentos, notas, creado_en, perfiles(nombre, email)"
    )
    .eq("pais_id", pais.id)
    .order("creado_en", { ascending: false })
    .limit(1000);

  const filasCompra: FilaCompra[] = (compras ?? []).map((c) => {
    const asignado = c.perfiles as unknown as { nombre: string | null; email: string } | null;
    return {
      id: c.id,
      nombre: c.nombre,
      etapa: c.etapa,
      proveedor: c.proveedor,
      cliente: c.cliente,
      tienda: c.tienda,
      trackId: c.track_id,
      orden: c.orden,
      productoRelacionado: c.producto_relacionado,
      qtyTotal: c.qty_total === null ? null : Number(c.qty_total),
      montoTotal: c.monto_total === null ? null : Number(c.monto_total),
      primerPago: c.primer_pago === null ? null : Number(c.primer_pago),
      segundoPago: c.segundo_pago === null ? null : Number(c.segundo_pago),
      pagadoAProveedor: c.pagado_a_proveedor === null ? null : Number(c.pagado_a_proveedor),
      pagoPendiente: c.pago_pendiente === null ? null : Number(c.pago_pendiente),
      cobradoCliente: c.cobrado_cliente === null ? null : Number(c.cobrado_cliente),
      pendienteCliente: c.pendiente_cliente === null ? null : Number(c.pendiente_cliente),
      pagoCliente: c.pago_cliente,
      cuentaReceptora: c.cuenta_receptora,
      factura: c.factura,
      financiamiento: c.financiamiento,
      revisadoAA: c.revisado_aa,
      fechaLimite: c.fecha_limite,
      fechaLlegada: c.fecha_llegada,
      fechaPago1: c.fecha_pago_1,
      fechaPago2: c.fecha_pago_2,
      fechaEnvio: c.fecha_envio,
      inconveniente: c.inconveniente,
      planificacion: c.planificacion,
      documentos: c.documentos,
      notas: c.notas,
      asignadoNombre: asignado ? (asignado.nombre || asignado.email) : null,
      creadoEn: c.creado_en,
    };
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={`Compras ${pais.codigo}`} icono={ComprasIcon} className="mb-2" />

      <TablaCompras
        compras={filasCompra}
        codigoPais={pais.codigo}
        paisId={pais.id}
        puedeEscribir={!usuario.modulosSoloLectura.includes("compras")}
      />
    </Pagina>
  );
}
