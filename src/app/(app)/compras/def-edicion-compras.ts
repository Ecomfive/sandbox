// Qué datos de una compra se editan directo en su celda de la lista y cómo se validan. Es lógica pura (sin base ni React): la
// usan la celda (para mostrar el cambio al instante) y la acción del servidor (que vuelve a validar, es la que manda).

import { colorEstado, colorEtapa, ESTADOS_COMPRA, ETAPAS_COMPRA, VIAS_ENVIO, type FilaCompra } from "./def-compras";

export type TipoCampoEditable = "texto" | "entero" | "dinero" | "fecha" | "seleccion" | "multiple" | "booleano" | "lista";

export interface CampoEditable {
  etiqueta: string;
  /** La propiedad de `FilaCompra` que se ve en la lista. */
  prop: keyof FilaCompra;
  /** La columna de `wms_compras` donde se guarda. */
  columna: string;
  tipo: TipoCampoEditable;
  opciones?: readonly { valor: string; etiqueta: string }[];
  /** En una selección: se puede dejar sin valor. */
  admiteVacio?: boolean;
  /** El color de cada opción (la insignia que se ve en la celda y en su lista). */
  color?: (valor: string) => string | undefined;
  /** Con productos vinculados la cantidad y el monto se calculan de ellos, así que no se escriben a mano (igual que en la ficha). */
  soloSinProductos?: boolean;
}

/**
 * Las columnas editables de la lista, por el `id` de la columna. Quedan fuera lo que pone el sistema (N.º OC, código, creada,
 * cerrada), lo que es una fórmula (días, valor unitario), el país (mueve la compra de lista y de código), la foto y la
 * persona asignada: eso se cambia en la ficha o no se cambia. El nombre de la compra se edita en su ficha.
 */
export const CAMPOS_EDITABLES: Record<string, CampoEditable> = {
  etapa: { etiqueta: "Etapa", prop: "etapa", columna: "etapa", tipo: "seleccion", opciones: ETAPAS_COMPRA, color: colorEtapa },
  estado: { etiqueta: "Estado", prop: "estado", columna: "estado", tipo: "seleccion", opciones: ESTADOS_COMPRA, color: colorEstado },
  viaEnvio: { etiqueta: "Vía de envío", prop: "viaEnvio", columna: "via_envio", tipo: "multiple", opciones: VIAS_ENVIO },
  proveedor: { etiqueta: "Proveedor", prop: "proveedor", columna: "proveedor", tipo: "texto" },
  tienda: { etiqueta: "Tienda", prop: "tiendas", columna: "tiendas", tipo: "lista" },
  etiquetas: { etiqueta: "Etiquetas", prop: "etiquetas", columna: "etiquetas", tipo: "lista" },
  planificacion: { etiqueta: "Planificación", prop: "planificacion", columna: "planificacion", tipo: "texto" },
  qtyTotal: { etiqueta: "QTY Total", prop: "qtyTotal", columna: "qty_total", tipo: "entero", soloSinProductos: true },
  montoTotal: { etiqueta: "Monto Total", prop: "montoTotal", columna: "monto_total", tipo: "dinero", soloSinProductos: true },
  primerPago: { etiqueta: "Primer Pago", prop: "primerPago", columna: "primer_pago", tipo: "dinero" },
  segundoPago: { etiqueta: "Segundo Pago", prop: "segundoPago", columna: "segundo_pago", tipo: "dinero" },
  pagadoAProveedor: { etiqueta: "Pagado a Proveedor", prop: "pagadoAProveedor", columna: "pagado_a_proveedor", tipo: "dinero" },
  factura: { etiqueta: "Factura", prop: "factura", columna: "factura", tipo: "booleano" },
  financiamiento: { etiqueta: "Financiamiento", prop: "financiamiento", columna: "financiamiento", tipo: "booleano" },
  fechaLimite: { etiqueta: "Fecha límite", prop: "fechaLimite", columna: "fecha_limite", tipo: "fecha" },
  fechaLlegada: { etiqueta: "Fecha de llegada", prop: "fechaLlegada", columna: "fecha_llegada", tipo: "fecha" },
  fechaPago1: { etiqueta: "Fecha de Pago (1)", prop: "fechaPago1", columna: "fecha_pago_1", tipo: "fecha" },
  fechaPago2: { etiqueta: "Fecha de Pago (2)", prop: "fechaPago2", columna: "fecha_pago_2", tipo: "fecha" },
  fechaEnvio: { etiqueta: "Fecha de Envío", prop: "fechaEnvio", columna: "fecha_envio", tipo: "fecha" },
};

export const campoEditable = (id: string): CampoEditable | undefined =>
  Object.prototype.hasOwnProperty.call(CAMPOS_EDITABLES, id) ? CAMPOS_EDITABLES[id] : undefined;

/** Lo que se guarda y lo que se ve en la lista: del mismo tipo que la propiedad de `FilaCompra`. */
export type ValorCampo = string | number | boolean | string[] | null;

const MAX_TEXTO = 500;
const MAX_NUMERO = 1_000_000_000;

/** «a, b ,c» → ["a", "b", "c"] (sin vacíos ni repetidos). */
function listaDeTexto(bruto: unknown): string[] {
  const partes = Array.isArray(bruto) ? bruto.map(String) : typeof bruto === "string" ? bruto.split(",") : [];
  return [...new Set(partes.map((x) => x.trim()).filter(Boolean))].slice(0, 30).map((x) => x.slice(0, 80));
}

/**
 * Limpia y valida lo que se escribió en una celda. Devuelve el valor ya listo para guardar (y para mostrar) o el error
 * como texto. La misma función corre en el navegador y en el servidor: el servidor no se fía de lo que llega.
 */
export function normalizarValor(def: CampoEditable, bruto: unknown): { valor: ValorCampo } | { error: string } {
  const vacio = bruto === null || bruto === undefined || (typeof bruto === "string" && bruto.trim() === "");
  switch (def.tipo) {
    case "texto": {
      const texto = typeof bruto === "string" ? bruto.trim() : "";
      if (texto.length > MAX_TEXTO) return { error: `${def.etiqueta} es muy largo (máximo ${MAX_TEXTO} caracteres).` };
      return { valor: texto || null };
    }
    case "entero":
    case "dinero": {
      if (vacio) return { valor: null };
      const n = typeof bruto === "number" ? bruto : Number(String(bruto).trim());
      if (!Number.isFinite(n) || n < 0 || n > MAX_NUMERO) return { error: `${def.etiqueta} debe ser un número de 0 en adelante.` };
      if (def.tipo === "entero") return Number.isInteger(n) ? { valor: n } : { error: `${def.etiqueta} debe ser un número entero.` };
      return { valor: Math.round(n * 100) / 100 };
    }
    case "fecha": {
      if (vacio) return { valor: null };
      const texto = String(bruto).trim();
      const fecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
      const real = fecha ? new Date(Date.UTC(Number(fecha[1]), Number(fecha[2]) - 1, Number(fecha[3]))) : null;
      const valida = fecha && real && real.toISOString().slice(0, 10) === texto && Number(fecha[1]) >= 2000 && Number(fecha[1]) <= 2100;
      return valida ? { valor: texto } : { error: `${def.etiqueta} no es una fecha válida.` };
    }
    case "seleccion": {
      if (vacio) return def.admiteVacio ? { valor: null } : { error: `Elige ${def.etiqueta.toLowerCase()}.` };
      const valor = String(bruto);
      return def.opciones?.some((o) => o.valor === valor) ? { valor } : { error: `${def.etiqueta} no es válida.` };
    }
    case "multiple": {
      const elegidas = Array.isArray(bruto) ? bruto.map(String) : [];
      const validas = (def.opciones ?? []).map((o) => o.valor);
      if (elegidas.some((v) => !validas.includes(v))) return { error: `${def.etiqueta} no es válida.` };
      return { valor: validas.filter((v) => elegidas.includes(v)) };
    }
    case "booleano":
      return { valor: bruto === true };
    case "lista":
      return { valor: listaDeTexto(bruto) };
  }
}

/** El valor como se lee en el historial de cambios («Chin», «Sí», «Marítimo, Aéreo», «—»). */
export function textoDeValor(def: CampoEditable, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (Array.isArray(valor)) return valor.length ? valor.map((v) => def.opciones?.find((o) => o.valor === v)?.etiqueta ?? String(v)).join(", ") : "—";
  return def.opciones?.find((o) => o.valor === valor)?.etiqueta ?? String(valor);
}
