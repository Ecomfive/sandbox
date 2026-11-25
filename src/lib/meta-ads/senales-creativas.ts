// Anuncios Meta › los creativos de un producto, mirados por dentro (24 nov 2026, pedido de Alcides: ir más allá de «el CTR bajó» y decir por qué y qué hacer). Con los resultados por día de cada video se ve si los videos que más gastan se están
// cansando (su CTR o su hook cae frente a la semana anterior), cuánto del gasto depende de videos viejos o de uno solo, si hace días que no se sube nada nuevo, si los videos nuevos rinden peor que los viejos y qué ángulo es el que mejor
// ha funcionado con ese producto. Cada causa lleva su acción concreta y sus números. Lógica pura, con prueba; los datos son los de `base-dias.ts`. Solo lee.

import type { BaseDias } from "./analisis-pedido";
import { cpa, ctr, hookRate, sinResultados, sumar, type Resultados } from "./metricas";

export const UMBRALES_CREATIVOS = {
  /** Días de vida desde que un video gastó por primera vez para llamarlo «viejo». */
  diasViejo: 21,
  /** Cuánto tiene que haber gastado un video en los últimos 14 días para analizarlo. */
  gastoMinimoVideo: 30,
  /** Cuánto cae el CTR o el hook (frente a la semana anterior) para decir que se cansó. */
  caidaCansado: 0.15,
  /** Parte del gasto en videos cansados para que sea la causa. */
  parteCansada: 0.4,
  /** Parte del gasto en un solo video para decir que dependes de él. */
  parteDominante: 0.6,
  /** Parte del gasto en videos viejos y sin nada nuevo para decir que no se renueva. */
  parteVieja: 0.7,
  /** Cuánto peor tiene que rendir lo nuevo frente a lo viejo (CPA) para decirlo. */
  peorNuevo: 1.3,
  /** Gasto mínimo de un ángulo en 60 días para recomendarlo. */
  gastoAngulo: 60,
} as const;

export interface VideoSenal {
  id: string;
  nombre: string;
  angulo: string | null;
  edadDias: number;
  gasto14: number;
  parte: number;
  ctrRec: number | null;
  ctrPrev: number | null;
  hookRec: number | null;
  hookPrev: number | null;
  cansado: boolean;
}

export interface CausaCreativa {
  tipo: "cansancio" | "dependencia" | "sin_renovacion" | "nuevos_peores";
  titulo: string;
  detalle: string;
  accion: string;
  /** Gasto de los últimos 14 días que toca (para ordenar). */
  fuerza: number;
}

export interface SenalesCreativas {
  producto: string;
  generadaEn: string;
  gasto14: number;
  videosActivos: number;
  parteVieja: number;
  nuevos14: { videos: number; gasto: number; cpa: number | null };
  viejos14: { gasto: number; cpa: number | null };
  videos: VideoSenal[];
  mejorAngulo: { angulo: string; cpa: number; gasto: number; compras: number } | null;
  causas: CausaCreativa[];
}

const sumarDias = (fecha: string, n: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const cambio = (rec: number | null, prev: number | null) => (rec === null || prev === null || prev === 0 ? null : rec / prev - 1);
const pct = (n: number) => `${Math.round(Math.abs(n) * 100)} %`;
const usd = (n: number) => `$${n.toFixed(2)}`;

/** Los creativos de un producto (el texto del producto de sus campañas) a `hoy`: o null si no gastó nada en los últimos 14 días. */
export function senalesDeProducto(base: BaseDias, producto: string, hoy: string): SenalesCreativas | null {
  const U = UMBRALES_CREATIVOS;
  const clave = producto.trim().toLowerCase();
  const campanasDe = new Set([...base.campanas.values()].filter((c) => (c.producto ?? "").trim().toLowerCase() === clave).map((c) => c.id));
  if (!campanasDe.size) return null;
  const d14 = sumarDias(hoy, -13);
  const d7 = sumarDias(hoy, -6);

  // Primera vez que cada video gastó (en cualquier campaña) y lo que hizo en las dos últimas semanas y en los 60 días.
  const primera = new Map<string, string>();
  for (const f of base.dias) if (f.videoId && f.r.gasto > 0 && (!primera.has(f.videoId) || f.fecha < primera.get(f.videoId)!)) primera.set(f.videoId, f.fecha);
  const rec7 = new Map<string, Resultados>();
  const prev7 = new Map<string, Resultados>();
  const ult14 = new Map<string, Resultados>();
  const angulos60 = new Map<string, Resultados>();
  const hace60 = sumarDias(hoy, -59);
  let total14 = sinResultados();
  for (const f of base.dias) {
    if (!campanasDe.has(f.campanaId) || !f.videoId || f.fecha > hoy) continue;
    const v = f.videoId;
    if (f.fecha >= d14) {
      ult14.set(v, sumar(ult14.get(v) ?? sinResultados(), f.r));
      total14 = sumar(total14, f.r);
      if (f.fecha >= d7) rec7.set(v, sumar(rec7.get(v) ?? sinResultados(), f.r));
      else prev7.set(v, sumar(prev7.get(v) ?? sinResultados(), f.r));
    }
    if (f.fecha >= hace60) {
      const a = base.videos.get(v)?.angulo;
      if (a) angulos60.set(a, sumar(angulos60.get(a) ?? sinResultados(), f.r));
    }
  }
  if (total14.gasto <= 0) return null;

  const videos: VideoSenal[] = [];
  for (const [id, r14] of ult14) {
    if (r14.gasto < U.gastoMinimoVideo) continue;
    const a = rec7.get(id) ?? sinResultados();
    const b = prev7.get(id) ?? sinResultados();
    const cCtr = cambio(ctr(a), ctr(b));
    const cHook = cambio(hookRate(a), hookRate(b));
    const edad = primera.has(id) ? diasEntre(primera.get(id)!, hoy) : 0;
    videos.push({
      id,
      nombre: base.videos.get(id)?.nombre ?? `Video …${id.slice(-5)}`,
      angulo: base.videos.get(id)?.angulo ?? null,
      edadDias: edad,
      gasto14: Math.round(r14.gasto * 100) / 100,
      parte: r14.gasto / total14.gasto,
      ctrRec: ctr(a),
      ctrPrev: ctr(b),
      hookRec: hookRate(a),
      hookPrev: hookRate(b),
      // Se cansó: ya tiene unos días de vida, tiene gasto en las dos semanas y su CTR o su hook cayó.
      cansado: edad >= 14 && a.gasto >= U.gastoMinimoVideo / 2 && b.gasto >= U.gastoMinimoVideo / 2 && ((cCtr !== null && cCtr <= -U.caidaCansado) || (cHook !== null && cHook <= -U.caidaCansado)),
    });
  }
  videos.sort((x, y) => y.gasto14 - x.gasto14);

  const viejos = videos.filter((v) => v.edadDias > U.diasViejo);
  const idsNuevos = new Set([...ult14.keys()].filter((id) => primera.has(id) && diasEntre(primera.get(id)!, hoy) <= 13));
  const sumaNuevos = [...ult14].filter(([id]) => idsNuevos.has(id)).reduce((t, [, r]) => sumar(t, r), sinResultados());
  const sumaViejos = [...ult14].filter(([id]) => !idsNuevos.has(id)).reduce((t, [, r]) => sumar(t, r), sinResultados());
  const parteVieja = viejos.reduce((s, v) => s + v.gasto14, 0) / total14.gasto;

  // El ángulo que mejor ha funcionado en 60 días con este producto (con gasto y compras suficientes), para recomendarlo al renovar.
  const mejor = [...angulos60].filter(([, r]) => r.gasto >= U.gastoAngulo && r.compras >= 2 && cpa(r) !== null).sort((a, b) => cpa(a[1])! - cpa(b[1])!)[0];
  const mejorAngulo = mejor ? { angulo: mejor[0], cpa: Math.round(cpa(mejor[1])! * 100) / 100, gasto: Math.round(mejor[1].gasto), compras: mejor[1].compras } : null;
  const sugerencia = mejorAngulo ? `El ángulo que mejor ha funcionado con este producto en 60 días es «${mejorAngulo.angulo}» (CPA ${usd(mejorAngulo.cpa)} con ${mejorAngulo.compras} compras): empieza por ahí.` : "Todavía ningún ángulo tiene datos suficientes con este producto: prueba 2 o 3 ángulos distintos.";

  const causas: CausaCreativa[] = [];
  const cansados = videos.filter((v) => v.cansado);
  const gastoCansado = cansados.reduce((s, v) => s + v.gasto14, 0);
  if (cansados.length && gastoCansado / total14.gasto >= U.parteCansada) {
    const peor = cansados[0];
    const dc = cambio(peor.ctrRec, peor.ctrPrev);
    const dh = cambio(peor.hookRec, peor.hookPrev);
    causas.push({
      tipo: "cansancio",
      titulo: `El creativo se está cansando: ${cansados.length} ${cansados.length === 1 ? "video" : "videos"} con el ${pct(gastoCansado / total14.gasto)} del gasto perdieron fuerza`,
      detalle: `«${peor.nombre}» (${peor.edadDias} días en pantalla, ${pct(peor.parte)} del gasto)${dc !== null && dc < 0 ? ` perdió ${pct(dc)} de CTR` : ""}${dh !== null && dh < 0 ? `${dc !== null && dc < 0 ? " y" : " perdió"} ${pct(dh)} de hook` : ""} frente a la semana anterior.`,
      accion: `Rotar: subir 2 o 3 videos nuevos y bajar el gasto de los cansados. ${sugerencia}`,
      fuerza: gastoCansado,
    });
  }
  const dominante = videos[0];
  if (dominante && dominante.parte >= U.parteDominante) {
    causas.push({
      tipo: "dependencia",
      titulo: `Dependes de un solo video: «${dominante.nombre}» lleva el ${pct(dominante.parte)} del gasto`,
      detalle: `En los últimos 14 días gastó ${usd(dominante.gasto14)} de ${usd(total14.gasto)}. Si ese video se cansa, todo el producto cae a la vez.`,
      accion: `Tener al menos 3 videos con gasto parejo: subir variantes del mismo ángulo (cambia el gancho, no el mensaje). ${sugerencia}`,
      fuerza: dominante.gasto14,
    });
  }
  if (idsNuevos.size === 0 && parteVieja >= U.parteVieja) {
    causas.push({
      tipo: "sin_renovacion",
      titulo: `Hace 14 días no se sube ningún video nuevo y el ${pct(parteVieja)} del gasto va a videos de más de ${U.diasViejo} días`,
      detalle: `Los videos viejos concentran el gasto y ninguno nuevo entró a competir.`,
      accion: `Subir creativos nuevos cada semana. ${sugerencia}`,
      fuerza: viejos.reduce((s, v) => s + v.gasto14, 0),
    });
  }
  const cNuevos = cpa(sumaNuevos);
  const cViejos = cpa(sumaViejos);
  if (idsNuevos.size > 0 && sumaNuevos.gasto >= U.gastoMinimoVideo && cNuevos !== null && cViejos !== null && cNuevos > cViejos * U.peorNuevo) {
    causas.push({
      tipo: "nuevos_peores",
      titulo: `Los videos nuevos rinden peor que los viejos: CPA ${usd(cNuevos)} frente a ${usd(cViejos)}`,
      detalle: `${idsNuevos.size} ${idsNuevos.size === 1 ? "video nuevo gastó" : "videos nuevos gastaron"} ${usd(sumaNuevos.gasto)} en 14 días. El problema no es solo cansancio: lo nuevo que se sube no está funcionando.`,
      accion: `Revisar el ángulo de lo nuevo frente a lo que ya funcionó. ${sugerencia}`,
      fuerza: sumaNuevos.gasto,
    });
  }
  causas.sort((a, b) => b.fuerza - a.fuerza);
  return {
    producto,
    generadaEn: new Date().toISOString(),
    gasto14: Math.round(total14.gasto * 100) / 100,
    videosActivos: videos.length,
    parteVieja,
    nuevos14: { videos: idsNuevos.size, gasto: Math.round(sumaNuevos.gasto * 100) / 100, cpa: cNuevos },
    viejos14: { gasto: Math.round(sumaViejos.gasto * 100) / 100, cpa: cViejos },
    videos: videos.slice(0, 6),
    mejorAngulo,
    causas,
  };
}

/** Lo que se le da a la IA de las señales de un producto. */
export function senalesParaIA(s: SenalesCreativas): unknown {
  return {
    producto: s.producto,
    gasto_ultimos_14_dias_usd: s.gasto14,
    videos_con_gasto: s.videosActivos,
    parte_del_gasto_en_videos_de_mas_de_21_dias: Math.round(s.parteVieja * 100) / 100,
    videos_nuevos_ultimos_14_dias: s.nuevos14,
    videos_viejos: s.viejos14,
    mejor_angulo_60_dias: s.mejorAngulo,
    causas_encontradas: s.causas.map((c) => ({ tipo: c.tipo, titulo: c.titulo, detalle: c.detalle, accion: c.accion })),
  };
}

export const claveDeSenales = (paisId: string) => `senales_creativas:${paisId}`;

export interface SenalesGuardadas {
  generadoEn: string;
  items: SenalesCreativas[];
}
export function leerValorSenales(valor: unknown): SenalesGuardadas | null {
  if (!valor || typeof valor !== "object") return null;
  const v = valor as Partial<SenalesGuardadas>;
  return typeof v.generadoEn === "string" && Array.isArray(v.items) ? { generadoEn: v.generadoEn, items: v.items.filter((i) => i && typeof i.producto === "string" && Array.isArray(i.causas)) } : null;
}
