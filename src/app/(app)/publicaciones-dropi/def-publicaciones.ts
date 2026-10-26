import {
  numeroPublicacion,
  TIPOS,
  UBICACIONES,
  opcion,
  type OpcionPublicacion,
} from "@/lib/publicaciones/publicacion";
import type { SkuResumen, SugerenciaVista } from "@/lib/publicaciones/sugerencias";
import type { VentasPublicacion } from "@/lib/publicaciones/ventas";
import type { DatosCrearDropi } from "@/lib/publicaciones/crear-dropi";
import { ACCIONES, EN_DROPI, type Accion, type EnDropi } from "@/lib/publicaciones/automatico";
import { TIPOS_RECOMENDACION, type Decision, type EstadoTarea, type Recomendacion } from "@/lib/publicaciones/recomendaciones";
import type { NivelMargen } from "@/lib/publicaciones/reglas";
import type { Revision } from "@/lib/publicaciones/optimizacion";
import type { CambioPrecio, CompetidorBarato } from "@/lib/publicaciones/competencia-publicaciones";
import { ETIQUETA_SUGERENCIA } from "@/lib/publicaciones/vincular";
import { codigoBodega, type BodegaAsignada } from "@/lib/publicaciones/sincronizar-dropi";
import type { CambioDropiVista } from "@/lib/publicaciones/cambios-dropi";
import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

/** Una decisión sobre una recomendación (aceptada, rechazada o pospuesta), con su porqué. */
export interface DecisionVista {
  id: string;
  publicacionId: string;
  tipo: string;
  decision: Decision;
  nota: string;
  titulo: string;
  motivo: string;
  vigenteHasta: string;
  usuario: string;
  fecha: string;
  /** El precio de la publicación al decidir (para saber si después se subió o se bajó). */
  precioAntes: number | null;
  /** La tarea (migración 0128): quién la hace, hasta cuándo, y si ya se hizo (a mano o detectado por el sistema). */
  responsableId: string | null;
  responsable: string;
  plazo: string | null;
  hechaEn: string | null;
  hechaComo: "manual" | "dropi" | "producto" | null;
  hechaPor: string;
  hechaNota: string;
  /** Solo una aceptada es una tarea; null en las demás (o sin la migración 0128). */
  estado: EstadoTarea | null;
}

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
  /** Crítico, bajo, aceptable o saludable según las reglas (pantalla Reglas). */
  nivelMargen: NivelMargen | null;
  estadoVenta: string | null;
  ubicacion: string | null;
  estadoReposicion: string | null;
  competencia: boolean | null;
  fechaPublicacion: string | null;
  ultimaRevision: string | null;
  proximaRevision: string | null;
  /** La fecha anotada antes (ClickUp o a mano). Se usa solo si Dropi todavía no registró ningún cambio. */
  ultimoCambioPrecio: string | null;
  /** El último cambio de precio que se vio en Dropi (fecha, de cuánto a cuánto), o null si no se vio ninguno. */
  cambioPrecioDropi: CambioPrecio | null;
  /** Desde cuándo se lee el catálogo de Dropi del país (antes de esa fecha no se pueden ver cambios). */
  lecturaDropiDesde: string | null;
  /** La próxima revisión ya pasó (o nunca se revisó) y no está archivada. */
  revisionVencida: boolean;
  fotoUrl: string | null;
  responsableId: string | null;
  /** Los nombres de las publicaciones relacionadas. */
  relacionados: string[];
  /** Viene de la lista GCC de ClickUp. */
  deClickup: boolean;
  /** El producto de Producto vinculado. */
  sku: SkuResumen | null;
  /** Unidades de su producto vinculado que vienen en camino (órdenes que ya salieron y no han llegado) en este país; 0 si no hay. */
  enCamino: number;
  /** La llegada más próxima de lo que viene en camino («2026-11-12»): la fecha límite de la compra o la estimada; null si ninguna tiene. */
  llegadaCamino: string | null;
  /** Unidades en camino de órdenes que todavía no tienen fecha de llegada (faltan datos en Compras). */
  sinFechaCamino: number;
  /** De esas, las unidades de órdenes que aún no tienen fecha de envío (en producción, sin enviar). */
  sinEnvioCamino: number;
  /** Si no está vinculada: el producto sugerido y cómo se encontró. */
  sugerencia: SugerenciaVista | null;
  /** Sus ventas en Dropi (Desempeño › Ventas Dropi); `null` si no tiene datos. */
  ventas: VentasPublicacion | null;
  /** Cómo está en Dropi según lo que reporta Dropi (ya no se marca a mano). */
  enDropi: EnDropi;
  /** Va a «Archivados»: archivada en Dropi (sin datos de Dropi, lo que estaba marcado a mano), o duplicada. */
  archivada: boolean;
  /** Si es un duplicado de otra publicación con el mismo ID de Dropi (migración 0147): «PUB-0309 · nombre» de la que vale. */
  duplicadaDe: string | null;
  /** Tiene un apagado esperando «Aplicar en Dropi» (migración 0148): en el sistema ya cuenta como apagada (va a Archivados, sin acciones). */
  apagadoPendiente: boolean;
  /** Dropi todavía no se tocó con ese apagado (ningún intento): se puede deshacer desde el sistema sin consecuencias. */
  apagadoSinTocar: boolean;
  /** «Sin publicar» (migración 0151): todavía no existe en Dropi; tiene los datos que Dropi pide y se publica con «Aplicar en Dropi». */
  sinPublicar: boolean;
  /** Tiene la publicación en Dropi esperando «Aplicar en Dropi» (se puede deshacer desde la lista de cambios pendientes). */
  publicarPendiente: boolean;
  /** Lo que Dropi pide para publicarla (peso, medidas, categoría, descripción, stock inicial y fotos); solo en una «Sin publicar». */
  datosDropi: DatosCrearDropi | null;
  /** Tiene archivar (o sacar de Archivados) esperando «Aplicar en Dropi»: «archivar» o «restaurar». */
  archivadoPendiente: "archivar" | "restaurar" | null;
  /** Las demás publicaciones del mismo producto (el público y sus privadas «P-MA …»), para apagarlas juntas (`grupoDe`). */
  grupo: { id: string; nombre: string; dropiId: string; archivada: boolean; tipo: "publico" | "privado" | null; stock: number | null; correo: string; apagadoPendiente: boolean; apagadoSinTocar: boolean }[];
  /** Público o privado: el elegido en la ficha (el sistema manda, 24 oct 2026); si no hay nada anotado, lo que dice Dropi. */
  tipoDropi: "publico" | "privado" | null;
  /** Público o privado según la última lectura de Dropi (solo de referencia; null sin datos de Dropi). */
  tipoEnDropi: "publico" | "privado" | null;
  /** Lo que necesita (calculado): vacío = al día. */
  acciones: Accion[];
  /** El competidor que vende lo mismo más barato (precio equivalente), si hay. */
  competidorMasBarato: CompetidorBarato | null;
  /** El precio equivalente más bajo de la competencia con stock, aunque sea más caro que el nuestro. */
  competidorMinimo: CompetidorBarato | null;
  /** Lo que el sistema recomienda hacer y nadie ha decidido todavía (o cuya decisión ya venció). */
  recomendaciones: Recomendacion[];
  /** Las decisiones sobre sus recomendaciones, de la más nueva a la más vieja. */
  decisiones: DecisionVista[];
  /** La revisión de optimización (título, fotos, video, descripción, precio sugerido) y su nota. */
  revisiones: Revision[];
  nota: { cumple: number; total: number };
  /** El título tal como se ve en Dropi (la última lectura del catálogo), o null si no se leyó. */
  tituloDropi: string | null;
  /** Lo que dice «Mis productos» de Dropi (migración 0131): cada bodega con su stock, el total y lo reservado a privados. null si
   * la publicación no tiene un ID que esté entre nuestros productos de Dropi o nunca se leyó. */
  bodegasDropi: { id: number; nombre: string; stock: number }[] | null;
  stockProveedor: number | null;
  stockPrivadoProveedor: number | null;
  /** Cuándo se leyó «Mis productos» por última vez (lo mismo en todas las filas del país). */
  leidoProveedor: string | null;
  /** A qué bodega de Dropi pertenece (B280, B81): la que muestra Dropi o, sin stock, la de «Dónde está» o la del nombre. */
  bodega: BodegaAsignada | null;
  /** El último cambio de nombre que el sistema mandó a Dropi (pendiente, aplicado o con error), o null. */
  cambioDropi: CambioDropiVista | null;
}

/**
 * Si el ID de Dropi de la publicación está en Dropi: «conectado» si «Mis productos» lo lista (o, sin esa lectura en el país, si
 * Dropi reporta sus ventas); «no_aparece» si tiene ID pero la lectura no lo trae; null sin ID o sin forma de saberlo.
 */
export type ConexionDropi = "conectado" | "no_aparece";
/** Activa en Dropi y con 0 unidades (la lectura de «Mis productos» manda sobre la carga de ventas). Sin datos de stock, no. */
export function sinStock(f: Pick<FilaPublicacion, "archivada" | "enDropi" | "stockProveedor" | "ventas">): boolean {
  const stock = f.stockProveedor ?? f.ventas?.stock ?? null;
  return !f.archivada && f.enDropi === "activo" && stock !== null && stock <= 0;
}

export function conexionDropi(f: Pick<FilaPublicacion, "dropiId" | "bodegasDropi" | "leidoProveedor" | "ventas">): ConexionDropi | null {
  if (!f.dropiId.trim()) return null;
  if (f.bodegasDropi !== null) return "conectado";
  if (f.leidoProveedor) return "no_aparece";
  return f.ventas ? "conectado" : null;
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

export const NIVELES_MARGEN: { valor: NivelMargen; etiqueta: string }[] = [
  { valor: "critico", etiqueta: "Crítico" },
  { valor: "bajo", etiqueta: "Bajo" },
  { valor: "aceptable", etiqueta: "Aceptable" },
  { valor: "sano", etiqueta: "Saludable" },
];

/** Cómo anda el stock de una publicación según sus ventas en Dropi. */
export const STOCK_DROPI = [
  { valor: "sin_stock_vende", etiqueta: "Sin stock y se vende" },
  { valor: "se_acaba", etiqueta: "Se acaba (menos de 15 días)" },
  { valor: "alcanza", etiqueta: "Alcanza" },
  { valor: "sin_ventas", etiqueta: "Sin ventas en 30 días" },
];

/** Cómo se filtra y agrupa la lista: las archivadas en Dropi van ocultas (botón «Archivados»); lo que necesita cada una está en las tarjetas de arriba. */
export const DEF_PUBLICACIONES: DefTabla<FilaPublicacion> = {
  clave: "publicaciones-dropi",
  campos: [
    // Lo que necesita cada publicación, calculado (21 oct 2026): reemplaza el «Estado» del flujo de trabajo y la revisión cada 28
    // días, que se marcaban a mano. Una publicación puede necesitar más de una cosa; sin ninguna, está al día.
    {
      id: "accion",
      etiqueta: "Acción",
      tipo: "seleccion",
      valores: (f) => (f.archivada ? [SIN_VALOR] : f.acciones.length ? f.acciones : ["al_dia"]),
      opciones: () => ACCIONES.map((a) => ({ valor: a.valor, etiqueta: a.etiqueta })),
      etiquetaSinValor: "Archivada",
      agrupable: true,
      ordenGrupos: ACCIONES.map((a) => a.valor),
      colorValor: (v) => ACCIONES.find((a) => a.valor === v)?.color,
    },
    {
      id: "margenBajo",
      etiqueta: "Margen",
      tipo: "seleccion",
      // Crítico, bajo, aceptable y saludable según los umbrales de la pantalla Reglas (lo calcula el servidor).
      valores: (f) => [f.nivelMargen ?? SIN_VALOR],
      opciones: () => NIVELES_MARGEN,
      etiquetaSinValor: "Sin margen",
      agrupable: true,
      ordenGrupos: NIVELES_MARGEN.map((n) => n.valor),
    },
    {
      id: "recomendacion",
      etiqueta: "Recomendación",
      tipo: "seleccion",
      valores: (f) => (f.recomendaciones.length ? f.recomendaciones.map((r) => r.tipo) : [SIN_VALOR]),
      opciones: () => TIPOS_RECOMENDACION.map((t) => ({ valor: t.valor, etiqueta: t.etiqueta })),
      etiquetaSinValor: "Sin recomendaciones",
      agrupable: true,
      ordenGrupos: TIPOS_RECOMENDACION.map((t) => t.valor),
      colorValor: (v) => TIPOS_RECOMENDACION.find((t) => t.valor === v)?.color,
    },
    {
      id: "optimizacion",
      etiqueta: "Optimización",
      tipo: "seleccion",
      valores: (f) => [f.nota.total === 0 ? SIN_VALOR : f.nota.cumple === f.nota.total ? "completa" : f.nota.cumple / f.nota.total >= 0.5 ? "a_medias" : "baja"],
      opciones: () => [
        { valor: "baja", etiqueta: "Le falta mucho (menos de la mitad)" },
        { valor: "a_medias", etiqueta: "Le falta algo" },
        { valor: "completa", etiqueta: "Completa" },
      ],
      etiquetaSinValor: "Sin revisar",
      agrupable: true,
      ordenGrupos: ["baja", "a_medias", "completa"],
    },
    { id: "notaOptimizacion", etiqueta: "Nota de optimización (%)", tipo: "numero", valor: (f) => (f.nota.total ? Math.round((f.nota.cumple / f.nota.total) * 100) : null) },
    {
      id: "idDropi",
      etiqueta: "ID de Dropi",
      tipo: "seleccion",
      // Sin ID, con un ID que no aparece en Dropi, o conectado (el producto está en Dropi).
      valores: (f) => [!f.dropiId.trim() ? "sin_id" : (conexionDropi(f) ?? "sin_datos")],
      opciones: () => [
        { valor: "sin_id", etiqueta: "Sin ID de Dropi" },
        { valor: "no_aparece", etiqueta: "No aparece en Dropi" },
        { valor: "conectado", etiqueta: "Conectado con Dropi" },
        { valor: "sin_datos", etiqueta: "Sin lectura de Dropi" },
      ],
      agrupable: true,
      ordenGrupos: ["sin_id", "no_aparece", "conectado", "sin_datos"],
    },
    { id: "vinculo", etiqueta: "Vínculo con Producto", tipo: "seleccion", valores: (f) => [estadoVinculo(f)], opciones: () => VINCULOS, agrupable: true, ordenGrupos: VINCULOS.map((v) => v.valor) },
    // Las ventas de Dropi (21 oct 2026): reemplazan el «Estado de venta» que se marcaba a mano. Las ve todo el que abre el módulo.
    { id: "netas30", etiqueta: "Ventas 30 días", tipo: "numero", valor: (f) => f.ventas?.netas30 ?? null },
    { id: "stockDropi", etiqueta: "Stock en Dropi", tipo: "seleccion", valores: (f) => uno(f.ventas?.stockEstado ?? null), opciones: () => STOCK_DROPI, etiquetaSinValor: "Sin datos de Dropi", agrupable: true, ordenGrupos: STOCK_DROPI.map((s) => s.valor) },
    { id: "enCamino", etiqueta: "Mercancía en camino (unidades)", tipo: "numero", valor: (f) => f.enCamino },
    // «Sin stock» del tablero (25 oct 2026, pedido de Alcides): toda publicación activa en Dropi con 0 unidades, venda o no.
    { id: "sinStock", etiqueta: "Sin stock", tipo: "seleccion", valores: (f) => [sinStock(f) ? "si" : "no"], opciones: () => [{ valor: "si", etiqueta: "Sin stock" }, { valor: "no", etiqueta: "Con stock" }] },
    // Primero la lectura de «Mis productos» (más reciente que la carga de ventas).
    { id: "stockDropiNum", etiqueta: "Stock en Dropi (unidades)", tipo: "numero", valor: (f) => f.stockProveedor ?? f.ventas?.stock ?? null },
    {
      id: "bodega",
      etiqueta: "Bodega en Dropi",
      tipo: "seleccion",
      valores: (f) => [f.bodega ? `${codigoBodega(f.bodega.id)} · ${f.bodega.nombre}` : SIN_VALOR],
      etiquetaSinValor: "Sin bodega en Dropi",
      agrupable: true,
    },
    { id: "diasInventario", etiqueta: "Días de inventario", tipo: "numero", valor: (f) => f.ventas?.diasInventario ?? null },
    { id: "ubicacion", etiqueta: "Dónde está", tipo: "seleccion", valores: (f) => uno(f.ubicacion), opciones: opciones(UBICACIONES), agrupable: true, colorValor: color(UBICACIONES) },
    // Tipo y «En Dropi» salen de lo que reporta Dropi (ya no se marcan a mano).
    { id: "tipo", etiqueta: "Tipo", tipo: "seleccion", valores: (f) => uno(f.tipoDropi), opciones: opciones(TIPOS), agrupable: true, colorValor: color(TIPOS) },
    {
      id: "publicacion",
      etiqueta: "En Dropi",
      tipo: "seleccion",
      valores: (f) => [f.archivada && f.enDropi !== "archivado" ? "archivado" : f.enDropi],
      opciones: () => EN_DROPI.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: EN_DROPI.map((e) => e.valor),
      colorValor: (v) => EN_DROPI.find((e) => e.valor === v)?.color,
    },
    { id: "privatizado", etiqueta: "Privatizado a", tipo: "seleccion", valores: (f) => uno(f.privatizadoA || null), etiquetaSinValor: "Sin privatizar", agrupable: true },
    { id: "nombre", etiqueta: "Producto", tipo: "texto", valor: (f) => `${numeroPublicacion(f.numero)} ${f.nombre} ${f.dropiId}` },
    { id: "precio", etiqueta: "Precio de venta", tipo: "numero", valor: (f) => f.precioVenta },
    { id: "margen", etiqueta: "Margen (%)", tipo: "numero", valor: (f) => (f.margen === null ? null : Math.round(f.margen * 1000) / 10) },
    { id: "fechaPublicacion", etiqueta: "Fecha de publicación", tipo: "fecha", valor: (f) => f.ventas?.primeraVenta?.slice(0, 10) ?? f.fechaPublicacion },
  ],
  // Archivadas: las que Dropi tiene archivadas (si vuelven a estar activas en Dropi, salen solas de aquí).
  cerrados: { etiqueta: "Archivados", esCerrado: (f) => f.archivada, campoEstado: "publicacion", valoresCerrados: ["archivado"], ocultosPorDefecto: true },
  csvAntes: [
    { etiqueta: "N.º", valor: (f) => numeroPublicacion(f.numero) },
    { etiqueta: "ID Dropi", valor: (f) => f.dropiId },
    { etiqueta: "SKU", valor: (f) => f.sku?.codigo ?? "" },
    { etiqueta: "Ventas 30 días (Dropi)", valor: (f) => (f.ventas ? String(f.ventas.netas30) : "") },
    { etiqueta: "Stock en Dropi", valor: (f) => (f.stockProveedor !== null ? String(f.stockProveedor) : f.ventas ? String(f.ventas.stock) : "") },
    { etiqueta: "Bodega", valor: (f) => (f.bodega ? `${codigoBodega(f.bodega.id)} ${f.bodega.nombre}` : "") },
    { etiqueta: "Stock por bodega en Dropi", valor: (f) => (f.bodegasDropi ?? []).map((b) => `${codigoBodega(b.id)} ${b.nombre}: ${b.stock}`).join(" | ") },
  ],
};

