import {
  numeroPublicacion,
  TIPOS,
  UBICACIONES,
  opcion,
  type OpcionPublicacion,
} from "@/lib/publicaciones/publicacion";
import type { SkuResumen, SugerenciaVista } from "@/lib/publicaciones/sugerencias";
import type { VentasPublicacion } from "@/lib/publicaciones/ventas";
import { ACCIONES, EN_DROPI, type Accion, type EnDropi } from "@/lib/publicaciones/automatico";
import { TIPOS_RECOMENDACION, type Decision, type EstadoTarea, type Recomendacion } from "@/lib/publicaciones/recomendaciones";
import type { NivelMargen } from "@/lib/publicaciones/reglas";
import type { CambioPrecio, CompetidorBarato } from "@/lib/publicaciones/competencia-publicaciones";
import { ETIQUETA_SUGERENCIA } from "@/lib/publicaciones/vincular";
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
  notas: string;
  responsableId: string | null;
  /** Los nombres de las publicaciones relacionadas. */
  relacionados: string[];
  /** Viene de la lista GCC de ClickUp. */
  deClickup: boolean;
  /** El producto de Producto vinculado. */
  sku: SkuResumen | null;
  /** Si no está vinculada: el producto sugerido y cómo se encontró. */
  sugerencia: SugerenciaVista | null;
  /** Sus ventas en Dropi (Desempeño › Ventas Dropi); `null` si no tiene datos. */
  ventas: VentasPublicacion | null;
  /** Cómo está en Dropi según lo que reporta Dropi (ya no se marca a mano). */
  enDropi: EnDropi;
  /** Va a «Archivados»: archivada en Dropi (sin datos de Dropi, lo que estaba marcado a mano). */
  archivada: boolean;
  /** Público o privado según Dropi; sin datos de Dropi, lo que estaba marcado. */
  tipoDropi: "publico" | "privado" | null;
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
    { id: "vinculo", etiqueta: "Vínculo con Producto", tipo: "seleccion", valores: (f) => [estadoVinculo(f)], opciones: () => VINCULOS, agrupable: true, ordenGrupos: VINCULOS.map((v) => v.valor) },
    // Las ventas de Dropi (21 oct 2026): reemplazan el «Estado de venta» que se marcaba a mano. Las ve todo el que abre el módulo.
    { id: "netas30", etiqueta: "Ventas 30 días", tipo: "numero", valor: (f) => f.ventas?.netas30 ?? null },
    { id: "stockDropi", etiqueta: "Stock en Dropi", tipo: "seleccion", valores: (f) => uno(f.ventas?.stockEstado ?? null), opciones: () => STOCK_DROPI, etiquetaSinValor: "Sin datos de Dropi", agrupable: true, ordenGrupos: STOCK_DROPI.map((s) => s.valor) },
    { id: "stockDropiNum", etiqueta: "Stock en Dropi (unidades)", tipo: "numero", valor: (f) => f.ventas?.stock ?? null },
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
    { etiqueta: "Stock en Dropi", valor: (f) => (f.ventas ? String(f.ventas.stock) : "") },
  ],
};

