// Movimientos recurrentes del libro (mejora 9, migración 0981). Parte pura, con prueba en `recurrentes.test.ts`: qué meses
// le toca generar a una plantilla, en qué fecha y con qué clave. La carga y el guardado viven en `recurrentes-servidor.ts`.

export { ORIGEN_RECURRENTE } from "./movimiento-manual";
/** Como mucho estos meses hacia atrás se generan de una vez (una plantilla con «desde» viejo no llena años). */
export const MAX_MESES_ATRAS = 12;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PlantillaRecurrente {
  id: string;
  dia: number;
  desde: string;
  hasta: string | null;
  ultimo_periodo: string | null;
  activo: boolean;
}

const mesSiguiente = (m: string) => {
  const a = Number(m.slice(0, 4));
  const n = Number(m.slice(5, 7));
  return n === 12 ? `${a + 1}-01-01` : `${a}-${String(n + 1).padStart(2, "0")}-01`;
};
const mesAtras = (m: string, k: number) => {
  let a = Number(m.slice(0, 4));
  let n = Number(m.slice(5, 7)) - k;
  while (n <= 0) {
    n += 12;
    a -= 1;
  }
  return `${a}-${String(n).padStart(2, "0")}-01`;
};
const ultimoDia = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();

/** La fecha del movimiento en ese mes: su día, o el último del mes si es más corto. */
export const fechaDelMes = (periodo: string, dia: number) => `${periodo.slice(0, 7)}-${String(Math.min(Math.max(1, dia), ultimoDia(periodo))).padStart(2, "0")}`;

export const claveRecurrente = (id: string, periodo: string) => `recurrente:${id}:${periodo.slice(0, 7)}`;

/**
 * Los meses (primer día) que le faltan generar a la plantilla hasta hoy, del más viejo al más nuevo: desde el mes
 * siguiente al último generado (o `desde`), sin pasar de `hasta`, como mucho `MAX_MESES_ATRAS` atrás, y el mes en curso
 * solo si ya llegó su día.
 */
export function mesesPorGenerar(p: PlantillaRecurrente, hoy: string): string[] {
  if (!p.activo) return [];
  const mesHoy = `${hoy.slice(0, 7)}-01`;
  let m = p.ultimo_periodo ? mesSiguiente(p.ultimo_periodo) : p.desde;
  if (m < p.desde) m = p.desde;
  const tope = mesAtras(mesHoy, MAX_MESES_ATRAS);
  if (m < tope) m = tope;
  const salida: string[] = [];
  while (m <= mesHoy && (!p.hasta || m <= p.hasta)) {
    if (m < mesHoy || hoy >= fechaDelMes(m, p.dia)) salida.push(m);
    m = mesSiguiente(m);
  }
  return salida;
}

/** Lo que pide la ficha de una plantilla. */
export interface DatosRecurrente {
  unidad_id: string;
  tipo_id: string;
  descripcion: string;
  monto: number;
  dia: number;
  cuenta_id: string | null;
  en_eerr: boolean;
  en_flujo: boolean;
  desde: string;
  hasta: string | null;
}

/** Valida los campos de la ficha («desde» y «hasta» llegan como AAAA-MM). */
export function leerDatosRecurrente(get: (campo: string) => unknown): DatosRecurrente | { error: string } {
  const s = (k: string) => {
    const v = get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const mes = (k: string) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(s(k)) ? `${s(k)}-01` : null);
  const unidad = s("unidad_id");
  if (!UUID.test(unidad)) return { error: "Elige la tienda." };
  const tipo = s("tipo_id");
  if (!UUID.test(tipo)) return { error: "Elige el tipo." };
  const descripcion = s("descripcion").replace(/\s+/g, " ").slice(0, 500);
  if (!descripcion) return { error: "Falta la descripción." };
  const monto = Number(s("monto").replace(/[$\s,]/g, ""));
  if (!Number.isFinite(monto) || monto <= 0 || monto > 100_000_000) return { error: "El monto debe ser mayor a cero." };
  const dia = Number(s("dia"));
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return { error: "El día debe ir del 1 al 31." };
  const desde = mes("desde");
  if (!desde) return { error: "Elige desde qué mes." };
  const hasta = s("hasta") ? mes("hasta") : null;
  if (s("hasta") && !hasta) return { error: "El mes «hasta» no es válido." };
  if (hasta && hasta < desde) return { error: "«Hasta» no puede ser antes de «desde»." };
  const cuenta = s("cuenta_id");
  return {
    unidad_id: unidad,
    tipo_id: tipo,
    descripcion,
    monto: Math.round(monto * 100) / 100,
    dia,
    cuenta_id: UUID.test(cuenta) ? cuenta : null,
    en_eerr: s("en_eerr") === "si",
    en_flujo: s("en_flujo") === "si",
    desde,
    hasta,
  };
}
