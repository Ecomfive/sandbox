// Cruce de los cierres de Deliverys con lo que el libro de movimientos ya tiene cargado como pago a repartidores
// (líneas «TRANSPORTE 3/9 AL 09/9 - …» de tipo «Shipping por Ventas», una por repartidor y tienda). Lógica pura; prueba
// en `conciliar-libro.test.ts`. Sirve para ver, antes de dejar de cargarlas a mano, que las dos fuentes dicen lo mismo.

import { inicioSemana, redondear } from "./liquidacion";

const PATRON = /TRANSPORTE\s+(\d{1,2})\/(\d{1,2})\s*AL\s*(\d{1,2})\/(\d{1,2})/i;

/**
 * El jueves de la semana que nombra la descripción de un pago del libro. El año sale del mes del movimiento (`periodo`):
 * «27/12 AL 2/1» en enero es del año anterior. null si la descripción no tiene esa forma.
 */
export function semanaDeDescripcion(descripcion: string, periodo: string): string | null {
  const m = descripcion.match(PATRON);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  let anio = Number(periodo.slice(0, 4));
  if (mes > Number(periodo.slice(5, 7)) + 1) anio--;
  const iso = `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  if (Number.isNaN(Date.parse(iso)) || new Date(`${iso}T00:00:00Z`).getUTCDate() !== dia) return null;
  return inicioSemana(iso);
}

export interface PagoLibro {
  periodo: string;
  tienda: string;
  descripcion: string;
  monto: number;
}

export interface CruceSemanaTienda {
  semana: string;
  tienda: string;
  deliverys: number;
  libro: number;
  diferencia: number;
  lineasLibro: number;
}

/** Por semana y tienda: lo que suman los cierres (`deliverys`) contra lo que suma el libro. Solo semanas de los dos lados. */
export function cruzarConLibro(deliverys: { semana: string; tienda: string; monto: number }[], libro: PagoLibro[]): CruceSemanaTienda[] {
  const m = new Map<string, CruceSemanaTienda>();
  const fila = (semana: string, tienda: string) => {
    const k = `${semana}|${tienda}`;
    return m.get(k) ?? m.set(k, { semana, tienda, deliverys: 0, libro: 0, diferencia: 0, lineasLibro: 0 }).get(k)!;
  };
  const semanasDeliverys = new Set(deliverys.map((d) => d.semana));
  for (const d of deliverys) fila(d.semana, d.tienda).deliverys += d.monto;
  for (const p of libro) {
    const s = semanaDeDescripcion(p.descripcion, p.periodo);
    if (!s || !semanasDeliverys.has(s)) continue;
    const f = fila(s, p.tienda);
    f.libro += p.monto;
    f.lineasLibro++;
  }
  const semanasLibro = new Set([...m.values()].filter((f) => f.lineasLibro).map((f) => f.semana));
  return [...m.values()]
    .filter((f) => semanasLibro.has(f.semana))
    .map((f) => ({ ...f, deliverys: redondear(f.deliverys), libro: redondear(f.libro), diferencia: redondear(f.libro - f.deliverys) || 0 }))
    .filter((f) => f.deliverys || f.libro)
    .sort((a, b) => a.semana.localeCompare(b.semana) || a.tienda.localeCompare(b.tienda));
}
