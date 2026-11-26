// Quién puede hacer qué en el Inventario y hasta dónde puede subir una existencia a mano (26 nov 2026, pedido de Dinora: el mismo conteo se cargó dos veces y un producto quedó con el doble).
// Lógica pura, con prueba. La usan las acciones del servidor (que mandan) y las pantallas (que solo esconden).
//
// - «total»: administradores y la persona a cargo del inventario (módulo `encargado-inventario`, que se da por persona, migración 0367): todas las bodegas, transferencias, recepción,
//   reparto y, escribiendo el motivo, pueden pasar del límite.
// - «despacho»: quien puede modificar Inventario sin estar a cargo (Yiletsi): solo la bodega «Despacho» de Panamá, sin transferir. Las remisiones siguen como estaban.
// - «lectura»: los demás.

export const MODULO_ENCARGADO_INVENTARIO = "encargado-inventario";

export type AlcanceInventario = "total" | "despacho" | "lectura";

type Acceso = { modulos: readonly string[]; modulosSoloLectura: readonly string[] };

const escribe = (u: Acceso, modulo: string): boolean => u.modulos.includes(modulo) && !u.modulosSoloLectura.includes(modulo);

/** Administra el sistema: puede modificar Usuarios y roles (la misma regla de `esAdministrador` en `permisos/acceso.ts`). */
const administra = (u: Acceso): boolean => escribe(u, "usuarios");

/** Está a cargo del inventario: un administrador, o quien tenga el módulo «A cargo del inventario» con edición. */
export function estaACargoDelInventario(u: Acceso): boolean {
  return administra(u) || escribe(u, MODULO_ENCARGADO_INVENTARIO);
}

/** Hasta dónde llega esa persona en el Inventario. Estar a cargo no basta sin poder modificar Inventario. */
export function alcanceInventario(u: Acceso): AlcanceInventario {
  if (administra(u)) return "total";
  if (!escribe(u, "inventario")) return "lectura";
  return escribe(u, MODULO_ENCARGADO_INVENTARIO) ? "total" : "despacho";
}

export const SOLO_A_CARGO = "Esto solo lo puede hacer la persona a cargo del inventario o un administrador.";
export const SOLO_BODEGA_DESPACHO = "Solo puedes modificar la bodega de despacho. Para las demás, pídeselo a la persona a cargo del inventario.";

/** La bodega que puede modificar quien no está a cargo: «Despacho» de Panamá (código `despacho`, propia). */
export function esBodegaDeDespacho(b: { codigo: string | null | undefined; tipo: string | null | undefined; pais: string | null | undefined }): boolean {
  return b.codigo === "despacho" && b.tipo === "propia" && b.pais === "PA";
}

/** Por qué esa persona no puede mover esa bodega, o `null` si puede. */
export function bloqueoDeBodega(alcance: AlcanceInventario, bodega: { codigo: string | null | undefined; tipo: string | null | undefined; pais: string | null | undefined }): string | null {
  if (alcance === "total") return null;
  if (alcance === "despacho" && esBodegaDeDespacho(bodega)) return null;
  return alcance === "despacho" ? SOLO_BODEGA_DESPACHO : SOLO_A_CARGO;
}

/** Los países donde la mercancía nueva entra por Recepción y una existencia no se sube a mano sin más. Costa Rica sigue como estaba. */
export const PAISES_CON_LIMITE = ["PA"];

/**
 * El límite: `aumento` son las unidades que el cambio le agrega a la existencia del producto en el país (la suma de sus bodegas propias). Bajar o dejar igual es libre. Subir solo lo
 * puede quien está a cargo del inventario, escribiendo el motivo. Devuelve el mensaje que se muestra, o `null` si se puede guardar.
 */
export function revisarLimite(p: {
  pais: string | null | undefined;
  existencia: number;
  aumento: number;
  aCargo: boolean;
  motivo: string | null | undefined;
  /** Dónde se escribe el motivo en esa pantalla («en «Referencia»»). */
  dondeVaElMotivo?: string;
  /** El producto, cuando se guardan varios a la vez. */
  producto?: string;
}): string | null {
  if (!PAISES_CON_LIMITE.includes(p.pais ?? "") || p.aumento <= 0) return null;
  if (p.aCargo && (p.motivo ?? "").trim()) return null;
  const unidades = `${p.existencia.toLocaleString("es-PA")} ${p.existencia === 1 ? "unidad" : "unidades"}`;
  const base = `${p.producto ? `${p.producto}: ` : ""}La existencia de este producto es de ${unidades}, estás superando el límite.`;
  if (p.aCargo) return `${base} Para guardarlo igual, escribe el motivo${p.dondeVaElMotivo ? ` ${p.dondeVaElMotivo}` : ""}.`;
  return `${base} La mercancía nueva entra por Recepción; si el conteo encontró más, pídeselo a la persona a cargo del inventario.`;
}

/**
 * Cuánto sube la existencia de un producto con lo escrito en un levantamiento de una bodega: lo contado reemplaza lo que había en esa bodega (sin contar, queda igual), más lo que se
 * añade. **Lo que se resta no compensa**: se guarda en un paso posterior que puede fallar, y el conteo más alto quedaría guardado sin haber pasado por el límite. Lo que se transfiere
 * no cambia la existencia del país.
 */
export function aumentoDeConteo(p: { enBodega: number; contado: number | null; sumar: number }): number {
  return (p.contado === null ? 0 : p.contado - p.enBodega) + p.sumar;
}
