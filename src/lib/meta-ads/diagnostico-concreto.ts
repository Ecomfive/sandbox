// Anuncios Meta › del «revisa X» a la respuesta (24 nov 2026, pedido de Alcides: el «Qué hacer» decía «mirar en qué zonas se entrega peor… revisar que la promesa del anuncio y la landing coincidan», o sea, dejaba la tarea a la persona; el sistema debe
// hacer la revisión y decir cuáles zonas, qué promete el anuncio y qué le falta a la landing). Lógica pura, con prueba: arma el texto de «Qué hacer» de los hallazgos con lo que ya midió el sistema (la investigación de entrega, las señales de
// creativos, los rasgos de los que funcionaron y las páginas medidas) y reemplaza el texto fijo. Solo sugiere lo que controla quien monta las campañas (segmentación, presupuesto, anuncios, videos, landings); si no hay datos, deja el texto de antes.

import type { AnalisisHistorico, Hallazgo } from "./historico";
import type { GrupoInv, InvestigacionProducto } from "./investigacion-entrega";
import type { RasgosDeGanadores } from "./rasgos-ganadores";
import type { SenalesCreativas } from "./senales-creativas";

export interface OfertaAnuncio {
  titulo: string | null;
  /** Lo que dice el anuncio al empezar (su promesa), ya recortado en una frase. */
  inicio: string;
  /** Su página de destino sin parámetros (tienda.com/corrector). */
  landing: string | null;
  gasto: number;
  compras: number;
}

/** Lo que el producto promete y adónde lleva: sus anuncios con más gasto y lo que se midió de cada página de destino. */
export interface OfertasProducto {
  producto: string;
  anuncios: OfertaAnuncio[];
  /** Página (sin parámetros) → rasgos medidos de esa página. */
  paginas: Record<string, string[]>;
}

export const claveDeOfertas = (paisId: string): string => `ofertas_producto:${paisId}`;

export function leerValorOfertas(valor: unknown): Record<string, OfertasProducto> {
  const out: Record<string, OfertasProducto> = {};
  const crudo = valor && typeof valor === "object" ? (valor as { productos?: unknown }).productos : null;
  if (!crudo || typeof crudo !== "object") return out;
  for (const [k, v] of Object.entries(crudo as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Partial<OfertasProducto>;
    if (typeof o.producto !== "string" || !Array.isArray(o.anuncios)) continue;
    out[k] = {
      producto: o.producto,
      anuncios: o.anuncios.filter((a): a is OfertaAnuncio => !!a && typeof a === "object" && typeof (a as OfertaAnuncio).inicio === "string").slice(0, 3),
      paginas: o.paginas && typeof o.paginas === "object" ? Object.fromEntries(Object.entries(o.paginas).filter(([, r]) => Array.isArray(r))) : {},
    };
  }
  return out;
}

/** Dónde se guardan las páginas ya medidas (página sin parámetros → rasgos). */
export const claveDePaginasMedidas = (paisId: string): string => `landing_rasgos:${paisId}`;

/** Las páginas ya medidas, sin las que fallaron al descargarse. */
export function leerValorPaginas(valor: unknown): Record<string, string[]> {
  const crudo = valor && typeof valor === "object" ? (valor as { paginas?: unknown }).paginas : null;
  if (!crudo || typeof crudo !== "object") return {};
  const out: Record<string, string[]> = {};
  for (const [url, g] of Object.entries(crudo as Record<string, unknown>)) {
    const o = g as { rasgos?: unknown; error?: unknown } | null;
    if (o && !o.error && Array.isArray(o.rasgos) && o.rasgos.length) out[url] = o.rasgos.map(String);
  }
  return out;
}

const pct = (n: number) => `${Math.round(n * 100)} %`;
const dol = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Lo básico que una landing de pago contra entrega debería decir y no dice, según lo que se midió de ella. Vacío si no hay medición (no se adivina). */
export function fallasDePagina(rasgos: readonly string[] | undefined): string[] {
  if (!rasgos || rasgos.length === 0) return [];
  const tiene = (t: string) => rasgos.some((r) => r.includes(t));
  const out: string[] = [];
  if (!tiene("dice que se paga contra entrega")) out.push("no dice que se paga contra entrega");
  if (!tiene("muestra el precio")) out.push("no muestra el precio");
  if (!tiene("habla de garantía o devolución")) out.push("no habla de garantía ni devolución");
  if (!tiene("muestra reseñas o testimonios")) out.push("no muestra reseñas ni testimonios");
  if (tiene("Botones de compra: ninguno visible")) out.push("no tiene un botón de compra visible");
  if (tiene("Velocidad de la página: lenta")) out.push("carga lenta (más de 2,5 segundos)");
  if (tiene("Peso de la página: pesada")) out.push("pesa más de 1,5 MB");
  return out;
}

/** Lo que le falta a la landing de una campaña (la de su anuncio con más gasto), o que no le falta nada de lo básico. null si esa página todavía no se midió. */
export function diagnosticoDeLanding(paginas: readonly { url: string; rasgos: readonly string[] }[] | undefined): { url: string; fallas: string[] } | null {
  const p = paginas?.find((x) => x.rasgos.length > 0);
  return p ? { url: p.url, fallas: fallasDePagina(p.rasgos) } : null;
}

const esZona = (g: GrupoInv) => g.dimension === "zona" || g.dimension === "provincia";

/** Qué zonas bajar y a cuáles mover el presupuesto, con los pedidos que lo respaldan. null si la investigación no tiene zonas que comparar. */
export function accionDeZonas(inv: InvestigacionProducto): string | null {
  const zonas = inv.grupos.filter(esZona);
  if (!zonas.length) return null;
  const general = inv.resumen.resueltos ? inv.resumen.devueltos / inv.resumen.resueltos : 0;
  // La provincia es más precisa que la zona (Colón frente a «Interior»): se usa si hay alguna; si no, la zona. Así no se dice dos veces lo mismo.
  const elegir = (lista: GrupoInv[]) => {
    const provincias = lista.filter((g) => g.dimension === "provincia");
    return provincias.length ? provincias : lista;
  };
  const malas = elegir(zonas.filter((g) => g.factor)).sort((a, b) => b.exceso - a.exceso).slice(0, 3);
  const buenas = elegir(zonas.filter((g) => !g.factor && g.resueltos >= 8 && g.tasaDevolucion < general)).sort((a, b) => a.tasaDevolucion - b.tasaDevolucion).slice(0, 2);
  if (!malas.length) return `Ninguna zona ni provincia concentra las devoluciones (en general vuelve el ${pct(general)}): no hay una zona que excluir; el problema no es dónde se muestra el anuncio.`;
  const de = (g: GrupoInv) => `${g.nombre} (${g.devueltos} de ${g.resueltos} pedidos volvieron, ${pct(g.tasaDevolucion)}${g.resueltos < 12 ? ", pocos pedidos: señal débil" : ""})`;
  const mover = buenas.length ? ` y mover ese presupuesto a ${buenas.map((g) => `${g.nombre} (${pct(g.tasaDevolucion)} de devoluciones)`).join(" o ")}` : "";
  return `Bajar o excluir de la segmentación ${malas.map(de).join("; ")}${mover}.`;
}

/** Lo que promete el anuncio de más gasto y si su página dice lo básico. null si no hay anuncios del producto. */
export function accionDePromesa(ofertas: OfertasProducto | undefined): string | null {
  const a = ofertas?.anuncios[0];
  if (!ofertas || !a) return null;
  const fallas = a.landing ? fallasDePagina(ofertas.paginas[a.landing]) : [];
  const promesa = `Su anuncio con más gasto (${dol(a.gasto)}) empieza diciendo «${a.inicio}»`;
  if (!a.landing) return `${promesa}, pero no se pudo leer a qué página lleva.`;
  const medida = ofertas.paginas[a.landing];
  if (!medida || medida.length === 0) return `${promesa} y lleva a ${a.landing}, que todavía no se ha medido.`;
  if (fallas.length === 0) return `${promesa} y lleva a ${a.landing}, que sí muestra el precio, dice que se paga contra entrega, habla de garantía y tiene reseñas: la promesa y la página no parecen ser la causa.`;
  return `${promesa} y lleva a ${a.landing}, que ${fallas.join(", ")}: completar eso en la landing para que el cliente sepa lo que va a pagar y recibir.`;
}

/** El «Qué hacer» de un producto que vende bien pero entrega mal, con las zonas, la promesa y lo que dijeron los motivos, o null si no hay nada que agregar al texto de antes. */
export function accionDeEntregaConcreta(inv: InvestigacionProducto | undefined, ofertas: OfertasProducto | undefined): string | null {
  const partes: string[] = [];
  const zonas = inv ? accionDeZonas(inv) : null;
  if (zonas) partes.push(zonas);
  const promesa = accionDePromesa(ofertas);
  if (promesa) partes.push(promesa);
  const motivo = inv?.hallazgos.find((h) => h.tipo === "motivo_courier" || h.tipo === "conversacion");
  if (motivo) partes.push(`Lo que más escribieron en las devoluciones: ${motivo.titulo.replace(/^Según [^:]+: /, "").replace(/^En las conversaciones: /, "")}. ${motivo.accion}`);
  return partes.length ? partes.join(" ") : null;
}

/** El «Qué hacer» de una tendencia que empeoró en un producto: las causas que encontraron las señales (creativos cansados, depender de un video, inventario, precio, competencia). null si no hay causas. */
export function accionDeTendenciaConcreta(s: SenalesCreativas | undefined): string | null {
  if (!s) return null;
  const graves = (s.otras ?? []).filter((o) => o.gravedad === "alta").slice(0, 1);
  const frases = [...graves.map((o) => `${o.titulo}. ${o.accion}`), ...s.causas.slice(0, 2).map((c) => `${c.titulo}. ${c.accion}`)];
  return frases.length ? `Lo que se ve en este producto: ${frases.join(" ")}` : null;
}

/** Lo que tienen en común los anuncios que sí funcionaron, en una frase, para compararlo con lo que no funcionó. null si no hay patrones. */
export function resumenDeGanadores(rasgos: readonly RasgosDeGanadores[]): string | null {
  const r = rasgos.find((x) => x.metrica === "ctr" && x.comunes.length > 0) ?? rasgos.find((x) => x.sobre === "anuncios" && x.comunes.length > 0);
  if (!r) return null;
  return `Los anuncios que sí funcionaron comparten: ${r.comunes.slice(0, 3).map((x) => `${x.rasgo} (${x.enGanadores} de ${r.ganadores})`).join("; ")}`;
}

export interface DatosParaConcretar {
  investigaciones: readonly InvestigacionProducto[];
  senales: readonly SenalesCreativas[];
  rasgos: readonly RasgosDeGanadores[];
  ofertas: Record<string, OfertasProducto>;
}

/** Reemplaza el «Qué hacer» genérico de los hallazgos por uno con la respuesta, cuando el sistema ya tiene los datos para darla. Lo demás queda igual. */
export function concretarHallazgos(analisis: AnalisisHistorico, d: DatosParaConcretar): AnalisisHistorico {
  const ganadores = resumenDeGanadores(d.rasgos);
  const hallazgos = analisis.hallazgos.map((h): Hallazgo => {
    const entrega = /^entrega:(.+):mala$/.exec(h.id);
    if (entrega) {
      const clave = entrega[1];
      const accion = accionDeEntregaConcreta(d.investigaciones.find((i) => i.clave === clave), d.ofertas[clave]);
      if (!accion) return h;
      // Dentro de su tope no se toca la campaña: lo encontrado queda para cuando pase, o para probar aparte.
      return { ...h, accion: h.tono === "info" ? `Sin tocar la campaña actual (va dentro de su tope); para una campaña nueva o si pasa del tope: ${accion}` : accion };
    }
    const tendencia = /^tendencia:Producto:(.+):(mes|semana)$/.exec(h.id);
    if (tendencia && h.tono === "alerta") {
      const nombre = norm(tendencia[1]);
      const accion = accionDeTendenciaConcreta(d.senales.find((s) => norm(s.producto) === nombre));
      if (!accion) return h;
      return { ...h, accion: h.zona === "cerca" ? `Está cerca del tope: dale 4 días; si no baja: ${accion.charAt(0).toLowerCase()}${accion.slice(1)}` : accion };
    }
    if (h.categoria === "no_funciona" && h.accion?.startsWith("Dejar de usar «") && ganadores) {
      return { ...h, accion: `${h.accion} ${ganadores}.` };
    }
    return h;
  });
  return { ...analisis, hallazgos };
}
