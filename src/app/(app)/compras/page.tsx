import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { requireModulo } from "@/lib/auth";
import { ComprasIcon } from "@/lib/nav-icons";
import { TablaCompras } from "./tabla-compras";
import type { FilaCompra } from "./def-compras";

export const metadata = { title: "Compras" };

export const dynamic = "force-dynamic";

const COLUMNAS =
  "id, tipo, codigo, nombre, foto_url, etapa, estado, proveedor, cliente, tienda, track_id, orden, producto_relacionado, qty_total, monto_total, primer_pago, segundo_pago, pagado_a_proveedor, pago_pendiente, cobrado_cliente, pendiente_cliente, pago_cliente, cuenta_receptora, factura, financiamiento, revisado_aa, fecha_limite, fecha_llegada, fecha_pago_1, fecha_pago_2, fecha_envio, inconveniente, planificacion, documentos, notas, via_envio, prioridad, etiquetas, responsable_nombre, creador_nombre, descripcion, url_producto, paises_destino, fecha_inicio, cerrado_en, creado_en, paises(codigo), perfiles(nombre, email)";

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/**
 * Compras: **un solo tablero** para todo. Arriba se elige qué se ve: todos los países, uno solo, o **Importadora** (el
 * servicio de comprar e importar para un cliente, que no es una compra nuestra y por eso nunca se mezcla con las de un
 * país). Va en la dirección (`?ver=todos|PA|CR|…|importacion`) para poder compartirla. No depende del país de la barra de
 * arriba: los montos van en dólares en todos los países.
 */
export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("compras");
  const supabase = createServiceClient();
  const { ver } = await searchParams;

  const { data: paisesBd } = await supabase.from("paises").select("id, codigo, nombre").order("nombre");
  const paises = (paisesBd ?? []) as { id: string; codigo: string; nombre: string }[];
  const pedido = typeof ver === "string" ? ver : "todos";
  const vista = pedido === "importacion" || paises.some((p) => p.codigo === pedido) ? pedido : "todos";
  const paisVista = paises.find((p) => p.codigo === vista) ?? null;

  let filasBd: Record<string, unknown>[] = [];
  let error = false;
  try {
    filasBd = await traerTodasLasFilas<Record<string, unknown>>((desde, hasta) => {
      let q = supabase.from("wms_compras").select(COLUMNAS);
      if (vista === "importacion") q = q.eq("tipo", "importacion");
      else if (paisVista) q = q.eq("tipo", "pais").eq("pais_id", paisVista.id);
      else q = q.eq("tipo", "pais");
      return q.order("creado_en", { ascending: false }).range(desde, hasta);
    });
  } catch {
    error = true;
  }

  const uno = <T,>(r: unknown): T | null => (Array.isArray(r) ? ((r[0] as T) ?? null) : ((r as T) ?? null));
  const filasCompra: FilaCompra[] = filasBd.map((c) => {
    const asignado = uno<{ nombre: string | null; email: string }>(c.perfiles);
    return {
      id: String(c.id),
      tipo: String(c.tipo),
      paisCodigo: uno<{ codigo: string }>(c.paises)?.codigo ?? null,
      codigo: (c.codigo as string | null) ?? null,
      nombre: String(c.nombre),
      fotoUrl: (c.foto_url as string | null) ?? null,
      etapa: String(c.etapa),
      estado: String(c.estado),
      proveedor: (c.proveedor as string | null) ?? null,
      cliente: (c.cliente as string | null) ?? null,
      tienda: (c.tienda as string | null) ?? null,
      trackId: (c.track_id as string | null) ?? null,
      orden: (c.orden as string | null) ?? null,
      productoRelacionado: (c.producto_relacionado as string | null) ?? null,
      qtyTotal: num(c.qty_total),
      montoTotal: num(c.monto_total),
      primerPago: num(c.primer_pago),
      segundoPago: num(c.segundo_pago),
      pagadoAProveedor: num(c.pagado_a_proveedor),
      pagoPendiente: num(c.pago_pendiente),
      cobradoCliente: num(c.cobrado_cliente),
      pendienteCliente: num(c.pendiente_cliente),
      pagoCliente: (c.pago_cliente as string | null) ?? null,
      cuentaReceptora: (c.cuenta_receptora as string | null) ?? null,
      factura: c.factura === true,
      financiamiento: c.financiamiento === true,
      revisadoAA: c.revisado_aa === true,
      fechaLimite: (c.fecha_limite as string | null) ?? null,
      fechaLlegada: (c.fecha_llegada as string | null) ?? null,
      fechaPago1: (c.fecha_pago_1 as string | null) ?? null,
      fechaPago2: (c.fecha_pago_2 as string | null) ?? null,
      fechaEnvio: (c.fecha_envio as string | null) ?? null,
      inconveniente: (c.inconveniente as string | null) ?? null,
      planificacion: (c.planificacion as string | null) ?? null,
      documentos: (c.documentos as string | null) ?? null,
      notas: (c.notas as string | null) ?? null,
      asignadoNombre: asignado ? asignado.nombre || asignado.email : ((c.responsable_nombre as string | null) ?? null),
      viaEnvio: (c.via_envio as string[] | null) ?? [],
      prioridad: (c.prioridad as string | null) ?? null,
      etiquetas: (c.etiquetas as string[] | null) ?? [],
      creadorNombre: (c.creador_nombre as string | null) ?? null,
      descripcion: (c.descripcion as string | null) ?? null,
      urlProducto: (c.url_producto as string | null) ?? null,
      paisesDestino: (c.paises_destino as string[] | null) ?? [],
      fechaInicio: (c.fecha_inicio as string | null) ?? null,
      cerradoEn: (c.cerrado_en as string | null) ?? null,
      creadoEn: String(c.creado_en),
    };
  });

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Compras" icono={ComprasIcon} oculto />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las compras.
        </p>
      ) : (
        <TablaCompras
          key={vista}
          compras={filasCompra}
          vista={vista}
          paises={paises}
          puedeEscribir={!usuario.modulosSoloLectura.includes("compras")}
        />
      )}
    </Pagina>
  );
}
