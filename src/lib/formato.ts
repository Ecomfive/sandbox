const MONEDA_POR_PAIS: Record<string, { locale: string; currency: string }> = {
  CR: { locale: "es-CR", currency: "CRC" },
  PA: { locale: "es-PA", currency: "USD" },
};

/** 9520682 -> "₡9.520.682,00" (CR) o "$9,520,682.00" (PA), según el país. */
export function formatearMoneda(valor: number, codigoPais: string): string {
  const config = MONEDA_POR_PAIS[codigoPais] ?? MONEDA_POR_PAIS.PA;
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-09-17" -> "17 sep 2026". Sin pasar por Date, evita corrimientos de zona horaria. */
export function formatearFecha(fechaIso: string): string {
  const [anio, mes, dia] = fechaIso.slice(0, 10).split("-");
  const mesTexto = MESES_CORTOS[Number(mes) - 1] ?? mes;
  return `${Number(dia)} ${mesTexto} ${anio}`;
}

/** "2026-09-01" (o cualquier fecha de ese mes) -> "sep 2026", para periodos mensuales. */
export function formatearMes(fechaIso: string): string {
  const [anio, mes] = fechaIso.slice(0, 10).split("-");
  const mesTexto = MESES_CORTOS[Number(mes) - 1] ?? mes;
  return `${mesTexto} ${anio}`;
}

/** "2026-09-17T12:25:05" -> "17 sep 2026, 12:25". */
export function formatearFechaHora(fechaHoraIso: string | null): string {
  if (!fechaHoraIso) return "—";
  const [fecha, hora] = fechaHoraIso.split("T");
  if (!fecha) return "—";
  if (!hora) return formatearFecha(fecha);
  return `${formatearFecha(fecha)}, ${hora.slice(0, 5)}`;
}

/** Para timestamptz reales (con zona horaria), como "cuándo se subió este archivo". */
export function formatearFechaHoraCompleta(isoConZona: string, codigoPais: string): string {
  const locale = MONEDA_POR_PAIS[codigoPais]?.locale ?? "es-PA";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoConZona));
}
