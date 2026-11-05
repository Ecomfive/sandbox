// Gestión de IDs Dropi › Uso del sistema (5 nov 2026, pedido de Alcides y Hernán; migraciones 0226 y 0227). El objetivo es operar todo desde el
// sistema e ir a las plataformas solo para conectar algo: esto mide qué se sigue haciendo en Dropi y por qué, para arreglar lo que le falta al
// sistema. Es una vista de supervisión (módulo `uso-sistema`): quien gestiona los IDs no ve nada de esto. Sin base ni React, con prueba.

export type OrigenPublicacion = "sistema" | "dropi" | "carga_inicial";

/** Desde esta fecha los productos se crean en el sistema: lo anterior no cuenta. */
export const INICIO_USO_SISTEMA = "2026-10-24";

export const MOTIVOS_FUERA = [
  { valor: "falta_dato", etiqueta: "Al formulario le faltaba un dato" },
  { valor: "no_permite", etiqueta: "El sistema no permite eso" },
  { valor: "mas_rapido", etiqueta: "Fue más rápido en Dropi" },
  { valor: "no_sabia", etiqueta: "No sabía que se hace en el sistema" },
  { valor: "fallo", etiqueta: "El sistema falló" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

export type MotivoFuera = (typeof MOTIVOS_FUERA)[number]["valor"];
export const esMotivoFuera = (v: unknown): v is MotivoFuera => MOTIVOS_FUERA.some((m) => m.valor === v);

export type TipoAlta = "nuevo" | "republicacion" | "privatizacion";

export const TIPOS_ALTA: { valor: TipoAlta; etiqueta: string }[] = [
  { valor: "nuevo", etiqueta: "Producto nuevo" },
  { valor: "republicacion", etiqueta: "Republicación" },
  { valor: "privatizacion", etiqueta: "Privatización" },
];

/** Qué fue: lo dice la actividad de la creación; si no, una privada es una privatización y una ligada a otra publicación, una republicación. */
export function tipoDeAlta(p: { detalle: string | null; privado: boolean; relacionados: number }): TipoAlta {
  if (p.detalle && /republicada/.test(p.detalle)) return "republicacion";
  if (p.detalle && /privatizada/.test(p.detalle)) return "privatizacion";
  if (p.privado) return "privatizacion";
  return p.relacionados > 0 ? "republicacion" : "nuevo";
}

export interface AltaPublicacion {
  id: string;
  numero: number | null;
  nombre: string;
  pais: string;
  origen: "sistema" | "dropi";
  tipo: TipoAlta;
  /** Día de la creación (AAAA-MM-DD): en Dropi, el que dice Dropi. */
  fecha: string;
  /** Quién la hizo en el sistema o, si nació en Dropi, quién la pasó al sistema (Dropi no dice quién la creó). */
  persona: string | null;
  motivo: MotivoFuera | null;
  nota: string;
}

export interface Conteo {
  sistema: number;
  dropi: number;
}

const contar = (altas: AltaPublicacion[]): Conteo => ({ sistema: altas.filter((a) => a.origen === "sistema").length, dropi: altas.filter((a) => a.origen === "dropi").length });

/** Qué parte se hizo en el sistema, de 0 a 100; null si no hubo nada. */
export function porcentajeSistema(c: Conteo): number | null {
  const total = c.sistema + c.dropi;
  return total ? Math.round((c.sistema / total) * 100) : null;
}

/** El lunes de la semana de una fecha (AAAA-MM-DD). */
export function inicioSemana(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export interface ResumenUso {
  total: Conteo;
  porTipo: (Conteo & { tipo: TipoAlta })[];
  porPais: (Conteo & { pais: string })[];
  /** De la semana más reciente a la más vieja. */
  porSemana: (Conteo & { semana: string })[];
  /** Los motivos de lo hecho en Dropi, del más repetido al menos. */
  motivos: { motivo: MotivoFuera; n: number }[];
  sinMotivo: number;
}

export function resumirUso(altas: AltaPublicacion[]): ResumenUso {
  const agrupar = <K extends string>(clave: (a: AltaPublicacion) => K) => {
    const m = new Map<K, AltaPublicacion[]>();
    for (const a of altas) m.set(clave(a), [...(m.get(clave(a)) ?? []), a]);
    return [...m.entries()];
  };
  const enDropi = altas.filter((a) => a.origen === "dropi");
  return {
    total: contar(altas),
    porTipo: TIPOS_ALTA.map((t) => ({ tipo: t.valor, ...contar(altas.filter((a) => a.tipo === t.valor)) })),
    porPais: agrupar((a) => a.pais)
      .map(([pais, lista]) => ({ pais, ...contar(lista) }))
      .sort((a, b) => b.dropi - a.dropi || a.pais.localeCompare(b.pais)),
    porSemana: agrupar((a) => inicioSemana(a.fecha))
      .map(([semana, lista]) => ({ semana, ...contar(lista) }))
      .sort((a, b) => b.semana.localeCompare(a.semana)),
    motivos: MOTIVOS_FUERA.map((m) => ({ motivo: m.valor, n: enDropi.filter((a) => a.motivo === m.valor).length }))
      .filter((m) => m.n > 0)
      .sort((a, b) => b.n - a.n),
    sinMotivo: enDropi.filter((a) => !a.motivo).length,
  };
}
