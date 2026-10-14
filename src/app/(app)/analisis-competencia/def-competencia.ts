/** Un producto del catálogo de Dropi del país (nuestro o de la competencia). */
export interface ProductoC {
  id: string;
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
  /** El nuestro al que es igual (en uno de la competencia), con el parecido y si fue por nombre o por foto. */
  igualA: string | null;
  parecido: number | null;
  metodo: string | null;
  primeraVez: string;
  ultimaVez: string;
  /** Unidades que bajó su stock en 1, 7 y 30 días (solo las bajadas). */
  bajo1: number;
  bajo7: number;
  bajo30: number;
  urlProveedor: string;
}

/** Una fila de «Nuestros productos vs competencia»: un producto nuestro y los iguales de la competencia. */
export interface FilaNuestro {
  nuestro: ProductoC;
  iguales: ProductoC[];
  minimo: number | null;
  /** Precio más bajo de la competencia menos el nuestro (negativo = ellos más baratos). */
  diferencia: number | null;
  bajo7: number;
}

export interface CompetidorC {
  id: number;
  nombre: string;
  url: string;
  productos: number;
  iguales: number;
  nuevos7: number;
  bajo1: number;
  bajo7: number;
  bajo30: number;
  primeraVez: string;
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
  pais: string;
  productos: ProductoC[];
  competidores: CompetidorC[];
  alertas: AlertaC[];
  bitacora: BitacoraC[];
  ultima: { inicio: string; estado: string; duracionMs: number | null; productos: number | null; proveedores: number | null } | null;
  busquedas: number;
  /** Fin de la primera búsqueda del país: lo que aparece después es nuevo de verdad. */
  corte: string | null;
  ventas: VentaC[];
}
