// La línea de tiempo de la ficha de un pedido de tienda (13 nov 2026, pedido de Hernán: «como la ficha de pedido de la app de Jorge»): Entró → Confirmado →
// Despachado → Entregado (o Volvió / Cancelado) → Pagado. Cada paso sale de lo registrado (la orden, Monday o Servientrega, Shopify); lo que no está
// registrado no se da por hecho (regla de Hernán: no se inventa nada). Un paso hecho sin fecha conocida dice «sin fecha». Sin base ni React, con prueba.

export type TonoPaso = "hecho" | "pendiente" | "malo";

export interface PasoPedido {
  clave: "entro" | "confirmado" | "despachado" | "entregado" | "pagado";
  etiqueta: string;
  tono: TonoPaso;
  /** El momento (ISO o AAAA-MM-DD) si se sabe. */
  fecha: string | null;
  /** Una línea debajo («con Aníbal Pérez», «Servientrega», «Transp no entrega»…). */
  nota: string | null;
}

export interface DatosLineaTiempo {
  fecha: string;
  creado_origen?: string | null;
  fase?: string | null;
  estado_entrega: string | null;
  etiquetas: string | null;
  confirmada_en?: string | null;
  despachada_en?: string | null;
  fecha_envio: string | null;
  entregada_en?: string | null;
  fecha_devolucion: string | null;
  motivo_cancelacion: string | null;
  transportista: string | null;
  estado_pago: string | null;
  cod_esperado?: number | null;
  cod_cobrado?: number | null;
}

/** Lo último que dicen Monday o Servientrega del pedido. */
export interface EntregaRegistrada {
  fuente: "monday" | "siscore";
  grupo: string;
  fecha: string | null;
  repartidor: string | null;
  causa: string | null;
}

const confirmadaPorEtiqueta = (etiquetas: string | null) => (etiquetas ?? "").split(",").some((e) => /^\s*confirmad[ao]\s*$/i.test(e));
const ORDEN_FASE: Record<string, number> = { por_confirmar: 0, confirmada: 1, despachada: 2, fallida: 2, entregada: 3, devuelta: 3, cancelada: 3 };

/** Los cinco pasos del pedido con lo registrado. */
export function pasosDelPedido(o: DatosLineaTiempo, entrega: EntregaRegistrada | null = null): PasoPedido[] {
  const fase = o.fase ?? (o.estado_entrega === "entregada" ? "entregada" : o.estado_entrega === "devuelta" ? "devuelta" : o.estado_entrega === "cancelada" || o.estado_entrega === "no_gestionada" ? "cancelada" : o.estado_entrega === "en_transito" ? "despachada" : null);
  const n = fase ? (ORDEN_FASE[fase] ?? 0) : 0;
  const cancelada = fase === "cancelada";
  const devuelta = fase === "devuelta";
  const entregada = fase === "entregada";
  const confirmado = !cancelada && (n >= 1 || !!o.confirmada_en || confirmadaPorEtiqueta(o.etiquetas));
  const despachado = n >= 2 && !cancelada;
  const deFuente = entrega ? (entrega.fuente === "siscore" ? "Servientrega" : entrega.repartidor ? `Monday · ${entrega.repartidor}` : "Monday") : null;

  const pasos: PasoPedido[] = [
    { clave: "entro", etiqueta: "Entró", tono: "hecho", fecha: o.creado_origen ?? o.fecha, nota: null },
    { clave: "confirmado", etiqueta: "Confirmado", tono: confirmado ? "hecho" : cancelada ? "malo" : "pendiente", fecha: confirmado ? (o.confirmada_en ?? null) : null, nota: confirmado && !o.confirmada_en ? "sin fecha" : null },
    {
      clave: "despachado",
      etiqueta: "Despachado",
      tono: despachado ? "hecho" : "pendiente",
      fecha: despachado ? (o.despachada_en ?? o.fecha_envio ?? null) : null,
      nota: despachado ? (o.despachada_en || o.fecha_envio ? (o.transportista ?? null) : "sin fecha") : null,
    },
  ];
  if (cancelada) pasos.push({ clave: "entregado", etiqueta: "Cancelado", tono: "malo", fecha: null, nota: o.motivo_cancelacion?.slice(0, 80) ?? null });
  else if (devuelta)
    pasos.push({ clave: "entregado", etiqueta: "Volvió", tono: "malo", fecha: o.fecha_devolucion ?? entrega?.fecha ?? null, nota: (o.motivo_cancelacion ?? entrega?.causa ?? deFuente)?.slice(0, 80) ?? null });
  else if (entregada) pasos.push({ clave: "entregado", etiqueta: "Entregado", tono: "hecho", fecha: o.entregada_en ?? entrega?.fecha ?? null, nota: deFuente ?? (o.entregada_en ? null : "sin fecha") });
  else pasos.push({ clave: "entregado", etiqueta: "Entregado", tono: "pendiente", fecha: null, nota: despachado && entrega && !["entregado", "rechazado"].includes(entrega.grupo) ? `${deFuente}: en camino` : null });

  // Pagado: lo dice Shopify (PAID) o lo cobrado contra entrega; si no, pendiente (aunque esté entregado: no se supone el cobro).
  const pagadoShopify = /^paid$/i.test(o.estado_pago ?? "") || /^pagad/i.test(o.estado_pago ?? "");
  const cobrado = o.cod_cobrado !== null && o.cod_cobrado !== undefined && Number(o.cod_esperado ?? 0) > 0;
  if (cancelada || devuelta) pasos.push({ clave: "pagado", etiqueta: "Pagado", tono: pagadoShopify ? "hecho" : "pendiente", fecha: null, nota: pagadoShopify ? "en Shopify" : null });
  else pasos.push({ clave: "pagado", etiqueta: "Pagado", tono: pagadoShopify || cobrado ? "hecho" : "pendiente", fecha: cobrado ? (o.entregada_en ?? null) : null, nota: pagadoShopify ? "en Shopify" : cobrado ? "contra entrega" : null });
  return pasos;
}
