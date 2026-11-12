// Lectura de las órdenes de las tiendas Shopify desde el Excel de gestión (GESTION_OCEANS_PANAMA.xlsx, hoja «Excel
// Matriz»: una fila por producto de cada orden) y de las hojas que la completan («Informe SE» trae la guía de
// Servientrega; «Monday» el estado de las órdenes que el equipo de reparto actualizó y la Matriz todavía no).
//
// Lógica pura (sin Supabase ni navegador): la usan la pantalla «Importar» de Ventas por tienda y el script
// `scripts/finanzas/importar-ventas.ts`. Prueba en `matriz.test.ts` (con datos inventados).
//
// Cómo lleva la Matriz el estado de una orden (comprobado contra la hoja EERR de GASTOS_PANAMA_2026):
// - «TOTAL VENTA» va en una sola línea de la orden (la principal); las demás dicen «DUPLICADO». Majo lo deja en 0
//   cuando la orden no se cobró: por eso «ENTREGADOS» del EERR = órdenes con TOTAL VENTA mayor a 0.
// - «FORMA DE PAGO» de la línea principal dice cómo se cobró (EFECTIVO, YAPPY, TRANSFERENCIA, STRIPE, MIPOS, «INFORME
//   173» = recaudo de Servientrega, «GESTIONADO POR CLICKSI»…) o por qué no (CANCELADO, NO GESTIONADO).
// - «TOTAL ENVÍOS» del EERR = todas las órdenes del mes (por la fecha de la orden), también las canceladas.

import { huella, leerFecha, leerMonto, type Celda } from "../finanzas/libro-excel";
import { normalizar } from "../finanzas/clasificacion";

export type EstadoEntrega = "entregada" | "devuelta" | "cancelada" | "no_gestionada" | "en_transito" | "pendiente";
export type MetodoPago = "efectivo" | "yappy" | "transferencia" | "tarjeta" | "servientrega" | "clicksi" | "previo_pago" | "otro";

export const ESTADOS_ENTREGA: EstadoEntrega[] = ["entregada", "en_transito", "pendiente", "devuelta", "cancelada", "no_gestionada"];
export const METODOS_PAGO: MetodoPago[] = ["efectivo", "yappy", "transferencia", "tarjeta", "servientrega", "clicksi", "previo_pago", "otro"];

/** Nombre de cada tienda del Excel (hoja «Tiendas») en el catálogo de unidades del libro (`fin_unidades`). */
export const TIENDA_A_UNIDAD: Record<string, string> = {
  OFERFY: "OFERFY PAN",
  NUVO: "NUVO PAN",
  KENKU: "KENKU",
  CLICKSI: "CLICKSI",
  CALZADOS_O: "CALZADOS O.",
  "CALZADOS O": "CALZADOS O.",
};

/** La unidad del libro que corresponde a una tienda del Excel (si no es conocida, su nombre tal cual). */
export function unidadDeTienda(tienda: string): string {
  const t = tienda.trim().toUpperCase().replace(/\s+/g, "_");
  return TIENDA_A_UNIDAD[t] ?? TIENDA_A_UNIDAD[t.replace(/_/g, " ")] ?? tienda.trim().toUpperCase();
}

export interface LineaVenta {
  /** Posición dentro de la orden (1 = primera). */
  linea: number;
  producto: string;
  /** Nombre normalizado (`normalizar`): es lo que se cruza con el mapeo y con el costo vigente. */
  producto_clave: string;
  cantidad: number;
  sku: string | null;
  /** Costo de la línea según la Matriz (columna «COSTO PRODUCTO»: cantidad × costo), si lo trae. */
  costo_excel: number | null;
  /** Envío prioritario, garantía extendida…: no es mercancía y no lleva costo. */
  es_servicio: boolean;
}

/** Datos de la persona que compró. Sensibles: viajan aparte y se guardan en su propia tabla. */
export interface ClienteVenta {
  nombre: string | null;
  telefono: string | null;
  direccion: string | null;
  corregimiento: string | null;
  notas: string | null;
}

export interface OrdenVenta {
  /** Unidad del libro («OFERFY PAN»). */
  tienda: string;
  numero: string;
  fecha: string;
  periodo: string;
  estado_pago: string | null;
  estado_entrega: EstadoEntrega;
  metodo_pago: MetodoPago | null;
  forma_pago_texto: string | null;
  informe_servientrega: string | null;
  transportista: string | null;
  guia: string | null;
  fecha_envio: string | null;
  fecha_devolucion: string | null;
  resultado_courier: string | null;
  subtotal: number;
  envio: number;
  descuento: number;
  total: number;
  /** Lo que costó llevarla: repartidor («MONTO ENVIO») + Servientrega («MONTO ENVIO SE»). */
  costo_envio: number;
  facturado: boolean;
  factura_numero: string | null;
  mes_gestion: string | null;
  motivo_cancelacion: string | null;
  etiquetas: string | null;
  /** La hora en que se creó en Shopify (migración 0276); el Excel no la trae. */
  creado_origen?: string | null;
  lineas: LineaVenta[];
  cliente: ClienteVenta;
  /** Huella estable de la orden (tienda + número): la llave de la importación. */
  origen_clave: string;
  /** Huella de su contenido: si no cambió, la importación no la vuelve a escribir. */
  huella_contenido: string;
}

export interface FilaDescartada {
  fila: number;
  motivo: string;
}

const texto = (v: Celda): string | null => {
  if (v === null || v === undefined) return null;
  const s = (v instanceof Date ? v.toISOString() : String(v)).replace(/\s+/g, " ").trim();
  return s === "" || s === "-" || s === "---" ? null : s;
};
const mayus = (v: Celda) => normalizar(texto(v) ?? "");
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Encabezados de la Matriz (sin acentos ni signos, como los deja `normalizar`). */
const ENCABEZADOS = {
  tienda: ["TIENDA"],
  fecha: ["FECHA"],
  numero: ["N ORDEN", "NO ORDEN", "NUMERO ORDEN"],
  nombre: ["NOMBRES Y APELLIDOS", "NOMBRE Y APELLIDO"],
  total: ["TOTAL VENTA"],
  cantidad: ["CANTIDAD"],
  producto: ["NOMBRE PRODUCTO", "NOMBRE DEL PRODUCTO"],
  corregimiento: ["CORREGIMIENTO"],
  direccion: ["DIRECCION"],
  telefono: ["TELEFONO"],
  estado_pago: ["ESTADO PEDIDO SHOPIFY", "ESTADO DEL PEDIDO"],
  etiquetas: ["ETIQUETAS", "ETIQUETAS CANCELACION"],
  notas: ["NOTAS"],
  forma_pago: ["FORMA DE PAGO"],
  verificado: ["VERIFICADO"],
  courier: ["COURIER"],
  monto_envio: ["MONTO ENVIO"],
  fecha_envio: ["FECHA DE ENVIO"],
  costo: ["COSTO PRODUCTO"],
  motivo: ["MOTIVOS DE CANCELACIONES", "MOTIVO DE CANCELACION"],
  monto_envio_se: ["MONTO ENVIO SE"],
  resultado: ["EXITOSA FALLIDA"],
  mes: ["MES"],
  devuelto_se: ["DEVUELTOS SE"],
  facturado: ["FACTURADO CON ITBMS"],
  factura: ["N FACTURA", "NO FACTURA"],
  sku: ["SKU"],
} as const;
type Campo = keyof typeof ENCABEZADOS;

/** La fila de títulos (dentro de las primeras 10) y la columna de cada campo. */
export function ubicarColumnasMatriz(filas: Celda[][]): { fila: number; columnas: Partial<Record<Campo, number>> } | null {
  for (let i = 0; i < Math.min(filas.length, 10); i++) {
    const titulos = (filas[i] ?? []).map((c) => mayus(c));
    if (!titulos.includes("TIENDA") || !titulos.includes("TOTAL VENTA")) continue;
    const columnas: Partial<Record<Campo, number>> = {};
    for (const [campo, nombres] of Object.entries(ENCABEZADOS) as [Campo, readonly string[]][]) {
      const j = titulos.findIndex((t) => nombres.includes(t));
      if (j >= 0) columnas[campo] = j;
    }
    if (columnas.numero === undefined || columnas.fecha === undefined) continue;
    return { fila: i, columnas };
  }
  return null;
}

const COBRADO: [RegExp, MetodoPago][] = [
  [/^EFECTIVO/, "efectivo"],
  [/^YAPPY/, "yappy"],
  [/^TRANSFERENCIA/, "transferencia"],
  [/^(STRIPE|MIPOS|TARJETA|TDC)/, "tarjeta"],
  [/^(INFORME|INFROME|DEPOSITO SERVIENTREGA|DEPOSITO)/, "servientrega"],
  [/^GESTIONADO POR CLICKSI/, "clicksi"],
  [/^PREVIO PAGO/, "previo_pago"],
  [/^(ENTREGADO|PAGADO)/, "otro"],
];

/** Cómo se cobró, según «FORMA DE PAGO» (null si no dice un cobro: cancelado, no gestionado, vacío). */
export function metodoDePago(formaPago: string | null): MetodoPago | null {
  const t = normalizar(formaPago ?? "");
  for (const [re, m] of COBRADO) if (re.test(t)) return m;
  return null;
}

const CANCELADO = /^(CANCELAD|CANCELACION|ANULAD)/;
const NO_GESTIONADO = /^NO GESTIONADO|^PEDIDO DUPLICADO/;
const DEVUELTO = /^(REEMBOLS|DEVUEL|PEDIDO EXTRAVIADO)/;
const SERVICIO = /^(ENVIO\b|ENVIO PRIORITARIO|GARANTIA|PROTECCION|SEGURO DE ENVIO)/;
/** Lo que se escribe en COURIER cuando no es un transportista sino un estado. */
const NO_ES_COURIER = /^(CANCELAD|CANCELACION|NO GESTIONADO|ENVIO PRIORITARIO|ENTREGADO|REEMBOLS|PEDIDO EXTRAVIADO)/;

export interface DatosEstado {
  total: number;
  formaPago: string | null;
  courier: string | null;
  verificado: string | null;
  estadoShopify: string | null;
  resultado: string | null;
  fechaEnvio: string | null;
  fechaDevolucion: string | null;
}

/**
 * El estado de entrega de una orden. Entregada = cobrada (una forma de pago de cobro) y con monto; devuelta = Fallido
 * como último resultado de Servientrega, con fecha de devolución o reembolsada; luego cancelada, no gestionada, en
 * tránsito (ya salió) o pendiente.
 */
export function estadoDeEntrega(d: DatosEstado): EstadoEntrega {
  const fp = normalizar(d.formaPago ?? "");
  const courier = normalizar(d.courier ?? "");
  const verificado = normalizar(d.verificado ?? "");
  const shopify = normalizar(d.estadoShopify ?? "");
  const resultados = normalizar(d.resultado ?? "").split(/\s+/).filter(Boolean);
  const ultimo = resultados[resultados.length - 1] ?? "";
  if (d.total > 0 && metodoDePago(d.formaPago) !== null) return "entregada";
  if (d.total > 0 && /^EXITOS/.test(ultimo)) return "entregada";
  if (/^FALLID/.test(ultimo) || d.fechaDevolucion || DEVUELTO.test(fp) || DEVUELTO.test(courier) || shopify === "REFUNDED") return "devuelta";
  if (CANCELADO.test(fp) || CANCELADO.test(courier) || CANCELADO.test(verificado) || shopify === "VOIDED") return "cancelada";
  if (NO_GESTIONADO.test(fp) || NO_GESTIONADO.test(courier)) return "no_gestionada";
  if (d.fechaEnvio || (courier && !NO_ES_COURIER.test(courier))) return "en_transito";
  return "pendiente";
}

/** Un transportista legible: «ANDRES ALVARES» y «ANDRÉS ÁLVAREZ» son el mismo; los estados no son transportistas. */
export function transportistaDe(courier: string | null): string | null {
  const t = normalizar(courier ?? "");
  if (!t || NO_ES_COURIER.test(t)) return null;
  if (/^ANDRES ALVAR/.test(t)) return "ANDRES ALVAREZ";
  return t.slice(0, 80);
}

/** Una celda que en la Matriz puede traer una fecha o un estado («ENTREGADO», «D-08/04/2026»). */
function fechaDe(v: Celda): string | null {
  if (typeof v === "number" || v instanceof Date) return leerFecha(v);
  const s = texto(v);
  if (!s) return null;
  const directa = leerFecha(s);
  if (directa) return directa;
  const m = s.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
  return m ? leerFecha(m[1]) : null;
}

/** Un número que en la Matriz también puede traer un estado escrito: solo vale si es número. */
const numero = (v: Celda): number | null => (typeof v === "number" ? (Number.isFinite(v) ? v : null) : null);

/** El teléfono como texto (a veces llega como número). */
const telefono = (v: Celda): string | null => {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? String(Math.trunc(v)) : null;
  const s = texto(v);
  return s && s !== "0" ? s.slice(0, 40) : null;
};

/** Datos extra de una orden que llegan de otras hojas. */
export interface Complemento {
  guia?: string | null;
  /** De Monday: solo se usa si la Matriz todavía no dice nada del cobro. */
  monday?: { formaPago: string | null; delivery: string | null; estado: string | null; pagado: boolean; costoEnvio: number | null } | null;
}

/** Llave para cruzar las hojas: «OFERFY|#144098». */
export const llaveOrden = (tienda: string, numeroOrden: string) => `${unidadDeTienda(tienda)}|${numeroOrden.trim().toUpperCase()}`;

/**
 * Lee la Matriz: agrupa las líneas por orden (tienda + número) y devuelve una orden por grupo con sus líneas, su estado,
 * su método de pago y los datos de la persona aparte. `complementos` (por `llaveOrden`) suma la guía y Monday.
 */
export function leerMatriz(
  filas: Celda[][],
  complementos: Map<string, Complemento> = new Map(),
): { ordenes: OrdenVenta[]; descartadas: FilaDescartada[]; lineas: number } {
  const ubicacion = ubicarColumnasMatriz(filas);
  if (!ubicacion) return { ordenes: [], descartadas: [{ fila: 0, motivo: "no encontré la fila de títulos" }], lineas: 0 };
  const c = ubicacion.columnas;
  const celda = (f: Celda[], campo: Campo): Celda => (c[campo] === undefined ? null : f[c[campo]!]);
  const descartadas: FilaDescartada[] = [];
  const grupos = new Map<string, { fila: number; celdas: Celda[] }[]>();
  let lineas = 0;
  for (let i = ubicacion.fila + 1; i < filas.length; i++) {
    const f = filas[i] ?? [];
    const tienda = texto(celda(f, "tienda"));
    const num = texto(celda(f, "numero"));
    if (!tienda && !num) continue;
    if (!tienda || !num) {
      descartadas.push({ fila: i + 1, motivo: tienda ? "sin número de orden" : "sin tienda" });
      continue;
    }
    if (!leerFecha(celda(f, "fecha"))) {
      descartadas.push({ fila: i + 1, motivo: "sin fecha" });
      continue;
    }
    lineas++;
    const llave = llaveOrden(tienda, num);
    const g = grupos.get(llave);
    if (g) g.push({ fila: i + 1, celdas: f });
    else grupos.set(llave, [{ fila: i + 1, celdas: f }]);
  }

  const ordenes: OrdenVenta[] = [];
  for (const [llave, grupo] of grupos) {
    const ls = grupo.map((g) => g.celdas);
    // La línea principal: la que lleva el TOTAL VENTA como número (las demás dicen «DUPLICADO»).
    const principal = ls.find((l) => (numero(celda(l, "total")) ?? 0) > 0) ?? ls.find((l) => numero(celda(l, "total")) !== null) ?? ls[0];
    const p = (campo: Campo) => celda(principal, campo);
    const total = r2(ls.reduce((a, l) => a + Math.max(0, numero(celda(l, "total")) ?? 0), 0));
    const fecha = leerFecha(p("fecha"))!;
    const comp = complementos.get(llave);
    let formaPago = texto(p("forma_pago"));
    let courier = texto(p("courier"));
    let costoRepartidor = Math.max(0, ...ls.map((l) => numero(celda(l, "monto_envio")) ?? 0));
    const costoSe = Math.max(0, ...ls.map((l) => numero(celda(l, "monto_envio_se")) ?? 0));
    // Monday solo completa lo que la Matriz todavía no dice (órdenes recientes).
    if (comp?.monday && !metodoDePago(formaPago) && !CANCELADO.test(normalizar(formaPago ?? "")) && comp.monday.pagado) {
      formaPago = comp.monday.formaPago ?? formaPago;
      courier = courier ?? comp.monday.delivery;
      if (!costoRepartidor && comp.monday.costoEnvio) costoRepartidor = comp.monday.costoEnvio;
    }
    const fechaEnvio = fechaDe(p("fecha_envio"));
    const fechaDevolucion = fechaDe(p("devuelto_se"));
    const resultado = texto(p("resultado"));
    const estado = estadoDeEntrega({
      total,
      formaPago,
      courier,
      verificado: texto(p("verificado")),
      estadoShopify: texto(p("estado_pago")),
      resultado,
      fechaEnvio,
      fechaDevolucion,
    });
    const fp = normalizar(formaPago ?? "");
    const informe = fp.match(/^(?:INFORME|INFROME) (\d+)/);
    const motivo = texto(p("motivo"));
    const lineasOrden: LineaVenta[] = ls.map((l, k) => {
      const producto = (texto(celda(l, "producto")) ?? "(sin nombre)").slice(0, 300);
      const clave = normalizar(producto);
      const cantidad = numero(celda(l, "cantidad"));
      const costo = numero(celda(l, "costo"));
      return {
        linea: k + 1,
        producto,
        producto_clave: clave,
        cantidad: cantidad && cantidad > 0 ? cantidad : 1,
        sku: texto(celda(l, "sku"))?.slice(0, 80) ?? null,
        costo_excel: costo !== null && costo >= 0 ? r2(costo) : null,
        es_servicio: SERVICIO.test(clave),
      };
    });
    const numeroOrden = llave.split("|")[1];
    const tienda = llave.split("|")[0];
    const cliente: ClienteVenta = {
      nombre: texto(p("nombre"))?.slice(0, 200) ?? null,
      telefono: telefono(p("telefono")),
      direccion: texto(p("direccion"))?.slice(0, 500) ?? null,
      corregimiento: texto(p("corregimiento"))?.slice(0, 200) ?? null,
      notas: texto(p("notas"))?.slice(0, 500) ?? null,
    };
    const orden: Omit<OrdenVenta, "huella_contenido"> = {
      tienda,
      numero: numeroOrden,
      fecha,
      periodo: `${fecha.slice(0, 7)}-01`,
      estado_pago: texto(p("estado_pago"))?.toUpperCase().slice(0, 30) ?? null,
      estado_entrega: estado,
      metodo_pago: metodoDePago(formaPago),
      forma_pago_texto: formaPago?.slice(0, 80) ?? null,
      informe_servientrega: informe ? informe[1] : null,
      transportista: transportistaDe(courier),
      guia: comp?.guia ?? null,
      fecha_envio: fechaEnvio,
      fecha_devolucion: fechaDevolucion,
      resultado_courier: resultado?.slice(0, 80) ?? null,
      subtotal: total,
      envio: 0,
      descuento: 0,
      total,
      costo_envio: r2(costoRepartidor + costoSe),
      facturado: mayus(p("facturado")) === "FACTURADO",
      factura_numero: texto(p("factura"))?.slice(0, 40) ?? null,
      mes_gestion: texto(p("mes"))?.slice(0, 60) ?? null,
      // En algunas filas esa columna trae el costo (un número): no es un motivo.
      motivo_cancelacion: motivo && leerMonto(motivo) === null ? motivo.slice(0, 200) : null,
      etiquetas: texto(p("etiquetas"))?.slice(0, 300) ?? null,
      lineas: lineasOrden,
      cliente,
      origen_clave: huella(`ventas|${llave}`),
    };
    ordenes.push({ ...orden, huella_contenido: huella(JSON.stringify(orden)) });
  }
  return { ordenes, descartadas, lineas };
}

/** Las guías de Servientrega de la hoja «Informe SE» (columnas Guia, Nombre Cliente = tienda, Numero factura = orden). */
export function leerGuias(filas: Celda[][]): Map<string, string> {
  const guias = new Map<string, string>();
  const i = filas.findIndex((f) => (f ?? []).some((c) => mayus(c) === "GUIA"));
  if (i < 0) return guias;
  const t = filas[i].map((c) => mayus(c));
  const cGuia = t.indexOf("GUIA");
  const cTienda = t.indexOf("NOMBRE CLIENTE");
  const cOrden = t.indexOf("NUMERO FACTURA");
  if (cGuia < 0 || cTienda < 0 || cOrden < 0) return guias;
  for (const f of filas.slice(i + 1)) {
    const guia = texto(f?.[cGuia]);
    const tienda = texto(f?.[cTienda]);
    const orden = texto(f?.[cOrden]);
    if (guia && tienda && orden && /^#?\w+$/.test(orden)) guias.set(llaveOrden(tienda, orden.startsWith("#") ? orden : `#${orden}`), guia.slice(0, 40));
  }
  return guias;
}

/** El estado de cobro que lleva Monday («Name-Tienda» = «OFERFY-#143678»). */
export function leerMonday(filas: Celda[][]): Map<string, NonNullable<Complemento["monday"]>> {
  const salida = new Map<string, NonNullable<Complemento["monday"]>>();
  const i = filas.findIndex((f) => (f ?? []).some((c) => mayus(c) === "NAME TIENDA"));
  if (i < 0) return salida;
  const t = filas[i].map((c) => mayus(c));
  const col = (n: string) => t.indexOf(n);
  const [cNombre, cDelivery, cEstado, cPago, cForma, cCosto] = [
    col("NAME TIENDA"),
    col("DELIVERY"),
    col("ESTADO"),
    col("EDO PAGO"),
    col("FORMA DE PAGO"),
    col("COSTE ENVIO"),
  ];
  for (const f of filas.slice(i + 1)) {
    const nombre = texto(f?.[cNombre]);
    const m = nombre?.match(/^(.+?)-(#\S+)$/);
    if (!m) continue;
    const estado = mayus(f?.[cEstado]);
    salida.set(llaveOrden(m[1], m[2]), {
      formaPago: texto(f?.[cForma]),
      delivery: texto(f?.[cDelivery]),
      estado: estado || null,
      pagado: estado === "ENTREGADO" && mayus(f?.[cPago]) === "PAGADO",
      costoEnvio: numero(f?.[cCosto]),
    });
  }
  return salida;
}

/** Junta guías y Monday en los complementos que recibe `leerMatriz`. */
export function complementos(guias: Map<string, string>, monday: Map<string, NonNullable<Complemento["monday"]>>): Map<string, Complemento> {
  const salida = new Map<string, Complemento>();
  for (const [k, g] of guias) salida.set(k, { guia: g });
  for (const [k, m] of monday) salida.set(k, { ...(salida.get(k) ?? {}), monday: m });
  return salida;
}

/**
 * El mapeo «nombre del producto en la Matriz → producto de costo» de la hoja «BASE COSTO ECOMFIVE» (columnas «PRODUCTO
 * MATRIZ NUVO / OFERFY / KENKU / CLICKSI»; el producto de costo es «NOMBRE HOMOLOGADO» o, si está vacío, «PRODUCTO», la
 * misma regla que usa Costos de mercancía para su `producto_clave`).
 */
export function leerMapeoProductos(filas: Celda[][]): { producto_clave: string; producto: string; costo_clave: string }[] {
  const i = filas.findIndex((f) => (f ?? []).some((c) => mayus(c).startsWith("PRODUCTO MATRIZ")));
  if (i < 0) return [];
  const t = filas[i].map((c) => mayus(c));
  const cHomologado = t.indexOf("NOMBRE HOMOLOGADO");
  const cProducto = t.indexOf("PRODUCTO");
  const cMatriz = t.map((x, j) => (x.startsWith("PRODUCTO MATRIZ") || x.startsWith("COLUMNA COMPLEMENTARIA") ? j : -1)).filter((j) => j >= 0);
  const salida = new Map<string, { producto_clave: string; producto: string; costo_clave: string }>();
  for (const f of filas.slice(i + 1)) {
    const homologado = texto(f?.[cHomologado]);
    const costo = homologado && homologado.length > 2 ? homologado : texto(f?.[cProducto]);
    if (!costo) continue;
    for (const j of cMatriz) {
      const nombre = texto(f?.[j]);
      if (!nombre) continue;
      const clave = normalizar(nombre);
      if (clave) salida.set(clave, { producto_clave: clave, producto: nombre.slice(0, 300), costo_clave: normalizar(costo) });
    }
  }
  return [...salida.values()];
}

/** Resumen por tienda y mes de lo leído (para revisar antes de cargar y para el script). */
export interface ResumenLeido {
  tienda: string;
  periodo: string;
  ordenes: number;
  entregadas: number;
  ventas: number;
}

export function resumirLeido(ordenes: OrdenVenta[]): ResumenLeido[] {
  const mapa = new Map<string, ResumenLeido>();
  for (const o of ordenes) {
    const k = `${o.tienda}|${o.periodo}`;
    const x = mapa.get(k) ?? { tienda: o.tienda, periodo: o.periodo, ordenes: 0, entregadas: 0, ventas: 0 };
    x.ordenes++;
    if (o.estado_entrega === "entregada") {
      x.entregadas++;
      x.ventas = r2(x.ventas + o.total);
    }
    mapa.set(k, x);
  }
  return [...mapa.values()].sort((a, b) => a.periodo.localeCompare(b.periodo) || a.tienda.localeCompare(b.tienda));
}
