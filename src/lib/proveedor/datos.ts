// Portal del proveedor: la lectura del espejo (`proveedor_pedidos`, migración 0124) que usan las dos vistas. Solo servidor, con el
// cliente de servicio; quien llama ya comprobó el acceso (el módulo en nuestra vista, la cuenta del proveedor en el portal).

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import type { EtapaPortal, ViaPortal } from "./espejo";
import type { Plazo } from "./transito";

export interface Proveedor {
  id: string;
  nombre: string;
  nombreEnCompras: string;
  diasAnticipo: number;
  porcentajeAnticipo: number;
}

/** Un pedido tal como lo ve el proveedor (sin precio de venta, tiendas, responsables ni nada interno). */
export interface PedidoPortal {
  id: string;
  compraId: string;
  referencia: string | null;
  producto: string;
  fotoReferencia: string | null;
  paisCodigo: string | null;
  via: ViaPortal;
  modalidad: string | null;
  etapa: EtapaPortal;
  unidadesPedidas: number | null;
  unidades: number | null;
  montoTotal: number | null;
  costoUnitario: number | null;
  notaParaProveedor: string | null;
  fechaEnvio: string | null;
  fechaLlegada: string | null;
  primerPago: number | null;
  fechaPago1: string | null;
  segundoPago: number | null;
  fechaPago2: string | null;
  pagadoAProveedor: number | null;
  fotoRealRuta: string | null;
  comentarioProveedor: string | null;
  cotizadoEn: string | null;
  actualizadoEn: string;
  /** Anticipo distinto del de siempre (lo dice la hoja de pagos de Chin; migración 0127). */
  anticipoMonto: number | null;
}

const COLUMNAS =
  "id, compra_id, referencia, producto, foto_referencia, pais_codigo, via, modalidad, etapa, unidades_pedidas, unidades, monto_total, costo_unitario, nota_para_proveedor, fecha_envio, fecha_llegada, primer_pago, fecha_pago_1, segundo_pago, fecha_pago_2, pagado_a_proveedor, foto_real_ruta, comentario_proveedor, cotizado_en, actualizado_en, anticipo_monto";

type Fila = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const txt = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function pedidoDesdeFila(f: Fila): PedidoPortal {
  return {
    id: String(f.id),
    compraId: String(f.compra_id),
    referencia: txt(f.referencia),
    producto: String(f.producto),
    fotoReferencia: txt(f.foto_referencia),
    paisCodigo: txt(f.pais_codigo),
    via: f.via === "aire" ? "aire" : "mar",
    modalidad: txt(f.modalidad),
    etapa: f.etapa as EtapaPortal,
    unidadesPedidas: num(f.unidades_pedidas),
    unidades: num(f.unidades),
    montoTotal: num(f.monto_total),
    costoUnitario: num(f.costo_unitario),
    notaParaProveedor: txt(f.nota_para_proveedor),
    fechaEnvio: txt(f.fecha_envio),
    fechaLlegada: txt(f.fecha_llegada),
    primerPago: num(f.primer_pago),
    fechaPago1: txt(f.fecha_pago_1),
    segundoPago: num(f.segundo_pago),
    fechaPago2: txt(f.fecha_pago_2),
    pagadoAProveedor: num(f.pagado_a_proveedor),
    fotoRealRuta: txt(f.foto_real_ruta),
    comentarioProveedor: txt(f.comentario_proveedor),
    cotizadoEn: txt(f.cotizado_en),
    actualizadoEn: String(f.actualizado_en),
    anticipoMonto: num(f.anticipo_monto),
  };
}

/** Clave de un plazo: país y vía («PA|mar»). */
export const clavePlazo = (pais: string | null, via: ViaPortal) => `${pais ?? ""}|${via}`;

export interface Espejo {
  proveedor: Proveedor;
  pedidos: PedidoPortal[];
  /** Plazo prometido por país y vía, de Compras › Envíos (las rutas del proveedor como agente). */
  plazos: Record<string, Plazo>;
}

/** Todo lo visible del espejo de un proveedor y sus plazos. Devuelve el error como valor. */
export async function cargarEspejo(supabase: SupabaseClient, proveedorId: string): Promise<Espejo | { error: string }> {
  const { data: p, error: errorProveedor } = await supabase
    .from("proveedores")
    .select("id, nombre, nombre_en_compras, dias_anticipo, porcentaje_anticipo")
    .eq("id", proveedorId)
    .eq("activo", true)
    .maybeSingle();
  if (errorProveedor) return { error: "Falta correr en Supabase la migración 0124 (portal del proveedor)." };
  if (!p) return { error: "Proveedor no encontrado." };
  const proveedor: Proveedor = {
    id: p.id as string,
    nombre: p.nombre as string,
    nombreEnCompras: p.nombre_en_compras as string,
    diasAnticipo: Number(p.dias_anticipo),
    porcentajeAnticipo: Number(p.porcentaje_anticipo),
  };
  const leerPedidos = (columnas: string) =>
    traerTodasConError<Fila>((desde, hasta) =>
      supabase.from("proveedor_pedidos").select(columnas).eq("proveedor_id", proveedorId).eq("visible", true).order("actualizado_en", { ascending: false }).range(desde, hasta) as unknown as PromiseLike<{ data: Fila[] | null; error: unknown }>,
    );
  const [primeros, rutas] = await Promise.all([
    leerPedidos(COLUMNAS),
    supabase.from("wms_rutas_envio").select("agente, pais_codigo, via, dias_min, dias_max").eq("activo", true).ilike("agente", proveedor.nombreEnCompras).order("actualizado_en"),
  ]);
  // Sin la migración 0127 (anticipo distinto) el portal sigue funcionando sin ese dato.
  const pedidos = primeros.error ? await leerPedidos(COLUMNAS.replace(", anticipo_monto", "")) : primeros;
  if (pedidos.error) return { error: "No se pudieron cargar los pedidos del proveedor." };
  // Si un país y vía tienen dos rutas activas, manda la que se cambió por último (van en orden).
  const plazos: Record<string, Plazo> = {};
  for (const r of rutas.data ?? []) {
    if (r.via !== "mar" && r.via !== "aire") continue;
    plazos[clavePlazo(r.pais_codigo as string, r.via)] = { min: num(r.dias_min), max: num(r.dias_max) };
  }
  return { proveedor, pedidos: (pedidos.data ?? []).map(pedidoDesdeFila), plazos };
}
