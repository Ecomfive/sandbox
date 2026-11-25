// Anuncios Meta › las tácticas generales, siempre con lo que son (25 nov 2026, pedido de Alcides: «cuando menciones antes y después o experto o autoridad, di cuáles: de qué son, qué tienen en común y qué videos y campañas»).
// «Antes y después», «Testimonio de cliente» y «Experto o autoridad» se quedan como ángulo (para compararlos entre productos), pero solos no dicen nada: donde aparezcan van con su detalle. Lógica pura, con prueba.

import type { Quienes } from "./historico";
import { claveDeTexto } from "./nombre";
import { esAnguloTactico } from "./video-angulo";

const minuscula = (t: string) => (/^\p{Lu}\p{Ll}/u.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t);
const limpio = (t: string | null | undefined) => (t ?? "").trim();

/** «Antes y después · manchas en la cara». Un ángulo que no es una táctica general, o sin detalle todavía, queda como está. */
export function nombreDeAngulo(angulo: string, detalle?: string | null): string;
export function nombreDeAngulo(angulo: string | null, detalle?: string | null): string | null;
export function nombreDeAngulo(angulo: string | null, detalle?: string | null): string | null {
  const d = limpio(detalle);
  return angulo && d && esAnguloTactico(angulo) ? `${angulo} · ${minuscula(d)}` : angulo;
}

/** «Antes y después (manchas en la cara, próstata y 1 más)»: una táctica general con los temas que tiene detrás (en una campaña o un grupo). */
export function nombreConTemas(angulo: string, temas: readonly string[] | null | undefined, max = 2): string {
  if (!temas?.length || !esAnguloTactico(angulo)) return angulo;
  const resto = temas.length - max;
  return `${angulo} (${temas.slice(0, max).join(", ")}${resto > 0 ? ` y ${resto} más` : ""})`;
}

export interface VideoConAngulo {
  angulo: string | null;
  detalle?: string | null;
  gasto: number;
  compras: number;
}

/** Un tema dentro de una táctica general; `detalle` vacío = videos que todavía no lo tienen. */
export interface DetalleDeAngulo {
  detalle: string;
  videos: number;
  gasto: number;
  compras: number;
}

/** Los temas de unos videos (de más a menos gasto; los que no tienen detalle, al final). */
export function detallesDe(videos: readonly VideoConAngulo[]): DetalleDeAngulo[] {
  const mapa = new Map<string, DetalleDeAngulo>();
  for (const v of videos) {
    const d = limpio(v.detalle);
    const clave = claveDeTexto(d);
    const x = mapa.get(clave) ?? { detalle: d ? minuscula(d) : "", videos: 0, gasto: 0, compras: 0 };
    x.videos++;
    x.gasto += v.gasto;
    x.compras += v.compras;
    mapa.set(clave, x);
  }
  return [...mapa.values()].sort((a, b) => Number(!a.detalle) - Number(!b.detalle) || b.gasto - a.gasto || b.videos - a.videos || a.detalle.localeCompare(b.detalle, "es"));
}

/** Los temas de cada táctica general presente en unos videos. */
export function detallesPorAngulo(videos: readonly VideoConAngulo[]): Map<string, DetalleDeAngulo[]> {
  const porAngulo = new Map<string, VideoConAngulo[]>();
  for (const v of videos) {
    if (!v.angulo || !esAnguloTactico(v.angulo)) continue;
    porAngulo.set(v.angulo, [...(porAngulo.get(v.angulo) ?? []), v]);
  }
  return new Map([...porAngulo].map(([a, l]) => [a, detallesDe(l)]));
}

const cuantos = (n: number) => `${n} ${n === 1 ? "video" : "videos"}`;

/** «manchas en la cara (3 videos), caída del cabello (1 video) y 2 temas más; 4 videos sin detalle todavía». Cadena vacía si no hay videos. */
export function textoDeDetalles(lista: readonly DetalleDeAngulo[], max = 3): string {
  const conTema = lista.filter((d) => d.detalle);
  const sin = lista.find((d) => !d.detalle)?.videos ?? 0;
  const vistos = conTema.slice(0, max).map((d) => `${d.detalle} (${cuantos(d.videos)})`);
  const resto = conTema.length - vistos.length;
  const base = vistos.length ? `${vistos.join(", ")}${resto > 0 ? ` y ${resto} ${resto === 1 ? "tema más" : "temas más"}` : ""}` : "";
  const falta = sin ? `${cuantos(sin)} sin detalle todavía` : "";
  return [base, falta].filter(Boolean).join("; ");
}

/** De qué es cada táctica general entre unos videos con su análisis, para ponerlo debajo de una gráfica. */
export function temasPorTactica(videos: readonly { angulo: string | null; analisis: { angulo: string | null; anguloDetalle: string | null } | null; r: { gasto: number; compras: number } }[], max = 4): { nombre: string; texto: string }[] {
  const lista = detallesPorAngulo(videos.map((v) => ({ angulo: v.analisis?.angulo ?? v.angulo, detalle: v.analisis?.anguloDetalle, gasto: v.r.gasto, compras: v.r.compras })));
  const gasto = (l: DetalleDeAngulo[]) => l.reduce((s, d) => s + d.gasto, 0);
  return [...lista].sort((a, b) => gasto(b[1]) - gasto(a[1])).map(([nombre, l]) => ({ nombre, texto: textoDeDetalles(l, max) }));
}

/** Los temas de una táctica general entre unos videos, en texto; null si el ángulo no es una táctica general o no hay videos. */
export function temasDe(angulo: string | null, videos: readonly VideoConAngulo[], max = 3): string | null {
  if (!angulo || !esAnguloTactico(angulo)) return null;
  const suyos = videos.filter((v) => v.angulo === angulo);
  return suyos.length ? textoDeDetalles(detallesDe(suyos), max) : null;
}

/** Lo que una IA necesita saber de «cuáles son» un hallazgo, corto: de qué son, lo común y los primeros videos y campañas. */
export function cualesParaIA(h: { quienes?: Quienes }): Record<string, unknown> {
  const q = h.quienes;
  if (!q) return {};
  const uno = (x: Quienes["videos"][number]) => ({ nombre: x.nombre, ...(x.detalle ? { detalle: x.detalle } : {}), ...(x.antes !== undefined ? { cpa_antes: x.antes } : {}), cpa: x.ahora, gasto_usd: Math.round(x.gasto) });
  return {
    ...(q.deQue ? { de_que_son: q.deQue } : {}),
    ...(q.enComun.length ? { en_comun: q.enComun.map((r) => `${r.titulo}: ${r.texto}`) } : {}),
    ...(q.videos.length ? { videos: q.videos.slice(0, 4).map(uno) } : {}),
    ...(q.campanas.length ? { campanas: q.campanas.slice(0, 4).map(uno) } : {}),
  };
}

export interface RasgosDeUnVideo {
  detalle?: string | null;
  gancho?: string | null;
  formato?: string | null;
  cta?: string | null;
}

export interface RasgoComun {
  titulo: string;
  texto: string;
}

/**
 * Lo que comparten unos videos (los que empeoraron, los que mejoraron…): de qué son, cómo arrancan, su formato y su llamado a la acción, con cuántos de cuántos. Un rasgo que solo tiene un video de varios no se cuenta como común,
 * salvo el tema (`conTema`), que siempre se dice porque es la pregunta («¿cuál antes y después?»).
 */
export function enComun(videos: readonly RasgosDeUnVideo[], o: { conTema: boolean }): RasgoComun[] {
  const rasgos: [string, (v: RasgosDeUnVideo) => string | null | undefined, number][] = [
    ...(o.conTema ? ([["De qué son", (v) => v.detalle, 1]] as [string, (v: RasgosDeUnVideo) => string | null | undefined, number][]) : []),
    ["Gancho", (v) => v.gancho, 2],
    ["Formato", (v) => v.formato, 2],
    ["Llamado a la acción", (v) => v.cta, 2],
  ];
  const out: RasgoComun[] = [];
  for (const [titulo, de, minimo] of rasgos) {
    const mapa = new Map<string, { valor: string; n: number }>();
    let conDato = 0;
    for (const v of videos) {
      const valor = limpio(de(v));
      if (!valor) continue;
      conDato++;
      const x = mapa.get(claveDeTexto(valor)) ?? { valor: minuscula(valor), n: 0 };
      x.n++;
      mapa.set(claveDeTexto(valor), x);
    }
    const piso = videos.length > 1 ? minimo : 1;
    const top = [...mapa.values()].filter((x) => x.n >= piso).sort((a, b) => b.n - a.n || a.valor.localeCompare(b.valor, "es")).slice(0, titulo === "De qué son" ? 5 : 2);
    if (top.length) out.push({ titulo, texto: top.map((x) => `${x.valor} (${x.n} de ${conDato})`).join(", ") });
  }
  return out;
}
