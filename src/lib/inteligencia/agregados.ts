export interface PuntoMensual {
  mes: string; // "2026-09"
  valor: number;
}

function enumerarMeses(desde: string, hasta: string): string[] {
  const meses: string[] = [];
  const [anioInicio, mesInicio] = desde.split("-").map(Number);
  const [anioFin, mesFin] = hasta.split("-").map(Number);
  let anio = anioInicio;
  let mes = mesInicio;
  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    meses.push(`${anio}-${String(mes).padStart(2, "0")}`);
    mes++;
    if (mes > 12) {
      mes = 1;
      anio++;
    }
  }
  return meses;
}

/** Cuántos proveedores detectamos por primera vez en nuestro rastreo, mes a mes (no acumulado). */
export function agruparProveedoresNuevosPorMes(
  proveedores: { primera_vez_visto: string }[]
): PuntoMensual[] {
  if (proveedores.length === 0) return [];
  const porMes = new Map<string, number>();
  for (const p of proveedores) {
    const mes = p.primera_vez_visto.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
  }
  const meses = enumerarMeses(
    proveedores.reduce((min, p) => (p.primera_vez_visto < min ? p.primera_vez_visto : min), proveedores[0].primera_vez_visto).slice(0, 7),
    new Date().toISOString().slice(0, 7)
  );
  return meses.map((mes) => ({ mes, valor: porMes.get(mes) ?? 0 }));
}

/**
 * Total de productos rastreados en la plataforma, al cierre de cada mes (acumulado):
 * para cada proveedor se usa su último conteo conocido hasta ese mes, y se suman todos.
 */
export function agruparProductosTotalesPorMes(
  snapshots: { proveedor_id: string; fecha: string; productos_count: number }[]
): PuntoMensual[] {
  if (snapshots.length === 0) return [];
  const ordenAsc = [...snapshots].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const primerMes = ordenAsc[0].fecha.slice(0, 7);
  const ultimoMes = new Date().toISOString().slice(0, 7);
  const meses = enumerarMeses(primerMes, ultimoMes);

  const ultimoValorPorProveedor = new Map<string, number>();
  let cursor = 0;
  const puntos: PuntoMensual[] = [];
  for (const mes of meses) {
    while (cursor < ordenAsc.length && ordenAsc[cursor].fecha.slice(0, 7) <= mes) {
      ultimoValorPorProveedor.set(ordenAsc[cursor].proveedor_id, ordenAsc[cursor].productos_count);
      cursor++;
    }
    const total = Array.from(ultimoValorPorProveedor.values()).reduce((a, b) => a + b, 0);
    puntos.push({ mes, valor: total });
  }
  return puntos;
}

export function soloAnio(puntos: PuntoMensual[], anio: string): PuntoMensual[] {
  return puntos.filter((p) => p.mes.startsWith(anio));
}

const NOMBRES_MES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

export function etiquetaMes(mes: string): string {
  const [anio, m] = mes.split("-");
  return `${NOMBRES_MES[Number(m) - 1]} ${anio.slice(2)}`;
}

/** Snapshot con fecha <= objetivo más cercano a esa fecha (el historial debe venir ordenado desc por fecha). */
export function snapshotMasCercano<T extends { fecha: string }>(
  historialDesc: T[],
  fechaObjetivoIso: string
): T | null {
  return historialDesc.find((h) => h.fecha <= fechaObjetivoIso) ?? null;
}

export function fechaHaceMeses(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}
