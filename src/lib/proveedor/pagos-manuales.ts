// Portal del proveedor › «Registro de pagos» (23 oct 2026): el proveedor anota los pagos que recibe y su fecha de llegada. Ya no hay
// «avisar pago» desde Ecomfive: el comprobante va por privado y Ecomfive actualiza Compras a mano. Cada anotación deja su novedad para
// Ecomfive («Nuevo» en el Tablero de Chin), el aviso en la campana de quien recibe los avisos del proveedor y su línea en la auditoría.
// Solo servidor: quien llama ya comprobó la cuenta (`cuentaProveedorActual`).

import { createServiceClient } from "@/lib/supabase/server";
import type { CuentaProveedor } from "./cuenta";
import { diasEntre, hoyPanama } from "./fechas";

type Resultado = { error?: string };
type Supabase = ReturnType<typeof createServiceClient>;

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Cuántos días antes del envío se acepta una fecha (un anticipo que se pagó antes de despachar). */
const DIAS_ANTES_ENVIO = 60;

const dinero = (n: number) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (d: string) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`;
const autorDe = (cuenta: CuentaProveedor) => `${cuenta.proveedor.nombre} (proveedor)`;

interface PedidoPago {
  id: string;
  compra_id: string;
  producto: string;
  monto_total: number | null;
  fecha_envio: string | null;
}

async function pedidoDe(supabase: Supabase, cuenta: CuentaProveedor, pedidoId: unknown): Promise<PedidoPago | { error: string }> {
  if (typeof pedidoId !== "string" || !UUID.test(pedidoId)) return { error: "Pedido no válido." };
  const { data } = await supabase.from("proveedor_pedidos").select("id, compra_id, proveedor_id, producto, monto_total, fecha_envio, visible").eq("id", pedidoId).maybeSingle();
  if (!data || data.proveedor_id !== cuenta.proveedor.id || !data.visible) return { error: "Ese pedido ya no está en tu portal." };
  if (!data.fecha_envio) return { error: "Ese pedido todavía no se envió." };
  return data as PedidoPago;
}

/** Una fecha válida: no futura y no muy anterior al envío. */
function revisarFecha(fecha: unknown, envio: string): string | { error: string } {
  if (typeof fecha !== "string" || !FECHA.test(fecha) || Number.isNaN(Date.parse(fecha))) return { error: "Fecha no válida." };
  if (fecha > hoyPanama()) return { error: "La fecha no puede ser futura." };
  if (diasEntre(fecha, envio) > DIAS_ANTES_ENVIO) return { error: "La fecha es muy anterior al envío." };
  return fecha;
}

/** Novedad para Ecomfive, aviso en la campana (lleva a los pagos del Tablero de Chin) y línea en la auditoría de la compra. */
async function avisar(supabase: Supabase, cuenta: CuentaProveedor, p: PedidoPago, tipo: "pago" | "llegada", texto: string) {
  await Promise.all([
    supabase.from("proveedor_novedades").insert({ proveedor_id: cuenta.proveedor.id, pedido_id: p.id, lado: "proveedor", tipo, texto, autor_nombre: cuenta.nombre }),
    cuenta.proveedor.notificarA
      ? supabase.from("notificaciones_usuario").insert({ usuario_id: cuenta.proveedor.notificarA, tipo: "proveedor", titulo: texto, texto: "Registro de pagos de Chin", href: "/compras/tablero-chin?ver=pagos", autor_nombre: autorDe(cuenta) })
      : Promise.resolve(),
    supabase.from("historial_auditoria").insert({ usuario_id: null, usuario_nombre: autorDe(cuenta), accion: "editar_campo_compra", entidad: "wms_compras", entidad_id: p.compra_id, detalle: texto }),
  ]);
}

/** El proveedor anota un pago recibido (del anticipo o del saldo) de un pedido enviado. */
export async function anotarPago(cuenta: CuentaProveedor, pedidoId: unknown, cuota: unknown, monto: unknown, fecha: unknown): Promise<Resultado> {
  const supabase = createServiceClient();
  const p = await pedidoDe(supabase, cuenta, pedidoId);
  if ("error" in p) return p;
  if (cuota !== "anticipo" && cuota !== "saldo") return { error: "Elige si es del anticipo o del saldo." };
  const n = typeof monto === "number" ? monto : Number(monto);
  if (!Number.isFinite(n) || n <= 0) return { error: "El monto debe ser mayor que cero." };
  if (p.monto_total && n > Number(p.monto_total) + 0.5) return { error: "El monto es mayor que el total del pedido." };
  const f = revisarFecha(fecha, p.fecha_envio!);
  if (typeof f !== "string") return f;
  const { error } = await supabase
    .from("proveedor_pagos")
    .insert({ proveedor_id: cuenta.proveedor.id, pedido_id: p.id, cuota, monto: Math.round(n * 100) / 100, fecha: f, origen: "proveedor", registrado_por: cuenta.cuentaId });
  if (error) return { error: "No se pudo anotar el pago." };
  await avisar(supabase, cuenta, p, "pago", `${cuenta.proveedor.nombre} anotó un pago de ${dinero(n)} del ${cuota === "anticipo" ? "anticipo" : "saldo"} de ${p.producto} (${fechaCorta(f)})`);
  return {};
}

/** El proveedor quita un pago que anotó él (si se equivocó). Los que vinieron de sus hojas no se tocan. */
export async function quitarPago(cuenta: CuentaProveedor, pagoId: unknown): Promise<Resultado> {
  if (typeof pagoId !== "string" || !UUID.test(pagoId)) return { error: "Pago no válido." };
  const supabase = createServiceClient();
  const { data: pago } = await supabase.from("proveedor_pagos").select("id, proveedor_id, pedido_id, cuota, monto, fecha, origen").eq("id", pagoId).maybeSingle();
  if (!pago || pago.proveedor_id !== cuenta.proveedor.id || pago.origen !== "proveedor" || !pago.pedido_id) return { error: "Ese pago no se puede quitar." };
  const p = await pedidoDe(supabase, cuenta, pago.pedido_id);
  if ("error" in p) return p;
  const { error } = await supabase.from("proveedor_pagos").delete().eq("id", pagoId);
  if (error) return { error: "No se pudo quitar el pago." };
  await avisar(supabase, cuenta, p, "pago", `${cuenta.proveedor.nombre} quitó el pago de ${dinero(Number(pago.monto))} del ${pago.cuota === "anticipo" ? "anticipo" : "saldo"} de ${p.producto} (${fechaCorta(pago.fecha as string)})`);
  return {};
}

/** El proveedor anota (o borra, con fecha vacía) su fecha de llegada. No cambia la compra: Ecomfive marca la suya. */
export async function anotarLlegada(cuenta: CuentaProveedor, pedidoId: unknown, fecha: unknown): Promise<Resultado> {
  const supabase = createServiceClient();
  const p = await pedidoDe(supabase, cuenta, pedidoId);
  if ("error" in p) return p;
  let f: string | null = null;
  if (fecha !== "" && fecha !== null) {
    const r = revisarFecha(fecha, p.fecha_envio!);
    if (typeof r !== "string") return r;
    if (r < p.fecha_envio!) return { error: "La llegada no puede ser antes del envío." };
    f = r;
  }
  const { error } = await supabase.from("proveedor_pedidos").update({ llegada_proveedor: f }).eq("id", p.id);
  if (error) return { error: "No se pudo guardar la llegada." };
  await avisar(supabase, cuenta, p, "llegada", f ? `${cuenta.proveedor.nombre} anotó que ${p.producto} llegó el ${fechaCorta(f)}` : `${cuenta.proveedor.nombre} quitó la fecha de llegada de ${p.producto}`);
  return {};
}
