// Gestión de IDs Dropi › Recomendaciones (fase 1, migración 0127, 21 oct 2026): además de marcar lo que necesita cada publicación
// (automatico.ts), el sistema propone qué hacer, como una tarea: crear un combo x2, subir el precio o bajarlo frente a la
// competencia, con el porqué y el resultado esperado. La persona la acepta, la rechaza o la pospone y explica por qué; esas
// decisiones quedan guardadas (`dropi_publicaciones_decisiones`) y son lo que en la fase 2 leerá la IA para aprender. Sin base
// ni React, con prueba.

import type { Revision } from "./optimizacion";
import type { Reglas } from "./reglas";

export type TipoRecomendacion = "combo_x2" | "subir_precio" | "igualar_precio" | "optimizar_titulo" | "mas_fotos" | "agregar_video" | "mejorar_descripcion" | "precio_sugerido";

/** Precio y combo (cuánto se gana) u optimización de la publicación (cómo se ve en Dropi). */
export type GrupoRecomendacion = "precio" | "optimizacion";

export const TIPOS_RECOMENDACION: { valor: TipoRecomendacion; etiqueta: string; color: string; grupo: GrupoRecomendacion }[] = [
  { valor: "combo_x2", etiqueta: "Crear combo x2", color: "#8e4ec6", grupo: "precio" },
  { valor: "subir_precio", etiqueta: "Subir precio", color: "#30a46c", grupo: "precio" },
  { valor: "igualar_precio", etiqueta: "Bajar precio frente a la competencia", color: "#f76808", grupo: "precio" },
  { valor: "optimizar_titulo", etiqueta: "Optimizar el título", color: "#0090ff", grupo: "optimizacion" },
  { valor: "mas_fotos", etiqueta: "Agregar fotos", color: "#12a594", grupo: "optimizacion" },
  { valor: "agregar_video", etiqueta: "Agregar video", color: "#d6409f", grupo: "optimizacion" },
  { valor: "mejorar_descripcion", etiqueta: "Mejorar la descripción", color: "#a18072", grupo: "optimizacion" },
  { valor: "precio_sugerido", etiqueta: "Ajustar el precio sugerido", color: "#d9a200", grupo: "optimizacion" },
];

export const etiquetaRecomendacion = (t: string) => TIPOS_RECOMENDACION.find((x) => x.valor === t)?.etiqueta ?? t;

export interface Recomendacion {
  tipo: TipoRecomendacion;
  /** Lo que hay que hacer, en una línea («Crear combo x2 a $8.99»). */
  titulo: string;
  /** Por qué, con los datos («Margen 24,6 %, menor a tu mínimo de 30 %…»). */
  motivo: string;
  /** Qué se espera si se hace. */
  resultado: string;
  /** Los números con que se calculó (quedan guardados con la decisión). */
  datos: Record<string, number | string | null>;
}

export interface EntradaRecomendacion {
  archivada: boolean;
  /** Ya es un pack o combo (por su nombre): no se le sugiere otro combo. */
  esPack: boolean;
  precio: number | null;
  costo: number | null;
  fulfillment: number | null;
  margen: number | null;
  netas30: number | null;
  /** El producto vinculado: solo a uno simple se le sugiere el combo (sin vínculo no se sabe si ya existe). */
  sku: { tipo: string } | null;
  /** El compuesto de 2 unidades de su producto, si ya existe en Producto, y si ya está publicado en Dropi en este país. */
  combo: { codigo: string; publicado: boolean } | null;
  /** El competidor que vende lo mismo más barato (precio equivalente). */
  competidorMasBarato: { proveedor: string; precio: number } | null;
  /** El precio equivalente más bajo de la competencia con stock, aunque sea más caro que el nuestro. */
  competidorMinimo: { proveedor: string; precio: number } | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
/** El margen bruto a un precio: lo que queda después del costo y el fulfillment, sobre el precio. */
export const margenA = (precio: number, costo: number, fulfillment: number) => (precio > 0 ? (precio - costo - fulfillment) / precio : 0);
/** Redondea hacia arriba a un precio que termina en 9 (5,37 → 5,39; 8,98 → 8,99). */
export const precioArriba = (p: number) => r2(Math.ceil(r2((p + 0.01) * 10) - 1e-9) / 10 - 0.01);
/** Redondea hacia abajo a un precio que termina en 9, sin pasar del dado (4,50 → 4,49; 4,49 → 4,49). */
export const precioAbajo = (p: number) => r2(Math.floor(r2((p + 0.01) * 10) + 1e-9) / 10 - 0.01);

const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString("es-PA")} %`;
const usd = (v: number) => `$${v.toFixed(2)}`;

/** Las recomendaciones de una publicación según las reglas (puede no tener ninguna). */
export function recomendar(p: EntradaRecomendacion, reglas: Reglas): Recomendacion[] {
  if (p.archivada || p.precio === null || p.precio <= 0 || p.costo === null || p.margen === null) return [];
  const out: Recomendacion[] = [];
  const ful = p.fulfillment ?? 0;
  const bajo = p.margen < reglas.margen_minimo;
  const ventas = p.netas30 ?? 0;
  const baseMotivo = `Margen ${pct(p.margen)}, menor a tu mínimo de ${pct(reglas.margen_minimo)}`;

  // Combo x2: el fulfillment se paga una vez por pedido, así que dos unidades en un pedido reparten ese costo y suben el margen.
  if (bajo && !p.esPack && p.sku?.tipo === "simple" && ventas >= reglas.combo_min_ventas && !p.combo?.publicado) {
    const precioCombo = precioArriba(p.precio * 2 * (1 - reglas.combo_descuento));
    const margenCombo = margenA(precioCombo, p.costo * 2, ful);
    if (margenCombo >= reglas.margen_minimo)
      out.push({
        tipo: "combo_x2",
        titulo: `${p.combo ? "Publicar el combo x2" : "Crear combo x2"} a ${usd(precioCombo)}`,
        motivo: `${baseMotivo}. Vende ${ventas} en 30 días.${p.combo ? ` El compuesto ${p.combo.codigo} ya existe en Producto y no está publicado.` : " No tiene combo x2."}`,
        resultado: `Con 2 unidades a ${usd(precioCombo)} (${pct(reglas.combo_descuento)} menos que dos sueltas) el margen sería ${pct(margenCombo)}: el fulfillment se paga una vez por pedido.`,
        datos: { margen: p.margen, precio: p.precio, costo: p.costo, fulfillment: ful, ventas30: ventas, precioCombo, margenCombo: Math.round(margenCombo * 10000) / 10000, comboExistente: p.combo?.codigo ?? null },
      });
  }

  // Subir el precio hasta el mínimo, si ningún competidor lo vende más barato; sin pasarse del más barato de la competencia.
  if (bajo && !p.competidorMasBarato) {
    let precio = precioArriba((p.costo + ful) / (1 - reglas.margen_minimo));
    let tope: string | null = null;
    if (p.competidorMinimo && precio > p.competidorMinimo.precio) {
      precio = precioAbajo(p.competidorMinimo.precio);
      tope = `${p.competidorMinimo.proveedor} lo vende a ${usd(p.competidorMinimo.precio)}`;
    }
    const margenNuevo = margenA(precio, p.costo, ful);
    // Solo si de verdad mejora (al menos 2 puntos).
    if (precio > p.precio && margenNuevo - p.margen >= 0.02)
      out.push({
        tipo: "subir_precio",
        titulo: `Subir el precio a ${usd(precio)}`,
        motivo: `${baseMotivo}. Nadie lo vende más barato${tope ? `; ${tope}` : ""}.`,
        resultado: `A ${usd(precio)} el margen sería ${pct(margenNuevo)}${margenNuevo < reglas.margen_minimo ? " (todavía bajo el mínimo, para no pasar a la competencia)" : ""}.`,
        datos: { margen: p.margen, precio: p.precio, costo: p.costo, fulfillment: ful, precioSugerido: precio, margenNuevo: Math.round(margenNuevo * 10000) / 10000, competidor: p.competidorMinimo?.proveedor ?? null, precioCompetidor: p.competidorMinimo?.precio ?? null },
      });
  }

  // Bajar al precio del competidor más barato, si el margen no queda crítico.
  if (p.competidorMasBarato) {
    const precio = precioAbajo(p.competidorMasBarato.precio);
    const margenNuevo = margenA(precio, p.costo, ful);
    if (precio < p.precio && precio > 0 && margenNuevo >= reglas.margen_critico)
      out.push({
        tipo: "igualar_precio",
        titulo: `Bajar el precio a ${usd(precio)}`,
        motivo: `${p.competidorMasBarato.proveedor} vende lo mismo a ${usd(p.competidorMasBarato.precio)} (precio equivalente) y tiene stock; nosotros, a ${usd(p.precio)}.`,
        resultado: `A ${usd(precio)} el margen quedaría en ${pct(margenNuevo)} (tu crítico es ${pct(reglas.margen_critico)}).`,
        datos: { margen: p.margen, precio: p.precio, costo: p.costo, fulfillment: ful, precioSugerido: precio, margenNuevo: Math.round(margenNuevo * 10000) / 10000, competidor: p.competidorMasBarato.proveedor, precioCompetidor: p.competidorMasBarato.precio },
      });
  }
  return out;
}

/** Qué puntos de la revisión resuelve cada recomendación de optimización. */
const PUNTOS: Partial<Record<TipoRecomendacion, Revision["clave"][]>> = {
  optimizar_titulo: ["titulo_espanol", "titulo_largo", "titulo_cantidad", "titulo_angulo", "titulo_formato"],
  mas_fotos: ["fotos"],
  agregar_video: ["video"],
  mejorar_descripcion: ["descripcion"],
  precio_sugerido: ["precio_sugerido"],
};

const RESULTADO_OPTIMIZACION: Partial<Record<TipoRecomendacion, string>> = {
  optimizar_titulo: "Un título en español, de 40 caracteres como máximo, con la cantidad y para qué sirve, se encuentra mejor en Dropi y el dropshipper entiende qué vende.",
  mas_fotos: "Más fotos (producto, uso, tamaño, empaque) dan al dropshipper material para sus anuncios.",
  agregar_video: "Un video del producto en uso es lo que más usa el dropshipper para anunciar.",
  mejorar_descripcion: "Una descripción completa (beneficios, uso, contenido) ayuda a vender y evita devoluciones.",
  precio_sugerido: "Un precio sugerido por encima del nuestro le muestra al dropshipper cuánto puede ganar.",
};

const TITULO_OPTIMIZACION: Partial<Record<TipoRecomendacion, string>> = {
  optimizar_titulo: "Optimizar el título en Dropi",
  mas_fotos: "Agregar fotos en Dropi",
  agregar_video: "Agregar un video en Dropi",
  mejorar_descripcion: "Mejorar la descripción en Dropi",
  precio_sugerido: "Ajustar el precio sugerido en Dropi",
};

/**
 * Las recomendaciones de optimización a partir de la revisión: una por cosa que arreglar en Dropi (el título junta sus cuatro
 * puntos). «Para qué sirve» sin confirmar cuenta para el título; «Sin datos» y «No aplica» no.
 */
export function recomendarOptimizacion(revs: Revision[], archivada: boolean): Recomendacion[] {
  if (archivada) return [];
  const out: Recomendacion[] = [];
  for (const [tipo, claves] of Object.entries(PUNTOS) as [TipoRecomendacion, Revision["clave"][]][]) {
    const fallas = revs.filter((r) => claves.includes(r.clave) && (r.estado === "falta" || r.estado === "revisar"));
    if (!fallas.length) continue;
    out.push({
      tipo,
      titulo: TITULO_OPTIMIZACION[tipo]!,
      motivo: fallas.map((f) => `${f.etiqueta}: ${f.detalle}`).join(". ") + ".",
      resultado: RESULTADO_OPTIMIZACION[tipo]!,
      datos: Object.fromEntries(fallas.map((f) => [f.clave, f.estado])),
    });
  }
  return out;
}

export type Decision = "aceptada" | "rechazada" | "pospuesta";

export const DECISIONES: { valor: Decision; etiqueta: string; color: string }[] = [
  { valor: "aceptada", etiqueta: "Aceptada", color: "#30a46c" },
  { valor: "rechazada", etiqueta: "Rechazada", color: "#e5484d" },
  { valor: "pospuesta", etiqueta: "Pospuesta", color: "#d9a200" },
];

/** Cuántos días deja de verse una recomendación después de decidirla (pospuesta: lo que se elija). */
export const DIAS_OCULTA: Record<Exclude<Decision, "pospuesta">, number> = { aceptada: 30, rechazada: 90 };
export const DIAS_POSPONER = [7, 14, 30];

export const sumarDias = (dia: string, n: number) => new Date(Date.parse(`${dia.slice(0, 10)}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Hasta qué día no vuelve a salir una recomendación decidida hoy. */
export function vigenteHasta(decision: Decision, hoy: string, diasPosponer?: number): string {
  if (decision === "pospuesta") return sumarDias(hoy, DIAS_POSPONER.includes(diasPosponer ?? 0) ? diasPosponer! : 7);
  return sumarDias(hoy, DIAS_OCULTA[decision]);
}

/**
 * Las que siguen pendientes: sin una decisión de su tipo que todavía esté vigente, ni una tarea de su tipo abierta (aceptada y sin
 * hacer: mientras alguien la tenga pendiente, no se vuelve a sugerir).
 */
export function pendientes<T extends { tipo: string }>(recs: T[], decisiones: { tipo: string; vigenteHasta: string; decision?: Decision; hechaEn?: string | null }[], hoy: string): T[] {
  return recs.filter((r) => !decisiones.some((d) => d.tipo === r.tipo && (d.vigenteHasta >= hoy || (d.decision === "aceptada" && !d.hechaEn))));
}

// Tareas (migración 0128): una recomendación aceptada se vuelve una tarea con responsable y plazo.

export type EstadoTarea = "por_hacer" | "atrasada" | "hecha";

export const ESTADOS_TAREA: { valor: EstadoTarea; etiqueta: string; color: string }[] = [
  { valor: "por_hacer", etiqueta: "Por hacer", color: "#0090ff" },
  { valor: "atrasada", etiqueta: "Atrasada", color: "#e5484d" },
  { valor: "hecha", etiqueta: "Hecha", color: "#30a46c" },
];

/** Cómo va una tarea: hecha si tiene fecha de hecha; si no, atrasada cuando ya pasó su plazo. */
export function estadoTarea(t: { hechaEn: string | null; plazo: string | null }, hoy: string): EstadoTarea {
  if (t.hechaEn) return "hecha";
  return t.plazo && t.plazo < hoy ? "atrasada" : "por_hacer";
}

export interface Cumplimiento {
  como: "dropi" | "producto";
  /** Cuándo se vio (el cambio de precio en Dropi); null si no se sabe. */
  fecha: string | null;
  detalle: string;
}

/**
 * Si una tarea abierta ya se hizo, según los datos: un cambio de precio en Dropi después de aceptarla y hacia donde se pidió
 * (subir o bajar; no hace falta que sea el precio exacto sugerido), o el combo x2 ya publicado. Si no se puede saber, null.
 */
export function tareaCumplida(
  t: { tipo: string; fecha: string; precioAntes: number | null },
  actual: { cambioPrecio: { fecha: string; antes: number | null; despues: number | null } | null; comboPublicado: boolean; revisiones?: Revision[] },
): Cumplimiento | null {
  // Optimización: hecha cuando la lectura de Dropi ya no ve lo que faltaba (lo «sin datos» no cuenta como hecho).
  const puntos = PUNTOS[t.tipo as TipoRecomendacion];
  if (puntos) {
    const revs = (actual.revisiones ?? []).filter((r) => puntos.includes(r.clave));
    if (!revs.length || revs.some((r) => r.estado !== "ok" && r.estado !== "no_aplica")) return null;
    return { como: "dropi", fecha: null, detalle: `Dropi ya lo muestra: ${revs.map((r) => r.detalle).join(" · ")}` };
  }
  if (t.tipo === "combo_x2") return actual.comboPublicado ? { como: "producto", fecha: null, detalle: "El combo x2 ya está publicado" } : null;
  const c = actual.cambioPrecio;
  if (!c || c.despues === null || t.precioAntes === null || c.fecha.slice(0, 10) < t.fecha.slice(0, 10)) return null;
  const subio = c.despues > t.precioAntes + 0.004;
  const bajo = c.despues < t.precioAntes - 0.004;
  if ((t.tipo === "subir_precio" && subio) || (t.tipo === "igualar_precio" && bajo))
    return { como: "dropi", fecha: c.fecha, detalle: `Dropi muestra $${c.despues.toFixed(2)} (antes $${t.precioAntes.toFixed(2)})` };
  return null;
}
