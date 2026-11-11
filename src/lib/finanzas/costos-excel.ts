// Lectura del Excel de costos de mercancía (PRECIOS_DE_COSTE_MERCANCIA.xlsx): las hojas «MERCANCIA ECOMFIVE»,
// «MERCANCIA OFERFY» y «MERCANCIA CALZADOS» (un lote por fila: llegada, proveedor, producto, cantidad y el costo real
// unitario con comisiones, impuestos, envío y financiamiento) y la hoja «MAPEO» (nombre en Dropi → producto de costo).
// Lógica pura: sirve en el navegador y en el servidor. Prueba en `costos-excel.test.ts`.

import { normalizar } from "./clasificacion";
import { huella, leerFecha, leerMonto, type Celda } from "./libro-excel";

export interface LoteCosto {
  hoja: string;
  fila: number;
  /** ECOMFIVE, OFERFY, CALZADOS… (de qué negocio es la mercancía). */
  linea: string;
  fecha_llegada: string | null;
  mes_texto: string | null;
  proveedor: string | null;
  seguimiento: string | null;
  producto: string;
  /** El nombre con el que se agrupa: el homologado si lo hay, si no el del producto, normalizado. */
  producto_clave: string;
  codigo: string | null;
  cantidad: number | null;
  costo_unitario: number;
  comisiones: number;
  impuesto: number;
  envio: number;
  financiamiento: number;
  /** Costo real unitario (lo que dice el Excel; si no lo trae, la suma de los componentes). */
  costo_total: number;
  estatus: string | null;
  origen_clave: string;
}

export interface MapeoDropi {
  producto_dropi: string;
  producto_costo: string | null;
  producto_clave: string | null;
  estado: "mapeado" | "pendiente" | "sugerido";
  notas: string | null;
}

const texto = (v: Celda): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s && s !== "-" ? s : null;
};

const SINONIMOS: Record<string, string[]> = {
  fecha: ["FECHA DE LLEGADA", "FECHA", "HGG"],
  mes: ["MES LLEGADA", "MES"],
  proveedor: ["PROVEEDOR"],
  seguimiento: ["N DE SEGUIMIENTO", "NO DE SEGUIMIENTO"],
  homologado: ["NOMBRE HOMOLOGADO"],
  producto: ["PRODUCTO", "DESCRIPCION"],
  linea: ["TIENDA"],
  codigo: ["CODIGO"],
  cantidad: ["CANTIDAD"],
  costo_unitario: ["COSTO UNITARIO"],
  comision1: ["COMISION BANCO 1", "COMISION BANCO"],
  comision2: ["COMISION BANCO 2"],
  comision_cambio: ["COMISION CAMBIO"],
  impuesto: ["PAGO DE IMPUESTO"],
  envio: ["COSTE DE ENVIO", "COSTO ENVIO"],
  financiamiento: ["FINANCIAMIENTO"],
  costo_total: ["COSTO TOTAL", "COSTO REAL UNITARIO"],
  estatus: ["ESTATUS DE MERCANCIA PARA VENTA"],
};

/** Columna de cada campo según los títulos de la primera fila (el primer título que calce exacto). */
export function columnasCostos(titulos: Celda[]): Record<string, number> {
  const nombres = titulos.map((t) => normalizar(String(t ?? "")));
  const salida: Record<string, number> = {};
  for (const [campo, opciones] of Object.entries(SINONIMOS)) {
    for (const o of opciones) {
      const i = nombres.indexOf(normalizar(o));
      if (i >= 0 && !Object.values(salida).includes(i)) {
        salida[campo] = i;
        break;
      }
    }
  }
  return salida;
}

/** La línea de negocio por el nombre de la hoja: «MERCANCIA OFERFY» → OFERFY. */
export function lineaDeHoja(hoja: string): string {
  return normalizar(hoja).replace(/^MERCANCIA\s*/, "") || "OTRA";
}

/**
 * Lee una hoja de mercancía. En la de Ecomfive la columna CODIGO dice de qué tienda es el lote (Oferfy, ECOMFIVE…); en
 * la de Calzados es un código de producto. Se descartan las filas sin producto o sin costo (totales, vacías, #DIV/0!).
 */
export function leerLotes(filas: Celda[][], hoja: string): { lotes: LoteCosto[]; descartadas: number } {
  if (!filas.length) return { lotes: [], descartadas: 0 };
  const c = columnasCostos(filas[0]);
  const linea = lineaDeHoja(hoja);
  const codigoEsLinea = linea === "ECOMFIVE";
  const lotes: LoteCosto[] = [];
  let descartadas = 0;
  const vistas = new Map<string, number>();
  const n = (f: Celda[], campo: string) => (c[campo] === undefined ? 0 : (leerMonto(f[c[campo]]) ?? 0));
  for (let i = 1; i < filas.length; i++) {
    const f = filas[i];
    const producto = texto(c.producto !== undefined ? f[c.producto] : null);
    if (!producto) {
      if (f.some((v) => v !== null && v !== undefined && v !== "")) descartadas++;
      continue;
    }
    const costoUnitario = n(f, "costo_unitario");
    const comisiones = n(f, "comision1") + n(f, "comision2") + n(f, "comision_cambio");
    const impuesto = n(f, "impuesto");
    const envio = n(f, "envio");
    const financiamiento = n(f, "financiamiento");
    const suma = costoUnitario + comisiones + impuesto + envio + financiamiento;
    const totalExcel = c.costo_total === undefined ? null : leerMonto(f[c.costo_total]);
    const costoTotal = totalExcel && totalExcel > 0 ? totalExcel : suma;
    if (!(costoTotal > 0) || costoTotal > 100_000) {
      descartadas++;
      continue;
    }
    const homologado = texto(c.homologado !== undefined ? f[c.homologado] : null);
    const codigoCelda = texto(c.codigo !== undefined ? f[c.codigo] : null);
    const lineaFila = codigoEsLinea && codigoCelda ? normalizar(codigoCelda) : linea;
    const cantidad = c.cantidad === undefined ? null : leerMonto(f[c.cantidad]);
    const base = {
      hoja,
      fila: i + 1,
      linea: lineaFila,
      fecha_llegada: c.fecha === undefined ? null : leerFecha(f[c.fecha]),
      mes_texto: texto(c.mes !== undefined ? f[c.mes] : null),
      proveedor: texto(c.proveedor !== undefined ? f[c.proveedor] : null),
      seguimiento: texto(c.seguimiento !== undefined ? f[c.seguimiento] : null),
      producto,
      producto_clave: normalizar(homologado && homologado.length > 2 ? homologado : producto),
      codigo: codigoEsLinea ? null : codigoCelda,
      cantidad: cantidad !== null && cantidad > 0 ? cantidad : null,
      costo_unitario: redondear(costoUnitario),
      comisiones: redondear(comisiones),
      impuesto: redondear(impuesto),
      envio: redondear(envio),
      financiamiento: redondear(financiamiento),
      costo_total: redondear(costoTotal),
      estatus: texto(c.estatus !== undefined ? f[c.estatus] : null),
    };
    const contenido = [hoja, base.fecha_llegada, base.mes_texto, base.proveedor, base.producto, base.cantidad, base.costo_total].join("|");
    const ordinal = (vistas.get(contenido) ?? 0) + 1;
    vistas.set(contenido, ordinal);
    lotes.push({ ...base, origen_clave: `${huella(contenido)}#${ordinal}` });
  }
  return { lotes, descartadas };
}

const redondear = (v: number) => Math.round(v * 1_000_000) / 1_000_000;

/** La hoja MAPEO: título en la fila que dice «PRODUCTO DROPI»; las filas sin nombre de Dropi no cuentan. */
export function leerMapeo(filas: Celda[][]): MapeoDropi[] {
  const i = filas.findIndex((f) => normalizar(String(f[0] ?? "")) === "PRODUCTO DROPI");
  if (i < 0) return [];
  const vistos = new Set<string>();
  const salida: MapeoDropi[] = [];
  for (const f of filas.slice(i + 1)) {
    const dropi = texto(f[0]);
    if (!dropi || normalizar(dropi) === "PRODUCTO") continue;
    const clave = normalizar(dropi);
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    const costo = texto(f[1]);
    const estado = normalizar(String(f[2] ?? ""));
    salida.push({
      producto_dropi: dropi,
      producto_costo: costo,
      producto_clave: costo ? normalizar(costo) : null,
      estado: estado === "MAPEADO" && costo ? "mapeado" : estado === "SUGERIDO" ? "sugerido" : "pendiente",
      notas: texto(f[7]),
    });
  }
  return salida;
}

/** El lote vigente de un producto: el de llegada más reciente; sin fecha, el último de la hoja. */
export function loteVigente<T extends { fecha_llegada: string | null; fila: number }>(lotes: T[]): T | null {
  return (
    [...lotes].sort((a, b) => {
      if (a.fecha_llegada && b.fecha_llegada && a.fecha_llegada !== b.fecha_llegada) return a.fecha_llegada < b.fecha_llegada ? 1 : -1;
      if (a.fecha_llegada && !b.fecha_llegada) return -1;
      if (!a.fecha_llegada && b.fecha_llegada) return 1;
      return b.fila - a.fila;
    })[0] ?? null
  );
}

/** Costo promedio ponderado por cantidad (los lotes sin cantidad no pesan). null si ninguno trae cantidad. */
export function costoPromedio(lotes: { cantidad: number | null; costo_total: number }[]): number | null {
  const con = lotes.filter((l) => l.cantidad && l.cantidad > 0);
  const unidades = con.reduce((a, l) => a + (l.cantidad ?? 0), 0);
  return unidades > 0 ? con.reduce((a, l) => a + (l.cantidad ?? 0) * l.costo_total, 0) / unidades : null;
}
