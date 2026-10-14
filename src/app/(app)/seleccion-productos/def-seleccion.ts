import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

/** Una fila de Selección de productos: un candidato que salió de una fuente o se creó a mano. No es un producto de Producto. */
export interface FilaSeleccion {
  id: string;
  /** El N.º de la fila en Selección (se muestra SEL-0001). */
  numero: number;
  nombre: string;
  estado: string;
  fuente: string;
  /** El correlativo que trae de su fuente (DK-0012); a mano, MAN-0001. */
  codigoFuente: string;
  fechaCaptacion: string;
  fotoUrl: string | null;
  urlPagina: string | null;
  urlAdLibrary: string | null;
  /** Precios de referencia en dólares. */
  costoProveedor: number | null;
  precioVenta: number | null;
  categoria: string | null;
  responsableId: string | null;
  responsableNombre: string | null;
  notas: string | null;
  creadoEn: string;
  /** Por qué se descartó (p. ej. «Ya testeado: …» cuando llegó de una fuente y ya se había visto). */
  motivoDescarte: string | null;
  /** Otros proveedores o fuentes donde aparece el mismo producto: si hay alguno, es prioridad. */
  prioridad: string[];
  /** Cuántas ofertas tiene en Creación de ofertas (0 a 3). */
  ofertas: number;
  /** El costo en la moneda del proveedor, si vino de Scraping (el de arriba ya está en dólares). */
  precioOriginal: number | null;
  monedaOriginal: string | null;
}

export const numeroSeleccion = (n: number) => `SEL-${String(n).padStart(4, "0")}`;

/**
 * El recorrido de una fila (14 oct 2026, migración 0106): llega **Seleccionado** (lo que viene de una fuente ya se eligió allá),
 * pasa a **Crear oferta** cuando se le arman sus ofertas (Creación de ofertas, de 1 a 3) o se **Descarta** con su motivo. Lo
 * que ya se testeó o ya está en Producto llega Descartado solo, con la nota de por qué.
 */
export const ESTADOS_SELECCION = [
  { valor: "seleccionado", etiqueta: "Seleccionado", color: "#1bbc9c" },
  { valor: "crear_oferta", etiqueta: "Crear oferta", color: "#5f43d1" },
  { valor: "descartado", etiqueta: "Descartado", color: "#e50000" },
] as const;

export const etiquetaEstadoSeleccion = (v: string) => ESTADOS_SELECCION.find((e) => e.valor === v)?.etiqueta ?? v;
export const colorEstadoSeleccion = (v: string) => ESTADOS_SELECCION.find((e) => e.valor === v)?.color ?? "#8D8D8D";

/** De dónde salió: las fuentes de Testing Lab, o a mano. El prefijo es el de su correlativo (migración 0104). */
export const FUENTES = [
  { valor: "drop_killer", etiqueta: "Drop Killer", prefijo: "DK", color: "#5f43d1" },
  { valor: "tu_winner", etiqueta: "Tu Winner", prefijo: "TW", color: "#d74c81" },
  { valor: "scraping_proveedores", etiqueta: "Scraping de proveedores", prefijo: "SP", color: "#0880EA" },
  { valor: "manual", etiqueta: "Manual", prefijo: "MAN", color: "#8D8D8D" },
] as const;

export const etiquetaFuente = (v: string) => FUENTES.find((f) => f.valor === v)?.etiqueta ?? v;
export const colorFuente = (v: string) => FUENTES.find((f) => f.valor === v)?.color ?? "#8D8D8D";

export const DEF_SELECCION: DefTabla<FilaSeleccion> = {
  clave: "seleccion-productos",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => `${numeroSeleccion(f.numero)} ${f.codigoFuente} ${f.nombre}` },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => ESTADOS_SELECCION.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ESTADOS_SELECCION.map((e) => e.valor),
      colorValor: colorEstadoSeleccion,
    },
    {
      id: "fuente",
      etiqueta: "Fuente",
      tipo: "seleccion",
      valores: (f) => [f.fuente],
      opciones: () => FUENTES.map((x) => ({ valor: x.valor, etiqueta: x.etiqueta })),
      agrupable: true,
      ordenGrupos: FUENTES.map((x) => x.valor),
      colorValor: colorFuente,
    },
    { id: "categoria", etiqueta: "Categoría", tipo: "seleccion", valores: (f) => [f.categoria ?? SIN_VALOR], etiquetaSinValor: "Sin categoría", agrupable: true },
    { id: "responsable", etiqueta: "Responsable", tipo: "seleccion", valores: (f) => [f.responsableNombre ?? SIN_VALOR], etiquetaSinValor: "Sin responsable", agrupable: true },
    { id: "fechaCaptacion", etiqueta: "Fecha de captación", tipo: "fecha", valor: (f) => f.fechaCaptacion },
    { id: "costoProveedor", etiqueta: "Costo proveedor", tipo: "numero", valor: (f) => f.costoProveedor },
    { id: "precioVenta", etiqueta: "Precio de venta", tipo: "numero", valor: (f) => f.precioVenta },
    { id: "notas", etiqueta: "Notas", tipo: "texto", valor: (f) => f.notas ?? "" },
    {
      id: "prioridad",
      etiqueta: "Prioridad",
      tipo: "seleccion",
      valores: (f) => [f.prioridad.length ? "si" : "no"],
      opciones: () => [
        { valor: "si", etiqueta: "Prioridad (en varias fuentes)" },
        { valor: "no", etiqueta: "Sin prioridad" },
      ],
      agrupable: true,
      ordenGrupos: ["si", "no"],
    },
    { id: "motivoDescarte", etiqueta: "Motivo del descarte", tipo: "texto", valor: (f) => f.motivoDescarte ?? "" },
  ],
  csvAntes: [{ etiqueta: "N.º", valor: (f) => numeroSeleccion(f.numero) }],
  // Lo descartado se oculta por defecto, como los cerrados de Compras; el botón lo muestra aparte.
  cerrados: {
    etiqueta: "Descartados",
    esCerrado: (f) => f.estado === "descartado",
    campoEstado: "estado",
    valoresCerrados: ["descartado"],
    ocultosPorDefecto: true,
    exclusivo: true,
  },
  vistaInicial: { agrupar: "estado" },
};
