// Lectura de GESTION_DELIVERYS_<mes>.xlsx, hoja «GESTION DELIVERY II». Lógica pura: recibe las filas ya leídas (arreglos
// de celdas, `sheet_to_json(..., { header: 1, raw: true, defval: null })`) y devuelve las líneas de entregas. La usan la
// pantalla «Importar» (en el navegador) y `scripts/finanzas/importar-deliverys.ts`. Prueba en `excel.test.ts`.
//
// La hoja no trae una fila por pedido: trae una fila por día y repartidor (o por zona de un repartidor: «ZONA 5 …»,
// «ARRAIJAN») con cuántos pedidos salió a repartir de cada tienda y, en bloques por tarifa («COSTE DE ENVIO $3.65»),
// cuántos entregó y cuántos fallaron. Cada celda con número se vuelve una línea (cantidad × tarifa); lo que salió a ruta
// y no se entregó ni se pagó como fallido queda como «devuelto» sin tarifa. Las columnas «Pagar por envíos <tienda>» se
// leen solo para comprobar que el cálculo da lo mismo que el Excel.

import { huella, leerFecha, type Celda } from "../finanzas/libro-excel";
import { redondear, type Categoria, type EstadoEntrega } from "./liquidacion";

export const HOJA_GESTION = "GESTION DELIVERY II";

/** Cómo se llama cada tienda en la hoja → su nombre en `fin_unidades` (la migración 0911 los deja en `del_tiendas`). */
export const TIENDAS_EXCEL: Record<string, string> = {
  CALZADOS: "CALZADOS O.",
  OFERFY: "OFERFY PAN",
  KENKU: "KENKU",
  CLICKSI: "CLICKSI",
  NUVO: "NUVO PAN",
};

export interface EntregaExcel {
  /** Fila del Excel (1 = primera), para el informe. */
  fila: number;
  fecha: string;
  /** El nombre de la columna «NOMBRE DEL DELIVERY» tal como viene (un repartidor o una zona suya). */
  etiqueta: string;
  /** Tienda como la escribe la hoja (OFERFY, NUVO…). */
  tienda: string;
  categoria: Categoria | null;
  estado: EstadoEntrega;
  cantidad: number;
  tarifa: number;
  origen_clave: string;
}

export interface CuadreFila {
  fila: number;
  fecha: string;
  etiqueta: string;
  tienda: string;
  excel: number;
  calculado: number;
}

export interface AvisoExcel {
  fila: number;
  mensaje: string;
}

export interface LecturaDeliverys {
  entregas: EntregaExcel[];
  /** Filas de la hoja con fecha y nombre. */
  filas: number;
  etiquetas: string[];
  desde: string | null;
  hasta: string | null;
  /** Filas cuyo cálculo no da lo mismo que «Pagar por envíos <tienda>» del Excel. */
  noCuadran: CuadreFila[];
  /** Total que paga la hoja (columna «CÁLCULO TOTAL A PAGAR») y el calculado. */
  totalExcel: number;
  totalCalculado: number;
  avisos: AvisoExcel[];
}

const normal = (v: Celda) =>
  (v === null || v === undefined ? "" : String(v))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** El nombre de la columna «NOMBRE DEL DELIVERY» limpio (mayúsculas, sin acentos, un espacio): así se compara entre filas. */
export const claveEtiqueta = (v: Celda) => normal(v);

function categoriaDeTitulo(t: string): Categoria | null {
  if (t.includes("PROPINA")) return "propina";
  if (t.includes("COMPARTID")) return "compartida";
  if (t.includes("CAMBIO") || t.includes("RETIRO") || t.includes("COMPLEMENTO")) return "cambio";
  if (t.includes("FUERA DE RUTA")) return "fuera_ruta";
  if (t.includes("PAGO POR ENTREGA")) return "entrega";
  return null;
}

/** «… (COSTE DE ENVIO $1.83 cada uno)» → 1.83. */
function tarifaDeTitulo(t: string): number | null {
  const m = t.match(/\$\s*(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(",", ".")) : null;
}

function tiendaDeEncabezado(t: string): string | null {
  const limpio = t.replace(/\b(ENTREGADOS?|FALLIDOS?|PAGAR POR ENVIOS)\b/g, "").replace(/\s+/g, " ").trim();
  return Object.keys(TIENDAS_EXCEL).find((k) => limpio === k) ?? null;
}

interface ColumnaTarifa {
  col: number;
  tienda: string;
  categoria: Categoria;
  estado: "entregado" | "fallido";
  tarifa: number;
}

interface Estructura {
  filaTitulos: number;
  fecha: number;
  nombre: number;
  ruta: { col: number; tienda: string }[];
  tarifas: ColumnaTarifa[];
  pagos: { col: number; tienda: string }[];
  total: number | null;
}

/** Ubica las columnas por sus títulos (no por letra): la fila con «NOMBRE DEL DELIVERY» y la de los bloques encima. */
export function ubicarEstructura(filas: Celda[][]): Estructura | null {
  const filaTitulos = filas.findIndex((f) => (f ?? []).some((c) => normal(c) === "NOMBRE DEL DELIVERY"));
  if (filaTitulos < 1) return null;
  const titulos = (filas[filaTitulos] ?? []).map(normal);
  const bloques = (filas[filaTitulos - 1] ?? []).map(normal);
  const fecha = titulos.findIndex((t) => t === "FECHA");
  const nombre = titulos.indexOf("NOMBRE DEL DELIVERY");
  if (fecha < 0 || nombre < 0) return null;
  // Cada bloque va desde su título hasta el siguiente.
  const inicios = bloques.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
  const bloqueDe = (col: number) => {
    let ini = -1;
    for (const i of inicios) if (i <= col) ini = i;
    return ini < 0 ? "" : bloques[ini];
  };
  const ruta: Estructura["ruta"] = [];
  const tarifas: ColumnaTarifa[] = [];
  const pagos: Estructura["pagos"] = [];
  let total: number | null = null;
  for (let col = 0; col < titulos.length; col++) {
    const t = titulos[col];
    if (!t) continue;
    const b = bloqueDe(col);
    if (b === "TIENDAS") {
      const tienda = tiendaDeEncabezado(t);
      if (tienda) ruta.push({ col, tienda });
      continue;
    }
    if (b.startsWith("CALCULOS DE PAGOS")) {
      if (t.startsWith("PAGAR POR ENVIOS")) {
        const tienda = tiendaDeEncabezado(t);
        if (tienda) pagos.push({ col, tienda });
      } else if (t.includes("TOTAL A PAGAR")) total = col;
      continue;
    }
    const categoria = categoriaDeTitulo(b);
    if (!categoria) continue;
    const tarifa = categoria === "propina" ? 1 : tarifaDeTitulo(b);
    const tienda = tiendaDeEncabezado(t);
    if (tarifa === null || !tienda) continue;
    tarifas.push({ col, tienda, categoria, estado: /FALLID/.test(t) ? "fallido" : "entregado", tarifa });
  }
  if (!ruta.length || !tarifas.length) return null;
  return { filaTitulos, fecha, nombre, ruta, tarifas, pagos, total };
}

/** Solo lo que es número: una celda con texto («0.6») el Excel no la suma, así que aquí tampoco (y se avisa). */
const numero = (v: Celda): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function leerGestionDeliverys(filas: Celda[][]): LecturaDeliverys | null {
  const e = ubicarEstructura(filas);
  if (!e) return null;
  const entregas: EntregaExcel[] = [];
  const noCuadran: CuadreFila[] = [];
  const avisos: AvisoExcel[] = [];
  const etiquetas = new Set<string>();
  const vistas = new Map<string, number>();
  let leidas = 0;
  let totalExcel = 0;
  let totalCalculado = 0;
  let desde: string | null = null;
  let hasta: string | null = null;

  const clave = (base: string) => {
    const h = huella(base);
    const n = vistas.get(h) ?? 0;
    vistas.set(h, n + 1);
    return `${h}#${n}`;
  };

  for (let i = e.filaTitulos + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    const fecha = leerFecha(f[e.fecha] as Celda);
    const etiqueta = claveEtiqueta(f[e.nombre] as Celda);
    if (!fecha || !etiqueta) {
      if (etiqueta || numero(f[e.fecha] as Celda) !== null) avisos.push({ fila: i + 1, mensaje: "Fila sin fecha o sin nombre: no se carga." });
      continue;
    }
    leidas++;
    etiquetas.add(etiqueta);
    if (!desde || fecha < desde) desde = fecha;
    if (!hasta || fecha > hasta) hasta = fecha;

    const pagadas = new Map<string, number>();
    const calculado = new Map<string, number>();
    for (const c of e.tarifas) {
      const v = f[c.col] as Celda;
      const n = numero(v);
      if (n === null) {
        if (v !== null && v !== undefined && String(v).trim() !== "") avisos.push({ fila: i + 1, mensaje: `«${String(v).trim()}» está escrito como texto en ${c.categoria === "propina" ? "propinas" : "una tarifa"} de ${c.tienda}: el Excel no lo suma.` });
        continue;
      }
      if (n === 0) continue;
      if (n < 0 || (c.categoria !== "propina" && !Number.isInteger(n))) {
        avisos.push({ fila: i + 1, mensaje: `Cantidad inválida (${n}) en ${c.tienda}: no se carga.` });
        continue;
      }
      const esPropina = c.categoria === "propina";
      const cantidad = esPropina ? 1 : n;
      const tarifa = esPropina ? redondear(n) : c.tarifa;
      entregas.push({
        fila: i + 1,
        fecha,
        etiqueta,
        tienda: c.tienda,
        categoria: c.categoria,
        estado: c.estado,
        cantidad,
        tarifa,
        origen_clave: clave(`${fecha}|${etiqueta}|${c.tienda}|${c.categoria}|${c.tarifa}|${c.estado}`),
      });
      if (!esPropina) pagadas.set(c.tienda, (pagadas.get(c.tienda) ?? 0) + cantidad);
      calculado.set(c.tienda, (calculado.get(c.tienda) ?? 0) + cantidad * tarifa);
    }

    // Lo que salió a ruta y no se entregó ni se pagó como intento fallido: devuelto, sin tarifa.
    for (const r of e.ruta) {
      const n = numero(f[r.col] as Celda) ?? 0;
      const resto = n - (pagadas.get(r.tienda) ?? 0);
      if (resto > 0 && Number.isInteger(resto)) {
        entregas.push({
          fila: i + 1,
          fecha,
          etiqueta,
          tienda: r.tienda,
          categoria: null,
          estado: "devuelto",
          cantidad: resto,
          tarifa: 0,
          origen_clave: clave(`${fecha}|${etiqueta}|${r.tienda}|devuelto`),
        });
      } else if (resto < 0) {
        avisos.push({ fila: i + 1, mensaje: `${r.tienda}: se pagan ${pagadas.get(r.tienda)} pedidos y solo salieron ${n} a ruta.` });
      }
    }

    for (const p of e.pagos) {
      const excel = numero(f[p.col] as Celda) ?? 0;
      const calc = redondear(calculado.get(p.tienda) ?? 0);
      if (Math.abs(redondear(excel) - calc) > 0.005) noCuadran.push({ fila: i + 1, fecha, etiqueta, tienda: p.tienda, excel: redondear(excel), calculado: calc });
    }
    totalExcel += e.total === null ? 0 : (numero(f[e.total] as Celda) ?? 0);
    totalCalculado += [...calculado.values()].reduce((a, b) => a + b, 0);
  }

  return {
    entregas,
    filas: leidas,
    etiquetas: [...etiquetas].sort(),
    desde,
    hasta,
    noCuadran,
    totalExcel: redondear(totalExcel),
    totalCalculado: redondear(totalCalculado),
    avisos,
  };
}
