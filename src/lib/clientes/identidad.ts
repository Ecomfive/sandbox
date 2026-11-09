// Identidad de cliente (Clientes y marketing). Lógica pura: sirve en la acción «Recalcular clientes», en el script
// `scripts/finanzas/recalcular-clientes.ts` y en las pruebas (`identidad.test.ts`).
//
// Una persona se reconoce por su teléfono de Panamá normalizado (+507 y 8 dígitos de un móvil que empieza en 6, o 7 de
// un fijo); si no trae uno válido, por su correo; y si tampoco, la orden queda como un cliente de una sola orden (cuenta
// como cliente nuevo pero nunca como recompra). La llave que se guarda es un HMAC-SHA256 de ese dato con un secreto del
// servidor: en la base no queda el teléfono ni el correo, y sin el secreto no se puede recorrer los 10^8 números posibles.

import { createHmac } from "node:crypto";

export type CalidadTelefono = "movil" | "fijo" | "invalido" | "sospechoso" | "sin_dato";
export type TipoLlave = "telefono" | "correo" | "orden";

export const CALIDADES: CalidadTelefono[] = ["movil", "fijo", "invalido", "sospechoso", "sin_dato"];

export const ETIQUETA_CALIDAD: Record<CalidadTelefono, string> = {
  movil: "Móvil",
  fijo: "Fijo",
  invalido: "Inválido",
  sospechoso: "Sospechoso",
  sin_dato: "Sin teléfono",
};

/** Un teléfono con órdenes de al menos tantos nombres distintos es de la tienda, de un repartidor o de un tercero. */
export const UMBRAL_NOMBRES_DISTINTOS = 4;

export interface TelefonoNormalizado {
  /** «+50760001234» o «+5072001234»; null si no es un número de Panamá válido. */
  numero: string | null;
  calidad: CalidadTelefono;
}

/** Siete dígitos iguales o seguidos (0000000, 1234567, 7654321): un número de relleno. */
function esRelleno(local: string): boolean {
  const cola = local.slice(-7);
  if (/^(\d)\1+$/.test(cola)) return true;
  let sube = true;
  let baja = true;
  for (let i = 1; i < cola.length; i++) {
    const d = Number(cola[i]) - Number(cola[i - 1]);
    if (d !== 1) sube = false;
    if (d !== -1) baja = false;
  }
  return sube || baja;
}

/**
 * Normaliza un teléfono de Panamá: quita espacios, guiones, paréntesis y el prefijo (+507, 00507, 507). Un móvil son
 * 8 dígitos que empiezan en 6; un fijo, 7 dígitos que empiezan del 2 al 9 (menos el 6). Un número de otro país (+ y
 * otro código) es inválido. Un número de relleno (todos iguales o seguidos) es sospechoso.
 */
export function normalizarTelefono(texto: string | null | undefined): TelefonoNormalizado {
  const crudo = (texto ?? "").trim();
  if (!crudo) return { numero: null, calidad: "sin_dato" };
  let d = crudo.replace(/\D/g, "");
  if (!d) return { numero: null, calidad: "sin_dato" };
  const internacional = /^\s*(\+|00)/.test(crudo);
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("507") && (d.length === 10 || d.length === 11)) d = d.slice(3);
  else if (internacional) return { numero: null, calidad: "invalido" };

  let calidad: CalidadTelefono;
  if (d.length === 8 && d[0] === "6") calidad = "movil";
  else if (d.length === 7 && /^[2-578-9]/.test(d)) calidad = "fijo";
  else return { numero: null, calidad: "invalido" };
  if (esRelleno(d)) return { numero: null, calidad: "sospechoso" };
  return { numero: `+507${d}`, calidad };
}

/** Correo en minúsculas y sin espacios; null si no tiene forma de correo. */
export function normalizarCorreo(texto: string | null | undefined): string | null {
  const c = (texto ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(c) ? c : null;
}

/** El primer nombre sin acentos ni signos: «María José» y «maria» cuentan como el mismo. */
export function primerNombre(nombre: string | null | undefined): string | null {
  const p = (nombre ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .find((x) => x.length >= 2);
  return p ?? null;
}

/** HMAC-SHA256 en hexadecimal: la llave del cliente. */
export function llaveHash(valor: string, secreto: string): string {
  return createHmac("sha256", secreto).update(valor).digest("hex");
}

export interface OrdenIdentidad {
  orden_id: string;
  nombre: string | null;
  telefono: string | null;
  correo?: string | null;
}

export interface Asignacion {
  orden_id: string;
  llave: string;
  tipo_llave: TipoLlave;
  calidad: CalidadTelefono;
}

export interface ResumenIdentidad {
  ordenes: number;
  porCalidad: Record<CalidadTelefono, number>;
  porTipo: Record<TipoLlave, number>;
  /** Clientes distintos (llaves), incluidos los de una sola orden sin dato. */
  clientes: number;
  /** Clientes reconocidos por teléfono o correo. */
  clientesIdentificados: number;
  /** Teléfonos válidos que se descartaron por tener órdenes de muchos nombres distintos. */
  telefonosCompartidos: number;
  ordenesTelefonoCompartido: number;
}

/**
 * Asigna a cada orden la llave de su cliente. Primero normaliza todos los teléfonos y cuenta, por número, los nombres
 * distintos: los que pasan del umbral se marcan sospechosos y sus órdenes caen al correo o quedan solas.
 */
export function armarIdentidades(
  ordenes: OrdenIdentidad[],
  secreto: string,
  umbralNombres = UMBRAL_NOMBRES_DISTINTOS,
): { asignaciones: Asignacion[]; resumen: ResumenIdentidad } {
  if (!secreto) throw new Error("Falta el secreto de las llaves de cliente.");
  const tels = ordenes.map((o) => normalizarTelefono(o.telefono));
  const nombres = new Map<string, Set<string>>();
  ordenes.forEach((o, i) => {
    const n = tels[i].numero;
    const p = primerNombre(o.nombre);
    if (!n || !p) return;
    const s = nombres.get(n) ?? new Set<string>();
    s.add(p);
    nombres.set(n, s);
  });
  const compartidos = new Set([...nombres].filter(([, s]) => s.size >= umbralNombres).map(([n]) => n));

  const porCalidad = Object.fromEntries(CALIDADES.map((c) => [c, 0])) as Record<CalidadTelefono, number>;
  const porTipo: Record<TipoLlave, number> = { telefono: 0, correo: 0, orden: 0 };
  const llaves = new Set<string>();
  const identificadas = new Set<string>();
  let ordenesTelefonoCompartido = 0;
  const asignaciones = ordenes.map((o, i): Asignacion => {
    let { numero, calidad } = tels[i];
    if (numero && compartidos.has(numero)) {
      numero = null;
      calidad = "sospechoso";
      ordenesTelefonoCompartido++;
    }
    const correo = normalizarCorreo(o.correo);
    let tipo_llave: TipoLlave;
    let llave: string;
    if (numero) {
      tipo_llave = "telefono";
      llave = llaveHash(`tel:${numero}`, secreto);
    } else if (correo) {
      tipo_llave = "correo";
      llave = llaveHash(`correo:${correo}`, secreto);
    } else {
      tipo_llave = "orden";
      llave = llaveHash(`orden:${o.orden_id}`, secreto);
    }
    porCalidad[calidad]++;
    porTipo[tipo_llave]++;
    llaves.add(llave);
    if (tipo_llave !== "orden") identificadas.add(llave);
    return { orden_id: o.orden_id, llave, tipo_llave, calidad };
  });
  return {
    asignaciones,
    resumen: {
      ordenes: ordenes.length,
      porCalidad,
      porTipo,
      clientes: llaves.size,
      clientesIdentificados: identificadas.size,
      telefonosCompartidos: compartidos.size,
      ordenesTelefonoCompartido,
    },
  };
}

/** El secreto de las llaves: `CLIENTES_LLAVE_SECRETO` o, si no está, la clave de servicio de Supabase. */
export function secretoLlaves(env: Record<string, string | undefined> = process.env): string {
  const s = env.CLIENTES_LLAVE_SECRETO || env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!s) throw new Error("Falta CLIENTES_LLAVE_SECRETO (o SUPABASE_SERVICE_ROLE_KEY) para armar las llaves de cliente.");
  return s;
}
