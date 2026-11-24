// Gestión de tienda › Despacho ciudad y Devoluciones (15 nov 2026, pedido de Hernán: «pasar Monday al sistema, que funcione igual que Monday»). Las
// etiquetas de cada columna con sus colores, tal como estaban en los tableros de Panamá de Monday, y las reglas puras del tablero: el nombre limpio del
// repartidor, qué fila se muestra cuando un pedido está en el consolidado y en el tablero del repartidor, y las sumas del día. Sin base ni React.

import { normalizar } from "@/lib/finanzas/clasificacion";

export type Columna = "tienda" | "courier" | "estado" | "edo_pago" | "forma_pago" | "turno" | "estado_asesores";

/**
 * El repartidor de prueba (24 nov 2026, pedido de Hernán: probar el panel del repartidor sin tocar pedidos reales). Las filas del tablero de prueba de
 * Monday (`mon_tableros_extra.prueba`, migración 0363) se guardan con este repartidor, sin tienda ni pedido enlazado: lo que se marque no cambia ningún
 * pedido, no sale en Logística ni en las métricas de Monday y no se confunde con una fila real del mismo número.
 */
export const REPARTIDOR_PRUEBA = "USUARIO DE PRUEBA";

export interface Etiqueta {
  nombre: string;
  color: string;
}

/** Las etiquetas de cada columna, en el orden y con el color de Monday. */
export const ETIQUETAS: Record<Columna, { titulo: string; opciones: Etiqueta[] }> = {
  tienda: {
    titulo: "Tienda",
    opciones: [
      { nombre: "KENKU", color: "#4eccc6" },
      { nombre: "OFERFY", color: "#00c875" },
      { nombre: "NUVO", color: "#333333" },
      { nombre: "CLICKSI", color: "#ffcb00" },
      { nombre: "CALZADOS O.", color: "#ff6d3b" },
    ],
  },
  courier: {
    titulo: "Repartidor",
    opciones: [
      { nombre: "JULY CALLE", color: "#ff7575" },
      { nombre: "ANIBAL PEREZ", color: "#bca58a" },
      { nombre: "ANDRÉS ÁLVAREZ", color: "#ff007f" },
      { nombre: "YOSELYN VIAÑA", color: "#cab641" },
      { nombre: "GILBERTO PARRA", color: "#00c875" },
      { nombre: "DEIMIBEL", color: "#bda8f9" },
      { nombre: "DEIMIBEL CIUDAD", color: "#9d50dd" },
      { nombre: "DEIMIBEL ZONA 1 Y 2", color: "#fdab3d" },
      { nombre: "DEIMIBEL ZONA 4", color: "#757575" },
      { nombre: "DEIMIBEL ZONA 5", color: "#037f4c" },
      { nombre: "DEIMIBEL CHORRERA", color: "#784bd1" },
      { nombre: "DEIMIBEL ARRAIJÁN", color: "#7e3b8a" },
      { nombre: "USUARIO DE PRUEBA", color: "#c4c4c4" },
    ],
  },
  estado: {
    titulo: "Estado",
    opciones: [
      { nombre: "ENTREGADO", color: "#00c875" },
      { nombre: "FALLIDO", color: "#fdab3d" },
      { nombre: "RECOLECTADO", color: "#ff6d3b" },
      { nombre: "POSPUESTO", color: "#9d50dd" },
      { nombre: "DESINTEGRADO", color: "#007eb5" },
    ],
  },
  edo_pago: {
    titulo: "Edo. pago",
    opciones: [
      { nombre: "PAGADO", color: "#00c875" },
      { nombre: "PENDIENTE", color: "#c4c4c4" },
      { nombre: "ONLINE", color: "#784bd1" },
    ],
  },
  forma_pago: {
    titulo: "Forma de pago",
    opciones: [
      { nombre: "EFECTIVO", color: "#00c875" },
      { nombre: "YAPPY", color: "#007eb5" },
      { nombre: "TRANSFERENCIA", color: "#fdab3d" },
      { nombre: "PREVIO PAGO", color: "#9d50dd" },
      { nombre: "CAMBIO", color: "#5559df" },
      { nombre: "RETIRO", color: "#037f4c" },
      { nombre: "COMPLEMENTO", color: "#ffadad" },
      { nombre: "MiPOS", color: "#df2f4a" },
    ],
  },
  turno: {
    titulo: "Cambio / retiro / turno",
    opciones: [
      { nombre: "1ER. TURNO", color: "#333333" },
      { nombre: "2DO. TURNO", color: "#df2f4a" },
      { nombre: "EN PROCESO", color: "#fdab3d" },
      { nombre: "RECIBIDO", color: "#00c875" },
      { nombre: "FUERA DE RUTA", color: "#ff6d3b" },
      { nombre: "PROPINAS", color: "#216edf" },
    ],
  },
  estado_asesores: {
    titulo: "Estado asesores",
    opciones: [
      { nombre: "PENDIENTE", color: "#fdab3d" },
      { nombre: "VERIFICADO", color: "#00c875" },
      { nombre: "RECHAZADO", color: "#df2f4a" },
      { nombre: "DESINTEGRADO", color: "#333333" },
      { nombre: "POSPUESTO", color: "#9d50dd" },
      { nombre: "PROCESADO", color: "#ff6d3b" },
      { nombre: "FALLIDO", color: "#579bfc" },
    ],
  },
};

export const COLUMNAS_ETIQUETA = Object.keys(ETIQUETAS) as Columna[];
export const esColumnaEtiqueta = (v: unknown): v is Columna => typeof v === "string" && (COLUMNAS_ETIQUETA as string[]).includes(v);

/** Los grupos del tablero de devoluciones, en orden. */
export const GRUPOS_DEVOLUCION: Etiqueta[] = [
  { nombre: "DEVOLUCIÓN CIUDAD", color: "#784bd1" },
  { nombre: "RECHAZADOS / CANCELADOS", color: "#df2f4a" },
  { nombre: "REALIZADOS / REPROGRAMADOS", color: "#007eb5" },
];

/** El grupo de devoluciones de un texto de Monday («DEVOLUCION CIUDAD», «RECHAZADOS/CANCELADOS»…); el primero si no se reconoce. */
export function grupoDevolucion(texto: string | null | undefined): string {
  const t = normalizar(texto ?? "");
  if (/RECHAZ|CANCEL/.test(t)) return GRUPOS_DEVOLUCION[1].nombre;
  if (/REALIZ|REPROGRAM/.test(t)) return GRUPOS_DEVOLUCION[2].nombre;
  return GRUPOS_DEVOLUCION[0].nombre;
}

/** Regla de Monday en los tableros de devoluciones: «Estado asesores» en DESINTEGRADO pasa la fila a Rechazados / cancelados. */
export const grupoPorAsesores = (estadoAsesores: string | null | undefined): string | null =>
  normalizar(estadoAsesores ?? "") === "DESINTEGRADO" ? GRUPOS_DEVOLUCION[1].nombre : null;

/**
 * El nombre limpio de una etiqueta: el de la lista si coincide sin tildes, mayúsculas ni espacios de más, y los errores conocidos de Monday
 * («DEIMIBLE» por «DEIMIBEL», «GILBERTO    PARRA»). Lo que no está en la lista queda como vino, sin espacios de más.
 */
export function etiquetaLimpia(columna: Columna, texto: string | null | undefined): string | null {
  const crudo = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!crudo) return null;
  const n = normalizar(crudo).replace(/\bDEIMIBLE\b/g, "DEIMIBEL");
  const igual = ETIQUETAS[columna].opciones.find((o) => normalizar(o.nombre) === n);
  return igual ? igual.nombre : crudo;
}

/** El color de una etiqueta (gris si no está en la lista). */
export const colorDe = (columna: Columna, nombre: string | null | undefined): string | null =>
  nombre ? (ETIQUETAS[columna].opciones.find((o) => o.nombre === nombre)?.color ?? "#9ca3af") : null;

/** El color de texto que se lee sobre una etiqueta: oscuro sobre colores claros, blanco sobre los demás. */
export function textoSobre(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n)) return "#18181b";
  const r = n >> 16;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#18181b" : "#ffffff";
}

export interface FilaDespacho {
  itemId: string;
  tableroId: string;
  origen: "monday" | "sistema";
  editadoEn: string | null;
  actualizado: string | null;
  numero: string | null;
  tienda: string | null;
  dia: string | null;
  /** El repartidor: las filas de prueba (`REPARTIDOR_PRUEBA`) nunca se juntan con una real del mismo número. */
  courier?: string | null;
}

/**
 * Un pedido puede estar dos veces: en el tablero del repartidor y, al cerrar el mes, copiado al consolidado. Se muestra una sola fila por pedido, tienda
 * y día: la editada en el sistema; si no, la del tablero del repartidor (no la del consolidado); si no, la más reciente. Las filas sin número no se juntan.
 */
export function sinDuplicados<T extends FilaDespacho>(filas: T[], tableroConsolidado: string | null): T[] {
  const puntos = (f: T) => `${f.origen === "sistema" || f.editadoEn ? "2" : "1"}${f.tableroId === tableroConsolidado ? "0" : "1"}${f.editadoEn ?? f.actualizado ?? ""}`;
  const mejor = new Map<string, T>();
  const sueltas: T[] = [];
  for (const f of filas) {
    if (!f.numero) {
      sueltas.push(f);
      continue;
    }
    const clave = `${f.courier === REPARTIDOR_PRUEBA ? "PRUEBA|" : ""}${normalizar(f.tienda ?? "")}|${normalizar(f.numero).replace(/\s|COPY|COPIA/g, "")}|${f.dia ?? ""}`;
    const previa = mejor.get(clave);
    if (!previa || puntos(f) > puntos(previa)) mejor.set(clave, f);
  }
  const quedan = new Set([...mejor.values(), ...sueltas]);
  return filas.filter((f) => quedan.has(f));
}

/** Las sumas del pie de un grupo: por cobrar, cobrado y coste de envío, y cuántos se entregaron. */
export function sumasGrupo(filas: { estado: string | null; porCobrar: number | null; cobrado: number | null; costeEnvio: number | null }[]) {
  const suma = (k: "porCobrar" | "cobrado" | "costeEnvio") => Math.round(filas.reduce((t, f) => t + (f[k] ?? 0), 0) * 100) / 100;
  return { pedidos: filas.length, entregados: filas.filter((f) => f.estado === "ENTREGADO").length, porCobrar: suma("porCobrar"), cobrado: suma("cobrado"), costeEnvio: suma("costeEnvio") };
}

/** Un día de Monday («14/11/2026») o del sistema («2026-11-14») como AAAA-MM-DD; null si no es una fecha. */
export function diaIso(texto: string | null | undefined): string | null {
  const t = (texto ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
}

/** El día como se lee en el tablero: «14/11/2026», como en Monday. */
export const diaTexto = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "Sin día");

/** Hasta cuántos días se pueden pedir de una vez en Despacho ciudad (un cierre de quincena o de mes cabe; más carga demasiado). */
export const MAX_DIAS_RANGO = 62;

/**
 * El día o los días que se eligieron para mirar Despacho ciudad («Del … al …», 24 nov 2026, pedido de Soporte para los cierres de pago a los
 * mensajeros), o null si no se eligió nada válido. Sin «hasta», es un solo día; al revés, se ordenan; más de `MAX_DIAS_RANGO` días, se corta.
 */
export function rangoElegido(desde: unknown, hasta: unknown): { desde: string; hasta: string } | null {
  const ok = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
  if (!ok(desde)) return null;
  let [a, b] = ok(hasta) ? [desde, hasta] : [desde, desde];
  if (b < a) [a, b] = [b, a];
  const tope = new Date(Date.parse(`${a}T00:00:00Z`) + (MAX_DIAS_RANGO - 1) * 86_400_000).toISOString().slice(0, 10);
  return { desde: a, hasta: b > tope ? tope : b };
}
