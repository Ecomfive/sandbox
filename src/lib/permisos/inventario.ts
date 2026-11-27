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
  /** Lo que dicen sus compras (27 nov 2026, pedido de Hernán: guiarse por la orden de compra y por lo que se recibió). Ver `margenDeCompras`. */
  compras?: ComprasDelProducto;
}): string | null {
  if (!PAISES_CON_LIMITE.includes(p.pais ?? "") || p.aumento <= 0) return null;
  const margen = margenDeCompras(p.compras, p.existencia);
  if (p.aumento <= margen) return null;
  if (p.aCargo && (p.motivo ?? "").trim()) return null;
  const n = (x: number) => x.toLocaleString("es-PA");
  const unidades = `${n(p.existencia)} ${p.existencia === 1 ? "unidad" : "unidades"}`;
  const ultima = p.compras?.ultima;
  const faltante = Math.max(0, p.compras?.faltante ?? 0);
  const deLaCompra = [
    ultima ? ` La última compra que llegó (${ultima.codigo}) fue de ${n(ultima.pedida)}.` : "",
    faltante ? ` Al recibir sus compras faltaron ${n(faltante)}.` : "",
    margen ? ` Sin motivo se suman hasta ${n(margen)}; lo demás no.` : "",
  ].join("");
  const base = `${p.producto ? `${p.producto}: ` : ""}La existencia de este producto es de ${unidades}, estás superando el límite.${deLaCompra}`;
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

/** Lo que dicen las compras de un producto en el país. */
export interface ComprasDelProducto {
  /** Lo que faltó al recibir en Recepción (lo pedido menos lo recibido, ver `faltanteDeCompras`). */
  faltante: number;
  /** La última compra que llegó (por su fecha de llegada) y cuánto se pidió del producto en ella. */
  ultima: { codigo: string; pedida: number } | null;
}

/**
 * Cuánto puede subir la existencia sin motivo (27 nov 2026, pedido de Hernán): hasta el total de la última compra que llegó (se pidieron 600 y hay 599: se suma 1), o lo que faltó al recibir
 * sus compras, lo que sea mayor. Lo que pase de ahí pide motivo.
 */
export function margenDeCompras(c: ComprasDelProducto | undefined, existencia: number): number {
  if (!c) return 0;
  return Math.max(0, c.faltante, c.ultima ? c.ultima.pedida - existencia : 0);
}

/** Una línea de compra ya recibida en Recepción con menos de lo pedido. */
export interface LineaConFaltante {
  item: string;
  /** El código de la compra («ECOM01-0419»). */
  compra: string;
  pedida: number;
  recibida: number;
  notas: string | null;
}

/** Cuánto falta por llegar de esas líneas: lo pedido menos lo recibido. */
export function faltanteDeCompras(lineas: readonly LineaConFaltante[]): number {
  return lineas.reduce((t, l) => t + Math.max(0, l.pedida - l.recibida), 0);
}

/**
 * Lo que sube la existencia completa primero lo que faltó de las compras, en el orden dado (la más vieja primero): cada línea pasa a recibida + lo que le toca, sin pasar lo pedido. Así
 * la compra queda al día y lo mismo no se puede volver a sumar sin motivo.
 */
export function repartirFaltante(lineas: readonly LineaConFaltante[], unidades: number): { item: string; compra: string; antes: number; despues: number; suma: number; notas: string | null }[] {
  let quedan = Math.max(0, Math.floor(unidades));
  const r: { item: string; compra: string; antes: number; despues: number; suma: number; notas: string | null }[] = [];
  for (const l of lineas) {
    if (quedan <= 0) break;
    const suma = Math.min(quedan, Math.max(0, l.pedida - l.recibida));
    if (!suma) continue;
    r.push({ item: l.item, compra: l.compra, antes: l.recibida, despues: l.recibida + suma, suma, notas: l.notas });
    quedan -= suma;
  }
  return r;
}
