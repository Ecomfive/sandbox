// Lo que una persona puede ver y hacer dentro de Compras según lo que su rol (y ella misma) tienen afinado en Usuarios y roles
// (ver `src/lib/permisos/`). Lógica pura: la usan el servidor (que es quien manda: oculta datos, rechaza cambios y filtra compras)
// y la pantalla (que solo esconde lo que ya no llega).

import { alcanceDe, nivelDeCampo, type Afinado } from "@/lib/permisos/afinado";
import { CATALOGO_COMPRAS } from "@/lib/permisos/catalogo";
import type { FilaCompra } from "./def-compras";

/** Las claves del catálogo de Compras que son campos. */
const CAMPOS_DEL_CATALOGO = new Map(CATALOGO_COMPRAS.grupos.flatMap((g) => g.campos).map((c) => [c.clave, c]));

/** Qué propiedades de la compra que llega a la pantalla son de cada campo del catálogo. */
const PROPIEDADES: Record<string, (keyof FilaCompra)[]> = {
  monto: ["montoTotal"],
  pago1: ["primerPago", "fechaPago1"],
  pago2: ["segundoPago", "fechaPago2"],
  pagado: ["pagadoAProveedor"],
  proveedor: ["proveedor"],
  agente: ["agenteEnvio"],
  via: ["viaEnvio"],
  tienda: ["tiendas"],
  etiquetas: ["etiquetas"],
  limite: ["fechaLimite"],
};

/** Qué columnas de la tabla son de cada campo del catálogo. El valor unitario sale del monto: si se oculta uno, se oculta el otro. */
const COLUMNAS: Record<string, string[]> = {
  monto: ["montoTotal", "valorUnitario"],
  pago1: ["primerPago", "fechaPago1"],
  pago2: ["segundoPago", "fechaPago2"],
  pagado: ["pagadoAProveedor"],
  unitario: ["valorUnitario"],
  proveedor: ["proveedor"],
  agente: ["agenteEnvio"],
  via: ["viaEnvio"],
  tienda: ["tienda"],
  limite: ["fechaLimite"],
};

/** El campo del catálogo al que pertenece un dato que se edita en una celda (`CAMPOS_EDITABLES`), o `undefined` si ningún rol lo gobierna. */
const CAMPO_DE_CELDA: Record<string, string> = {
  etapa: "etapa",
  estado: "estado",
  viaEnvio: "via",
  proveedor: "proveedor",
  agenteEnvio: "agente",
  tienda: "tienda",
  etiquetas: "etiquetas",
  montoTotal: "monto",
  primerPago: "pago1",
  segundoPago: "pago2",
  pagadoAProveedor: "pagado",
  fechaLimite: "limite",
  fechaPago1: "pago1",
  fechaPago2: "pago2",
};

/** El campo del catálogo al que pertenece una columna de `wms_compras` (lo que lee `leerCambios` al guardar la ficha). */
const CAMPO_DE_COLUMNA: Record<string, string> = {
  proveedor: "proveedor",
  agente_envio: "agente",
  tiendas: "tienda",
  monto_total: "monto",
  primer_pago: "pago1",
  segundo_pago: "pago2",
  pagado_a_proveedor: "pagado",
  fecha_pago_1: "pago1",
  fecha_pago_2: "pago2",
  fecha_limite: "limite",
  via_envio: "via",
  etiquetas: "etiquetas",
  etapa: "etapa",
  estado: "estado",
};

/** El campo del catálogo al que pertenece un cambio anotado en la Actividad (por el nombre con que se anota). */
const CAMPO_DE_ACTIVIDAD: Record<string, string> = { ...CAMPO_DE_CELDA };

export const ES_ALCANCE_LIMITADO = (alcance: string) => alcance === "asignadas" || alcance === "creadas";

export interface RestriccionesCompras {
  /** Los campos del catálogo que no ve. */
  ocultos: string[];
  /** Los campos que ve pero no edita (los calculados no cuentan: siempre son de solo ver). */
  soloVer: string[];
  /** Las acciones que no puede usar. */
  bloqueadas: string[];
  /** `todas`, `asignadas` o `creadas`. */
  alcance: string;
}

export const SIN_RESTRICCIONES: RestriccionesCompras = { ocultos: [], soloVer: [], bloqueadas: [], alcance: "todas" };

/** Lo afinado de Compras de una persona, en la forma que usan la tabla, la ficha y las acciones. */
export function restriccionesDe(afinado: Afinado | undefined): RestriccionesCompras {
  if (!afinado) return SIN_RESTRICCIONES;
  const ocultos: string[] = [];
  const soloVer: string[] = [];
  for (const [clave, def] of CAMPOS_DEL_CATALOGO) {
    const nivel = nivelDeCampo(afinado, clave, def.editable);
    if (nivel === "oculto") ocultos.push(clave);
    else if (nivel === "ver" && def.editable) soloVer.push(clave);
  }
  // Sin el monto no hay valor unitario, aunque no se haya marcado.
  if (ocultos.includes("monto") && !ocultos.includes("unitario")) ocultos.push("unitario");
  return { ocultos, soloVer, bloqueadas: afinado.accionesBloqueadas, alcance: alcanceDe(afinado) };
}

export const accionPermitidaEnCompras = (r: RestriccionesCompras, accion: string): boolean => !r.bloqueadas.includes(accion);
export const campoOculto = (r: RestriccionesCompras, clave: string): boolean => r.ocultos.includes(clave);
export const campoEditable = (r: RestriccionesCompras, clave: string): boolean => !r.ocultos.includes(clave) && !r.soloVer.includes(clave);

/** Las columnas de la tabla que no se dibujan. */
export const columnasOcultas = (r: RestriccionesCompras): string[] => [...new Set(r.ocultos.flatMap((c) => COLUMNAS[c] ?? []))];

/** ¿Se puede cambiar este dato (uno de `CAMPOS_EDITABLES`) desde su celda o el cambio en lote? Los datos que ningún rol gobierna, sí. */
export function celdaEditable(r: RestriccionesCompras, campo: string): boolean {
  const clave = CAMPO_DE_CELDA[campo];
  return !clave || campoEditable(r, clave);
}

/** Quita de lo que llegó del formulario las columnas que la persona no puede cambiar, para que guardar la ficha no las pise (un campo oculto no viaja en el formulario y se guardaría vacío). */
export function sinColumnasBloqueadas<T extends Record<string, unknown>>(cambios: T, r: RestriccionesCompras): T {
  const resultado: Record<string, unknown> = { ...cambios };
  for (const columna of Object.keys(resultado)) {
    const clave = CAMPO_DE_COLUMNA[columna];
    if (clave && !campoEditable(r, clave)) delete resultado[columna];
  }
  return resultado as T;
}

/** ¿La persona puede ver este cambio anotado en la Actividad de una compra? (no si es de un dato que no ve). */
export function cambioVisibleEnActividad(r: RestriccionesCompras, campo: string): boolean {
  const clave = CAMPO_DE_ACTIVIDAD[campo];
  return !clave || !campoOculto(r, clave);
}

/** La compra como la ve la persona: lo que no ve no llega (el dato sale vacío, nunca con su valor). */
export function enmascarar(c: FilaCompra, r: RestriccionesCompras): FilaCompra {
  if (r.ocultos.length === 0) return c;
  const copia: Record<string, unknown> = { ...c };
  for (const clave of r.ocultos) {
    for (const propiedad of PROPIEDADES[clave] ?? []) copia[propiedad] = Array.isArray(c[propiedad]) ? [] : null;
  }
  return copia as unknown as FilaCompra;
}

/** Quita el monto de una línea de la Actividad («1.040 u. · $1.270,00 → 900 u. · $1.100,00» queda «1.040 u. → 900 u.»). */
export function textoSinMonto(texto: string): string {
  return texto.replace(/ · [^·→]*\$\s?[\d.,]+/g, "");
}

/** ¿Esta compra entra en lo que la persona alcanza? `usuario` trae su id y su nombre (las compras de ClickUp guardan el nombre como texto). */
export function dentroDelAlcance(
  alcance: string,
  compra: { asignadoId?: string | null; creadoPorId?: string | null; responsableNombre?: string | null; creadorNombre?: string | null },
  usuario: { id: string; nombre: string | null; email: string },
): boolean {
  if (!ES_ALCANCE_LIMITADO(alcance)) return true;
  const mismo = (texto: string | null | undefined) => {
    const t = (texto ?? "").trim().toLowerCase();
    return t !== "" && (t === (usuario.nombre ?? "").trim().toLowerCase() || t === usuario.email.toLowerCase());
  };
  if (alcance === "asignadas") return compra.asignadoId === usuario.id || mismo(compra.responsableNombre);
  return compra.creadoPorId === usuario.id || mismo(compra.creadorNombre);
}

