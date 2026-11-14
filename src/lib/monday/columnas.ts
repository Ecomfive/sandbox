// Monday.com (API GraphQL v2). Lógica pura: las consultas (columnas del tablero, primera página de `items_page` y las
// siguientes con `next_items_page` y su cursor), la validación del mapeo de columnas a los datos del portal, cómo se lee
// cada ítem del tablero de despachos (número de pedido, tienda, courier, estado, causa de rechazo, fechas y remisión), el
// grupo de cada estado y el enlace con la orden de Ventas por tienda. Prueba en `columnas.test.ts` con respuestas inventadas.

import { normalizar } from "../finanzas/clasificacion";

export const URL_API_MONDAY = "https://api.monday.com/v2";
export const VERSION_API_MONDAY = "2024-10";
/** Ítems por página (Monday acepta hasta 500). */
export const ITEMS_POR_PAGINA = 500;

export const CAMPOS_MONDAY = [
  { clave: "pedido", etiqueta: "Número de pedido", obligatorio: true },
  { clave: "tienda", etiqueta: "Tienda", obligatorio: false },
  { clave: "courier", etiqueta: "Courier", obligatorio: false },
  { clave: "estado", etiqueta: "Estado", obligatorio: true },
  { clave: "causa", etiqueta: "Causa de rechazo", obligatorio: false },
  { clave: "fecha_despacho", etiqueta: "Fecha de despacho", obligatorio: true },
  { clave: "fecha_entrega", etiqueta: "Fecha de entrega", obligatorio: false },
  { clave: "remision", etiqueta: "Remisión", obligatorio: false },
  // Los del tablero de devoluciones (13 nov 2026, migración 0288): lo que deciden los asesores con el pedido que volvió.
  { clave: "estado_asesores", etiqueta: "Estado de los asesores (devoluciones)", obligatorio: false },
  { clave: "observaciones_asesores", etiqueta: "Observaciones de los asesores (devoluciones)", obligatorio: false },
  // Cómo pagó el cliente y cuánto cobró el repartidor (14 nov 2026, migración 0295): la «FORMA DE PAGO» del Excel Matriz.
  { clave: "forma_pago", etiqueta: "Forma de pago (efectivo, Yappy…)", obligatorio: false },
  { clave: "monto_cobrado", etiqueta: "Monto cobrado", obligatorio: false },
] as const;
export type CampoMonday = (typeof CAMPOS_MONDAY)[number]["clave"];
export type MapeoColumnas = Partial<Record<CampoMonday, string>>;

/** El nombre del ítem (no es una columna): se puede elegir como número de pedido. */
export const COLUMNA_NOMBRE = "name";
/**
 * El grupo del ítem (no es una columna): en el tablero «DELIVERY REPORTES DIARIOS» de Panamá cada grupo es un día («02/11/2026») y no hay
 * columna de fecha (12 nov 2026). Se puede elegir como fecha de despacho o de entrega.
 */
export const COLUMNA_GRUPO = "group";

export const GRUPOS_ESTADO = ["entregado", "rechazado", "cancelado", "en_ruta", "sin_estado"] as const;
export type GrupoEstado = (typeof GRUPOS_ESTADO)[number];
export const ETIQUETA_GRUPO: Record<GrupoEstado, string> = { entregado: "Entregado", rechazado: "Rechazado", cancelado: "Cancelado", en_ruta: "En ruta", sin_estado: "Sin estado" };
export const esGrupoEstado = (v: unknown): v is GrupoEstado => typeof v === "string" && (GRUPOS_ESTADO as readonly string[]).includes(v);
/** Estados finales (con ellos el pedido «tiene estado»). */
export const FINALES = new Set<GrupoEstado>(["entregado", "rechazado", "cancelado"]);

// ---------------------------------------------------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------------------------------------------------
const CAMPOS_ITEM = "id name updated_at group { title } column_values { id text value type }";
export const CONSULTA_COLUMNAS = "query ($ids: [ID!]) { boards(ids: $ids) { id name columns { id title type } } }";
export const CONSULTA_PRIMERA = `query ($ids: [ID!], $limit: Int!) { boards(ids: $ids) { id name items_page(limit: $limit) { cursor items { ${CAMPOS_ITEM} } } } }`;
export const CONSULTA_SIGUIENTE = `query ($cursor: String!, $limit: Int!) { next_items_page(cursor: $cursor, limit: $limit) { cursor items { ${CAMPOS_ITEM} } } }`;

/**
 * La primera página con solo los ítems actualizados desde el día anterior a `desde` (13 nov 2026): Monday filtra por «última actualización», así una
 * lectura recorre lo que cambió (decenas de ítems) y no el tablero entero (casi 6.000 en el consolidado, que no cabía en una vuelta). Se pide desde
 * el día anterior para no perder nada por la zona horaria; lo fino lo sigue filtrando `cambioDesde`. Sin `desde` (primera lectura), el tablero entero.
 */
export function consultaPrimeraDesde(desde: string | null): string {
  const dia = desde && /^\d{4}-\d{2}-\d{2}/.test(desde) ? new Date(Date.parse(desde.slice(0, 10) + "T00:00:00Z") - 86_400_000).toISOString().slice(0, 10) : null;
  if (!dia) return CONSULTA_PRIMERA;
  const reglas = `query_params: { rules: [{ column_id: "__last_updated__", compare_value: ["EXACT", "${dia}"], operator: greater_than_or_equals, compare_attribute: "UPDATED_AT" }] }`;
  return `query ($ids: [ID!], $limit: Int!) { boards(ids: $ids) { id name items_page(limit: $limit, ${reglas}) { cursor items { ${CAMPOS_ITEM} } } } }`;
}

export const esIdTablero = (v: unknown): v is string => typeof v === "string" && /^[0-9]{1,20}$/.test(v);

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** El error de una respuesta de GraphQL de Monday (o null). */
export function errorMonday(respuesta: unknown): string | null {
  const r = obj(respuesta);
  const errores = arr(r.errors);
  if (errores.length) return String(obj(errores[0]).message ?? "Error de Monday").slice(0, 300);
  if (typeof r.error_message === "string") return r.error_message.slice(0, 300);
  return null;
}

export interface ColumnaTablero {
  id: string;
  titulo: string;
  tipo: string;
}

export function leerColumnas(respuesta: unknown): { nombre: string; columnas: ColumnaTablero[] } | null {
  const b = obj(arr(obj(obj(respuesta).data).boards)[0]);
  if (!b.id) return null;
  return {
    nombre: String(b.name ?? ""),
    columnas: arr(b.columns)
      .map(obj)
      .filter((c) => typeof c.id === "string")
      .map((c) => ({ id: String(c.id), titulo: String(c.title ?? c.id), tipo: String(c.type ?? "") })),
  };
}

export interface ItemMonday {
  id: string;
  name: string;
  updated_at: string | null;
  /** El título del grupo del ítem (en el tablero de Panamá, el día). */
  grupo?: string | null;
  column_values: { id: string; text: string | null; value: string | null; type?: string }[];
}

/** Ítems y cursor de una página (primera o siguiente). */
export function leerPagina(respuesta: unknown): { cursor: string | null; items: ItemMonday[] } {
  const d = obj(obj(respuesta).data);
  const pagina = d.next_items_page ? obj(d.next_items_page) : obj(obj(arr(d.boards)[0]).items_page);
  const items = arr(pagina.items)
    .map(obj)
    .filter((i) => typeof i.id === "string" || typeof i.id === "number")
    .map((i) => ({
      id: String(i.id),
      name: String(i.name ?? ""),
      updated_at: typeof i.updated_at === "string" ? i.updated_at : null,
      grupo: typeof obj(i.group).title === "string" ? (obj(i.group).title as string) : null,
      column_values: arr(i.column_values)
        .map(obj)
        .map((c) => ({ id: String(c.id ?? ""), text: typeof c.text === "string" ? c.text : null, value: typeof c.value === "string" ? c.value : null, type: typeof c.type === "string" ? c.type : undefined })),
    }));
  return { cursor: typeof pagina.cursor === "string" && pagina.cursor ? pagina.cursor : null, items };
}

// ---------------------------------------------------------------------------------------------------------------------
// Mapeo de columnas
// ---------------------------------------------------------------------------------------------------------------------
/** Valida el mapeo elegido contra las columnas del tablero. */
export function validarMapeo(mapeo: Record<string, unknown>, columnas: ColumnaTablero[]): { error: string } | { mapeo: MapeoColumnas } {
  const ids = new Set([COLUMNA_NOMBRE, COLUMNA_GRUPO, ...columnas.map((c) => c.id)]);
  const salida: MapeoColumnas = {};
  for (const c of CAMPOS_MONDAY) {
    const v = typeof mapeo[c.clave] === "string" ? (mapeo[c.clave] as string).trim() : "";
    if (!v || v === SIN_COLUMNA) {
      if (c.obligatorio) return { error: `Elige la columna de «${c.etiqueta}».` };
      continue;
    }
    if (!ids.has(v)) return { error: `La columna de «${c.etiqueta}» no existe en el tablero.` };
    salida[c.clave] = v;
  }
  return { mapeo: salida };
}

/** El mapeo guardado (jsonb), sin lo que no es texto. */
export function leerMapeo(v: unknown): MapeoColumnas {
  const o = obj(v);
  const salida: MapeoColumnas = {};
  for (const c of CAMPOS_MONDAY) if (typeof o[c.clave] === "string" && o[c.clave]) salida[c.clave] = (o[c.clave] as string).slice(0, 80);
  return salida;
}

/**
 * Completa un mapeo guardado con los datos que se agregaron después (forma de pago y monto cobrado, 14 nov 2026), por el título de las columnas del
 * tablero (pura). Lo que el tablero no tiene queda como `SIN_COLUMNA`, para no buscarlo en cada lectura. Devuelve null si no faltaba nada.
 */
export function completarMapeo(mapeo: MapeoColumnas, columnas: ColumnaTablero[]): MapeoColumnas | null {
  const nuevos: CampoMonday[] = ["forma_pago", "monto_cobrado"];
  if (nuevos.every((c) => mapeo[c])) return null;
  const s = sugerirMapeo(columnas);
  const salida: MapeoColumnas = { ...mapeo };
  for (const c of nuevos) salida[c] = mapeo[c] ?? s[c] ?? SIN_COLUMNA;
  return salida;
}

/** Sugiere la columna de cada dato por su título (para el primer mapeo). */
export function sugerirMapeo(columnas: ColumnaTablero[]): MapeoColumnas {
  const reglas: Record<CampoMonday, RegExp> = {
    pedido: /PEDIDO|ORDEN|ORDER/,
    tienda: /TIENDA|STORE|MARCA/,
    courier: /COURIER|REPARTIDOR|TRANSPORT|MENSAJER/,
    estado: /^(?!.*ASESOR)(?=.*(ESTADO|STATUS))/,
    causa: /CAUSA|MOTIVO|RAZON|RECHAZO/,
    fecha_despacho: /DESPACHO|ENVIO|SALIDA/,
    fecha_entrega: /ENTREGA/,
    remision: /REMISION|GUIA/,
    estado_asesores: /ESTADO.*ASESOR/,
    observaciones_asesores: /OBSERVACION.*ASESOR/,
    forma_pago: /FORMA DE PAGO/,
    monto_cobrado: /^COBRADO$|MONTO COBRADO/,
  };
  const salida: MapeoColumnas = {};
  const usadas = new Set<string>();
  for (const c of CAMPOS_MONDAY) {
    const col = columnas.find((x) => !usadas.has(x.id) && reglas[c.clave].test(normalizar(x.titulo)) && (!c.clave.startsWith("fecha") || x.tipo === "date"));
    if (col) {
      salida[c.clave] = col.id;
      usadas.add(col.id);
    }
  }
  if (!salida.pedido) salida.pedido = COLUMNA_NOMBRE;
  // Sin columna de fecha de despacho, el día del grupo (como en el tablero de Panamá).
  if (!salida.fecha_despacho) salida.fecha_despacho = COLUMNA_GRUPO;
  return salida;
}

// ---------------------------------------------------------------------------------------------------------------------
// Ítems → despachos
// ---------------------------------------------------------------------------------------------------------------------
/** El grupo de un estado de Monday: primero la regla guardada (etiqueta normalizada → grupo), si no por palabras. */
export function grupoDeEstado(etiqueta: string | null, reglas: Record<string, GrupoEstado> = {}): GrupoEstado {
  const n = normalizar(etiqueta ?? "");
  if (!n) return "sin_estado";
  if (reglas[n]) return reglas[n];
  if (/CANCELAD|ANULAD/.test(n)) return "cancelado";
  // FALLIDO no es rechazado (Hernán, 13 nov 2026): el pedido todavía se puede volver a entregar; sigue en ruta.
  if (/RECHAZ|DEVUEL|DEVOLU|NO ENTREGAD|RETURN/.test(n)) return "rechazado";
  if (/ENTREGAD|DELIVERED|COMPLETAD/.test(n)) return "entregado";
  return "en_ruta";
}

/** Las reglas de estado guardadas (jsonb), con la etiqueta normalizada. */
export function leerReglasEstado(v: unknown): Record<string, GrupoEstado> {
  const salida: Record<string, GrupoEstado> = {};
  for (const [k, g] of Object.entries(obj(v))) if (esGrupoEstado(g) && normalizar(k)) salida[normalizar(k)] = g;
  return salida;
}

/** Una fecha de una columna de Monday (date: `{"date":"AAAA-MM-DD"}`; si no, el texto). */
export function fechaDeColumna(c: { text: string | null; value: string | null } | undefined): string | null {
  if (!c) return null;
  if (c.value) {
    try {
      const v = JSON.parse(c.value) as { date?: unknown };
      if (typeof v?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date)) return v.date;
    } catch {
      /* el texto sigue */
    }
  }
  const m = (c.text ?? "").match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  // «02/11/2026» (día/mes/año, como los grupos del tablero de Panamá).
  const d = (c.text ?? "").match(/(?<!\d)(\d{1,2})\/(\d{1,2})\/(\d{4})(?!\d)/);
  if (!d) return null;
  const [dia, mes, anio] = [Number(d[1]), Number(d[2]), Number(d[3])];
  if (mes < 1 || mes > 12 || dia < 1 || dia > new Date(Date.UTC(anio, mes, 0)).getUTCDate()) return null;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** El número de pedido para comparar: mayúsculas, sin «#», espacios ni guiones. */
export const normalizarPedido = (v: string | null | undefined): string => (v ?? "").toUpperCase().replace(/[#\s-]/g, "").slice(0, 60);

/** El número del pedido sin el «(copy)» que agrega Monday al duplicar un ítem («1437 (copy)» → «1437»; 13 nov 2026). */
export const sinCopia = (v: string | null): string | null => (v ? v.replace(/\s*\((?:copy|copia)\)\s*/gi, " ").trim() || null : null);

export interface Despacho {
  item_id: string;
  nombre: string | null;
  numero_pedido: string | null;
  tienda_texto: string | null;
  courier: string | null;
  estado: string | null;
  estado_grupo: GrupoEstado;
  causa_rechazo: string | null;
  fecha_despacho: string | null;
  fecha_entrega: string | null;
  remision: string | null;
  actualizado_monday: string | null;
  /** Solo en el tablero de devoluciones: lo que deciden los asesores (PENDIENTE, DESINTEGRADO) y su motivo. */
  estado_asesores: string | null;
  observaciones_asesores: string | null;
  /** Cómo pagó el cliente (EFECTIVO, YAPPY, MiPOS…) y cuánto cobró el repartidor (14 nov 2026). */
  forma_pago: string | null;
  monto_cobrado: number | null;
}

/** «Sin columna» en un mapeo guardado: se buscó y el tablero no la tiene (así no se vuelve a buscar en cada lectura). */
export const SIN_COLUMNA = "-";

/** La forma de pago del sistema a partir del texto de Monday o de la Matriz (pura): efectivo, yappy, transferencia, tarjeta u otro; null si no dice. */
export function formaDePago(texto: string | null | undefined): "efectivo" | "yappy" | "transferencia" | "tarjeta" | "otro" | null {
  const t = normalizar(texto ?? "");
  if (!t || /^(CANCELAD|NO GESTION|PENDIENTE|ANULAD)/.test(t)) return null;
  if (/EFECTIVO|CASH/.test(t)) return "efectivo";
  if (/YAPPY/.test(t)) return "yappy";
  if (/TRANSF|ACH|BANCO|DEPOSITO/.test(t)) return "transferencia";
  if (/MIPOS|POS|TARJETA|CARD|VISA|CLAVE/.test(t)) return "tarjeta";
  return "otro";
}

/**
 * DESINTEGRADO o RECHAZADO: los asesores cerraron el pedido y el producto vuelve al inventario (Hernán, 13 nov 2026: «rechazado también es devuelto»).
 * Eso sí es una devolución (PROCESADO = reprogramado y PENDIENTE no lo son).
 */
export const esDesintegrado = (estadoAsesores: string | null | undefined) => /DESINTEGRAD|RECHAZ/.test(normalizar(estadoAsesores ?? ""));

/**
 * Qué fila de Monday manda cuando un pedido está en varios tableros (13 nov 2026): primero un ENTREGADO (de cualquier tablero: es lo más seguro),
 * luego un DESINTEGRADO de los asesores (el pedido se cerró), y entre las demás la más reciente. PROCESADO (los asesores reprogramaron la entrega) o
 * PENDIENTE no tienen prioridad: no tapan lo que diga después el repartidor. Se antepone a la fecha en la clave de orden.
 */
export const prioridadDespacho = (grupo: string | null | undefined, estadoAsesores: string | null | undefined): string =>
  grupo === "entregado" ? "3" : esDesintegrado(estadoAsesores) ? "2" : "1";

/** El motivo que se muestra: el de los asesores si lo hay (devolución si lo desintegraron; si no, lo que anotaron), o la causa del repartidor. */
export function causaDespacho(causa: string | null, estadoAsesores: string | null | undefined, observaciones: string | null | undefined): string | null {
  if (!estadoAsesores) return causa;
  const que = esDesintegrado(estadoAsesores) ? `Devolución (${estadoAsesores.trim().toLowerCase()})` : `Asesores (${estadoAsesores.toLowerCase()})`;
  // Las dos cosas son evidencia: lo que anotaron los asesores y lo que dijo el repartidor.
  const partes = [observaciones, causa && causa !== observaciones ? `repartidor: ${causa}` : null].filter(Boolean);
  return partes.length ? `${que}: ${partes.join(" · ")}` : que;
}

const corto = (v: string | null | undefined, max: number) => (v && v.trim() ? v.trim().slice(0, max) : null);

/** Un ítem del tablero como despacho, según el mapeo. */
export function despachoDeItem(item: ItemMonday, mapeo: MapeoColumnas, reglas: Record<string, GrupoEstado> = {}): Despacho {
  const col = (campo: CampoMonday) => {
    const id = mapeo[campo];
    if (!id) return undefined;
    if (id === COLUMNA_NOMBRE) return { id, text: item.name, value: null };
    if (id === COLUMNA_GRUPO) return { id, text: item.grupo ?? null, value: null };
    return item.column_values.find((c) => c.id === id);
  };
  const texto = (campo: CampoMonday, max = 200) => corto(col(campo)?.text, max);
  const estado = texto("estado", 120);
  const estadoAsesores = texto("estado_asesores", 120);
  const observaciones = texto("observaciones_asesores", 500);
  return {
    item_id: item.id,
    nombre: corto(item.name, 300),
    numero_pedido: sinCopia(texto("pedido", 60)),
    tienda_texto: texto("tienda", 120),
    courier: texto("courier", 120),
    estado,
    // Con DESINTEGRADO de los asesores el pedido se dio por devuelto, diga lo que diga la columna Estado (FALLIDO, POSPUESTO).
    estado_grupo: esDesintegrado(estadoAsesores) ? "rechazado" : grupoDeEstado(estado, reglas),
    causa_rechazo: texto("causa", 300) ?? (observaciones ? observaciones.slice(0, 300) : null),
    fecha_despacho: fechaDeColumna(col("fecha_despacho")),
    fecha_entrega: fechaDeColumna(col("fecha_entrega")),
    remision: texto("remision", 120),
    actualizado_monday: item.updated_at,
    estado_asesores: estadoAsesores,
    observaciones_asesores: observaciones,
    forma_pago: texto("forma_pago", 60),
    monto_cobrado: montoDeColumna(texto("monto_cobrado", 30)),
  };
}

/** Un monto de una columna de números de Monday («32.9», «$32,90»); null si no hay o no es un número razonable. */
export function montoDeColumna(t: string | null | undefined): number | null {
  const m = (t ?? "").replace(/[^\d.,-]/g, "").replace(",", ".");
  if (!m) return null;
  const v = Number(m);
  return Number.isFinite(v) && v > 0 && v < 100_000 ? Math.round(v * 100) / 100 : null;
}

/** ¿Hay que guardar el ítem? (lectura incremental: los actualizados desde el cursor, con un día de margen). */
export function cambioDesde(item: Pick<ItemMonday, "updated_at">, cursor: string | null): boolean {
  if (!cursor || !item.updated_at) return true;
  return Date.parse(item.updated_at) >= Date.parse(cursor) - 86_400_000;
}

// ---------------------------------------------------------------------------------------------------------------------
// Enlace con Ventas por tienda
// ---------------------------------------------------------------------------------------------------------------------
export interface UnidadSimple {
  id: string;
  nombre: string;
}

/** La unidad (tienda) del texto de Monday: mismo nombre normalizado, o uno contiene al otro (mínimo 4 letras). */
export function unidadDeTexto(texto: string | null, unidades: UnidadSimple[], alias: (t: string) => string = (t) => t): string | null {
  const n = normalizar(texto ?? "");
  if (!n) return null;
  const a = normalizar(alias(texto ?? ""));
  const exacta = unidades.find((u) => normalizar(u.nombre) === n || normalizar(u.nombre) === a);
  if (exacta) return exacta.id;
  const parcial = unidades.filter((u) => {
    const un = normalizar(u.nombre);
    return un.length >= 4 && n.length >= 4 && (un.includes(n) || n.includes(un));
  });
  return parcial.length === 1 ? parcial[0].id : null;
}

export interface OrdenCandidata {
  id: string;
  unidad_id: string;
  numero: string;
  periodo: string;
}

/** La orden de un despacho: mismo número normalizado; con tienda, de esa tienda; sin tienda, solo si hay una. */
export function enlazarOrden(numero: string | null, unidadId: string | null, candidatas: OrdenCandidata[]): OrdenCandidata | null {
  const n = normalizarPedido(numero);
  if (!n) return null;
  const mismas = candidatas.filter((c) => normalizarPedido(c.numero) === n);
  if (unidadId) return mismas.find((c) => c.unidad_id === unidadId) ?? null;
  return mismas.length === 1 ? mismas[0] : null;
}

/** Las formas del número que se buscan en `ven_ordenes.numero` («#1001» y «1001»). */
export function variantesPedido(numero: string | null): string[] {
  const t = (numero ?? "").trim().toUpperCase();
  if (!t) return [];
  const sin = t.replace(/^#/, "");
  return [...new Set([t, sin, `#${sin}`])];
}
