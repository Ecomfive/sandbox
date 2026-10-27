// Fechas del portal del proveedor como texto «AAAA-MM-DD» (sin horas: los plazos son en días corridos). Lógica pura.

/** Días de `desde` a `hasta` (negativo si `hasta` es antes). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(hasta.slice(0, 10)) - Date.parse(desde.slice(0, 10))) / 864e5);
}

/** La fecha `dias` días corridos después de `fecha`. */
export function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(fecha.slice(0, 10)) + dias * 864e5).toISOString().slice(0, 10);
}

/** El día (AAAA-MM-DD) y la hora (HH:MM) en Panamá de un momento guardado con zona horaria. */
export const diaPanama = (momento: string) => new Date(momento).toLocaleDateString("en-CA", { timeZone: "America/Panama" });
export const horaPanama = (momento: string) => new Date(momento).toLocaleTimeString("en-GB", { timeZone: "America/Panama", hour: "2-digit", minute: "2-digit" });

/** Hoy en Panamá. */
export const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
