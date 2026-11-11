// «Deshacer» una importación y reconocer qué filas creó, en todos los importadores (libro, cartera, bienes de uso, costos,
// nómina, ventas, deliverys y conciliación; migraciones 0925 y 0953). Lógica pura: qué tablas escribe cada importador, con
// qué huella, qué columnas dicen su mes (un mes cerrado no se toca), si la fila puede estar corregida a mano y qué la
// protege (un cierre de repartidor ya hecho, una línea de banco ya conciliada, un documento con abonos del portal).
// Lo usa `bitacora-actions.ts`. Prueba en `deshacer.test.ts`.

import type { ModuloImportable } from "./reconocer";

export interface TablaImportada {
  tabla: string;
  /** La huella que hace idempotente la importación. */
  clave: "origen_clave" | "huella";
  /** Columnas de fecha o mes de la fila (si cualquiera cae en un mes cerrado, no se borra). */
  meses: string[];
  /** Tiene `editado_a_mano`: lo corregido en el portal nunca se borra. */
  editado: boolean;
  /** Filtros fijos para reconocer las filas del módulo (la cartera guarda cobrar y pagar en la misma tabla). */
  filtro?: Record<string, string>;
  /** Una fila con este valor en esta columna no se borra (null = la columna debe estar vacía para borrar). */
  protegerSi?: { columna: string; borrarSolo: string | null; motivo: string };
  /** No se borra si tiene hijos en otra tabla (con un filtro opcional). */
  protegerConHijos?: { tabla: string; columna: string; filtro?: Record<string, string>; motivo: string };
  /** El libro pone `importacion_id` al insertar; los demás se marcan al cerrar la bitácora por su fecha de creación. */
  marcaAlInsertar?: boolean;
}

export const TABLAS_IMPORTADAS: Record<ModuloImportable, TablaImportada[]> = {
  "libro-movimientos": [{ tabla: "fin_movimientos", clave: "origen_clave", meses: ["periodo", "fecha_pago"], editado: true, marcaAlInsertar: true }],
  "cuentas-por-cobrar": [
    {
      tabla: "fin_cartera",
      clave: "origen_clave",
      meses: ["fecha"],
      editado: true,
      filtro: { clase: "cobrar" },
      protegerConHijos: { tabla: "fin_cartera_abonos", columna: "documento_id", filtro: { origen: "manual" }, motivo: "con abonos registrados en el portal" },
    },
  ],
  "cuentas-por-pagar": [
    {
      tabla: "fin_cartera",
      clave: "origen_clave",
      meses: ["fecha"],
      editado: true,
      filtro: { clase: "pagar" },
      protegerConHijos: { tabla: "fin_cartera_abonos", columna: "documento_id", filtro: { origen: "manual" }, motivo: "con abonos registrados en el portal" },
    },
  ],
  "bienes-de-uso": [{ tabla: "fin_bienes_uso", clave: "origen_clave", meses: ["fecha_alta"], editado: true }],
  "costos-mercancia": [{ tabla: "fin_costos_lotes", clave: "origen_clave", meses: [], editado: false }],
  nomina: [{ tabla: "nom_lineas", clave: "origen_clave", meses: ["periodo"], editado: true }],
  "ventas-tiendas": [{ tabla: "ven_ordenes", clave: "origen_clave", meses: ["periodo"], editado: false }],
  deliverys: [
    { tabla: "del_entregas", clave: "origen_clave", meses: ["fecha"], editado: false, protegerSi: { columna: "cierre_id", borrarSolo: null, motivo: "de semanas ya cerradas con el repartidor" } },
  ],
  "conciliacion-bancaria": [
    { tabla: "conc_lineas", clave: "huella", meses: ["fecha"], editado: false, protegerSi: { columna: "estado", borrarSolo: "pendiente", motivo: "ya conciliadas o revisadas" } },
    { tabla: "conc_fuentes_cobro", clave: "huella", meses: ["fecha"], editado: false, protegerConHijos: { tabla: "conc_pares", columna: "cobro_id", motivo: "ya emparejados" } },
    { tabla: "conc_ordenes", clave: "huella", meses: ["fecha"], editado: false },
  ],
};

/** Los módulos cuya importación se puede deshacer (todos los que tienen importador). */
export const MODULOS_DESHACER = Object.keys(TABLAS_IMPORTADAS) as ModuloImportable[];

export const esModuloDeshacer = (m: unknown): m is ModuloImportable => typeof m === "string" && (MODULOS_DESHACER as string[]).includes(m);

/** Una fila creada por la importación, con lo que hace falta para decidir si se borra. */
export interface FilaCreada {
  id: string;
  /** Las fechas o meses de la fila («AAAA-MM-DD»), en el orden de `meses`. */
  fechas: (string | null)[];
  editado?: boolean;
  /** El valor de la columna de `protegerSi`. */
  proteccion?: string | null;
  tieneHijos?: boolean;
}

export interface Decision {
  borrar: string[];
  conservadas: { editadas: number; enMesCerrado: number; protegidas: number };
}

const mesDe = (f: string | null) => (f && /^\d{4}-\d{2}/.test(f) ? `${f.slice(0, 7)}-01` : null);

/** Qué filas se borran: nunca lo corregido a mano, lo de un mes cerrado ni lo protegido (cierres, conciliado, abonos). */
export function decidirDeshacer(t: TablaImportada, filas: FilaCreada[], cerrados: Set<string>): Decision {
  const d: Decision = { borrar: [], conservadas: { editadas: 0, enMesCerrado: 0, protegidas: 0 } };
  for (const f of filas) {
    if (t.editado && f.editado) {
      d.conservadas.editadas++;
      continue;
    }
    if (f.fechas.some((x) => {
      const m = mesDe(x);
      return m !== null && cerrados.has(m);
    })) {
      d.conservadas.enMesCerrado++;
      continue;
    }
    const protegidaPorColumna = t.protegerSi ? (t.protegerSi.borrarSolo === null ? f.proteccion != null : f.proteccion !== t.protegerSi.borrarSolo) : false;
    if (protegidaPorColumna || (t.protegerConHijos && f.tieneHijos)) {
      d.conservadas.protegidas++;
      continue;
    }
    d.borrar.push(f.id);
  }
  return d;
}

/** Las columnas que hay que leer de cada fila creada para decidir. */
export function columnasDeshacer(t: TablaImportada): string[] {
  return [...new Set(["id", ...t.meses, ...(t.editado ? ["editado_a_mano"] : []), ...(t.protegerSi ? [t.protegerSi.columna] : [])])];
}

/** La fila leída de la base en la forma de `decidirDeshacer`. */
export function filaCreada(t: TablaImportada, r: Record<string, unknown>, conHijos: Set<string>): FilaCreada {
  const id = String(r.id);
  const p = t.protegerSi ? r[t.protegerSi.columna] : undefined;
  return {
    id,
    fechas: t.meses.map((c) => (r[c] === null || r[c] === undefined ? null : String(r[c]).slice(0, 10))),
    editado: r.editado_a_mano === true,
    proteccion: p === null || p === undefined ? null : String(p),
    tieneHijos: conHijos.has(id),
  };
}

/** El resumen de lo conservado, en una frase. */
export function textoConservadas(c: Decision["conservadas"], motivos: string[]): string {
  const partes = [
    c.editadas ? `${c.editadas} corregidas a mano` : "",
    c.enMesCerrado ? `${c.enMesCerrado} de meses cerrados` : "",
    c.protegidas ? `${c.protegidas} ${motivos.join(" o ") || "protegidas"}` : "",
  ].filter(Boolean);
  return partes.join(", ");
}

/** Suma las decisiones de varias tablas. */
export function sumarDecisiones(ds: Decision[]): Decision {
  return ds.reduce<Decision>(
    (a, d) => ({
      borrar: [...a.borrar, ...d.borrar],
      conservadas: {
        editadas: a.conservadas.editadas + d.conservadas.editadas,
        enMesCerrado: a.conservadas.enMesCerrado + d.conservadas.enMesCerrado,
        protegidas: a.conservadas.protegidas + d.conservadas.protegidas,
      },
    }),
    { borrar: [], conservadas: { editadas: 0, enMesCerrado: 0, protegidas: 0 } },
  );
}

/** Nuevas y actualizadas para la bitácora: las nuevas son las filas que la carga creó; el resto de lo guardado, actualizadas. */
export function nuevasYActualizadas(guardadas: number, creadas: number): { nuevas: number; actualizadas: number } {
  const n = Math.max(0, Math.round(creadas));
  return { nuevas: n, actualizadas: Math.max(0, Math.round(guardadas) - n) };
}
