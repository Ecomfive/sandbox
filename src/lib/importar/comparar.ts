// «Comparar con lo cargado antes de aplicar» en todos los importadores (antes solo el libro). Lógica pura: lleva lo leído
// de cada archivo y lo guardado en la base a la misma forma (`FilaComparable`: mes, descripción, tienda y monto) para
// compararlos con `compararLibro`, que ya empareja por huella y, si la huella cambió con el contenido, por segunda vez
// (mismo mes + descripción y monto…). Qué se lee de la base y con qué alcance lo decide `ALCANCE_COMPARAR`: el mismo que
// usa la carga para borrar lo que ya no vino (archivo, hojas). Ventas y conciliación no borran al cargar: se comparan solo
// las huellas del archivo. Prueba en `comparar.test.ts`.

import type { FilaComparable } from "@/lib/finanzas/comparar-libro";
import type { ModuloImportable } from "./reconocer";

/** Huellas por llamada (alcance «claves»): el navegador manda el archivo en tandas. */
export const MAX_CLAVES_COMPARAR = 1000;

export type ModuloComparable = Exclude<ModuloImportable, "libro-movimientos">;

export interface TablaComparar {
  tabla: string;
  clave: "origen_clave" | "huella";
  /** Columnas a leer (sin la clave). */
  columnas: string;
  /** Alcance: lo de ese archivo (`origen` = archivo), lo de esas hojas, o solo las huellas del archivo. */
  alcance: "archivo" | "hojas_cartera" | "archivo_hojas" | "claves";
  filtro?: Record<string, string>;
  /** Una fila de la base en la forma de la comparación. */
  fila: (r: Record<string, unknown>) => FilaComparable;
}

const t = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown) => Number(v ?? 0) || 0;
const unidad = (v: unknown) => t((Array.isArray(v) ? v[0] : (v as { nombre?: string } | null))?.nombre);
const fecha = (v: unknown) => t(v).slice(0, 10);

/** La forma común de una fila (lo que no se compara queda vacío). */
export function comparable(clave: string, periodo: string, descripcion: string, tienda: string, monto: number, editado = false): FilaComparable {
  return {
    clave,
    periodo: periodo ? `${periodo.slice(0, 7)}-01` : "",
    fecha_pago: periodo || null,
    fecha_servicio: null,
    tienda,
    tipo: null,
    descripcion,
    monto: Math.round(monto * 100) / 100,
    cuenta: null,
    en_eerr: true,
    en_flujo: true,
    factura_numero: null,
    ruc_proveedor: null,
    ...(editado ? { editado: true } : {}),
  };
}

const cartera = (clase: "cobrar" | "pagar"): TablaComparar => ({
  tabla: "fin_cartera",
  clave: "origen_clave",
  columnas: "fecha, contraparte, documento, monto, editado_a_mano, fin_unidades(nombre)",
  alcance: "hojas_cartera",
  filtro: { clase, origen: "excel" },
  fila: (r) => comparable(t(r.origen_clave), fecha(r.fecha), docCartera(t(r.documento), t(r.contraparte)), unidad(r.fin_unidades), n(r.monto), r.editado_a_mano === true),
});

export const docCartera = (documento: string | null, contraparte: string) => (documento ? `${documento} · ${contraparte}` : contraparte);

export const TABLAS_COMPARAR: Record<ModuloComparable, TablaComparar[]> = {
  "cuentas-por-cobrar": [cartera("cobrar")],
  "cuentas-por-pagar": [cartera("pagar")],
  "bienes-de-uso": [
    {
      tabla: "fin_bienes_uso",
      clave: "origen_clave",
      columnas: "fecha_alta, descripcion, importe, editado_a_mano",
      alcance: "archivo",
      fila: (r) => comparable(t(r.origen_clave), fecha(r.fecha_alta), t(r.descripcion), "", n(r.importe), r.editado_a_mano === true),
    },
  ],
  "costos-mercancia": [
    {
      tabla: "fin_costos_lotes",
      clave: "origen_clave",
      columnas: "fecha_llegada, producto, linea, costo_total",
      alcance: "archivo_hojas",
      fila: (r) => comparable(t(r.origen_clave), fecha(r.fecha_llegada), t(r.producto), t(r.linea), n(r.costo_total)),
    },
  ],
  nomina: [
    {
      tabla: "nom_lineas",
      clave: "origen_clave",
      columnas: "periodo, tramo, neto, editado_a_mano, nom_personas(nombre), fin_unidades(nombre)",
      alcance: "archivo",
      fila: (r) => comparable(t(r.origen_clave), fecha(r.periodo), lineaNomina(unidad(r.nom_personas), t(r.tramo)), unidad(r.fin_unidades), n(r.neto), r.editado_a_mano === true),
    },
  ],
  "ventas-tiendas": [
    {
      tabla: "ven_ordenes",
      clave: "origen_clave",
      columnas: "fecha, numero, total, fin_unidades(nombre)",
      alcance: "claves",
      fila: (r) => comparable(t(r.origen_clave), fecha(r.fecha), `Orden ${t(r.numero)}`, unidad(r.fin_unidades), n(r.total)),
    },
  ],
  deliverys: [
    {
      tabla: "del_entregas",
      clave: "origen_clave",
      columnas: "fecha, etiqueta, orden, monto, fin_unidades(nombre)",
      alcance: "archivo",
      fila: (r) => comparable(t(r.origen_clave), fecha(r.fecha), t(r.etiqueta), unidad(r.fin_unidades), n(r.monto)),
    },
  ],
  "conciliacion-bancaria": [
    {
      tabla: "conc_fuentes_cobro",
      clave: "huella",
      columnas: "fecha, fuente, referencia, lote, orden, tienda, monto_bruto",
      alcance: "claves",
      fila: (r) => comparable(t(r.huella), fecha(r.fecha), cobroConciliacion(t(r.referencia) || t(r.lote) || t(r.orden)), t(r.tienda), n(r.monto_bruto)),
    },
    {
      tabla: "conc_ordenes",
      clave: "huella",
      columnas: "fecha, numero, tienda, monto",
      alcance: "claves",
      fila: (r) => comparable(t(r.huella), fecha(r.fecha), `Orden ${t(r.numero)}`, t(r.tienda), n(r.monto)),
    },
  ],
};

export const esModuloComparable = (m: unknown): m is ModuloComparable => typeof m === "string" && m in TABLAS_COMPARAR;

export const lineaNomina = (nombre: string, tramo: string) => [nombre, tramo].filter(Boolean).join(" · ");
export const cobroConciliacion = (ref: string) => (ref ? `Cobro ${ref}` : "Cobro");

/** Para la nómina, la tienda vacía de la línea es la de la persona: no se compara (la base guarda la de la línea). */
export function igualarTiendaVacia(archivo: FilaComparable[], base: FilaComparable[]): FilaComparable[] {
  const porClave = new Map(base.map((b) => [b.clave, b.tienda]));
  return archivo.map((a) => (a.tienda ? a : { ...a, tienda: porClave.get(a.clave) ?? "" }));
}

/** Las huellas en tandas para leerlas de la base sin pasar el tamaño de una petición. */
export function enTandas<T>(xs: T[], tamano: number): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < xs.length; i += tamano) salida.push(xs.slice(i, i + tamano));
  return salida;
}
