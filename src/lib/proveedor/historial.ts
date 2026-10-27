// Historial de un pedido en el portal del proveedor (27 oct 2026, pedido de Francis): lo que cambió de ese pedido, quién y cuándo, para
// que no se pierda lo que en la hoja de Excel se borraba (cotizar 1,000, confirmar 500 y que Shen Zhen corrija el costo). Sale de la
// Actividad de la compra (`wms_compra_eventos`), solo con lo que le toca al proveedor: nada de pagos internos, tiendas ni comentarios.
// Lógica pura.

import { ETAPA_PORTAL_DE_COMPRA, type EtapaPortal } from "./espejo";

export interface EventoCompra {
  campo: string;
  valor_antes: string | null;
  valor_despues: string | null;
  ocurrido_en: string;
  autor: string | null;
  origen: string | null;
}

export type TipoHistorial = "cotizacion" | "unidades" | "monto" | "cantidad" | "etapa" | "envio" | "llegada" | "nota" | "pagos";

export interface LineaHistorial {
  fecha: string;
  lado: "proveedor" | "ecomfive";
  /** Quién lo hizo: del lado de Ecomfive solo se dice a Ecomfive (al proveedor le sale «Ecomfive»). */
  autor: string | null;
  tipo: TipoHistorial;
  antes: string | null;
  despues: string | null;
}

const TIPO_DE_CAMPO: Readonly<Record<string, TipoHistorial>> = {
  cotizacion: "cotizacion",
  qtyTotal: "unidades",
  montoTotal: "monto",
  productoAgregado: "cantidad",
  productoCambiado: "cantidad",
  productoQuitado: "cantidad",
  etapa: "etapa",
  fechaEnvio: "envio",
  fechaLlegada: "llegada",
  notaProveedor: "nota",
  registroPagos: "pagos",
};

/** De «SKU · Nombre · 1.040 u. · $1.270,00» queda «1.040 u. · $1.270,00»: el proveedor no ve nuestros códigos. */
export function cantidadDeLinea(texto: string | null): string | null {
  if (!texto) return null;
  const m = texto.match(/(\d[\d.,]*\s*u\.(?:\s*·\s*\$[\d.,]+)?)\s*$/);
  return m ? m[1] : null;
}

const vacio = (v: string | null) => (v === null || v.trim() === "" || v.trim() === "—" ? null : v.trim());

/** La etapa del portal, o null si esa etapa de la compra no se ve en el portal (Backlog, las retiradas). */
const etapaVisible = (v: string | null): EtapaPortal | null => (v ? (ETAPA_PORTAL_DE_COMPRA[v] ?? null) : null);

/** Lo que cambió del pedido, del más nuevo al más viejo. `conAutor`: Ecomfive ve los nombres de su equipo; el proveedor, «Ecomfive». */
export function historialDePedido(eventos: EventoCompra[], { conAutor }: { conAutor: boolean }): LineaHistorial[] {
  const lineas: LineaHistorial[] = [];
  for (const e of eventos) {
    const tipo = TIPO_DE_CAMPO[e.campo];
    if (!tipo) continue;
    let antes = vacio(e.valor_antes);
    let despues = vacio(e.valor_despues);
    if (tipo === "cantidad") {
      antes = cantidadDeLinea(antes);
      despues = cantidadDeLinea(despues);
    } else if (tipo === "etapa") {
      const a = etapaVisible(antes);
      const d = etapaVisible(despues);
      if (!d || a === d) continue;
      antes = a;
      despues = d;
    }
    if (antes === despues || (antes === null && despues === null)) continue;
    const lado = e.origen === "proveedor" ? "proveedor" : "ecomfive";
    lineas.push({ fecha: e.ocurrido_en, lado, autor: lado === "proveedor" || conAutor ? e.autor : null, tipo, antes, despues });
  }
  return lineas.sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/** Cuándo Ecomfive confirmó el pedido (lo pasó a «En producción» por última vez), por compra. */
export function fechasDeConfirmacion(eventos: { compra_id: string; valor_despues: string | null; ocurrido_en: string }[]): Record<string, string> {
  const r: Record<string, string> = {};
  for (const e of eventos) if (e.valor_despues === "produccion" && (!r[e.compra_id] || e.ocurrido_en > r[e.compra_id])) r[e.compra_id] = e.ocurrido_en;
  return r;
}
