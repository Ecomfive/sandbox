import type { DefTabla } from "@/lib/tabla/motor";

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

export const DEF_NUESTROS: DefTabla<FilaNuestro> = {
  clave: "competencia-nuestros",
  campos: [
    { id: "nombre", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.nuestro.nombre} ${f.iguales.map((i) => `${i.proveedor} ${i.nombre}`).join(" ")}` },
    {
      id: "competencia",
      etiqueta: "Competencia",
      tipo: "seleccion",
      valores: (f) => [f.iguales.length ? (f.diferencia !== null && f.diferencia < 0 ? "mas_barata" : "con") : "sin"],
      opciones: () => [
        { valor: "mas_barata", etiqueta: "La competencia vende más barato" },
        { valor: "con", etiqueta: "Con competencia" },
        { valor: "sin", etiqueta: "Solo nosotros" },
      ],
      agrupable: true,
      ordenGrupos: ["mas_barata", "con", "sin"],
    },
    { id: "competidores", etiqueta: "Competidores", tipo: "numero", valor: (f) => f.iguales.length },
    { id: "precio", etiqueta: "Nuestro precio", tipo: "numero", valor: (f) => f.nuestro.precio },
    { id: "diferencia", etiqueta: "Diferencia", tipo: "numero", valor: (f) => f.diferencia },
    { id: "bajo7", etiqueta: "Stock vendido por la competencia (7 días)", tipo: "numero", valor: (f) => f.bajo7 },
  ],
};

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

export const DEF_COMPETIDORES: DefTabla<CompetidorC> = {
  clave: "competencia-competidores",
  campos: [
    { id: "nombre", etiqueta: "Competidor", tipo: "texto", valor: (f) => f.nombre },
    { id: "productos", etiqueta: "Productos", tipo: "numero", valor: (f) => f.productos },
    { id: "iguales", etiqueta: "Iguales a los nuestros", tipo: "numero", valor: (f) => f.iguales },
    { id: "bajo7", etiqueta: "Stock vendido (7 días)", tipo: "numero", valor: (f) => f.bajo7 },
    { id: "bajo30", etiqueta: "Stock vendido (30 días)", tipo: "numero", valor: (f) => f.bajo30 },
  ],
};

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

export const EVENTOS: Record<string, string> = {
  precio: "Precio",
  stock: "Stock",
  desaparecio: "Desapareció",
  reaparecio: "Volvió",
  primera_vez: "Apareció",
};

export const DEF_BITACORA: DefTabla<BitacoraC> = {
  clave: "competencia-bitacora",
  campos: [
    {
      id: "evento",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (f) => [f.evento],
      opciones: () => Object.entries(EVENTOS).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
    },
    { id: "proveedor", etiqueta: "Proveedor", tipo: "seleccion", valores: (f) => [f.proveedor], agrupable: true },
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => f.producto },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (f) => f.fecha.slice(0, 10) },
  ],
};

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
  ventas: VentaC[];
}
