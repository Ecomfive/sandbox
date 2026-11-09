// Movimientos que se cargan en el portal (no desde un archivo): «Agregar» uno a mano, corregirlo en su ficha y «Pegar
// filas desde Excel». Lógica pura (sin Supabase): la usan las acciones de `libro-movimientos/movimiento-actions.ts` y el
// panel de pegar. Prueba en `movimiento-manual.test.ts`.

import { claveCatalogo, leerLibro, leerPeriodo, ubicarColumnas, UNIDAD_SIN_ASIGNAR, type Celda, type MovimientoExcel } from "./libro-excel";

/** El origen de lo que se pega desde Excel: no es un archivo, así que reimportar un libro nunca lo borra. */
export const ORIGEN_PEGADO = "pegado";
/** Lo que se crea con «Agregar». */
export const ORIGEN_MANUAL = "manual";
/** Solo estos se pueden eliminar: lo importado de un archivo se corrige o se saca del EERR, no se borra. */
export const ORIGENES_ELIMINABLES = [ORIGEN_MANUAL, ORIGEN_PEGADO];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export interface DatosMovimiento {
  periodo: string;
  fecha_pago: string | null;
  fecha_servicio: string | null;
  unidad_id: string;
  tipo_id: string;
  descripcion: string;
  monto: number;
  cuenta_id: string | null;
  en_eerr: boolean;
  en_flujo: boolean;
}

/**
 * Lee los campos de la ficha (crear o editar). `get` devuelve el valor de un campo del formulario. El mes llega como
 * «2026-10» (campo de mes) y el monto siempre positivo: el signo lo da el tipo.
 */
export function leerDatosMovimiento(get: (campo: string) => unknown): DatosMovimiento | { error: string } {
  const s = (k: string) => {
    const v = get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  const mes = s("mes");
  const periodo = /^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : null;
  if (!periodo || Number(mes.slice(5)) < 1 || Number(mes.slice(5)) > 12) return { error: "Elige el mes." };
  const unidad = s("unidad_id");
  if (!UUID.test(unidad)) return { error: "Elige la tienda." };
  const tipo = s("tipo_id");
  if (!UUID.test(tipo)) return { error: "Elige el tipo." };
  const descripcion = s("descripcion").replace(/\s+/g, " ").slice(0, 500);
  if (!descripcion) return { error: "Falta la descripción." };
  const monto = Number(s("monto").replace(/[$\s,]/g, ""));
  if (!Number.isFinite(monto) || monto <= 0 || monto > 100_000_000) return { error: "El monto debe ser mayor a cero." };
  const fecha = (k: string) => (FECHA.test(s(k)) ? s(k) : null);
  if (s("fecha_pago") && !fecha("fecha_pago")) return { error: "Fecha de pago inválida." };
  const cuenta = s("cuenta_id");
  return {
    periodo,
    fecha_pago: fecha("fecha_pago"),
    fecha_servicio: fecha("fecha_servicio"),
    unidad_id: unidad,
    tipo_id: tipo,
    descripcion,
    monto: Math.round(monto * 100) / 100,
    cuenta_id: UUID.test(cuenta) ? cuenta : null,
    en_eerr: s("en_eerr") === "si",
    en_flujo: s("en_flujo") === "si",
  };
}

/** Un movimiento como se ve en la actividad (nombres en vez de ids). */
export interface VistaMovimiento {
  mes: string;
  pago: string;
  prestacion: string;
  tienda: string;
  tipo: string;
  descripcion: string;
  monto: number;
  cuenta: string;
  eerr: boolean;
  flujo: boolean;
}

/** Los campos que cambiaron, listos para `registrarAuditoria({ antes, despues })`. Vacío si no cambió nada. */
export function cambiosMovimiento(a: VistaMovimiento, d: VistaMovimiento): { antes: Record<string, string>; despues: Record<string, string> } {
  const fmt = (v: VistaMovimiento): Record<string, string> => ({
    Mes: v.mes.slice(0, 7),
    Pago: v.pago || "—",
    Prestación: v.prestacion || "—",
    Tienda: v.tienda,
    Tipo: v.tipo || "—",
    Descripción: v.descripcion,
    Monto: v.monto.toFixed(2),
    "Forma de pago": v.cuenta || "—",
    EERR: v.eerr ? "Sí" : "No",
    Flujo: v.flujo ? "Sí" : "No",
  });
  const fa = fmt(a);
  const fd = fmt(d);
  const antes: Record<string, string> = {};
  const despues: Record<string, string> = {};
  for (const k of Object.keys(fa)) {
    if (fa[k] !== fd[k]) {
      antes[k] = fa[k];
      despues[k] = fd[k];
    }
  }
  return { antes, despues };
}

// ---------------------------------------------------------------------------------------------
// Pegar filas desde Excel
// ---------------------------------------------------------------------------------------------

/**
 * Texto copiado de Excel (TSV) → filas de celdas. Excel separa con tabulador y salto de línea, y pone entre comillas una
 * celda que lleva tabulador, salto de línea o comillas (con las comillas internas dobladas).
 */
export function leerTextoPegado(textoPegado: string): Celda[][] {
  const filas: Celda[][] = [];
  let fila: Celda[] = [];
  let celda = "";
  let entreComillas = false;
  const t = textoPegado.replace(/\r\n?/g, "\n");
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (entreComillas) {
      if (c === '"' && t[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"' && celda === "") entreComillas = true;
    else if (c === "\t") {
      fila.push(celda);
      celda = "";
    } else if (c === "\n") {
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.map((f) => f.map((x) => (typeof x === "string" && x.trim() === "" ? null : x)));
}

/** La fila de títulos de la hoja del libro, desde MES: se usa si lo pegado no la trae. */
export const TITULOS_HOJA_LIBRO = [
  "MES",
  "FECHA INCLUSIÓN",
  "TIENDA",
  "TIPO",
  "ESTATUS DE GESTION",
  "TIENDA A PAGAR",
  "DESCRIPCIÓN",
  "EERR?",
  "FLUJO ?",
  "USD",
  null,
  "Prestación de Servicio o disponibilidad mercancia",
  "Pago",
  "Forma de Pago",
];

export interface FilaPegada {
  /** Fila dentro de lo pegado (1 = primera). */
  fila: number;
  estado: "ok" | "aviso" | "error";
  mensajes: string[];
  mov: MovimientoExcel | null;
  /** Lo que se ve de la fila aunque tenga error. */
  resumen: { mes: string; tienda: string; tipo: string; descripcion: string; monto: string };
}

export interface ResultadoPegado {
  filas: FilaPegada[];
  /** Lo pegado no traía la fila de títulos: se tomó el orden de la hoja del libro. */
  sinTitulos: boolean;
  error: string | null;
}

export interface Catalogos {
  tiendas: string[];
  tipos: string[];
  cuentas: string[];
}

/**
 * Lee lo pegado con la misma lógica que la importación (`leerLibro`, columnas por título) y revisa cada fila contra los
 * catálogos. Error (no se guarda): sin mes, sin monto o una tienda que no existe (para no crear tiendas por un error de
 * tipeo). Aviso (se guarda): sin tienda, tipo fuera del catálogo (queda por clasificar) o forma de pago nueva.
 */
export function prepararPegado(textoPegado: string, catalogos: Catalogos): ResultadoPegado {
  let filas = leerTextoPegado(textoPegado).filter((f) => f.some((c) => c !== null));
  if (!filas.length) return { filas: [], sinTitulos: false, error: "No hay nada pegado." };
  let sinTitulos = false;
  let desfase = 0;
  if (!ubicarColumnas(filas)) {
    // Sin títulos: si la primera celda (o la segunda, con la columna A vacía) es un mes «1-2026», va en el orden de la hoja.
    const primera = filas[0];
    const inicio = leerPeriodo(primera[0]) ? 0 : leerPeriodo(primera[1]) ? 1 : -1;
    if (inicio < 0) return { filas: [], sinTitulos: false, error: "Copia también la fila de títulos de la hoja (MES, TIENDA, TIPO, USD…)." };
    filas = [[...Array(inicio).fill(null), ...TITULOS_HOJA_LIBRO], ...filas];
    sinTitulos = true;
    desfase = 1;
  }
  const crudas = filas;
  const { movimientos, descartadas } = leerLibro(filas, ORIGEN_PEGADO);
  const tiendas = new Set(catalogos.tiendas.map(claveCatalogo));
  const tipos = new Set(catalogos.tipos.map(claveCatalogo));
  const cuentas = new Set(catalogos.cuentas.map(claveCatalogo));
  const ubic = ubicarColumnas(crudas)!;
  const celda = (f: Celda[], campo: keyof typeof ubic.columnas) => {
    const i = ubic.columnas[campo];
    const v = i === undefined ? null : f[i];
    return v === null || v === undefined ? "" : String(v);
  };
  const porFila = new Map<number, FilaPegada>();
  for (const d of descartadas) {
    const f = crudas[d.fila - 1];
    porFila.set(d.fila, {
      fila: d.fila - desfase,
      estado: "error",
      mensajes: [d.motivo === "sin mes" ? "Sin mes (formato 1-2026)" : "Sin monto"],
      mov: null,
      resumen: { mes: celda(f, "mes"), tienda: celda(f, "unidad"), tipo: celda(f, "tipo"), descripcion: celda(f, "descripcion"), monto: celda(f, "monto") },
    });
  }
  for (const m of movimientos) {
    const mensajes: string[] = [];
    let estado: FilaPegada["estado"] = "ok";
    const clave = claveCatalogo(m.unidad);
    if (clave === UNIDAD_SIN_ASIGNAR) {
      mensajes.push("Sin tienda: queda por clasificar");
      estado = "aviso";
    } else if (!tiendas.has(clave)) {
      mensajes.push(`Tienda «${m.unidad}» no existe`);
      estado = "error";
    }
    if (!m.tipo || !tipos.has(claveCatalogo(m.tipo))) {
      mensajes.push(m.tipo ? `Tipo «${m.tipo}» fuera del catálogo: queda por clasificar` : "Sin tipo: queda por clasificar");
      if (estado === "ok") estado = "aviso";
    }
    if (m.cuenta && !cuentas.has(claveCatalogo(m.cuenta))) {
      mensajes.push(`Forma de pago nueva «${m.cuenta}»`);
      if (estado === "ok") estado = "aviso";
    }
    porFila.set(m.fila, {
      fila: m.fila - desfase,
      estado,
      mensajes,
      mov: estado === "error" ? null : m,
      resumen: { mes: m.periodo.slice(0, 7), tienda: m.unidad, tipo: m.tipo ?? "", descripcion: m.descripcion, monto: m.monto.toFixed(2) },
    });
  }
  return { filas: [...porFila.values()].sort((a, b) => a.fila - b.fila), sinTitulos, error: null };
}
