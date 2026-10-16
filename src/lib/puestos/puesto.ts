// Equipo › Puestos: lo que se valida de la ficha de un puesto. Lógica pura (sin base), con prueba en puesto.test.ts.

/** Las áreas de la empresa a las que pertenece un puesto (lista fija; una nueva se agrega aquí). */
export const AREAS_PUESTO = ["Dirección", "Marketing", "Ventas", "Operaciones", "Logística", "Administración y Finanzas"] as const;
export type AreaPuesto = (typeof AREAS_PUESTO)[number];

/** Las etapas del onboarding; `null` = de consulta (no es parte del onboarding). */
export const ETAPAS = [30, 60, 90] as const;
export type Etapa = (typeof ETAPAS)[number];
export const ETIQUETA_ETAPA: Record<Etapa, string> = { 30: "Día 30", 60: "Día 60", 90: "Día 90" };

export const MAX_KRA = 6;
export const LARGO = { nombre: 120, mision: 600, texto: 8000, kra: 120 } as const;

export interface DatosPuesto {
  nombre: string;
  area: AreaPuesto;
  reportaA: string | null;
  plazas: number;
  mision: string;
  responsabilidades: string;
  autoridad: string;
  kra: string[];
}

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = (v: unknown): v is string => typeof v === "string" && ES_UUID.test(v);

const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** Las áreas de resultado: sin vacías ni repetidas (sin mayúsculas ni espacios), hasta `MAX_KRA`. */
export function limpiarKra(lista: unknown): string[] {
  const valores = Array.isArray(lista) ? lista : typeof lista === "string" ? lista.split("\n") : [];
  const vistos = new Set<string>();
  const salida: string[] = [];
  for (const v of valores) {
    const t = texto(v, LARGO.kra).replace(/\s+/g, " ");
    const llave = t.toLowerCase();
    if (!t || vistos.has(llave)) continue;
    vistos.add(llave);
    salida.push(t);
  }
  return salida;
}

/** Valida lo que llega del formulario. `id` es el del puesto que se edita (no puede reportarse a sí mismo). */
export function validarPuesto(entrada: Record<string, unknown>, id?: string): DatosPuesto | { error: string } {
  const nombre = texto(entrada.nombre, LARGO.nombre).replace(/\s+/g, " ");
  if (!nombre) return { error: "Falta el nombre del puesto." };
  const area = AREAS_PUESTO.find((a) => a === entrada.area);
  if (!area) return { error: "Elige el área del puesto." };
  const reporta = texto(entrada.reporta_a, 64);
  if (reporta && !esUuid(reporta)) return { error: "El puesto al que reporta no es válido." };
  if (reporta && reporta === id) return { error: "Un puesto no puede reportarse a sí mismo." };
  const plazas = Number(entrada.plazas ?? 1);
  if (!Number.isInteger(plazas) || plazas < 1 || plazas > 99) return { error: "Las plazas van de 1 a 99." };
  const kra = limpiarKra(entrada.kra);
  if (kra.length > MAX_KRA) return { error: `Un puesto tiene como máximo ${MAX_KRA} áreas de resultado.` };
  return {
    nombre,
    area,
    reportaA: reporta || null,
    plazas,
    mision: texto(entrada.mision, LARGO.mision),
    responsabilidades: texto(entrada.responsabilidades, LARGO.texto),
    autoridad: texto(entrada.autoridad, LARGO.texto),
    kra,
  };
}

/** Lee una etapa (30, 60, 90) o `null` = de consulta. */
export function leerEtapa(v: unknown): Etapa | null {
  const n = Number(v);
  return (ETAPAS as readonly number[]).includes(n) ? (n as Etapa) : null;
}
