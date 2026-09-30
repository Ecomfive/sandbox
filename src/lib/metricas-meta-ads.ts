/**
 * El color de cada métrica de Meta Ads se calcula del valor, no se guarda — así que basta con definir,
 * por métrica, a partir de qué número es buena (verde) o mala (rojo); lo que queda en medio es amarillo.
 * Los umbrales son los que definió el equipo de Compras para decidir cuánto pedir de cada producto.
 * Lo usan tanto Filtros como Productos Test, que comparten el mismo criterio.
 */
export type NivelMetrica = "bueno" | "medio" | "malo" | "neutral";

const CLASE_NIVEL: Record<NivelMetrica, string> = {
  bueno: "text-success",
  medio: "text-warning",
  malo: "text-destructive",
  neutral: "text-foreground",
};

export const claseMetrica = (nivel: NivelMetrica) => CLASE_NIVEL[nivel];

export const nivelCpm = (valor: number): NivelMetrica => (valor < 3 ? "bueno" : valor > 5 ? "malo" : "medio");
export const nivelEfectividad = (valor: number): NivelMetrica => (valor > 80 ? "bueno" : valor < 70 ? "malo" : "medio");
export const nivelHookRate = (valor: number): NivelMetrica => (valor > 40 ? "bueno" : valor < 30 ? "malo" : "medio");
export const nivelCtr = (valor: number): NivelMetrica => (valor < 2 ? "malo" : valor > 3 ? "bueno" : "medio");
export const nivelCpa = (valor: number): NivelMetrica => (valor < 2 ? "bueno" : valor > 4 ? "malo" : "medio");
/** Gasto solo distingue "alto" de "normal" — sin amarillo ni verde. */
export const nivelGasto = (valor: number): NivelMetrica => (valor > 24 ? "malo" : "neutral");
export const nivelCvr = (valor: number): NivelMetrica => (valor < 4 ? "malo" : valor > 9 ? "bueno" : "medio");

/** Las métricas de Meta Ads siempre vienen en dólares (así las reporta Meta), sin importar la moneda del país. */
export const dolar = (valor: number) => `$${valor.toFixed(2)}`;
export const porcentaje = (valor: number) => `${valor.toFixed(2)}%`;
