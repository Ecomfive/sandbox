// Fórmulas de la nómina, tal como las usan los Excel de Majo (PLANILLA_FORMAL_PANAMA.xlsx y NOMINA_EXTRANJERA.xlsx).
// Lógica pura: sirve para recalcular cada fila al importar y avisar de las que no cuadran. Prueba en `calculos.test.ts`.
//
// Planilla formal (hoja de cada mes, guía rápida y hoja CALCULOS):
//   hora rata         = salario mensual ÷ horas del mes (45 h × 4,3333 semanas = 194,9985; algunas filas usan 195)
//   pago por día      = 7,5 × hora rata · pago por semana = 45 × hora rata
//   devengado         = hora rata × horas trabajadas (97,5 h por quincena)
//   horas extra       = horas × hora rata × 1,25
//   hora extra feriado= horas × hora rata × 1,5
//   tardanza          = (minutos ÷ 60) × hora rata
//   ausencia          = días × pago por día (o, si viene en horas, horas × hora rata)
//   total asignaciones= devengado + extras + feriado + extras en feriado + bono − tardanza − ausencia − descuento aplicado
//   Seguro Social     = 9,75 % del total · Seguro Educativo = 1,25 % del total (solo a quien cotiza)
//   neto              = total − Seguro Social − Seguro Educativo
// Política de la hoja CALCULOS: hasta 15 minutos de tardanza no se descuentan (desde el 16 se descuentan todos) y los
// primeros 15 minutos después de la salida no son hora extra.
//
// Nómina externa (USDT): hora normal = sueldo ÷ 26 días ÷ 9 horas; monto horas extra = horas × hora normal;
// total = sueldo + horas extra + bono.

export const TASA_SEGURO_SOCIAL = 0.0975;
export const TASA_SEGURO_EDUCATIVO = 0.0125;
export const RECARGO_HORA_EXTRA = 1.25;
export const RECARGO_FERIADO = 1.5;
export const HORAS_DIA = 7.5;
export const HORAS_SEMANA = 45;
export const SEMANAS_MES = 4.3333;
export const HORAS_MES = HORAS_SEMANA * SEMANAS_MES;
export const TOLERANCIA_MINUTOS = 15;
export const DIAS_MES_EXTERNA = 26;
export const HORAS_DIA_EXTERNA = 9;
/** Diferencia que se acepta al comparar con el Excel (redondeo a centavos). */
export const TOLERANCIA_CUADRE = 0.011;

const r2 = (v: number) => Math.round(v * 100) / 100;

export function horaRata(salarioMensual: number, horasMes: number = HORAS_MES): number {
  return horasMes > 0 ? salarioMensual / horasMes : 0;
}

/** Minutos de tardanza que se descuentan: hasta 15 no se descuentan; desde el 16, todos. */
export function minutosTardanzaADescontar(minutos: number): number {
  return minutos > TOLERANCIA_MINUTOS ? minutos : 0;
}

/** Minutos de hora extra: lo que se quedó después de la salida menos los primeros 15 (52 minutos → 37). */
export function minutosHoraExtra(minutosDespuesDeSalida: number): number {
  return Math.max(0, minutosDespuesDeSalida - TOLERANCIA_MINUTOS);
}

export interface EntradaFormal {
  salarioMensual: number;
  /** Horas del mes con que se saca la hora rata (194,9985 o 195). */
  horasMes: number;
  horasTrabajadas: number;
  horasExtra: number;
  /** Tardanza ya convertida a horas. */
  tardanzaHoras: number;
  ausenciaDias: number;
  /** Ausencia anotada en horas (algunas quincenas la anotan así). */
  ausenciaHoras: number;
  /** Monto del feriado trabajado (el Excel lo arma a mano: 1,5 × pago por día, 5,5 h × 1,5…). */
  montoFeriado: number;
  horasExtraFeriado: number;
  /** Monto de horas extra en feriado cuando el Excel no trae las horas. */
  montoHorasExtraFeriado: number;
  bono: number;
  /** «Descuento aplicado» (adelantos, préstamos…). */
  descuentoAplicado: number;
  /** El descuento aplicado se resta del total antes de los seguros (true) o del neto (false). */
  descuentoAntesDeSeguros: boolean;
  /** Si cotiza Seguro Social y Educativo. */
  aplicaSeguros: boolean;
}

export interface CalculoFormal {
  horaRata: number;
  pagoDia: number;
  devengado: number;
  montoHorasExtra: number;
  montoHorasExtraFeriado: number;
  descuentoTardanza: number;
  descuentoAusencia: number;
  totalBruto: number;
  seguroSocial: number;
  seguroEducativo: number;
  neto: number;
}

export function calcularFormal(e: EntradaFormal): CalculoFormal {
  const rata = horaRata(e.salarioMensual, e.horasMes);
  const pagoDia = HORAS_DIA * rata;
  const devengado = rata * e.horasTrabajadas;
  const montoHorasExtra = e.horasExtra * rata * RECARGO_HORA_EXTRA;
  const montoHorasExtraFeriado = e.horasExtraFeriado > 0 ? e.horasExtraFeriado * rata * RECARGO_FERIADO : e.montoHorasExtraFeriado;
  const descuentoTardanza = e.tardanzaHoras * rata;
  const descuentoAusencia = e.ausenciaDias * pagoDia + e.ausenciaHoras * rata;
  const antes = e.descuentoAntesDeSeguros ? e.descuentoAplicado : 0;
  const totalBruto =
    devengado + montoHorasExtra + e.montoFeriado + montoHorasExtraFeriado + e.bono - descuentoTardanza - descuentoAusencia - antes;
  const seguroSocial = e.aplicaSeguros ? totalBruto * TASA_SEGURO_SOCIAL : 0;
  const seguroEducativo = e.aplicaSeguros ? totalBruto * TASA_SEGURO_EDUCATIVO : 0;
  const neto = totalBruto - seguroSocial - seguroEducativo - (e.descuentoAntesDeSeguros ? 0 : e.descuentoAplicado);
  return {
    horaRata: rata,
    pagoDia,
    devengado: r2(devengado),
    montoHorasExtra: r2(montoHorasExtra),
    montoHorasExtraFeriado: r2(montoHorasExtraFeriado),
    descuentoTardanza: r2(descuentoTardanza),
    descuentoAusencia: r2(descuentoAusencia),
    totalBruto: r2(totalBruto),
    seguroSocial: r2(seguroSocial),
    seguroEducativo: r2(seguroEducativo),
    neto: r2(neto),
  };
}

export interface EntradaExterna {
  sueldo: number;
  horasExtra: number;
  /** La hora normal del Excel; sin ella, sueldo ÷ 26 ÷ 9. */
  horaNormal: number | null;
  bono: number;
}

export function horaNormalExterna(sueldo: number): number {
  return sueldo / DIAS_MES_EXTERNA / HORAS_DIA_EXTERNA;
}

export function calcularExterna(e: EntradaExterna): { horaNormal: number; montoHorasExtra: number; total: number } {
  const horaNormal = e.horaNormal ?? horaNormalExterna(e.sueldo);
  const montoHorasExtra = e.horasExtra * horaNormal;
  return { horaNormal, montoHorasExtra: r2(montoHorasExtra), total: r2(e.sueldo + montoHorasExtra + e.bono) };
}

export const cuadra = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA_CUADRE;
