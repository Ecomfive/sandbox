/**
 * Dañados y devoluciones en las plataformas (migración 0243, 6 nov 2026, pedido de Hernán, flujograma de Costa Rica): se registran a mano y se resuelven. Lógica pura, con prueba.
 */

export type TipoNovedad = "danado" | "devolucion";
export type EstadoNovedad = "por_revisar" | "baja" | "reclamo" | "vuelve" | "no_vuelve";

export const ETIQUETA_TIPO_NOVEDAD: Record<TipoNovedad, string> = { danado: "Dañado", devolucion: "Devolución" };
export const ETIQUETA_ESTADO_NOVEDAD: Record<EstadoNovedad, string> = {
  por_revisar: "Por revisar",
  baja: "Baja por dañado",
  reclamo: "Reclamo: posible robo",
  vuelve: "Vuelve al inventario",
  no_vuelve: "Dañado: no vuelve",
};

/** Las dos salidas de cada novedad: la primera es la pregunta en positivo («¿se confirma el daño?», «¿está en buen estado?»). */
export const RESULTADOS: Record<TipoNovedad, { valor: EstadoNovedad; boton: string }[]> = {
  danado: [
    { valor: "baja", boton: "Se confirma: baja" },
    { valor: "reclamo", boton: "No se confirma: reclamo" },
  ],
  devolucion: [
    { valor: "vuelve", boton: "Buen estado: vuelve" },
    { valor: "no_vuelve", boton: "Dañado: no vuelve" },
  ],
};

/** Lo que el cuadro le resta a lo que debería haber: unidades que ya no están para la venta. Un reclamo no resta: sigue siendo una diferencia por aclarar. */
export const ESTADOS_QUE_RESTAN: readonly EstadoNovedad[] = ["baja", "no_vuelve"];

/** «NOV-0012»: el número que se ve en la lista. */
export const numeroNovedad = (n: number) => `NOV-${String(n).padStart(4, "0")}`;

const ES_ID = /^[0-9a-fA-F-]{8,64}$/;
/** Una foto subida para una novedad: la ruta la da el servidor, y aquí se comprueba que no venga de otro lado. */
export const RUTA_FOTO_NOVEDAD = /^novedades\/[0-9a-fA-F-]{36}\/[A-Za-z0-9._-]+$/;

export interface NovedadNueva {
  tipo: TipoNovedad;
  bodega: string;
  sku: string;
  cantidad: number;
  referencia: string | null;
  nota: string | null;
  foto: string | null;
  retornoOficina: boolean;
}

/** Revisa lo que manda el formulario. Un dañado necesita su prueba: la foto o que volvió a la oficina. */
export function revisarNovedad(d: Record<string, unknown>): NovedadNueva | { error: string } {
  if (d.tipo !== "danado" && d.tipo !== "devolucion") return { error: "Elige si es dañado o devolución." };
  const bodega = typeof d.bodega === "string" ? d.bodega : "";
  if (!ES_ID.test(bodega)) return { error: "Elige la plataforma." };
  const sku = typeof d.sku === "string" ? d.sku : "";
  if (!ES_ID.test(sku)) return { error: "Elige el producto." };
  const cantidad = Number(d.cantidad);
  if (!Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 1_000_000) return { error: "Escribe cuántas unidades son." };
  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "") || null;
  const foto = typeof d.foto === "string" && d.foto ? d.foto : null;
  if (foto && !RUTA_FOTO_NOVEDAD.test(foto)) return { error: "La foto no es válida: vuelve a subirla." };
  const retornoOficina = d.retornoOficina === true;
  if (d.tipo === "danado" && !foto && !retornoOficina) return { error: "Un dañado necesita una foto o que el producto vuelva a la oficina." };
  return { tipo: d.tipo, bodega, sku, cantidad, referencia: texto(d.referencia, 120), nota: texto(d.nota, 500), foto, retornoOficina };
}

/** Quién puede resolver: un dañado, quien esté en `autoriza_a` (nunca quien lo reportó); una devolución, cualquiera con edición. Devuelve el motivo si no puede. */
export function motivoNoResolver(n: { tipo: TipoNovedad; estado: EstadoNovedad; autorizaA: readonly string[]; creadoPor: string | null }, usuario: string): string | null {
  if (n.estado !== "por_revisar") return "Esa novedad ya se resolvió.";
  if (n.tipo === "devolucion") return null;
  if (n.creadoPor === usuario) return "Quien reportó el dañado no lo confirma.";
  return n.autorizaA.includes(usuario) ? null : "Un dañado lo confirma quien autoriza en este país.";
}

/** Si ese resultado es de ese tipo de novedad. */
export const resultadoValido = (tipo: TipoNovedad, resultado: unknown): resultado is EstadoNovedad => RESULTADOS[tipo].some((r) => r.valor === resultado);
