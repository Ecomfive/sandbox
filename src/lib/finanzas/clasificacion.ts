// Clasificar movimientos del libro: reglas por descripción y sugerencias aprendidas de lo ya clasificado.
// Lógica pura (sin Supabase): la usan la importación, la bandeja «Por clasificar» y sus acciones. Prueba en
// `clasificacion.test.ts`.

/** Mayúsculas, sin acentos, solo letras, números y espacios simples: así se comparan descripciones y patrones. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * La «firma» de una descripción para aprender: sus primeras `n` palabras sin números (referencias, fechas y montos
 * cambian en cada movimiento; «COMISION TRANSACCIONES YAPPY 1234» y «… 9876» son lo mismo).
 */
export function firma(descripcion: string, n = 3): string {
  const palabras = normalizar(descripcion)
    .split(" ")
    .filter((p) => p && !/\d/.test(p) && !VACIAS.has(p))
    .slice(0, n);
  // Una firma de puras letras sueltas («I T») no dice nada: no se aprende de ella.
  return palabras.some((p) => p.length >= 3) ? palabras.join(" ") : "";
}

/** Palabras que no distinguen un movimiento de otro («Compra EN comercio DE …»). */
const VACIAS = new Set(["EN", "DE", "DEL", "LA", "EL", "LOS", "LAS", "A", "AL", "Y", "POR", "PARA", "CON"]);

export interface Regla {
  id: string;
  patron: string;
  unidad_id: string | null;
  tipo_id: string | null;
  activo: boolean;
}

/**
 * La regla que corresponde a una descripción: la activa cuyo patrón aparece en ella; si hay varias, la del patrón más
 * largo (la más específica). null si ninguna.
 */
export function reglaPara(descripcion: string, reglas: Regla[]): Regla | null {
  const d = ` ${normalizar(descripcion)} `;
  let mejor: Regla | null = null;
  for (const r of reglas) {
    if (!r.activo) continue;
    const p = normalizar(r.patron);
    // Palabras completas: «YAPPY» calza con «COMISION YAPPY 12», no con «YAPPYS».
    if (p.length < 3 || !d.includes(` ${p} `)) continue;
    if (!mejor || p.length > normalizar(mejor.patron).length) mejor = r;
  }
  return mejor;
}

export interface Clasificado {
  descripcion: string;
  unidad_id: string;
  tipo_id: string;
}

export interface Aprendizaje {
  tipo: Map<string, { id: string; veces: number; de: number }>;
  unidad: Map<string, { id: string; veces: number; de: number }>;
}

/** Mínimo de veces y de coincidencia para que una firma se vuelva sugerencia (90 %: casi siempre fue lo mismo). */
export const MIN_VECES = 3;
export const MIN_ACUERDO = 0.9;

/**
 * Aprende de los movimientos ya clasificados qué tipo y qué tienda suelen tener las descripciones con la misma firma.
 * `sinTienda` es el id de la unidad «SIN ASIGNAR», que no se aprende como tienda.
 */
export function aprender(clasificados: Clasificado[], sinTienda: string | null): Aprendizaje {
  const conteo = (campo: "tipo_id" | "unidad_id") => {
    const porFirma = new Map<string, Map<string, number>>();
    for (const c of clasificados) {
      const v = c[campo];
      if (!v || (campo === "unidad_id" && v === sinTienda)) continue;
      const f = firma(c.descripcion);
      if (!f) continue;
      const m = porFirma.get(f) ?? new Map<string, number>();
      m.set(v, (m.get(v) ?? 0) + 1);
      porFirma.set(f, m);
    }
    const salida = new Map<string, { id: string; veces: number; de: number }>();
    for (const [f, m] of porFirma) {
      const de = [...m.values()].reduce((a, b) => a + b, 0);
      const [id, veces] = [...m].sort((a, b) => b[1] - a[1])[0];
      if (veces >= MIN_VECES && veces / de >= MIN_ACUERDO) salida.set(f, { id, veces, de });
    }
    return salida;
  };
  return { tipo: conteo("tipo_id"), unidad: conteo("unidad_id") };
}

export interface Sugerencia {
  unidad_id: string | null;
  tipo_id: string | null;
  /** De dónde sale: una regla (más fuerte) o lo aprendido del historial. */
  origen: "regla" | "historial" | null;
  regla_id: string | null;
  /** «12 de 12 veces» para lo aprendido. */
  detalle: string | null;
}

/**
 * Qué falta completar de un movimiento pendiente y con qué. Solo propone lo que falta: una tienda ya asignada o un tipo
 * ya puesto no se tocan. Primero manda una regla; lo que la regla no dice se completa con lo aprendido.
 */
export function sugerir(
  mov: { descripcion: string; unidad_id: string; tipo_id: string | null },
  sinTienda: string | null,
  reglas: Regla[],
  aprendido: Aprendizaje,
): Sugerencia {
  const faltaTienda = mov.unidad_id === sinTienda;
  const faltaTipo = !mov.tipo_id;
  const vacia: Sugerencia = { unidad_id: null, tipo_id: null, origen: null, regla_id: null, detalle: null };
  if (!faltaTienda && !faltaTipo) return vacia;
  const s = { ...vacia };
  const regla = reglaPara(mov.descripcion, reglas);
  if (regla) {
    if (faltaTienda && regla.unidad_id) s.unidad_id = regla.unidad_id;
    if (faltaTipo && regla.tipo_id) s.tipo_id = regla.tipo_id;
    if (s.unidad_id || s.tipo_id) {
      s.origen = "regla";
      s.regla_id = regla.id;
      s.detalle = `Regla «${regla.patron}»`;
    }
  }
  const f = firma(mov.descripcion);
  const detalles: string[] = [];
  if (faltaTipo && !s.tipo_id) {
    const a = aprendido.tipo.get(f);
    if (a) {
      s.tipo_id = a.id;
      detalles.push(`tipo ${a.veces} de ${a.de} veces`);
    }
  }
  if (faltaTienda && !s.unidad_id) {
    const a = aprendido.unidad.get(f);
    if (a) {
      s.unidad_id = a.id;
      detalles.push(`tienda ${a.veces} de ${a.de} veces`);
    }
  }
  if (detalles.length) {
    s.origen ??= "historial";
    s.detalle = [s.detalle, `Como antes: ${detalles.join(", ")}`].filter(Boolean).join(" · ");
  }
  return s;
}
