// Respaldo semanal de los datos financieros fuera de las tablas (mejora 100): cada tabla `fin_*`, `nom_*`, `ven_*`,
// `conc_*`, `del_*` y `cli_*` va a un JSON comprimido en el bucket privado `respaldos-finanzas` (migración 0937), en una
// carpeta por fecha: `AAAA-MM-DD/<tabla>.json.gz`. Se conservan las últimas N carpetas. Lógica pura; la tarea vive en
// `respaldar-finanzas.ts`. Prueba en `respaldo.test.ts`.

export const BUCKET_RESPALDOS = "respaldos-finanzas";
export const CONSERVAR_PREDETERMINADO = 8;

/** Las tablas que se respaldan, de las más chicas a las más grandes (si se acaba el tiempo, lo grande sigue después). */
export const TABLAS_RESPALDO = [
  "fin_config",
  "fin_entidades",
  "fin_unidades",
  "fin_tipos",
  "fin_cuentas",
  "fin_reglas",
  "fin_socios",
  "fin_participaciones",
  "fin_retiros_socio",
  "fin_saldos_iniciales",
  "fin_tipos_cambio_mes",
  "fin_base_distribucion",
  "fin_bienes_uso",
  "fin_cartera",
  "fin_cartera_abonos",
  "fin_cierres",
  "fin_cierre_tareas",
  "fin_costos_lotes",
  "fin_costos_mapeo",
  "fin_presupuestos",
  "fin_presupuesto_lineas",
  "fin_proyeccion_ajustes",
  "fin_proyeccion_fotos",
  "fin_alertas",
  "fin_comentarios",
  "fin_informes_versiones",
  "fin_paquetes_bancarios",
  "fin_informes_envios",
  "fin_informes_explicacion",
  "fin_dropi_mensual",
  "fin_shopify_estado",
  "fin_movimientos",
  "nom_personas",
  "nom_periodos",
  "nom_lineas",
  "del_repartidores",
  "del_transportistas",
  "del_tiendas",
  "del_cierres",
  "del_recibos",
  "del_entregas",
  "conc_fuentes_cobro",
  "conc_extractos",
  "conc_pares",
  "conc_ordenes",
  "conc_lineas",
  "cli_clientes",
  "cli_cliente_ordenes",
  "ven_productos_mapeo",
  "ven_ordenes",
  "ven_ordenes_clientes",
  "ven_orden_lineas",
] as const;

/** Las tablas cuya llave no es `id`: se leen ordenadas por estas columnas (para paginar sin saltos). */
export const ORDEN_TABLA: Record<string, string[]> = {
  fin_config: ["clave"],
  fin_base_distribucion: ["periodo", "unidad_id"],
  fin_cierre_tareas: ["cierre_id", "clave"],
  fin_informes_explicacion: ["periodo"],
  fin_dropi_mensual: ["origen_clave"],
  fin_shopify_estado: ["tienda"],
  ven_orden_lineas: ["orden_id", "linea"],
  ven_ordenes_clientes: ["orden_id"],
  ven_productos_mapeo: ["producto_clave"],
};

export const ordenDe = (tabla: string) => ORDEN_TABLA[tabla] ?? ["id"];

/** ¿Es una tabla que se puede respaldar? (la lista fija, nunca lo que mande el navegador). */
export const esTablaRespaldo = (v: unknown): v is (typeof TABLAS_RESPALDO)[number] => typeof v === "string" && (TABLAS_RESPALDO as readonly string[]).includes(v);

export const rutaArchivo = (carpeta: string, tabla: string) => `${carpeta}/${tabla}.json.gz`;

/** La carpeta de un respaldo (la fecha de Panamá). */
export const esCarpetaRespaldo = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Una ruta de archivo de respaldo válida (carpeta con fecha y una tabla de la lista). */
export function rutaValida(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const m = v.match(/^(\d{4}-\d{2}-\d{2})\/([a-z_]+)\.json\.gz$/);
  return !!m && esTablaRespaldo(m[2]);
}

/** Las carpetas que sobran: todas menos las `conservar` más nuevas. */
export function carpetasABorrar(carpetas: string[], conservar: number): string[] {
  const n = Math.max(1, Math.min(52, Math.floor(conservar) || CONSERVAR_PREDETERMINADO));
  return [...new Set(carpetas.filter(esCarpetaRespaldo))].sort().reverse().slice(n);
}

/** Lo que le falta respaldar a una ejecución: las tablas de la lista que todavía no están. */
export function tablasPendientes(hechas: string[]): string[] {
  const listas = new Set(hechas);
  return TABLAS_RESPALDO.filter((t) => !listas.has(t));
}
