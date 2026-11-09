// Portal AF4 360° › Tesorería › Capital para crecer (mejora 22 del «CFO en línea»). Lógica pura: cuánta caja exige crecer
// las ventas un X % con los días de calle (DSO), de inventario (DIO) y de proveedores (DPO): el capital de trabajo de cada
// mes, lo incremental y lo acumulado, contra la caja que genera el negocio (EBITDA menos servicio de la deuda), la caja
// disponible hoy y lo que queda libre en las líneas de crédito. Prueba en `capital-crecimiento.test.ts`.

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Capital de trabajo operativo con ventas y costo de un mes: CxC + inventario − CxP, por días (año de 365). */
export function capitalTrabajoOperativo(ventasMes: number, costoMes: number, dso: number, dio: number, dpo: number): number {
  const ventasDia = (ventasMes * 12) / 365;
  const costoDia = (costoMes * 12) / 365;
  return r2(ventasDia * dso + costoDia * dio - costoDia * dpo);
}

export interface InsumosCrecimiento {
  /** Ventas y costo de ventas de un mes típico (los últimos 12 meses ÷ 12). */
  ventasMes: number;
  costoMes: number;
  dso: number;
  dio: number;
  dpo: number;
  /** Crecimiento total de las ventas al final del horizonte (0,3 = 30 %). */
  crecimiento: number;
  meses: number;
  /** EBITDA ÷ ventas: crece con las ventas. */
  margenEbitda: number;
  /** Cuotas e intereses de la deuda de cada mes (lo que falte se toma como 0). */
  servicioDeuda: number[];
  /** Caja que se puede usar hoy sin bajar de la caja mínima. */
  cajaDisponible: number;
  /** Cupo libre de las líneas de crédito. */
  deudaDisponible: number;
}

export interface MesCrecimiento {
  mes: number;
  ventas: number;
  capitalTrabajo: number;
  /** Lo que sube el capital de trabajo ese mes. */
  incremental: number;
  acumulado: number;
  cajaGenerada: number;
  cajaGeneradaAcumulada: number;
  /** Caja disponible + líneas libres + caja generada − capital de trabajo incremental, acumulados. */
  holgura: number;
}

export interface ResultadoCrecimiento {
  filas: MesCrecimiento[];
  capitalTrabajoHoy: number;
  /** Capital de trabajo adicional que exige crecer (al final del horizonte). */
  requerido: number;
  cajaGenerada: number;
  /** Sin usar las líneas: ¿alcanza con la caja de hoy y la que genera? */
  alcanzaSinDeuda: boolean;
  alcanza: boolean;
  /** Lo que falta en el peor mes (0 si alcanza). */
  falta: number;
  /** El primer mes en que falta (null si alcanza). */
  mesFalta: number | null;
  /** El ciclo de caja en días (DIO + DSO − DPO). */
  ciclo: number;
}

/**
 * Las ventas crecen de forma compuesta hasta `1 + crecimiento` en `meses` meses (el costo, en la misma proporción). Cada
 * mes, el capital de trabajo con esas ventas; lo incremental contra el mes anterior; y la holgura acumulada.
 */
export function necesidadCapitalTrabajo(i: InsumosCrecimiento): ResultadoCrecimiento {
  const n = Math.min(Math.max(Math.round(i.meses), 1), 36);
  const proporcionCosto = i.ventasMes > 0 ? i.costoMes / i.ventasMes : 0;
  const hoy = capitalTrabajoOperativo(i.ventasMes, i.costoMes, i.dso, i.dio, i.dpo);
  let previo = hoy;
  let acumulado = 0;
  let generada = 0;
  let mesFalta: number | null = null;
  let peor = Infinity;
  let peorSinDeuda = Infinity;
  const filas: MesCrecimiento[] = [];
  for (let k = 1; k <= n; k++) {
    const ventas = r2(i.ventasMes * Math.pow(1 + i.crecimiento, k / n));
    const ct = capitalTrabajoOperativo(ventas, ventas * proporcionCosto, i.dso, i.dio, i.dpo);
    const incremental = r2(ct - previo);
    previo = ct;
    acumulado = r2(acumulado + incremental);
    const caja = r2(ventas * i.margenEbitda - (i.servicioDeuda[k - 1] ?? 0));
    generada = r2(generada + caja);
    const holgura = r2(i.cajaDisponible + i.deudaDisponible + generada - acumulado);
    peorSinDeuda = Math.min(peorSinDeuda, holgura - i.deudaDisponible);
    if (holgura < peor) peor = holgura;
    if (holgura < 0 && mesFalta === null) mesFalta = k;
    filas.push({ mes: k, ventas, capitalTrabajo: ct, incremental, acumulado, cajaGenerada: caja, cajaGeneradaAcumulada: generada, holgura });
  }
  return {
    filas,
    capitalTrabajoHoy: hoy,
    requerido: acumulado,
    cajaGenerada: generada,
    alcanzaSinDeuda: peorSinDeuda >= 0,
    alcanza: peor >= 0,
    falta: peor < 0 ? r2(-peor) : 0,
    mesFalta,
    ciclo: r2(i.dio + i.dso - i.dpo),
  };
}

/** Lee días (0 a 720) escritos en un campo; vacío o inválido = null. */
export function leerDias(v: unknown): number | null {
  const s = String(v ?? "").trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 720 ? Math.round(n * 10) / 10 : null;
}
