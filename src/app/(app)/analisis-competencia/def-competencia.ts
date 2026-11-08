import type { PlataformaId } from "@/lib/plataformas";

/** Un producto del catálogo de Dropi, Drop o Effi del país (nuestro o de la competencia). */
export interface ProductoC {
  id: string;
  /** Su ID en Dropi; 0 en Drop y Effi, donde no es un número. */
  dropiId: number;
  proveedorId: number;
  proveedor: string;
  nombre: string;
  foto: string | null;
  precio: number | null;
  stock: number | null;
  categoria: string | null;
  estado: "activo" | "desaparecido";
  esNuestro: boolean;
  /** El nuestro al que es igual (en uno de la competencia), con el parecido y si fue por nombre o por foto. Solo si es **el mismo producto** (`certezaIgual`): solo
   * esos cuentan para precios, posiciones y alertas. */
  igualA: string | null;
  /** El nuestro al que se parece sin ser seguro que sea el mismo (`certezaIgual` = dudoso): se muestra como dudoso y no se compara. */
  dudosoDe: string | null;
  /** Lo que dijo la IA al revisar el par (migración 0246): «mismo» lo vuelve igual, «distinto» lo quita, «parecido» lo deja dudoso. `null` si no lo revisó. */
  revision: { veredicto: "mismo" | "parecido" | "distinto"; motivo: string | null } | null;
  /** El nuestro con el que una persona o la IA dijo «No es el mismo» (8 nov 2026): ya no cuenta, pero se puede volver a revisar. */
  descartadoDe: string | null;
  parecido: number | null;
  metodo: string | null;
  primeraVez: string;
  ultimaVez: string;
  /** Unidades que bajó su stock en 1, 7 y 30 días (solo las bajadas). */
  bajo1: number;
  bajo7: number;
  bajo30: number;
  /** Las ventas que muestra la plataforma, de toda la vida: solo Effi las da; en Dropi y Drop, `null`. */
  ventasTotal: number | null;
  urlProveedor: string;
}

/** Una fila de «Nuestros productos vs competencia»: un producto nuestro y los iguales de la competencia. */
export interface FilaNuestro {
  nuestro: ProductoC;
  iguales: ProductoC[];
  /** El precio más bajo de la competencia llevado al tamaño del nuestro (ver `precioEquivalente`). */
  minimo: number | null;
  /** Precio más bajo de la competencia menos el nuestro (negativo = ellos más baratos). */
  diferencia: number | null;
  /** Si algún precio de la competencia se convirtió al tamaño del nuestro (otras cápsulas, ml, g o unidades). */
  convertido: boolean;
  bajo7: number;
}

export interface CompetidorC {
  id: number;
  nombre: string;
  url: string;
  /** El texto del enlace a `url`. */
  enlace: string;
  /** Lo que suman las ventas de sus productos (solo Effi las da; en Dropi y Drop, `null`). */
  ventasTotal: number | null;
  productos: number;
  iguales: number;
  nuevos7: number;
  bajo1: number;
  bajo7: number;
  bajo30: number;
  primeraVez: string;
  /** El nombre con que lo vigilamos («Oferfly», `VIGILADOS`), o `null`. */
  vigilado: string | null;
}

export interface BitacoraC {
  fecha: string;
  evento: string;
  producto: string;
  proveedor: string;
  esNuestro: boolean;
  precio: number | null;
  stock: number | null;
  precioAntes: number | null;
  stockAntes: number | null;
}

export interface AlertaC {
  id: string;
  fecha: string;
  tipo: string;
  titulo: string;
  detalle: string | null;
  vista: boolean;
  productoId: string | null;
  nuestroId: string | null;
}

/** Una bajada de stock de un producto (lo que se cuenta como vendido), para las gráficas por día. */
export interface VentaC {
  fecha: string;
  productoId: string;
  unidades: number;
}

export interface DatosCompetencia {
  /** De qué plataforma son los datos (Dropi, Drop o Effi; las dos últimas son solo de Costa Rica). */
  plataforma: PlataformaId;
  pais: string;
  productos: ProductoC[];
  competidores: CompetidorC[];
  alertas: AlertaC[];
  bitacora: BitacoraC[];
  ultima: { inicio: string; estado: string; duracionMs: number | null; productos: number | null; proveedores: number | null } | null;
  busquedas: number;
  /** Los pares dudosos con foto que la IA todavía no revisó (botón «Revisar con IA»). */
  dudososSinRevisar: number;
  /** Fin de la primera búsqueda del país: lo que aparece después es nuevo de verdad. */
  corte: string | null;
  ventas: VentaC[];
}
