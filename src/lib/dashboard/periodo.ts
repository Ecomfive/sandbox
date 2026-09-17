export type ModoComparacion = "anterior" | "anio_pasado";

export interface Periodo {
  desde: string;
  hasta: string;
  compararDesde: string;
  compararHasta: string;
  modoComparacion: ModoComparacion;
  preset: string;
  etiqueta: string;
  etiquetaComparacion: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function hoy(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function resolverPeriodo(sp: {
  preset?: string;
  desde?: string;
  hasta?: string;
  comparar?: string;
}): Periodo {
  const modoComparacion: ModoComparacion = sp.comparar === "anio_pasado" ? "anio_pasado" : "anterior";

  let desde: Date;
  let hasta: Date;
  let etiqueta: string;
  let preset = sp.preset ?? "7d";

  if (sp.desde && sp.hasta) {
    desde = new Date(sp.desde);
    hasta = new Date(sp.hasta);
    etiqueta = "Personalizado";
    preset = "personalizado";
  } else {
    const h = hoy();
    switch (preset) {
      case "30d":
        hasta = h;
        desde = new Date(h);
        desde.setDate(desde.getDate() - 29);
        etiqueta = "Últimos 30 días";
        break;
      case "mes_actual":
        desde = new Date(h.getFullYear(), h.getMonth(), 1);
        hasta = h;
        etiqueta = "Este mes";
        break;
      case "mes_anterior":
        desde = new Date(h.getFullYear(), h.getMonth() - 1, 1);
        hasta = new Date(h.getFullYear(), h.getMonth(), 0);
        etiqueta = "Mes anterior";
        break;
      default:
        preset = "7d";
        hasta = h;
        desde = new Date(h);
        desde.setDate(desde.getDate() - 6);
        etiqueta = "Últimos 7 días";
    }
  }

  const dias = Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1;

  let compararDesde: Date;
  let compararHasta: Date;
  if (modoComparacion === "anio_pasado") {
    compararDesde = new Date(desde);
    compararDesde.setFullYear(compararDesde.getFullYear() - 1);
    compararHasta = new Date(hasta);
    compararHasta.setFullYear(compararHasta.getFullYear() - 1);
  } else {
    compararHasta = new Date(desde);
    compararHasta.setDate(compararHasta.getDate() - 1);
    compararDesde = new Date(compararHasta);
    compararDesde.setDate(compararDesde.getDate() - (dias - 1));
  }

  return {
    desde: iso(desde),
    hasta: iso(hasta),
    compararDesde: iso(compararDesde),
    compararHasta: iso(compararHasta),
    modoComparacion,
    preset,
    etiqueta,
    etiquetaComparacion: modoComparacion === "anio_pasado" ? "mismo período año pasado" : "período anterior",
  };
}

/** Lista de fechas YYYY-MM-DD entre desde y hasta, inclusive. */
export function diasDelPeriodo(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  const d = new Date(desde);
  const h = new Date(hasta);
  while (d <= h) {
    dias.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return dias;
}

export function calcularDelta(actual: number, comparacion: number | null): number | null {
  if (comparacion === null) return null;
  if (comparacion === 0) return actual === 0 ? 0 : null;
  return ((actual - comparacion) / comparacion) * 100;
}
