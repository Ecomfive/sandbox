// Ciclo de la orden de tienda: confirmar → despachar → entregar → el mensajero devuelve la plata contra entrega.
// Lógica pura (sin Supabase): la usan las acciones y la pantalla Pipeline. Prueba en `ciclo.test.ts`.

import type { EstadoEntrega, MetodoPago } from "./matriz";

export type Fase = "por_confirmar" | "confirmada" | "despachada" | "entregada" | "fallida" | "devuelta" | "cancelada";

export const FASES: Fase[] = ["por_confirmar", "confirmada", "despachada", "fallida", "entregada", "devuelta", "cancelada"];
/** Las fases en las que la orden sigue en manos del equipo. */
export const FASES_ABIERTAS: Fase[] = ["por_confirmar", "confirmada", "despachada", "fallida"];

export const ETIQUETA_FASE: Record<Fase, string> = {
  por_confirmar: "Por confirmar",
  confirmada: "Confirmada",
  despachada: "Despachada",
  fallida: "Entrega fallida",
  entregada: "Entregada",
  devuelta: "Devuelta",
  cancelada: "Cancelada",
};

/** Qué fases puede tomar una orden desde cada una (una fase final no se mueve). */
export const TRANSICIONES: Record<Fase, Fase[]> = {
  por_confirmar: ["confirmada", "cancelada"],
  confirmada: ["despachada", "cancelada"],
  despachada: ["entregada", "fallida", "devuelta"],
  fallida: ["despachada", "devuelta", "cancelada"],
  entregada: [],
  devuelta: [],
  cancelada: [],
};

export const puedePasar = (de: Fase, a: Fase) => TRANSICIONES[de].includes(a);

/** Acción principal de cada fase (lo que el equipo hace a continuación). */
export const SIGUIENTE: Partial<Record<Fase, { a: Fase; etiqueta: string }>> = {
  por_confirmar: { a: "confirmada", etiqueta: "Confirmar" },
  confirmada: { a: "despachada", etiqueta: "Despachar" },
  despachada: { a: "entregada", etiqueta: "Marcar entregada" },
  fallida: { a: "despachada", etiqueta: "Reprogramar" },
};

/** Fase y plata contra entrega con que entra una orden nueva de Shopify. */
export function faseInicial(estado: EstadoEntrega, metodo: MetodoPago | null, total: number): { fase: Fase; codEsperado: number | null } {
  const fase: Fase =
    estado === "cancelada" || estado === "no_gestionada" ? "cancelada" : estado === "devuelta" ? "devuelta" : estado === "en_transito" ? "despachada" : estado === "entregada" ? "entregada" : "por_confirmar";
  return { fase, codEsperado: metodo === "efectivo" && total > 0 && fase !== "cancelada" ? Math.round(total * 100) / 100 : null };
}

/** El estado grueso (`estado_entrega`) que corresponde a cada fase, para que vistas y reportes sigan cuadrando. */
export const ESTADO_DE_FASE: Record<Fase, EstadoEntrega> = {
  por_confirmar: "pendiente",
  confirmada: "pendiente",
  despachada: "en_transito",
  fallida: "en_transito",
  entregada: "entregada",
  devuelta: "devuelta",
  cancelada: "cancelada",
};

export interface DatosDespacho {
  repartidorId: string | null;
  transportista: string | null;
  guia: string | null;
}

/** Con quién se envía: un mensajero o una transportadora (uno de los dos es obligatorio). */
export function validarDespacho(d: DatosDespacho): string | null {
  if (!d.repartidorId && !(d.transportista ?? "").trim()) return "Elige con quién se envía: un mensajero o una transportadora.";
  if (d.guia && d.guia.length > 80) return "La guía es demasiado larga.";
  return null;
}

/** Dinero que el mensajero debe devolver, orden por orden. */
export interface SaldoCod {
  ordenId: string;
  esperado: number;
  cobrado: number;
  remitido: number;
  pendiente: number;
  dias: number;
  repartidorId: string | null;
  transportista: string | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function resumenCod(saldos: SaldoCod[]) {
  const pendientes = saldos.filter((s) => s.pendiente > 0);
  return {
    porDevolver: r2(pendientes.reduce((a, s) => a + s.pendiente, 0)),
    ordenes: pendientes.length,
    vencido: r2(pendientes.filter((s) => s.dias > DIAS_PLAZO_REMESA).reduce((a, s) => a + s.pendiente, 0)),
    remitido: r2(saldos.reduce((a, s) => a + s.remitido, 0)),
    // Cobró menos de lo esperado: diferencia a aclarar.
    diferencia: r2(saldos.reduce((a, s) => a + Math.max(s.esperado - s.cobrado, 0), 0)),
  };
}

/** Días que se tolera que el mensajero tenga la plata antes de marcarla vencida. */
export const DIAS_PLAZO_REMESA = 7;

/** Lo que cada mensajero (o transportadora) tiene en su poder. */
export function porMensajero(saldos: SaldoCod[], nombre: (id: string | null, transportista: string | null) => string) {
  const m = new Map<string, { clave: string; nombre: string; repartidorId: string | null; transportista: string | null; monto: number; ordenes: number; maxDias: number }>();
  for (const s of saldos) {
    if (s.pendiente <= 0) continue;
    const clave = s.repartidorId ? `r:${s.repartidorId}` : `t:${(s.transportista ?? "—").toUpperCase()}`;
    const x = m.get(clave) ?? { clave, nombre: nombre(s.repartidorId, s.transportista), repartidorId: s.repartidorId, transportista: s.transportista, monto: 0, ordenes: 0, maxDias: 0 };
    x.monto = r2(x.monto + s.pendiente);
    x.ordenes += 1;
    x.maxDias = Math.max(x.maxDias, s.dias);
    m.set(clave, x);
  }
  return [...m.values()].sort((a, b) => b.monto - a.monto);
}

/** Reparte lo que entregó el mensajero entre sus órdenes, de la más vieja a la más nueva; lo que sobra se informa. */
export function repartirRemesa(saldos: Pick<SaldoCod, "ordenId" | "pendiente" | "dias">[], monto: number): { items: { orden_id: string; monto: number }[]; sobra: number } {
  let resto = r2(monto);
  const items: { orden_id: string; monto: number }[] = [];
  for (const s of [...saldos].filter((x) => x.pendiente > 0).sort((a, b) => b.dias - a.dias)) {
    if (resto <= 0) break;
    const parte = r2(Math.min(resto, s.pendiente));
    items.push({ orden_id: s.ordenId, monto: parte });
    resto = r2(resto - parte);
  }
  return { items, sobra: resto };
}
