// Compras › «Qué hacer con Chin» (23 oct 2026, pedido de Hernán): lo que nos toca para cerrar el ciclo con el proveedor, armado con
// el espejo (`proveedor_pedidos`), las cuotas por pagar y lo que el proveedor hizo en su tablero (`proveedor_novedades` del lado
// proveedor, sin leer = «Nuevo»). Cada tarea se va sola cuando el ciclo avanza (se decide la cotización, se paga, se marca la
// llegada). Lo usan Compras y el Tablero de Chin. Lógica pura, con prueba.

import type { PedidoPortal } from "./datos";
import { diasEntre } from "./fechas";
import type { CuotaPorPagar } from "./resumen-pagos";
import { estadoTransito, type Plazo } from "./transito";

export type TipoTarea = "decidir" | "falta_costo" | "pagar_anticipo" | "pagar_saldo" | "confirmar_llegada" | "esperando";

export const ETIQUETA_TAREA: Record<TipoTarea, string> = {
  decidir: "Decidir cotización",
  falta_costo: "Falta el costo",
  pagar_anticipo: "Pagar anticipo",
  pagar_saldo: "Pagar saldo",
  confirmar_llegada: "Confirmar llegada",
  esperando: "Esperando a Chin",
};

/** Orden de los tipos en los contadores de arriba. */
export const ORDEN_TAREAS: TipoTarea[] = ["decidir", "pagar_anticipo", "pagar_saldo", "confirmar_llegada", "falta_costo", "esperando"];

/** Días en «Por cotizar» a partir de los cuales se espera a Chin. */
export const DIAS_ESPERA_COTIZAR = 5;
/** Un anticipo que vence dentro de estos días ya cuenta como urgente. */
const DIAS_URGENTE = 3;

export interface Tarea {
  /** Única: tipo y pedido (o aviso de pago). */
  id: string;
  tipo: TipoTarea;
  pedidoId: string | null;
  compraId: string | null;
  producto: string;
  foto: string | null;
  texto: string;
  /** El proveedor hizo algo en este pedido y todavía no se vio. */
  nuevo: boolean;
  /** Lo vencido o que vence ya va primero. */
  urgente: boolean;
  /** Para ordenar dentro de lo urgente y lo demás: más alto, antes. */
  peso: number;
  /** Adónde lleva: la compra o los pagos a Chin. */
  destino: "compra" | "pagos";
}

export interface EntradaTareas {
  pedidos: PedidoPortal[];
  plazos: Record<string, Plazo>;
  /** Cuotas por pagar (`cuotasPorPagar`); vacío si quien mira no ve los montos. */
  porPagar: CuotaPorPagar[];
  /** Avisos de pago que el proveedor todavía no confirmó. */
  avisosSinConfirmar: { id: string; fecha: string; monto: number; productos: string[] }[];
  /** Pedidos con algo nuevo del proveedor sin leer. */
  nuevos: Set<string>;
  /** Desde cuándo está cada pedido en el espejo (para «Por cotizar»). */
  creadoEn: Record<string, string>;
  /** Si quien mira ve los montos de Compras: sin eso, las frases no dicen montos. */
  veMontos: boolean;
  proveedor: string;
  hoy: string;
}

const dinero = (n: number) => `$${n.toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fechaCorta = (d: string) => `${Number(d.slice(8, 10))} ${MESES[Number(d.slice(5, 7)) - 1]}`;
const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
const VIA: Record<string, string> = { mar: "por mar", aire: "por aire" };

/** Todas las tareas, primero lo nuevo y lo urgente. */
export function tareasChin(e: EntradaTareas): Tarea[] {
  const tareas: Tarea[] = [];
  const base = (p: PedidoPortal) => ({ pedidoId: p.id, compraId: p.compraId, producto: p.producto, foto: p.fotoReferencia, nuevo: e.nuevos.has(p.id) });
  const quien = e.proveedor;

  for (const p of e.pedidos) {
    if (p.etapa === "cotizado") {
      const sinCosto = !p.costoUnitario && !p.montoTotal;
      if (sinCosto) {
        tareas.push({ ...base(p), id: `falta_costo:${p.id}`, tipo: "falta_costo", destino: "compra", urgente: false, peso: 0, texto: `Está en Cotizado sin costo: pídele a ${quien} el precio${p.unidades ? ` de las ${entero(p.unidades)} u.` : ""}.` });
        continue;
      }
      const hace = p.cotizadoEn ? diasEntre(p.cotizadoEn.slice(0, 10), e.hoy) : null;
      const partes = [`${quien} cotizó${p.unidades ? ` ${entero(p.unidades)} u.` : ""}`];
      if (e.veMontos && p.costoUnitario) partes[0] += ` a ${dinero(p.costoUnitario)}${p.montoTotal ? ` (= ${dinero(p.montoTotal)})` : ""}`;
      partes[0] += hace !== null && hace > 0 ? ` hace ${dias(hace)}.` : ".";
      if (p.unidadesPedidas && p.unidades && p.unidadesPedidas !== p.unidades) {
        const dif = p.unidades - p.unidadesPedidas;
        partes.push(`Pediste ${entero(p.unidadesPedidas)}: vienen ${entero(Math.abs(dif))} ${dif < 0 ? "menos" : "más"}.`);
      }
      partes.push("Pásala a Producción o Descartado.");
      tareas.push({ ...base(p), id: `decidir:${p.id}`, tipo: "decidir", destino: "compra", urgente: false, peso: hace ?? 0, texto: partes.join(" ") });
    }

    if (p.etapa === "enviado" && p.fechaEnvio) {
      const t = estadoTransito(p.fechaEnvio, null, e.plazos[`${p.paisCodigo ?? ""}|${p.via}`] ?? null, e.hoy);
      if (t.clave === "atrasado") {
        tareas.push({
          ...base(p),
          id: `confirmar_llegada:${p.id}`,
          tipo: "confirmar_llegada",
          destino: "compra",
          urgente: false,
          peso: t.n,
          texto: `Salió el ${fechaCorta(p.fechaEnvio)} ${VIA[p.via] ?? ""}${p.paisCodigo ? ` a ${p.paisCodigo}` : ""} y lleva ${dias(t.dias)}: pasó ${dias(t.n)} su plazo. ¿Ya llegó? Marca la llegada.`,
        });
      }
    }

    if (p.etapa === "por_cotizar" && e.creadoEn[p.id]) {
      const espera = diasEntre(e.creadoEn[p.id].slice(0, 10), e.hoy);
      if (espera > DIAS_ESPERA_COTIZAR)
        tareas.push({ ...base(p), id: `esperando:${p.id}`, tipo: "esperando", destino: "compra", urgente: false, peso: espera, texto: `Lleva ${dias(espera)} en Por cotizar: ${quien} todavía no la cotiza.` });
    }
  }

  const porId = new Map(e.pedidos.map((p) => [p.id, p]));
  for (const c of e.porPagar) {
    // Lo que ya está en un aviso espera a que el proveedor lo confirme (sale abajo, en «Esperando»).
    if (c.avisada) continue;
    const p = porId.get(c.pedidoId);
    const tipo: TipoTarea = c.cuota === "anticipo" ? "pagar_anticipo" : "pagar_saldo";
    const cuanto = e.veMontos ? ` de ${dinero(c.monto)}` : "";
    const cuando =
      c.estado.clave === "vencido" ? `venció el ${fechaCorta(c.vence)}: ${dias(c.estado.n)} de atraso` : c.estado.clave === "vence_hoy" ? "vence hoy" : `vence el ${fechaCorta(c.vence)} (en ${dias(c.estado.n)})`;
    const texto =
      c.cuota === "anticipo"
        ? `Salió el ${fechaCorta(c.fechaEnvio)}. El anticipo${cuanto} ${cuando}.`
        : `Ya llegó. El saldo${cuanto} ${cuando}.`;
    const urgente = c.estado.clave === "vencido" || c.estado.clave === "vence_hoy" || (c.estado.clave === "vence_en" && c.estado.n <= DIAS_URGENTE);
    tareas.push({
      id: `${tipo}:${c.pedidoId}`,
      tipo,
      pedidoId: c.pedidoId,
      compraId: p?.compraId ?? null,
      producto: c.producto,
      foto: c.fotoReferencia,
      nuevo: e.nuevos.has(c.pedidoId),
      urgente,
      peso: c.estado.clave === "vencido" ? 1000 + c.estado.n : c.estado.clave === "vence_hoy" ? 999 : -c.estado.n,
      destino: "pagos",
      texto,
    });
  }

  for (const a of e.avisosSinConfirmar) {
    const hace = diasEntre(a.fecha, e.hoy);
    tareas.push({
      id: `esperando:aviso:${a.id}`,
      tipo: "esperando",
      pedidoId: null,
      compraId: null,
      producto: a.productos.length === 1 ? a.productos[0] : `Pago de ${a.productos.length} pedidos`,
      foto: null,
      nuevo: false,
      urgente: false,
      peso: hace,
      destino: "pagos",
      texto: `Avisaste un pago${e.veMontos ? ` de ${dinero(a.monto)}` : ""} el ${fechaCorta(a.fecha)}${hace > 0 ? ` (hace ${dias(hace)})` : ""}: ${quien} todavía no lo confirma.`,
    });
  }

  // Lo urgente (pagos) va por lo más atrasado, sea anticipo o saldo; lo demás, por tipo y dentro de cada tipo por lo que más espera.
  const rango = (t: Tarea) => (t.nuevo ? 0 : t.urgente ? 1 : 2);
  return tareas.sort((a, b) => rango(a) - rango(b) || (rango(a) === 1 ? 0 : ORDEN_TAREAS.indexOf(a.tipo) - ORDEN_TAREAS.indexOf(b.tipo)) || b.peso - a.peso);
}

/** Cuántas hay de cada tipo, en el orden de los contadores (sin los que no tienen). */
export function conteoTareas(tareas: Tarea[]): { tipo: TipoTarea; n: number }[] {
  return ORDEN_TAREAS.map((tipo) => ({ tipo, n: tareas.filter((t) => t.tipo === tipo).length })).filter((c) => c.n > 0);
}
