// Producto › tablero «Para decidir» (23 oct 2026, pedido de Hernán, al estilo de Gestión de IDs Dropi): lo que le falta a cada
// producto para venderse o comprarse. Cada punto es un valor del campo «Para decidir» de la lista (un producto puede tener
// varios) y una tarjeta que lo cuenta y filtra. Salvo «Winner sin comprar», solo cuentan los productos activos. Sin base ni
// React, con prueba.

/** Con menos unidades en Dropi el stock está bajo (la tarjeta «Sin stock en Dropi» lo dice aparte). */
export const STOCK_BAJO = 50;

export type PuntoDecidir = "sin_foto" | "sin_conectar" | "sin_stock" | "stock_bajo" | "nunca_comprado" | "categoria_revisar" | "winner_sin_comprar";

export const ETIQUETA_PUNTO: Record<PuntoDecidir, string> = {
  sin_foto: "Sin foto",
  sin_conectar: "Sin conectar",
  sin_stock: "Sin stock en Dropi",
  stock_bajo: `Menos de ${STOCK_BAJO} u. en Dropi`,
  nunca_comprado: "Nunca comprado",
  categoria_revisar: "Categoría a revisar",
  winner_sin_comprar: "Winner sin comprar",
};

/** Estados de un test que lo dan por ganador: «winner» y «enviado a compras» (el winner que ya se pasó a Compras). */
const ESTADOS_WINNER = new Set(["winner", "enviado_a_compras"]);

export interface ProductoParaDecidir {
  clase: string;
  foto: string | null;
  categoria: { revisar: boolean } | null;
  /** Órdenes de compra (sin las anuladas) en que está. */
  compras: { ordenes: number };
  /** Tiendas, productos de Dropi y pedidos con que está vinculado. */
  asociaciones: unknown[];
  /** Sus publicaciones en Gestión de IDs Dropi. */
  nombresDropi: unknown[];
  tests: { estado: string }[];
  /** Unidades en Dropi según la última lectura (suma de sus publicaciones); null si no tiene publicación leída. */
  stockDropi: number | null;
}

/** Los puntos «Para decidir» de un producto. */
export function puntosParaDecidir(p: ProductoParaDecidir): PuntoDecidir[] {
  const puntos: PuntoDecidir[] = [];
  const sinComprar = p.compras.ordenes === 0;
  if (p.clase === "fisico") {
    if (!p.foto) puntos.push("sin_foto");
    if (!p.asociaciones.length && !p.nombresDropi.length) puntos.push("sin_conectar");
    if (p.stockDropi === 0) puntos.push("sin_stock");
    else if (p.stockDropi !== null && p.stockDropi < STOCK_BAJO) puntos.push("stock_bajo");
    if (sinComprar) puntos.push("nunca_comprado");
    if (!p.categoria || p.categoria.revisar) puntos.push("categoria_revisar");
  }
  // Un winner que nunca se compró, esté activo o todavía en test (los inactivos y descontinuados ya se descartaron).
  if ((p.clase === "fisico" || p.clase === "test") && sinComprar && p.tests.some((t) => ESTADOS_WINNER.has(t.estado))) puntos.push("winner_sin_comprar");
  return puntos;
}
