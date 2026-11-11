// Clasificación asistida de la bandeja «Por clasificar»: junta las tres fuentes de sugerencia (regla escrita por una
// persona, firma aprendida y parecido con lo ya clasificado) y le pone a cada una su confianza de 0 a 100.
// Lógica pura. Prueba en `sugerencias-confianza.test.ts`.

import { sugerir, type Aprendizaje, type Regla } from "./clasificacion";
import { sugerirPorParecido, type IndiceParecido } from "./similitud";

export type OrigenSugerencia = "regla" | "historial" | "parecido";

export interface SugerenciaConConfianza {
  unidad_id: string | null;
  tipo_id: string | null;
  origen: OrigenSugerencia | null;
  regla_id: string | null;
  detalle: string | null;
  /** La confianza de lo sugerido (la menor entre tienda y tipo cuando se sugieren los dos); null sin sugerencia. */
  confianza: number | null;
}

/** Una regla manda (la escribió una persona): 99. */
export const CONFIANZA_REGLA = 99;

/** La confianza de una firma aprendida: lo que acertó, castigado si son pocas veces (12 de 12 → 92). */
export const confianzaFirma = (veces: number, de: number) => Math.min(97, Math.round((100 * veces) / de * (1 - 1 / (veces + 2))));

/**
 * Sugerencia de un movimiento pendiente con su confianza. Primero la regla, luego la firma aprendida y, para lo que falte,
 * el parecido con lo ya clasificado (descripción y monto). Solo propone lo que falta.
 */
export function sugerirConConfianza(
  mov: { descripcion: string; monto: number; unidad_id: string; tipo_id: string | null },
  sinTienda: string | null,
  reglas: Regla[],
  aprendido: Aprendizaje,
  indice: IndiceParecido | null,
): SugerenciaConConfianza {
  const base = sugerir(mov, sinTienda, reglas, aprendido);
  const faltaTienda = mov.unidad_id === sinTienda;
  const faltaTipo = !mov.tipo_id;
  const confs: number[] = [];
  const s: SugerenciaConConfianza = { ...base, origen: base.origen, confianza: null };
  // Confianza de lo que ya puso la regla o la firma.
  if (base.origen === "regla") {
    const regla = reglas.find((r) => r.id === base.regla_id);
    if (regla?.tipo_id && base.tipo_id === regla.tipo_id) confs.push(CONFIANZA_REGLA);
    if (regla?.unidad_id && base.unidad_id === regla.unidad_id) confs.push(CONFIANZA_REGLA);
  }
  const detalleFirma = (campo: "tipo" | "tienda") => /(\d+) de (\d+) veces/.exec(base.detalle?.split(`${campo} `)[1] ?? "");
  for (const campo of ["tipo", "tienda"] as const) {
    const m = detalleFirma(campo);
    if (m) confs.push(confianzaFirma(Number(m[1]), Number(m[2])));
  }
  // Lo que falta: por parecido.
  const sinTipo = faltaTipo && !s.tipo_id;
  const sinUnidad = faltaTienda && !s.unidad_id;
  if ((sinTipo || sinUnidad) && indice) {
    const p = sugerirPorParecido(mov, indice);
    const partes: string[] = [];
    if (sinTipo && p.tipo) {
      s.tipo_id = p.tipo.id;
      confs.push(p.tipo.confianza);
      partes.push(`tipo de ${p.tipo.apoyo} parecidos`);
    }
    if (sinUnidad && p.unidad) {
      s.unidad_id = p.unidad.id;
      confs.push(p.unidad.confianza);
      partes.push(`tienda de ${p.unidad.apoyo} parecidos`);
    }
    if (partes.length) {
      s.origen ??= "parecido";
      const ejemplo = p.ejemplo ? ` («${p.ejemplo.slice(0, 40)}»)` : "";
      s.detalle = [s.detalle, `Parecido: ${partes.join(", ")}${ejemplo}`].filter(Boolean).join(" · ");
    }
  }
  s.confianza = s.tipo_id || s.unidad_id ? (confs.length ? Math.min(...confs) : null) : null;
  return s;
}
