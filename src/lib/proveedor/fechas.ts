// Fechas del portal del proveedor como texto «AAAA-MM-DD» (sin horas: los plazos son en días corridos). Lógica pura.

/** Días de `desde` a `hasta` (negativo si `hasta` es antes). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta.slice(0, 10)) - Date.parse(desde.slice(0, 10))) / 864e5);
}

/** La fecha `dias` días corridos después de `fecha`. */
export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(fecha.slice(0, 10)) + dias * 864e5).toISOString().slice(0, 10);
}

/** Hoy en Panamá. */
export const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
