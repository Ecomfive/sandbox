import {
  numeroPublicacion,
  MARGEN_BAJO,
  margenBajo,
  ESTADOS,
  ESTADOS_PUBLICACION,
  ESTADOS_REPOSICION,
  ESTADOS_VENTA,
  TIPOS,
  UBICACIONES,
  opcion,
  type OpcionPublicacion,
} from "@/lib/publicaciones/publicacion";
import type { SkuResumen, SugerenciaVista } from "@/lib/publicaciones/sugerencias";
import type { VentasPublicacion } from "@/lib/publicaciones/ventas";
import { ETIQUETA_SUGERENCIA } from "@/lib/publicaciones/vincular";
import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

/** Una publicación de ECOMFIVE en Dropi (una fila de `dropi_publicaciones`), lista para la tabla y la ficha. */
export interface FilaPublicacion {
  id: string;
  /** El correlativo propio (PUB-0012), distinto al ID de Dropi. Sin la migración 0123, null. */
  numero: number | null;
  nombre: string;
  dropiId: string;
  estado: string;
  estadoPublicacion: string | null;
  tipo: string | null;
  privatizadoA: string;
  privatizadoEmail: string;
  precioVenta: number | null;
  costoMercancia: number | null;
  fulfillment: number | null;
  costeReal: number | null;
  utilidad: number | null;
  margen: number | null;
  estadoVenta: string | null;
  ubicacion: string | null;
  estadoReposicion: string | null;
  competencia: boolean | null;
  fechaPublicacion: string | null;
  ultimaRevision: string | null;
  proximaRevision: string | null;
  ultimoCambioPrecio: string | null;
  /** La próxima revisión ya pasó (o nunca se revisó) y no está archivada. */
  revisionVencida: boolean;
  fotoUrl: string | null;
  notas: string;
  responsableId: string | null;
  responsableNombre: string | null;
  /** Los nombres de las publicaciones relacionadas. */
  relacionados: string[];
  /** Viene de la lista GCC de ClickUp. */
  deClickup: boolean;
  /** El producto de Producto vinculado. */
  sku: SkuResumen | null;
  /** Si no está vinculada: el producto sugerido y cómo se encontró. */
  sugerencia: SugerenciaVista | null;
  /** Sus ventas en Dropi (Desempeño › Ventas Dropi): solo llegan a un administrador; `null` si no tiene datos. */
  ventas: VentasPublicacion | null;
}

/** En qué está el vínculo con Producto: vinculado, o la sugerencia que hay. */
export const estadoVinculo = (f: FilaPublicacion) => (f.sku ? "vinculado" : (f.sugerencia?.tipo ?? "ninguno"));
export const VINCULOS = [
  { valor: "vinculado", etiqueta: "Vinculado" },
  { valor: "seguro", etiqueta: ETIQUETA_SUGERENCIA.seguro },
  { valor: "sugerido", etiqueta: ETIQUETA_SUGERENCIA.sugerido },
  { valor: "varios", etiqueta: ETIQUETA_SUGERENCIA.varios },
  { valor: "falta_compuesto", etiqueta: ETIQUETA_SUGERENCIA.falta_compuesto },
  { valor: "ninguno", etiqueta: ETIQUETA_SUGERENCIA.ninguno },
];

const opciones = (lista: OpcionPublicacion[]) => () => lista.map((o) => ({ valor: o.valor, etiqueta: o.etiqueta }));
const color = (lista: OpcionPublicacion[]) => (v: string) => opcion(lista, v)?.color;
const uno = (v: string | null) => [v ?? SIN_VALOR];

/** Cómo anda el stock de una publicación según sus ventas en Dropi. */
export const STOCK_DROPI = [
  { valor: "sin_stock_vende", etiqueta: "Sin stock y se vende" },
  { valor: "se_acaba", etiqueta: "Se acaba (menos de 15 días)" },
  { valor: "alcanza", etiqueta: "Alcanza" },
  { valor: "sin_ventas", etiqueta: "Sin ventas en 30 días" },
];

/** Cómo se filtra y agrupa la lista: arranca agrupada por estado y los archivados van ocultos (botón «Archivados»). */
export const DEF_PUBLICACIONES: DefTabla<FilaPublicacion> = {
  clave: "publicaciones-dropi",
  campos: [
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [f.estado], opciones: opciones(ESTADOS), agrupable: true, ordenGrupos: ESTADOS.map((e) => e.valor), colorValor: color(ESTADOS) },
    {
      id: "revision",
      etiqueta: "Revisión",
      tipo: "seleccion",
      valores: (f) => [f.revisionVencida ? "vencida" : "al_dia"],
      opciones: () => [
        { valor: "vencida", etiqueta: "Revisión vencida" },
        { valor: "al_dia", etiqueta: "Revisión al día" },
      ],
      agrupable: true,
    },
    {
      id: "margenBajo",
      etiqueta: "Margen",
      tipo: "seleccion",
      valores: (f) => [f.margen === null ? SIN_VALOR : margenBajo(f.margen) ? "bajo" : "sano"],
      opciones: () => [
        { valor: "bajo", etiqueta: `Margen bajo (menos de ${Math.round(MARGEN_BAJO * 100)} %)` },
        { valor: "sano", etiqueta: "Margen sano" },
      ],
      etiquetaSinValor: "Sin margen",
      agrupable: true,
    },
    { id: "vinculo", etiqueta: "Vínculo con Producto", tipo: "seleccion", valores: (f) => [estadoVinculo(f)], opciones: () => VINCULOS, agrupable: true, ordenGrupos: VINCULOS.map((v) => v.valor) },
    { id: "venta", etiqueta: "Estado de venta", tipo: "seleccion", valores: (f) => uno(f.estadoVenta), opciones: opciones(ESTADOS_VENTA), agrupable: true, ordenGrupos: ESTADOS_VENTA.map((e) => e.valor), colorValor: color(ESTADOS_VENTA) },
    { id: "ubicacion", etiqueta: "Dónde está", tipo: "seleccion", valores: (f) => uno(f.ubicacion), opciones: opciones(UBICACIONES), agrupable: true, colorValor: color(UBICACIONES) },
    { id: "reposicion", etiqueta: "Reposición", tipo: "seleccion", valores: (f) => uno(f.estadoReposicion), opciones: opciones(ESTADOS_REPOSICION), agrupable: true, colorValor: color(ESTADOS_REPOSICION) },
    { id: "tipo", etiqueta: "Tipo", tipo: "seleccion", valores: (f) => uno(f.tipo), opciones: opciones(TIPOS), agrupable: true, colorValor: color(TIPOS) },
    { id: "publicacion", etiqueta: "En Dropi", tipo: "seleccion", valores: (f) => uno(f.estadoPublicacion), opciones: opciones(ESTADOS_PUBLICACION), agrupable: true, colorValor: color(ESTADOS_PUBLICACION) },
    { id: "privatizado", etiqueta: "Privatizado a", tipo: "seleccion", valores: (f) => uno(f.privatizadoA || null), etiquetaSinValor: "Sin privatizar", agrupable: true },
    { id: "responsable", etiqueta: "Responsable", tipo: "seleccion", valores: (f) => uno(f.responsableNombre), etiquetaSinValor: "Sin responsable", agrupable: true },
    {
      id: "competencia",
      etiqueta: "Competencia",
      tipo: "seleccion",
      valores: (f) => [f.competencia === null ? SIN_VALOR : f.competencia ? "si" : "no"],
      opciones: () => [
        { valor: "si", etiqueta: "Con competencia" },
        { valor: "no", etiqueta: "Sin competencia" },
      ],
      etiquetaSinValor: "Sin revisar",
      agrupable: true,
    },
    { id: "nombre", etiqueta: "Producto", tipo: "texto", valor: (f) => `${numeroPublicacion(f.numero)} ${f.nombre} ${f.dropiId}` },
    { id: "precio", etiqueta: "Precio de venta", tipo: "numero", valor: (f) => f.precioVenta },
    { id: "margen", etiqueta: "Margen (%)", tipo: "numero", valor: (f) => (f.margen === null ? null : Math.round(f.margen * 1000) / 10) },
    { id: "ultimaRevision", etiqueta: "Última revisión", tipo: "fecha", valor: (f) => f.ultimaRevision },
    { id: "proximaRevision", etiqueta: "Próxima revisión", tipo: "fecha", valor: (f) => f.proximaRevision },
    { id: "fechaPublicacion", etiqueta: "Fecha de publicación", tipo: "fecha", valor: (f) => f.fechaPublicacion },
  ],
  cerrados: { etiqueta: "Archivados", esCerrado: (f) => f.estado === "archivado", campoEstado: "estado", valoresCerrados: ["archivado"], ocultosPorDefecto: true },
  csvAntes: [
    { etiqueta: "N.º", valor: (f) => numeroPublicacion(f.numero) },
    { etiqueta: "ID Dropi", valor: (f) => f.dropiId },
    { etiqueta: "SKU", valor: (f) => f.sku?.codigo ?? "" },
  ],
  vistaInicial: { agrupar: "estado" },
};

/** La misma lista para un administrador: suma los filtros y columnas de las ventas en Dropi. */
export const DEF_PUBLICACIONES_ADMIN: DefTabla<FilaPublicacion> = {
  ...DEF_PUBLICACIONES,
  campos: [
    ...DEF_PUBLICACIONES.campos,
    { id: "stockDropi", etiqueta: "Stock en Dropi", tipo: "seleccion", valores: (f) => uno(f.ventas?.stockEstado ?? null), opciones: () => STOCK_DROPI, etiquetaSinValor: "Sin datos de Dropi", agrupable: true, ordenGrupos: STOCK_DROPI.map((s) => s.valor) },
    { id: "ventaDropi", etiqueta: "Estado de venta según Dropi", tipo: "seleccion", valores: (f) => uno(f.ventas?.estadoSugerido ?? null), opciones: opciones(ESTADOS_VENTA), etiquetaSinValor: "Sin datos de Dropi", agrupable: true, ordenGrupos: ESTADOS_VENTA.map((e) => e.valor), colorValor: color(ESTADOS_VENTA) },
    {
      id: "ventaCoincide",
      etiqueta: "Estado de venta vs. Dropi",
      tipo: "seleccion",
      valores: (f) => [!f.ventas ? SIN_VALOR : f.estadoVenta === f.ventas.estadoSugerido ? "coincide" : "distinto"],
      opciones: () => [
        { valor: "distinto", etiqueta: "No coincide con Dropi" },
        { valor: "coincide", etiqueta: "Coincide con Dropi" },
      ],
      etiquetaSinValor: "Sin datos de Dropi",
      agrupable: true,
    },
    { id: "netas30", etiqueta: "Netas 30 días (Dropi)", tipo: "numero", valor: (f) => f.ventas?.netas30 ?? null },
    { id: "stockDropiNum", etiqueta: "Stock en Dropi", tipo: "numero", valor: (f) => f.ventas?.stock ?? null },
    { id: "diasInventario", etiqueta: "Días de inventario", tipo: "numero", valor: (f) => f.ventas?.diasInventario ?? null },
  ],
  csvAntes: [
    ...(DEF_PUBLICACIONES.csvAntes ?? []),
    { etiqueta: "Netas 30 días (Dropi)", valor: (f) => (f.ventas ? String(f.ventas.netas30) : "") },
    { etiqueta: "Stock en Dropi", valor: (f) => (f.ventas ? String(f.ventas.stock) : "") },
  ],
};
