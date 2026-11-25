// Envíos Delivery › Control de envíos (25 nov 2026, pedido de Hernán y Yiletsi; prototipo aprobado https://claude.ai/artifact/8mbjcbJGELtkGhvmpSdKhX).
// Lo que se le paga a cada delivery en la semana, con las tarifas de cada delivery (migración 0366): la entrega y el fallido con evidencia (alguna foto)
// a la tarifa de entrega ($3.65; Deimibel $5.00), el cambio, el complemento y el retiro a la tarifa de cambio ($2.00; Deimibel $2.50). Los pospuestos
// y los fallidos sin foto no se pagan; solo cuentan los pedidos cerrados. La semana va de jueves a miércoles y se paga el jueves siguiente. ClickSi le
// paga aparte (es otra empresa): se muestra, pero no entra en el total de Oceans ni en su recibo. Las propinas y los ajustes los anota Yiletsi y se
// suman al total de Oceans. Reglas puras, sin base ni React; con prueba.

import { formaNormal, nombreRepartidor, sumarDias } from "./panel-repartidor";

/** El jueves en que empieza la semana de pago de un día (AAAA-MM-DD). */
export function inicioSemanaPago(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 domingo … 4 jueves
  return sumarDias(dia, -((d + 3) % 7));
}

/** El miércoles en que termina la semana que empieza `jueves`. */
export const finSemanaPago = (jueves: string) => sumarDias(jueves, 6);

/** El día que cae `n` días después (para mover semanas de pago). */
export const sumarDiasPago = sumarDias;

/** La fecha de pago: el jueves siguiente al cierre. */
export const fechaPagoDe = (jueves: string) => sumarDias(jueves, 7);

/** «19/11» de un día AAAA-MM-DD. */
export const diaCorto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
/** «Jue 19/11» de un día AAAA-MM-DD. */
export const diaConNombre = (iso: string) => `${DIAS_CORTOS[new Date(`${iso}T12:00:00Z`).getUTCDay()]} ${diaCorto(iso)}`;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «del 19 al 25 de noviembre de 2026» (o «del 26 de noviembre al 2 de diciembre de 2026»). */
export function semanaEnLetras(jueves: string): string {
  const fin = finSemanaPago(jueves);
  const [a1, m1, d1] = jueves.split("-").map(Number);
  const [a2, m2, d2] = fin.split("-").map(Number);
  if (a1 !== a2) return `del ${d1} de ${MESES[m1 - 1]} de ${a1} al ${d2} de ${MESES[m2 - 1]} de ${a2}`;
  if (m1 !== m2) return `del ${d1} de ${MESES[m1 - 1]} al ${d2} de ${MESES[m2 - 1]} de ${a2}`;
  return `del ${d1} al ${d2} de ${MESES[m2 - 1]} de ${a2}`;
}

/** Las tiendas que paga Oceans, en el orden del recibo; ClickSi va aparte. */
export const TIENDAS_OCEANS = ["OFERFY", "KENKU", "NUVO"] as const;
export const esClickSi = (tienda: string | null | undefined) => (tienda ?? "").trim().toUpperCase() === "CLICKSI";

/** «OFERFY» → «Oferfy». */
export const nombreTienda = (t: string) => (t === "CLICKSI" ? "ClickSi" : t.charAt(0) + t.slice(1).toLowerCase());

export interface Tarifas {
  /** La entrega y el fallido con evidencia. */
  entrega: number;
  /** El cambio, el complemento y el retiro. */
  cambio: number;
}
export const TARIFAS_BASE: Tarifas = { entrega: 3.65, cambio: 2 };

/** El repartidor de prueba (migración 0363): sale en el control, pero no suma en los totales. */
export const COURIER_PRUEBA = "USUARIO DE PRUEBA";

export interface FilaEnvio {
  courier: string | null;
  tienda: string | null;
  estado: string | null;
  formaPago: string | null;
  comprobantes: number;
  dia: string;
}

export interface Ajuste {
  /** Propina (suma) o ajuste (reconocimiento, préstamo, pago retenido: con signo). */
  tipo: "propina" | "ajuste";
  monto: number;
  motivo: string;
}

export interface DeliveryControl {
  id: string;
  nombre: string;
  couriers: string[];
  tarifas: Tarifas;
}

export type Concepto = "entrega" | "fallido" | "cambio" | "retiro";

export interface DiaControl {
  dia: string;
  asignados: number;
  entregados: number;
  cambios: number;
  fallidos: number;
  retiros: number;
  pago: number;
}

export interface ResumenDelivery {
  deliveryId: string | null;
  nombre: string;
  couriers: string[];
  tarifas: Tarifas;
  prueba: boolean;
  asignados: number;
  /** Entregas (sin los cambios, complementos ni retiros). */
  entregados: number;
  /** Cambios y complementos entregados. */
  cambios: number;
  retiros: number;
  /** Fallidos con evidencia (los que se pagan). */
  fallidos: number;
  fallidosSinEvidencia: number;
  pospuestos: number;
  enRuta: number;
  /** Lo que paga Oceans por tienda (sin ClickSi). */
  porTienda: Record<string, number>;
  clicksi: number;
  propinas: number;
  ajustes: number;
  /** Lo que paga Oceans: sus tiendas + propinas + ajustes. */
  totalOceans: number;
  dias: DiaControl[];
  /** «Cómo se calcula»: cada concepto con su cantidad, tarifa y total (de todas las tiendas, ClickSi incluida). */
  lineas: { concepto: Concepto; texto: string; cantidad: number; tarifa: number; total: number }[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Qué se le paga por un pedido, o null si no se paga (no cerrado, pospuesto o fallido sin evidencia). */
export function conceptoDeFila(f: Pick<FilaEnvio, "estado" | "formaPago" | "comprobantes">): Concepto | null {
  const e = (f.estado ?? "").trim().toUpperCase();
  if (e === "FALLIDO") return f.comprobantes > 0 ? "fallido" : null;
  if (e !== "ENTREGADO") return null;
  const forma = formaNormal(f.formaPago);
  if (forma.includes("RETIRO")) return "retiro";
  if (forma.includes("CAMBIO") || forma.includes("COMPLEMENTO")) return "cambio";
  return "entrega";
}

export const tarifaDe = (c: Concepto, t: Tarifas) => (c === "cambio" || c === "retiro" ? t.cambio : t.entrega);

const TEXTOS: Record<Concepto, [string, string]> = {
  entrega: ["entrega", "entregas"],
  fallido: ["fallido con evidencia", "fallidos con evidencia"],
  cambio: ["cambio o complemento", "cambios y complementos"],
  retiro: ["retiro", "retiros"],
};
const ORDEN: Concepto[] = ["entrega", "fallido", "cambio", "retiro"];

/**
 * El control de la semana: un renglón por delivery (sus tableros juntos) y uno por cada nombre de Envíos Delivery que no es de ningún delivery
 * registrado (con las tarifas de siempre), para que nada quede sin pagar. `ajustesDe` da las propinas y ajustes de cada delivery (por id).
 */
export function resumenSemana(filas: FilaEnvio[], deliverys: DeliveryControl[], ajustesDe: (id: string) => Ajuste[] = () => []): ResumenDelivery[] {
  const deQuien = new Map<string, DeliveryControl>();
  for (const d of deliverys) for (const c of d.couriers) deQuien.set(nombreRepartidor(c), d);
  type Trabajo = ResumenDelivery & { _dias: Map<string, DiaControl>; _cuenta: Record<Concepto, number> };
  const res = new Map<string, Trabajo>();
  const nuevo = (d: DeliveryControl | undefined, courier: string): Trabajo => {
    const limpio = courier.replace(/\s+/g, " ").trim();
    const couriers = d?.couriers ?? [limpio];
    return {
      deliveryId: d?.id ?? null,
      nombre: d?.nombre ?? limpio,
      couriers,
      tarifas: d?.tarifas ?? TARIFAS_BASE,
      prueba: couriers.some((c) => nombreRepartidor(c) === COURIER_PRUEBA),
      asignados: 0,
      entregados: 0,
      cambios: 0,
      retiros: 0,
      fallidos: 0,
      fallidosSinEvidencia: 0,
      pospuestos: 0,
      enRuta: 0,
      porTienda: {},
      clicksi: 0,
      propinas: 0,
      ajustes: 0,
      totalOceans: 0,
      dias: [],
      lineas: [],
      _dias: new Map(),
      _cuenta: { entrega: 0, fallido: 0, cambio: 0, retiro: 0 },
    };
  };
  // Los deliverys registrados salen aunque no tengan pedidos en la semana (para anotarles propinas o ajustes).
  for (const d of deliverys) res.set(`d:${d.id}`, nuevo(d, d.nombre));
  for (const f of filas) {
    const clave = nombreRepartidor(f.courier);
    if (!clave) continue;
    const d = deQuien.get(clave);
    const k = d ? `d:${d.id}` : `c:${clave}`;
    let r = res.get(k);
    if (!r) {
      r = nuevo(d, f.courier ?? clave);
      res.set(k, r);
    }
    const e = (f.estado ?? "").trim().toUpperCase();
    const dia = r._dias.get(f.dia) ?? { dia: f.dia, asignados: 0, entregados: 0, cambios: 0, fallidos: 0, retiros: 0, pago: 0 };
    r._dias.set(f.dia, dia);
    r.asignados++;
    dia.asignados++;
    if (e === "POSPUESTO") r.pospuestos++;
    else if (e === "FALLIDO" && f.comprobantes === 0) r.fallidosSinEvidencia++;
    else if (e !== "ENTREGADO" && e !== "FALLIDO" && e !== "DESINTEGRADO") r.enRuta++;
    const c = conceptoDeFila(f);
    if (!c) continue;
    const tarifa = tarifaDe(c, r.tarifas);
    r._cuenta[c]++;
    if (c === "entrega") {
      r.entregados++;
      dia.entregados++;
    } else if (c === "cambio") {
      r.cambios++;
      dia.cambios++;
    } else if (c === "retiro") {
      r.retiros++;
      dia.retiros++;
    } else {
      r.fallidos++;
      dia.fallidos++;
    }
    dia.pago += tarifa;
    if (esClickSi(f.tienda)) r.clicksi += tarifa;
    else {
      const t = (f.tienda ?? "").trim().toUpperCase() || "SIN TIENDA";
      r.porTienda[t] = (r.porTienda[t] ?? 0) + tarifa;
    }
  }
  return [...res.values()]
    .map(({ _dias, _cuenta, ...r }) => {
      const extras = r.deliveryId ? ajustesDe(r.deliveryId) : [];
      const propinas = r2(extras.filter((a) => a.tipo === "propina").reduce((s, a) => s + (Number(a.monto) || 0), 0));
      const ajustes = r2(extras.filter((a) => a.tipo !== "propina").reduce((s, a) => s + (Number(a.monto) || 0), 0));
      const porTienda = Object.fromEntries(Object.entries(r.porTienda).map(([k, v]) => [k, r2(v)]));
      return {
        ...r,
        porTienda,
        clicksi: r2(r.clicksi),
        propinas,
        ajustes,
        totalOceans: r2(Object.values(porTienda).reduce((s, v) => s + v, 0) + propinas + ajustes),
        dias: [..._dias.values()].map((d) => ({ ...d, pago: r2(d.pago) })).sort((a, b) => a.dia.localeCompare(b.dia)),
        lineas: ORDEN.map((c) => {
          const tarifa = tarifaDe(c, r.tarifas);
          const cantidad = _cuenta[c];
          return { concepto: c, texto: TEXTOS[c][cantidad === 1 ? 0 : 1], cantidad, tarifa, total: r2(cantidad * tarifa) };
        }),
      };
    })
    .sort((a, b) => Number(a.prueba) - Number(b.prueba) || b.totalOceans + b.clicksi - (a.totalOceans + a.clicksi) || a.nombre.localeCompare(b.nombre));
}

/** Los totales de la semana, sin el repartidor de prueba. */
export function totalesSemana(rs: ResumenDelivery[]) {
  const t = { entregados: 0, cambios: 0, retiros: 0, fallidos: 0, porTienda: {} as Record<string, number>, propinasYAjustes: 0, totalOceans: 0, clicksi: 0 };
  for (const r of rs) {
    if (r.prueba) continue;
    t.entregados += r.entregados;
    t.cambios += r.cambios;
    t.retiros += r.retiros;
    t.fallidos += r.fallidos;
    for (const [k, v] of Object.entries(r.porTienda)) t.porTienda[k] = r2((t.porTienda[k] ?? 0) + v);
    t.propinasYAjustes = r2(t.propinasYAjustes + r.propinas + r.ajustes);
    t.totalOceans = r2(t.totalOceans + r.totalOceans);
    t.clicksi = r2(t.clicksi + r.clicksi);
  }
  return t;
}

/** Una propina o un ajuste escrito por Yiletsi: monto (la propina, positiva; el ajuste con signo: − descuenta) y motivo; null si no sirve. */
export function leerAjuste(tipo: unknown, monto: unknown, motivo: unknown): Ajuste | null {
  const t = tipo === "propina" ? "propina" : tipo === "ajuste" ? "ajuste" : null;
  const n = Number(String(monto ?? "").replace(/[$\s]/g, "").replace(",", "."));
  const m = String(motivo ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!t || !Number.isFinite(n) || n === 0 || Math.abs(n) > 10_000) return null;
  if (t === "propina" && n < 0) return null;
  if (t === "ajuste" && !m) return null;
  return { tipo: t, monto: r2(n), motivo: m || "Propina" };
}

/** Las propinas y ajustes guardados en la base (jsonb), solo los que sirven. */
export function ajustesGuardados(v: unknown): Ajuste[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((a) => (a && typeof a === "object" ? leerAjuste((a as Ajuste).tipo ?? "ajuste", (a as Ajuste).monto, (a as Ajuste).motivo) : null))
    .filter((a): a is Ajuste => a !== null);
}

/** El número del recibo: «ENV-20261119-JULY-CALLE». */
export function numeroRecibo(jueves: string, nombre: string): string {
  const corto = nombre
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);
  return `ENV-${jueves.replace(/-/g, "")}-${corto || "DELIVERY"}`;
}

export const FORMAS_PAGO_RECIBO = { transferencia: "Transferencia", efectivo: "Efectivo", yappy: "Yappy" } as const;
export type FormaPagoRecibo = keyof typeof FORMAS_PAGO_RECIBO;
export const esFormaPagoRecibo = (v: unknown): v is FormaPagoRecibo => typeof v === "string" && v in FORMAS_PAGO_RECIBO;
