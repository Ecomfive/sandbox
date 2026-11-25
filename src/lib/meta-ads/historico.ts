// Anuncios Meta › Hallazgos (24 nov 2026, pedido de Alcides: «que uses toda la información y el conjunto de datos y estadísticos que tienes para dar recomendaciones en cuanto al historial»). Lee **todo el historial**
// de campañas, anuncios y videos y dice, frío y con números, lo que los datos muestran aunque no esté en ningún documento:
//   · qué nunca funcionó (campañas con cierto CTR, hook o CPM de las que ninguna llegó a su CPA tope) y qué tiende a funcionar mejor (ángulos, ganchos, formatos… en general y por tipo de producto);
//   · si algo empieza a desmejorar (o a mejorar) frente a las semanas o al mes anterior, y **por qué motivo** (CPM, CTR, hook, clic a visita, conversión de la página);
//   · la **tasa de entrega** de cada producto: un producto puede vender muy bien en Meta y entregar mal, y entonces cada compra entregada cuesta más de lo que parece;
//   · qué genera más ventas en cada parte (campañas, videos, ángulos, ganchos, productos), con lo que de verdad se entrega.
// Sin la calculadora de costos: «funcionó» = tuvo gasto suficiente para compararse y su CPA quedó dentro del CPA tope del producto. Lógica pura, con prueba; las lecturas están en `historico-datos.ts`.

import { sumarPedidos, tasasDe } from "./costos-operacion";
import { NO_TOCAR, zonaDe, zonaDeCpa, type GuiaDeTope, type Zona } from "./limite";
import { detallesDe, enComun, temasDe, textoDeDetalles, type RasgoComun } from "./angulo-detalle";
import { esAnguloTactico } from "./video-angulo";
import { claveDeProducto } from "./nombre";
import { calcularEnMarcha, type EnMarcha } from "./en-marcha";
import { CPA_TOPE_PREDETERMINADO, certezaDe, confiable, cpa, cpm, ctr, cvr, efectividad, GASTO_MINIMO_CONFIABLE, hookRate, sinResultados, sumar, type Certeza, type Resultados } from "./metricas";

export type Familia = "suplemento" | "belleza" | "general";
export const NOMBRE_FAMILIA: Record<Familia, string> = { suplemento: "suplementos", belleza: "belleza", general: "productos generales" };

/** Los umbrales, en un solo lugar y a la vista para que el equipo los entienda y los discuta. */
export const UMBRALES_HISTORICO = {
  /** Unidades (campañas o videos) mínimas en un grupo para decir algo de él. */
  minUnidades: 8,
  /** En un cruce (por ejemplo ángulo × tipo de producto) los grupos son más chicos. */
  minUnidadesCruce: 6,
  /** Para decir que algo «nunca funcionó», el resto tiene que funcionar al menos tanto como esto (si nada funciona, no hay nada que comparar). */
  tasaBaseMinima: 0.15,
  /** «Funciona mejor»: al menos 1.5 veces la tasa del resto y 15 puntos más, con 3 aciertos como mínimo y $300 de gasto. */
  mejorVeces: 1.5,
  mejorPuntos: 0.15,
  mejorAciertos: 3,
  mejorGasto: 300,
  /** Entrega: cerradas (entregadas + devueltas) para fiarse de la tasa, y cuándo es mala. */
  entregaMinCerradas: 15,
  entregaMala: 0.55,
  entregaBrecha: 0.12,
  entregaGastoMinimo: 150,
  entregaComprasMinimas: 5,
  /** Tendencia: el CPA cambió al menos esto (y al menos $1.50 en dólares) entre el periodo anterior y el reciente. */
  cpaCambio: 0.25,
  cpaCambioDolares: 1.5,
  /** Una métrica del anuncio (CTR, hook…) explica el cambio si se movió al menos esto en contra. */
  metricaCambio: 0.15,
  /** Gasto mínimo en los dos periodos que se comparan. */
  gastoMes: 80,
  gastoSemana: 40,
} as const;

/** Funcionó: con gasto suficiente para compararse, al menos una compra y el CPA dentro del tope. */
export const funciono = (r: Resultados, tope: number): boolean => confiable(r) && r.compras > 0 && (cpa(r) ?? Infinity) <= tope;

const pct = (n: number): string => `${Math.round(n * 100)} %`;
const dol = (n: number): string => `$${n.toFixed(2)}`;
const entero = (n: number): string => Math.round(n).toLocaleString("es-PA");

// ───────────────────────── Entrada ─────────────────────────

export interface Ventana {
  rec: Resultados;
  prev: Resultados;
}
/** Dos formas de mirar el cambio: el último mes contra el anterior y la última semana contra las tres anteriores. */
export interface Ventanas {
  mes: Ventana;
  semana: Ventana;
}
export const sinVentanas = (): Ventanas => ({ mes: { rec: sinResultados(), prev: sinResultados() }, semana: { rec: sinResultados(), prev: sinResultados() } });

export interface CampanaHist {
  id: string;
  nombre: string;
  producto: string | null;
  clave: string;
  familia: Familia;
  activa: boolean;
  etapa: string | null;
  estructura: string | null;
  puja: string | null;
  angulo: string | null;
  tope: number;
  /** Si su producto tiene el tope más bajo. */
  guia?: GuiaDeTope;
  total: Resultados;
  v: Ventanas;
}

export interface VideoHist {
  id: string;
  nombre: string;
  producto: string | null;
  clave: string;
  familia: Familia;
  angulo: string | null;
  /** De qué es, cuando el ángulo es una táctica general («Antes y después», «Testimonio de cliente», «Experto o autoridad»). */
  detalle?: string | null;
  ganchoTipo: string | null;
  formato: string | null;
  ctaTipo: string | null;
  tope: number;
  total: Resultados;
  /** Sus últimas semanas y meses (para decir cuáles empeoraron o mejoraron). */
  v?: Ventanas;
  /** Las campañas donde se usa. */
  campanas?: string[];
}

/** Lo que dicen los pedidos de un producto en la tienda (lo que Meta no sabe): cuántos se entregaron y cuántos volvieron. */
export interface EntregaProducto {
  nombre: string;
  entregadas: number;
  devueltas: number;
  canceladas: number;
  enCamino: number;
  /** De lo que va en camino, lo que todavía está pendiente (ni enviado ni cancelado). Sin este dato (un análisis guardado antes), no se calcula el % de envío. */
  sinEnviar?: number;
}

export interface ProductoHist {
  clave: string;
  nombre: string;
  familia: Familia;
  /** El CPA tope que se usa (ajustado por su envío y entrega, si toca). */
  tope: number;
  /** El tope sin ajustar. */
  topeBase?: number;
  guia?: GuiaDeTope;
  campanas: number;
  total: Resultados;
  v: Ventanas;
  entrega: EntregaProducto | null;
}

/** Lo que sumó algo en un mes calendario (AAAA-MM). */
export interface MesHist {
  mes: string;
  r: Resultados;
}

export interface EntradaHistorico {
  campanas: CampanaHist[];
  videos: VideoHist[];
  productos: ProductoHist[];
  /** Mes a mes de todas las campañas y de los productos con más gasto: para comparar un mes con otro. Opcional: sin esto no hay serie mensual. */
  mensual?: MesHist[];
  mensualPorProducto?: { clave: string; nombre: string; meses: MesHist[] }[];
  /** Todos los pedidos de las tiendas juntos (no solo los de productos con campañas). */
  pedidosDeLaTienda?: Omit<EntregaProducto, "nombre"> | null;
  /** Primer y último día con resultados leídos. */
  desde: string | null;
  hasta: string | null;
}

// ───────────────────────── Entrega ─────────────────────────

/** De lo que ya se resolvió (entregado o devuelto), cuánto se entregó. null con pocas resueltas: todavía no es una tasa en la que fiarse. */
export function tasaDeEntrega(e: Pick<EntregaProducto, "entregadas" | "devueltas"> | null): number | null {
  if (!e) return null;
  const cerradas = e.entregadas + e.devueltas;
  return cerradas >= UMBRALES_HISTORICO.entregaMinCerradas ? e.entregadas / cerradas : null;
}

/** La tasa de entrega de todos los productos juntos (ponderada por pedidos resueltos). */
export function tasaPromedio(productos: readonly { entrega: EntregaProducto | null }[]): number | null {
  let ent = 0;
  let cer = 0;
  for (const p of productos) {
    if (!p.entrega) continue;
    ent += p.entrega.entregadas;
    cer += p.entrega.entregadas + p.entrega.devueltas;
  }
  return cer >= UMBRALES_HISTORICO.entregaMinCerradas ? ent / cer : null;
}

export type VeredictoEntrega = "vende_y_entrega" | "vende_pero_no_entrega" | "no_funciona" | "poca_data" | "sin_entrega";

export interface FilaEntrega {
  clave: string;
  nombre: string;
  gasto: number;
  compras: number;
  cpa: number | null;
  tope: number;
  /** El tope sin ajustar (un análisis guardado antes no lo trae). */
  topeBase?: number;
  /** De los pedidos ya decididos, cuántos se envían. */
  envio?: number | null;
  guia?: GuiaDeTope;
  tasa: number | null;
  cerradas: number;
  entregadas: number;
  devueltas: number;
  canceladas: number;
  enCamino: number;
  sinEnviar?: number;
  /** Con qué producto de la tienda se calculó la entrega (el nombre de la línea del pedido). */
  enTienda: string | null;
  /** Compras de Meta × tasa de entrega: las que se espera que lleguen al cliente. */
  comprasEntregadas: number | null;
  /** Lo que cuesta cada compra que sí se entrega (gasto ÷ compras entregadas). */
  cpaEntregado: number | null;
  veredicto: VeredictoEntrega;
}

/** Cada producto con su CPA, su tasa de entrega y lo que cuesta de verdad cada compra entregada. */
export function filasDeEntrega(productos: readonly ProductoHist[]): FilaEntrega[] {
  const U = UMBRALES_HISTORICO;
  const promedio = tasaPromedio(productos);
  return productos
    .filter((p) => p.total.gasto > 0)
    .map((p): FilaEntrega => {
      const tasa = tasaDeEntrega(p.entrega);
      const c = cpa(p.total);
      const envio = tasasDe(p.entrega).envio;
      const base = p.topeBase ?? p.tope;
      // Las ventas que llegan: las que se envían (si se sabe) y de esas las que se entregan.
      const comprasEntregadas = tasa === null ? null : p.total.compras * tasa * (envio ?? 1);
      const cpaEntregado = comprasEntregadas && comprasEntregadas > 0 ? p.total.gasto / comprasEntregadas : null;
      let veredicto: VeredictoEntrega;
      if (tasa === null) veredicto = "sin_entrega";
      else if (p.total.gasto < U.entregaGastoMinimo || p.total.compras < U.entregaComprasMinimas) veredicto = "poca_data";
      // Se ve bien en Meta (dentro del tope general) pero no entrega, o no alcanza el tope que le queda con su entrega.
      else if (c !== null && c <= base && (tasa <= U.entregaMala || (promedio !== null && tasa <= promedio - U.entregaBrecha) || c > p.tope)) veredicto = "vende_pero_no_entrega";
      else if (c !== null && c <= p.tope) veredicto = "vende_y_entrega";
      else veredicto = "no_funciona";
      const e = p.entrega;
      return {
        clave: p.clave,
        nombre: p.nombre,
        gasto: p.total.gasto,
        compras: p.total.compras,
        cpa: c,
        tope: p.tope,
        topeBase: base,
        envio,
        ...(p.guia ? { guia: p.guia } : {}),
        tasa,
        cerradas: e ? e.entregadas + e.devueltas : 0,
        entregadas: e?.entregadas ?? 0,
        devueltas: e?.devueltas ?? 0,
        canceladas: e?.canceladas ?? 0,
        enCamino: e?.enCamino ?? 0,
        sinEnviar: e ? e.sinEnviar : 0,
        enTienda: e?.nombre ?? null,
        comprasEntregadas,
        cpaEntregado,
        veredicto,
      };
    })
    .sort((a, b) => b.gasto - a.gasto);
}

// ───────────────────────── Hallazgos ─────────────────────────

export type CategoriaHallazgo = "entrega" | "tendencia" | "no_funciona" | "funciona";
export type TonoHallazgo = "alerta" | "bueno" | "info";

export interface Hallazgo {
  id: string;
  categoria: CategoriaHallazgo;
  tono: TonoHallazgo;
  titulo: string;
  detalle: string;
  /** Por qué pasa (en las tendencias): lo que se movió en las métricas. */
  motivo?: string;
  /** Qué mirar o hacer, en una frase. */
  accion?: string;
  certeza: Certeza;
  gasto: number;
  /** Cuáles son: los videos y las campañas detrás del hallazgo, y lo que tienen en común. */
  quienes?: Quienes;
  /** Si su producto tiene el tope más bajo: desde cuánto vigilarlo y apagarlo. */
  guia?: GuiaDeTope;
  /** Dónde queda frente a su CPA tope (tendencias y entrega): dentro, cerca o sobre. */
  zona?: Zona;
  /** Dólares gastados por encima del tope (gasto − compras × tope): cuánto pesa lo que pasa. */
  impacto?: number;
  /** Solo en lo que sale de una vigilancia: la prioridad que la persona le dio (manda sobre la certeza al ordenar las sugerencias). */
  prioridad?: "alta" | "media" | "baja";
}

/** En qué pantalla de Anuncios Meta se explica mejor un hallazgo (24 nov 2026): cada pestaña muestra los suyos y Hallazgos queda con lo general. */
export type SeccionHallazgo = "productos" | "campanas" | "videos" | "general";

/**
 * A qué sección pertenece un hallazgo, según de qué nace su llave: la entrega y las tendencias de producto son de Productos; las bandas, la estructura, la puja y las tendencias de campaña, de Campañas; el ángulo, el gancho, el formato
 * y el llamado a la acción (lo que sale del video) y las tendencias de ángulo, de Videos; el resto (todo el conjunto), general. Se deduce de la llave para que valga también con un análisis guardado antes.
 */
export function seccionDeHallazgo(h: Pick<Hallazgo, "id">): SeccionHallazgo {
  const id = h.id;
  if (id.startsWith("entrega:")) return "productos";
  if (id.startsWith("tendencia:")) {
    const nivel = id.split(":")[1];
    return nivel === "Producto" ? "productos" : nivel === "Campaña" ? "campanas" : nivel === "Ángulo" ? "videos" : "general";
  }
  if (id.startsWith("banda:")) return "campanas";
  const dimension = id.split(":")[0].split("@")[0];
  if (["angulo", "gancho", "formato", "cta"].includes(dimension)) return "videos";
  if (["estructura", "puja"].includes(dimension)) return "campanas";
  return "general";
}

export const NOMBRE_CATEGORIA: Record<CategoriaHallazgo, string> = {
  entrega: "Entrega",
  tendencia: "Tendencia",
  no_funciona: "Lo que no funciona",
  funciona: "Lo que funciona",
};

// — Bandas de una métrica (CTR, hook…): de cuántas campañas con ese valor llegó alguna a su CPA tope.

interface DefMetrica {
  id: string;
  titulo: string;
  valor: (r: Resultados) => number | null;
  /** Cortes de menor a mayor: n cortes = n + 1 bandas. */
  cortes: number[];
  etiquetas: string[];
  /** true = mientras más alto, mejor (CTR); false = mientras más bajo, mejor (CPM). */
  masEsMejor: boolean;
}

/** Los cortes son los de las escalas de ventas del documento «Métrica» (mal, regular, bien). */
export const METRICAS_BANDA: DefMetrica[] = [
  { id: "ctr", titulo: "CTR", valor: ctr, cortes: [2, 3], etiquetas: ["menos de 2 %", "de 2 % a 3 %", "3 % o más"], masEsMejor: true },
  { id: "hook", titulo: "Hook rate", valor: hookRate, cortes: [25, 40], etiquetas: ["menos de 25 %", "de 25 % a 40 %", "40 % o más"], masEsMejor: true },
  { id: "cpm", titulo: "CPM", valor: cpm, cortes: [5.5, 7.5], etiquetas: ["hasta $5.50", "de $5.50 a $7.50", "más de $7.50"], masEsMejor: false },
  { id: "efectividad", titulo: "% Efectividad (clic a visita)", valor: efectividad, cortes: [75, 85], etiquetas: ["menos de 75 %", "de 75 % a 85 %", "85 % o más"], masEsMejor: true },
  { id: "cvr", titulo: "CVR (conversión de la página)", valor: cvr, cortes: [1, 1.5], etiquetas: ["menos de 1 %", "de 1 % a 1.5 %", "1.5 % o más"], masEsMejor: true },
];

export interface FilaBanda {
  etiqueta: string;
  campanas: number;
  funcionaron: number;
  /** Fracción (0 a 1) de las campañas de la banda que funcionaron. */
  tasa: number;
  gasto: number;
  cpa: number | null;
}
export interface BandasMetrica {
  id: string;
  titulo: string;
  filas: FilaBanda[];
  /** De todas las campañas medibles, cuántas funcionaron (la vara con que se compara cada banda). */
  tasaBase: number;
  medibles: number;
}

const bandaDe = (v: number, cortes: number[]): number => cortes.filter((c) => v >= c).length;

/** Para cada métrica, las campañas con gasto suficiente repartidas en bandas, con cuántas de cada banda funcionaron. */
export function bandasDeMetricas(campanas: readonly CampanaHist[]): BandasMetrica[] {
  return METRICAS_BANDA.map((m) => {
    const filas = m.etiquetas.map((etiqueta) => ({ etiqueta, campanas: 0, funcionaron: 0, gasto: 0, r: sinResultados() }));
    let medibles = 0;
    let funcionaron = 0;
    for (const c of campanas) {
      if (!confiable(c.total)) continue;
      const v = m.valor(c.total);
      if (v === null) continue;
      const f = filas[bandaDe(v, m.cortes)];
      const ok = funciono(c.total, c.tope);
      f.campanas++;
      f.gasto += c.total.gasto;
      f.r = sumar(f.r, c.total);
      if (ok) {
        f.funcionaron++;
        funcionaron++;
      }
      medibles++;
    }
    return {
      id: m.id,
      titulo: m.titulo,
      medibles,
      tasaBase: medibles ? funcionaron / medibles : 0,
      filas: filas.map((f) => ({ etiqueta: f.etiqueta, campanas: f.campanas, funcionaron: f.funcionaron, tasa: f.campanas ? f.funcionaron / f.campanas : 0, gasto: f.gasto, cpa: cpa(f.r) })),
    };
  });
}

function hallazgosDeBandas(bandas: BandasMetrica[]): Hallazgo[] {
  const U = UMBRALES_HISTORICO;
  const out: Hallazgo[] = [];
  for (const b of bandas) {
    for (const f of b.filas) {
      if (f.campanas < U.minUnidades) continue;
      const certeza: Certeza = f.gasto >= 1000 ? "firme" : "probable";
      if (f.funcionaron === 0 && b.tasaBase >= U.tasaBaseMinima) {
        out.push({
          id: `banda:${b.id}:${f.etiqueta}:no`,
          categoria: "no_funciona",
          tono: "alerta",
          titulo: `${b.titulo} ${f.etiqueta}: ninguna campaña llegó a su CPA tope`,
          detalle: `Ninguna de las ${f.campanas} campañas con ${b.titulo} ${f.etiqueta} (${dol(f.gasto)} gastados) funcionó, mientras que de todas las campañas medibles funcionó ${pct(b.tasaBase)}.`,
          accion: `Una campaña que se queda con ${b.titulo} ${f.etiqueta} después de unos días rara vez se arregla sola: cambiar el creativo o apagarla antes de gastar más.`,
          certeza,
          gasto: f.gasto,
        });
      } else if (f.funcionaron >= U.mejorAciertos && f.gasto >= U.mejorGasto && f.tasa >= Math.max(b.tasaBase * U.mejorVeces, b.tasaBase + U.mejorPuntos)) {
        out.push({
          id: `banda:${b.id}:${f.etiqueta}:si`,
          categoria: "funciona",
          tono: "bueno",
          titulo: `${b.titulo} ${f.etiqueta}: funciona ${pct(f.tasa)} de las veces`,
          detalle: `${f.funcionaron} de ${f.campanas} campañas con ${b.titulo} ${f.etiqueta} funcionaron (${pct(f.tasa)}), frente a ${pct(b.tasaBase)} de todas las campañas medibles${f.cpa !== null ? `; su CPA promedio fue ${dol(f.cpa)}` : ""}.`,
          accion: `Usar ${b.titulo} ${f.etiqueta} como señal temprana: una campaña nueva que lo logra en sus primeros días tiene más probabilidad de funcionar.`,
          certeza,
          gasto: f.gasto,
        });
      }
    }
  }
  return out;
}

// — Qué características funcionan (ángulo, gancho, formato…), en general y por tipo de producto.

interface Unidad {
  r: Resultados;
  tope: number;
  familia: Familia;
}
interface GrupoCara {
  clave: string;
  n: number;
  ok: number;
  gasto: number;
  r: Resultados;
}

function agruparCaracteristica(unidades: readonly (Unidad & { cara: string | null })[]): { grupos: GrupoCara[]; n: number; ok: number } {
  const mapa = new Map<string, GrupoCara>();
  let n = 0;
  let ok = 0;
  for (const u of unidades) {
    if (!u.cara || !confiable(u.r)) continue;
    const g = mapa.get(u.cara) ?? { clave: u.cara, n: 0, ok: 0, gasto: 0, r: sinResultados() };
    g.n++;
    g.gasto += u.r.gasto;
    g.r = sumar(g.r, u.r);
    n++;
    if (funciono(u.r, u.tope)) {
      g.ok++;
      ok++;
    }
    mapa.set(u.cara, g);
  }
  return { grupos: [...mapa.values()], n, ok };
}

function hallazgosDeCaracteristica(opciones: { id: string; unidad: string; plural: string; nombre: string; unidades: readonly (Unidad & { cara: string | null })[]; minimo: number; enFamilia?: Familia }): Hallazgo[] {
  const U = UMBRALES_HISTORICO;
  const { grupos, n, ok } = agruparCaracteristica(opciones.unidades);
  const out: Hallazgo[] = [];
  const donde = opciones.enFamilia ? ` en ${NOMBRE_FAMILIA[opciones.enFamilia]}` : "";
  for (const g of grupos) {
    if (g.n < opciones.minimo) continue;
    // El resto: todo lo demás de la misma dimensión (y del mismo tipo de producto, si es un cruce).
    const restoN = n - g.n;
    const restoOk = ok - g.ok;
    if (restoN < opciones.minimo) continue;
    const tasa = g.ok / g.n;
    const resto = restoOk / restoN;
    const certeza = certezaDe(g.r, g.n);
    const base = `${g.ok} de ${g.n} ${opciones.plural}`;
    if (g.ok === 0 && resto >= U.tasaBaseMinima) {
      out.push({
        id: `${opciones.id}:${g.clave}:no`,
        categoria: "no_funciona",
        tono: "alerta",
        titulo: `${opciones.nombre} «${g.clave}»${donde}: ninguno funcionó`,
        detalle: `De ${g.n} ${opciones.plural} con ${opciones.nombre.toLowerCase()} «${g.clave}»${donde} (${dol(g.gasto)} gastados) ninguno llegó a su CPA tope; en el resto funcionó ${pct(resto)}.`,
        accion: opciones.unidad === "video" ? `Dejar de usar «${g.clave}»${donde} en videos nuevos y probar con lo que sí funcionó.` : `Dejar de montar campañas con ${opciones.nombre.toLowerCase()} «${g.clave}»${donde} y probar con lo que sí funcionó.`,
        certeza,
        gasto: g.gasto,
      });
    } else if (g.ok >= U.mejorAciertos && g.gasto >= U.mejorGasto && tasa >= Math.max(resto * U.mejorVeces, resto + U.mejorPuntos)) {
      out.push({
        id: `${opciones.id}:${g.clave}:si`,
        categoria: "funciona",
        tono: "bueno",
        titulo: `${opciones.nombre} «${g.clave}»${donde}: funciona ${pct(tasa)}`,
        detalle: `${base} con ${opciones.nombre.toLowerCase()} «${g.clave}»${donde} funcionaron (${pct(tasa)}), frente a ${pct(resto)} del resto${cpa(g.r) !== null ? `; CPA promedio ${dol(cpa(g.r)!)}` : ""}.`,
        accion: `Es una de las ${opciones.nombre.toLowerCase()}s que mejor le va${donde}: probarla primero en los productos nuevos.`,
        certeza,
        gasto: g.gasto,
      });
    }
  }
  return out;
}

const familias: Familia[] = ["suplemento", "belleza", "general"];

/** Qué ángulos, ganchos, formatos, llamados, estructuras y pujas funcionan mejor o nunca funcionaron; y lo mismo dentro de cada tipo de producto. */
export function hallazgosDeCaracteristicas(campanas: readonly CampanaHist[], videos: readonly VideoHist[]): Hallazgo[] {
  const U = UMBRALES_HISTORICO;
  const deVideo = (cara: (v: VideoHist) => string | null) => videos.map((v) => ({ cara: cara(v), r: v.total, tope: v.tope, familia: v.familia }));
  const deCampana = (cara: (c: CampanaHist) => string | null) => campanas.map((c) => ({ cara: cara(c), r: c.total, tope: c.tope, familia: c.familia }));
  const dimensiones: { id: string; unidad: string; plural: string; nombre: string; unidades: (Unidad & { cara: string | null })[] }[] = [
    { id: "angulo", unidad: "video", plural: "videos", nombre: "Ángulo", unidades: deVideo((v) => v.angulo) },
    { id: "gancho", unidad: "video", plural: "videos", nombre: "Gancho", unidades: deVideo((v) => v.ganchoTipo) },
    { id: "formato", unidad: "video", plural: "videos", nombre: "Formato", unidades: deVideo((v) => v.formato) },
    { id: "cta", unidad: "video", plural: "videos", nombre: "Llamado a la acción", unidades: deVideo((v) => v.ctaTipo) },
    { id: "estructura", unidad: "campaña", plural: "campañas", nombre: "Estructura", unidades: deCampana((c) => c.estructura) },
    { id: "puja", unidad: "campaña", plural: "campañas", nombre: "Puja", unidades: deCampana((c) => c.puja) },
  ];
  const out: Hallazgo[] = [];
  for (const d of dimensiones) {
    out.push(...hallazgosDeCaracteristica({ ...d, minimo: U.minUnidades }));
    // Los cruces con el tipo de producto solo tienen sentido en lo creativo (ángulo, gancho, formato).
    if (["angulo", "gancho", "formato"].includes(d.id)) {
      for (const f of familias) out.push(...hallazgosDeCaracteristica({ ...d, id: `${d.id}@${f}`, unidades: d.unidades.filter((u) => u.familia === f), minimo: U.minUnidadesCruce, enFamilia: f }));
    }
  }
  // Un hallazgo del cruce que repite al general (mismo ángulo, mismo sentido) no aporta: se queda el más específico solo si es más fuerte.
  return out;
}

// ───────────────────────── Tendencias ─────────────────────────

export type SentidoCambio = "baja" | "mejora" | "estable" | "poca";

export interface Cambio {
  sentido: SentidoCambio;
  cpaPrev: number | null;
  cpaRec: number | null;
  /** Por qué: lo que más se movió en contra (o a favor) en las métricas del anuncio. */
  motivo: string | null;
}

interface MetricaMotivo {
  id: string;
  valor: (r: Resultados) => number | null;
  /** true = si baja, empeora. */
  masEsMejor: boolean;
  malo: (cambioPct: number) => string;
  bueno: (cambioPct: number) => string;
}

const METRICAS_MOTIVO: MetricaMotivo[] = [
  { id: "cpm", valor: cpm, masEsMejor: false, malo: (p) => `Meta cobra más por mostrar el anuncio (CPM +${p} %): la audiencia se encareció o se saturó.`, bueno: (p) => `Mostrar el anuncio sale más barato (CPM −${p} %).` },
  { id: "ctr", valor: ctr, masEsMejor: true, malo: (p) => `El anuncio atrae menos clics (CTR −${p} %): el creativo se está cansando.`, bueno: (p) => `El anuncio atrae más clics (CTR +${p} %).` },
  { id: "hook", valor: hookRate, masEsMejor: true, malo: (p) => `Menos gente pasa los 3 primeros segundos (hook −${p} %): el inicio del video perdió fuerza.`, bueno: (p) => `Más gente pasa los 3 primeros segundos (hook +${p} %).` },
  { id: "efectividad", valor: efectividad, masEsMejor: true, malo: (p) => `Se pierden más clics antes de ver la página (clic a visita −${p} %): revisar el enlace o la velocidad de la landing.`, bueno: (p) => `Llegan más clics a ver la página (clic a visita +${p} %).` },
  { id: "cvr", valor: cvr, masEsMejor: true, malo: (p) => `La página convierte menos (CVR −${p} %): el clic llega pero no compra (oferta, precio o landing).`, bueno: (p) => `La página convierte más (CVR +${p} %).` },
];

/**
 * Qué se movió más entre dos periodos, en las métricas del anuncio: devuelve la frase de la que más empeoró (si `empeora`) o más mejoró, cuando se movió al menos `metricaCambio`.
 * null si ninguna se movió lo suficiente: el cambio no se explica con esas métricas.
 */
export function motivoDeCambio(prev: Resultados, rec: Resultados, empeora: boolean): string | null {
  const x = masMovida(prev, rec, empeora);
  return x ? (empeora ? x.m.malo : x.m.bueno)(Math.round(Math.abs(x.relativo) * 100)) : null;
}

/** La métrica del anuncio que más se movió (en contra si `empeora`, a favor si no), con cuánto; null si ninguna llegó al umbral. */
function masMovida(prev: Resultados, rec: Resultados, empeora: boolean): { m: MetricaMotivo; relativo: number } | null {
  let mejor: { fuerza: number; m: MetricaMotivo; relativo: number } | null = null;
  for (const m of METRICAS_MOTIVO) {
    const a = m.valor(prev);
    const b = m.valor(rec);
    if (a === null || b === null || a <= 0) continue;
    const relativo = b / a - 1;
    // «En contra» es bajar si más es mejor, o subir si menos es mejor.
    const enContra = m.masEsMejor ? -relativo : relativo;
    const fuerza = empeora ? enContra : -enContra;
    if (fuerza < UMBRALES_HISTORICO.metricaCambio) continue;
    if (!mejor || fuerza > mejor.fuerza) mejor = { fuerza, m, relativo };
  }
  return mejor;
}

/** Cómo cambió algo entre el periodo anterior y el reciente: el CPA, y por qué. */
export function valorarCambio(v: Ventana, minGasto: number): Cambio {
  const U = UMBRALES_HISTORICO;
  const cpaPrev = cpa(v.prev);
  const cpaRec = cpa(v.rec);
  const poca: Cambio = { sentido: "poca", cpaPrev, cpaRec, motivo: null };
  if (v.prev.gasto < minGasto || v.rec.gasto < minGasto) return poca;
  if (v.rec.compras === 0) {
    return v.prev.compras > 0
      ? { sentido: "baja", cpaPrev, cpaRec: null, motivo: motivoDeCambio(v.prev, v.rec, true) ?? "Gastó y no vendió: sin ninguna compra en el periodo reciente." }
      : { sentido: "estable", cpaPrev, cpaRec, motivo: null };
  }
  if (cpaPrev === null) return { sentido: "mejora", cpaPrev, cpaRec, motivo: motivoDeCambio(v.prev, v.rec, false) ?? "Antes no vendía y ahora sí." };
  const relativo = (cpaRec ?? 0) / cpaPrev - 1;
  const dolares = (cpaRec ?? 0) - cpaPrev;
  if (relativo >= U.cpaCambio && dolares >= U.cpaCambioDolares) return { sentido: "baja", cpaPrev, cpaRec, motivo: motivoDeCambio(v.prev, v.rec, true) ?? "Las métricas del anuncio casi no se movieron: puede ser menos entrega de pedidos, un mal periodo o ruido normal." };
  if (relativo <= -U.cpaCambio && -dolares >= U.cpaCambioDolares) return { sentido: "mejora", cpaPrev, cpaRec, motivo: motivoDeCambio(v.prev, v.rec, false) };
  return { sentido: "estable", cpaPrev, cpaRec, motivo: null };
}

export type NivelTendencia = "Todo" | "Producto" | "Ángulo" | "Campaña";

export interface FilaTendencia {
  nivel: NivelTendencia;
  nombre: string;
  /** En un ángulo que es una táctica general, de qué son los videos que se movieron así. */
  deQue?: string;
  /** «mes» (último mes contra el anterior) o «semana» (última semana contra las tres anteriores). */
  ventana: "mes" | "semana";
  gastoRec: number;
  comprasPrev: number;
  comprasRec: number;
  cambio: Cambio;
  /** El CPA tope contra el que se mide (en un grupo, el de sus campañas según lo que gastó cada una). */
  tope: number;
  guia?: GuiaDeTope;
}

const TEXTO_VENTANA = { mes: "el último mes frente al mes anterior", semana: "la última semana frente a las tres anteriores" } as const;
const MIN_GASTO = { mes: UMBRALES_HISTORICO.gastoMes, semana: UMBRALES_HISTORICO.gastoSemana } as const;

/** Cómo va todo, cada producto, cada ángulo y las campañas activas más grandes: el último mes y la última semana contra lo anterior. */
export function tendencias(campanas: readonly CampanaHist[], productos: readonly ProductoHist[]): FilaTendencia[] {
  const filas: FilaTendencia[] = [];
  const topeDe = (suyas: readonly CampanaHist[], ventana: "mes" | "semana") => {
    const gasto = suyas.reduce((t, c) => t + c.v[ventana].rec.gasto, 0);
    return gasto > 0 ? Math.round((suyas.reduce((t, c) => t + c.v[ventana].rec.gasto * c.tope, 0) / gasto) * 100) / 100 : (suyas[0]?.tope ?? CPA_TOPE_PREDETERMINADO);
  };
  const poner = (nivel: NivelTendencia, nombre: string, v: Ventanas, suyas: readonly CampanaHist[], propio?: number, guia?: GuiaDeTope) => {
    for (const ventana of ["mes", "semana"] as const) {
      const cambio = valorarCambio(v[ventana], MIN_GASTO[ventana]);
      filas.push({ nivel, nombre, ventana, gastoRec: v[ventana].rec.gasto, comprasPrev: v[ventana].prev.compras, comprasRec: v[ventana].rec.compras, cambio, tope: propio ?? topeDe(suyas, ventana), ...(guia ? { guia } : {}) });
    }
  };
  const sumarVentanas = (lista: readonly Ventanas[]): Ventanas =>
    lista.reduce<Ventanas>(
      (t, v) => ({ mes: { rec: sumar(t.mes.rec, v.mes.rec), prev: sumar(t.mes.prev, v.mes.prev) }, semana: { rec: sumar(t.semana.rec, v.semana.rec), prev: sumar(t.semana.prev, v.semana.prev) } }),
      sinVentanas(),
    );
  poner("Todo", "Todas las campañas", sumarVentanas(campanas.map((c) => c.v)), campanas);
  for (const p of productos) poner("Producto", p.nombre, p.v, [], p.tope, p.guia);
  const porAngulo = new Map<string, CampanaHist[]>();
  for (const c of campanas) if (c.angulo) porAngulo.set(c.angulo, [...(porAngulo.get(c.angulo) ?? []), c]);
  for (const [angulo, suyas] of porAngulo) poner("Ángulo", angulo, sumarVentanas(suyas.map((c) => c.v)), suyas);
  for (const c of campanas.filter((x) => x.activa).sort((a, b) => b.v.semana.rec.gasto - a.v.semana.rec.gasto).slice(0, 15)) poner("Campaña", c.nombre, c.v, [], c.tope, c.guia);
  return filas;
}

function hallazgosDeTendencias(filas: readonly FilaTendencia[]): Hallazgo[] {
  const out: Hallazgo[] = [];
  const cifra = (n: number | null) => (n === null ? "sin ventas" : dol(n));
  const igualEnLaOtra = (f: FilaTendencia, sentido: Cambio["sentido"]) => filas.find((x) => x.nivel === f.nivel && x.nombre === f.nombre && x.ventana !== f.ventana && x.cambio.sentido === sentido);
  for (const f of filas) {
    if (f.cambio.sentido !== "baja" && f.cambio.sentido !== "mejora") continue;
    const baja = f.cambio.sentido === "baja";
    const igual = igualEnLaOtra(f, f.cambio.sentido);
    // Lo mismo en la semana y en el mes es una sola cosa: queda la semana (lo más reciente), que nombra también el mes.
    if (igual && f.ventana === "mes") continue;
    const antes = cifra(f.cambio.cpaPrev);
    const ahora = cifra(f.cambio.cpaRec);
    // El mismo nombre puede ir al revés en la otra ventana (mejor en el mes y peor en la semana): se dice para que no parezca una contradicción.
    const otra = igualEnLaOtra(f, baja ? "mejora" : "baja");
    const contraste = otra
      ? ` En ${TEXTO_VENTANA[otra.ventana]}, en cambio, ${baja ? "mejoró" : "empeoró"} (${cifra(otra.cambio.cpaPrev)} → ${cifra(otra.cambio.cpaRec)}).`
      : igual
        ? ` En ${TEXTO_VENTANA[igual.ventana]} también ${baja ? "empeoró" : "mejoró"} (${cifra(igual.cambio.cpaPrev)} → ${cifra(igual.cambio.cpaRec)}).`
        : "";
    // Que el CPA suba solo es un problema si llega a su tope: dentro de él no se toca nada.
    const zona: Zona = f.cambio.cpaRec === null ? zonaDe({ gasto: f.gastoRec, compras: 0 }, f.tope) : zonaDeCpa(f.cambio.cpaRec, f.tope);
    const dentro = zona === "dentro";
    const cuando = f.ventana === "mes" ? "en el último mes" : "en la última semana";
    const queCambio = !baja ? `el CPA mejoró ${cuando}` : dentro ? `el CPA subió ${cuando}, dentro del tope` : `el CPA empeoró ${cuando} y ${zona === "sobre" ? "pasa del tope" : "está cerca del tope"}`;
    const accionDeBaja =
      zona === "dentro"
        ? NO_TOCAR
        : zona === "cerca"
          ? "Está cerca del tope: dale 4 días para que se acomode sola; si no baja, agrega 2 o 3 videos nuevos."
          : f.nivel === "Campaña"
            ? "Revisar sus anuncios: si el creativo se cansó, rotarlo antes de seguir gastando."
            : "Mirar qué campañas de ahí bajaron y por qué motivo antes de seguir subiendo presupuesto.";
    const accionDeMejora = zona === "sobre" ? "Mejora, pero todavía pasa del tope: no subir presupuesto hasta que quede por debajo." : "Mantenerlo sin tocar y, si sigue así, subir el presupuesto de a 20 % como mucho para no reiniciar el aprendizaje.";
    out.push({
      id: `tendencia:${f.nivel}:${f.nombre}:${f.ventana}`,
      categoria: "tendencia",
      ...(f.guia ? { guia: f.guia } : {}),
      tono: !baja ? "bueno" : dentro ? "info" : "alerta",
      zona,
      impacto: baja ? Math.max(0, f.gastoRec - f.comprasRec * f.tope) : undefined,
      titulo: `${f.nivel === "Todo" ? "Todas las campañas" : `${f.nivel} «${f.nombre}»`}: ${queCambio} (${antes} → ${ahora}, tope ${dol(f.tope)})`,
      detalle: `En ${TEXTO_VENTANA[f.ventana]}, ${f.nivel === "Todo" ? "el conjunto" : `${f.nivel.toLowerCase()} «${f.nombre}»`} pasó de ${entero(f.comprasPrev)} a ${entero(f.comprasRec)} compras y su CPA de ${antes} a ${ahora}. En el periodo reciente gastó ${dol(f.gastoRec)}.${contraste}`,
      motivo: f.cambio.motivo ?? undefined,
      accion: baja ? accionDeBaja : accionDeMejora,
      certeza: f.gastoRec >= UMBRALES_HISTORICO.gastoMes * 3 ? "firme" : "probable",
      gasto: f.gastoRec,
    });
  }
  return out;
}

// ───────────────────────── Entrega: hallazgos ─────────────────────────

function hallazgosDeEntrega(filas: readonly FilaEntrega[], promedio: number | null): Hallazgo[] {
  const out: Hallazgo[] = [];
  for (const f of filas) {
    if (f.veredicto === "vende_pero_no_entrega" && f.tasa !== null) {
      const zona = f.cpa === null ? "sobre" : zonaDeCpa(f.cpa, f.tope);
      const dentro = zona === "dentro";
      const ajuste = f.topeBase !== undefined && f.tope < f.topeBase ? `su tope ajustado por envío y entrega es ${dol(f.tope)} (el general es ${dol(f.topeBase)})` : `su tope es ${dol(f.tope)}`;
      out.push({
        id: `entrega:${f.clave}:mala`,
        categoria: "entrega",
        ...(f.guia ? { guia: f.guia } : {}),
        tono: dentro ? "info" : "alerta",
        zona,
        impacto: Math.max(0, f.gasto - f.compras * f.tope),
        titulo: dentro ? `${f.nombre}: entrega baja (${pct(f.tasa)}), pero su CPA sigue dentro de su tope` : `${f.nombre}: vende en Meta pero solo se entrega ${pct(f.tasa)} y ${zona === "sobre" ? "pasa de su tope" : "está cerca de su tope"}`,
        detalle: `En Meta tiene un CPA de ${f.cpa === null ? "—" : dol(f.cpa)} y ${ajuste}. De ${entero(f.cerradas)} pedidos resueltos se entregaron ${entero(f.entregadas)} y volvieron ${entero(f.devueltas)}${promedio !== null ? ` (el promedio de todos los productos es ${pct(promedio)})` : ""}. Contando lo cancelado y lo devuelto, cada venta que llega cuesta en anuncios ${f.cpaEntregado === null ? "—" : dol(f.cpaEntregado)}.`,
        motivo: "Una parte de lo que Meta cuenta como compra no llega al cliente: el costo real por venta es más alto que el CPA.",
        accion: dentro ? "No cambies la campaña mientras vaya dentro de su tope: la segmentación nueva reinicia el aprendizaje. Las zonas con muchas devoluciones se prueban en una campaña nueva." : "Antes de escalarlo, mirar en qué zonas se entrega peor y bajar o excluir esas zonas de la segmentación, y revisar que la promesa del anuncio y de la landing coincida con lo que recibe el cliente.",
        certeza: f.cerradas >= 40 ? "firme" : "probable",
        gasto: f.gasto,
      });
    } else if (f.veredicto === "vende_y_entrega" && f.tasa !== null && promedio !== null && f.tasa >= promedio + 0.08 && f.gasto >= UMBRALES_HISTORICO.mejorGasto) {
      out.push({
        id: `entrega:${f.clave}:buena`,
        categoria: "entrega",
        tono: "bueno",
        titulo: `${f.nombre}: entrega mejor que el resto (${pct(f.tasa)})`,
        detalle: `Se entrega ${pct(f.tasa)} de lo despachado (el promedio es ${pct(promedio)}) y su CPA es ${f.cpa === null ? "—" : dol(f.cpa)} con un tope de ${dol(f.tope)}: cada venta que llega cuesta en anuncios ${f.cpaEntregado === null ? "—" : dol(f.cpaEntregado)}.`,
        accion: "Es de los productos más seguros para escalar: lo que se vende se entrega. Subir el presupuesto de a 20 % como mucho, para no reiniciar el aprendizaje.",
        certeza: f.cerradas >= 40 ? "firme" : "probable",
        gasto: f.gasto,
      });
    }
  }
  return out;
}

// ───────────────────────── Qué genera más ventas ─────────────────────────

export interface FilaVentas {
  nombre: string;
  compras: number;
  /** De todas las compras del historial, la parte que generó (0 a 1). */
  parte: number;
  gasto: number;
  cpa: number | null;
  /** Compras × tasa de entrega de su producto (o la de todos los productos si el suyo no tiene tasa). */
  comprasEntregadas: number | null;
  /** true = con la tasa del propio producto; false = con el promedio. */
  entregaReal: boolean;
  campanas?: number;
  /** En un ángulo que es una táctica general, de qué son sus videos. */
  deQue?: string;
}

export interface Rankings {
  campanas: FilaVentas[];
  videos: FilaVentas[];
  productos: FilaVentas[];
  angulos: FilaVentas[];
  ganchos: FilaVentas[];
  formatos: FilaVentas[];
}

const TOP = 10;

function rankear(items: readonly { nombre: string; r: Resultados; clave: string; campana?: string }[], tasaDe: (clave: string) => number | null, promedio: number | null, totalCompras: number): FilaVentas[] {
  const mapa = new Map<string, { r: Resultados; ent: number; propias: number; total: number; campanas: Set<string> }>();
  for (const i of items) {
    const g = mapa.get(i.nombre) ?? { r: sinResultados(), ent: 0, propias: 0, total: 0, campanas: new Set<string>() };
    g.r = sumar(g.r, i.r);
    const t = tasaDe(i.clave);
    const usada = t ?? promedio;
    if (usada !== null) g.ent += i.r.compras * usada;
    if (t !== null) g.propias += i.r.compras;
    g.total += i.r.compras;
    if (i.campana) g.campanas.add(i.campana);
    mapa.set(i.nombre, g);
  }
  return [...mapa]
    .filter(([, g]) => g.r.compras > 0)
    .map(([nombre, g]): FilaVentas => ({
      nombre,
      compras: g.r.compras,
      parte: totalCompras ? g.r.compras / totalCompras : 0,
      gasto: g.r.gasto,
      cpa: cpa(g.r),
      comprasEntregadas: promedio === null && g.propias === 0 ? null : g.ent,
      entregaReal: g.total > 0 && g.propias === g.total,
      ...(g.campanas.size ? { campanas: g.campanas.size } : {}),
    }))
    .sort((a, b) => b.compras - a.compras || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, TOP);
}

export function rankingsDeVentas(campanas: readonly CampanaHist[], videos: readonly VideoHist[], productos: readonly ProductoHist[]): Rankings {
  // De cada compra de Meta, la parte que llega: lo que se envía (si se sabe) y de eso lo que se entrega.
  const llega = (p: ProductoHist) => {
    const t = tasaDeEntrega(p.entrega);
    return t === null ? null : t * (tasasDe(p.entrega).envio ?? 1);
  };
  const tienda = sumarPedidos(productos.map((p) => p.entrega));
  const entregaTienda = tasaPromedio(productos);
  const promedio = entregaTienda === null ? null : entregaTienda * (tasasDe(tienda).envio ?? 1);
  const tasaPorClave = new Map(productos.map((p) => [p.clave, llega(p)]));
  const tasaDe = (clave: string) => tasaPorClave.get(clave) ?? null;
  const totalCompras = campanas.reduce((s, c) => s + c.total.compras, 0);
  const totalVideos = videos.reduce((s, v) => s + v.total.compras, 0);
  const deVideo = (cara: (v: VideoHist) => string | null) => videos.flatMap((v) => (cara(v) ? [{ nombre: cara(v)!, r: v.total, clave: v.clave }] : []));
  return {
    campanas: rankear(campanas.map((c) => ({ nombre: c.nombre, r: c.total, clave: c.clave, campana: c.id })), tasaDe, promedio, totalCompras),
    videos: rankear(videos.map((v) => ({ nombre: v.nombre, r: v.total, clave: v.clave })), tasaDe, promedio, totalVideos),
    productos: rankear(productos.map((p) => ({ nombre: p.nombre, r: p.total, clave: p.clave })), tasaDe, promedio, totalCompras),
    angulos: rankear(deVideo((v) => v.angulo), tasaDe, promedio, totalVideos).map((f) => {
      const deQue = temasDe(f.nombre, videos.map((v) => ({ angulo: v.angulo, detalle: v.detalle, gasto: v.total.gasto, compras: v.total.compras })));
      return deQue ? { ...f, deQue } : f;
    }),
    ganchos: rankear(deVideo((v) => v.ganchoTipo), tasaDe, promedio, totalVideos),
    formatos: rankear(deVideo((v) => v.formato), tasaDe, promedio, totalVideos),
  };
}

// ───────────────────────── Mes a mes ─────────────────────────

/** Un mes con sus cifras ya calculadas (la IA y las tablas leen cifras, no sumas). */
export interface FilaMes {
  mes: string;
  gasto: number;
  compras: number;
  cpa: number | null;
  ctr: number | null;
  hook: number | null;
  cpm: number | null;
  efectividad: number | null;
  cvr: number | null;
}

const r2 = (n: number | null): number | null => (n === null ? null : Math.round(n * 100) / 100);

/** Los meses con sus cifras calculadas, del más viejo al más nuevo. */
export function filasMensuales(meses: readonly MesHist[]): FilaMes[] {
  return [...meses]
    .sort((a, b) => a.mes.localeCompare(b.mes))
    .map(({ mes, r }) => ({ mes, gasto: Math.round(r.gasto * 100) / 100, compras: r.compras, cpa: r2(cpa(r)), ctr: r2(ctr(r)), hook: r2(hookRate(r)), cpm: r2(cpm(r)), efectividad: r2(efectividad(r)), cvr: r2(cvr(r)) }));
}

/** Cuántos productos llevan serie mensual propia (los de más gasto): más haría el contexto de la IA enorme sin aportar. */
export const PRODUCTOS_CON_SERIE = 12;

// ───────────────────────── Todo junto ─────────────────────────

export interface ResumenHistorico {
  campanas: number;
  videos: number;
  gasto: number;
  compras: number;
  desde: string | null;
  hasta: string | null;
  tasaEntrega: number | null;
  /** De las campañas con gasto suficiente, cuántas funcionaron (la vara de todo el análisis). */
  tasaFuncionaron: number;
  campanasMedibles: number;
}

export interface AnalisisHistorico {
  resumen: ResumenHistorico;
  hallazgos: Hallazgo[];
  bandas: BandasMetrica[];
  tendencias: FilaTendencia[];
  entrega: FilaEntrega[];
  /** Todos los pedidos de las tiendas juntos, para la calculadora de costos. Un análisis guardado antes no lo trae. */
  pedidosDeLaTienda?: Omit<EntregaProducto, "nombre"> | null;
  rankings: Rankings;
  /** Lo que tenía campañas activas con gasto en la última semana al calcular el análisis (los análisis guardados antes no lo traen). */
  enMarcha?: EnMarcha;
  /** Mes a mes de todas las campañas, y de los productos con más gasto. */
  meses: FilaMes[];
  mesesPorProducto: { nombre: string; filas: FilaMes[] }[];
}

const ORDEN_CATEGORIA: CategoriaHallazgo[] = ["entrega", "tendencia", "no_funciona", "funciona"];
const PESO_TONO: Record<TonoHallazgo, number> = { alerta: 0, info: 1, bueno: 2 };
const PESO_CERTEZA: Record<Certeza, number> = { firme: 0, probable: 1, poca: 2 };
/** Cuánto pesa un hallazgo: los dólares gastados por encima del tope; donde no se mide eso, una cuarta parte de lo gastado. */
export const pesoDeHallazgo = (h: Pick<Hallazgo, "gasto" | "impacto">): number => h.impacto ?? h.gasto * 0.25;

/** Ordena los hallazgos: primero los que piden atención (entrega, tendencias a la baja, lo que no funciona), después lo bueno; dentro de cada grupo, los de más gasto. */
export function ordenarHallazgos(lista: readonly Hallazgo[]): Hallazgo[] {
  return [...lista].sort(
    (a, b) => PESO_TONO[a.tono] - PESO_TONO[b.tono] || PESO_CERTEZA[a.certeza] - PESO_CERTEZA[b.certeza] || pesoDeHallazgo(b) - pesoDeHallazgo(a) || ORDEN_CATEGORIA.indexOf(a.categoria) - ORDEN_CATEGORIA.indexOf(b.categoria) || b.gasto - a.gasto || a.id.localeCompare(b.id),
  );
}

// ───────────────────────── Del «revisa» a la respuesta: lo que se puede decir con las campañas y los videos ─────────────────────────

const ACCION_POR_METRICA: Record<string, string> = {
  cpm: "Meta cobra más por mostrar el anuncio: la audiencia se saturó. Ampliar el público o sumar anuncios con otro ángulo.",
  ctr: "El anuncio atrae menos clics: subir 2 o 3 anuncios nuevos con otro gancho y bajar el gasto de los que ya se cansaron.",
  hook: "El inicio del video perdió fuerza: subir 2 o 3 variantes del mismo video con otros primeros 3 segundos.",
  efectividad: "Se pierden clics antes de ver la página: probar el enlace desde el celular y aligerar la landing para que cargue más rápido.",
  cvr: "El clic llega pero no compra: cambiar la oferta o el precio que muestra la landing, o probar otra página.",
};
const ACCION_SIN_METRICA = "Las métricas del anuncio casi no se movieron: no tocar el creativo todavía; si el CPA sigue arriba la próxima semana, bajar el presupuesto.";
const dolR = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const nombreCorto = (t: string) => (t.length > 46 ? `${t.slice(0, 45).trimEnd()}…` : t);

/**
 * Convierte el «Qué hacer» genérico de las tendencias que empeoraron (de una campaña, un ángulo o todo) y de lo que nunca funcionó (ángulo, gancho, formato, llamado) en uno con la respuesta: qué métrica falló y qué hacer con ella, qué campañas
 * empeoraron y a cuáles mover el presupuesto, y qué videos usan hoy eso que no funciona. Solo con lo que ya está en el análisis; lo que no se puede resolver queda como estaba.
 */
export function detallarConCampanas(hallazgos: readonly Hallazgo[], campanas: readonly CampanaHist[], videos: readonly VideoHist[]): Hallazgo[] {
  return hallazgos.map((h): Hallazgo => {
    const t = /^tendencia:(Todo|Ángulo|Campaña):(.+):(mes|semana)$/.exec(h.id);
    if (t && h.tono === "alerta") {
      const [, nivel, nombre, ventana] = t as unknown as [string, string, string, "mes" | "semana"];
      if (nivel === "Campaña") {
        const c = campanas.find((x) => x.nombre === nombre);
        if (!c) return h;
        const mov = masMovida(c.v[ventana].prev, c.v[ventana].rec, true);
        const hacer = mov ? ACCION_POR_METRICA[mov.m.id] : ACCION_SIN_METRICA;
        return { ...h, accion: h.zona === "cerca" ? `Está cerca del tope: dale 4 días; si no baja: ${hacer.charAt(0).toLowerCase()}${hacer.slice(1)}` : hacer };
      }
      const filas = campanas
        .filter((c) => c.activa && (nivel === "Todo" || c.angulo === nombre) && c.v[ventana].rec.gasto >= 30)
        .map((c) => ({ c, prev: cpa(c.v[ventana].prev), rec: cpa(c.v[ventana].rec), gasto: c.v[ventana].rec.gasto, comprasRec: c.v[ventana].rec.compras }));
      const empeoraron = filas.filter((x) => (x.rec === null ? x.comprasRec === 0 && x.prev !== null : x.prev !== null && x.rec > x.prev * 1.15));
      // Solo se tocan las que pasan de su tope o están cerca: las demás siguen aprendiendo.
      const peores = empeoraron.filter((x) => zonaDe({ gasto: x.gasto, compras: x.comprasRec }, x.c.tope) !== "dentro").sort((a, b) => b.gasto - a.gasto).slice(0, 3);
      const mejores = filas.filter((x) => x.prev !== null && x.rec !== null && x.rec < x.prev * 0.85).sort((a, b) => b.gasto - a.gasto).slice(0, 2);
      if (!peores.length) return empeoraron.length ? { ...h, accion: `Ninguna campaña de las que empeoraron pasa de su tope ni está cerca: no tocarlas (cambiar videos o presupuesto reinicia el aprendizaje). Mirarlas la próxima semana.` } : h;
      const de = (x: (typeof filas)[number]) => `${nombreCorto(x.c.nombre)} (CPA ${dol(x.prev!)} → ${x.rec === null ? "sin ventas" : dol(x.rec)}, ${dolR(x.gasto)} gastados)`;
      return { ...h, accion: `Bajar el presupuesto o rotar el creativo de lo que más empeoró: ${peores.map(de).join("; ")}${mejores.length ? `; y mover ese dinero a lo que mejoró: ${mejores.map(de).join("; ")}` : ""}.` };
    }
    const k = /^(angulo|gancho|formato|cta|estructura|puja)(?:@(\w+))?:(.+):no$/.exec(h.id);
    if (k) {
      const [, dim, familia, clave] = k;
      if (dim === "estructura" || dim === "puja") {
        const usan = campanas.filter((c) => c[dim] === clave && c.activa && c.total.gasto > 0).sort((x, y) => y.total.gasto - x.total.gasto);
        if (!usan.length) return h;
        return { ...h, detalle: `${h.detalle} Hoy siguen activas ${usan.length} ${usan.length === 1 ? "campaña" : "campañas"} así (${dolR(usan.reduce((t2, c) => t2 + c.total.gasto, 0))} gastados); las de más gasto: ${usan.slice(0, 3).map((c) => `${nombreCorto(c.nombre)} (${dolR(c.total.gasto)})`).join("; ")}.` };
      }
      const campo = dim === "angulo" ? "angulo" : dim === "gancho" ? "ganchoTipo" : dim === "formato" ? "formato" : "ctaTipo";
      const usan = videos.filter((v) => v[campo] === clave && (!familia || v.familia === familia) && v.total.gasto > 0).sort((x, y) => y.total.gasto - x.total.gasto);
      if (!usan.length) return h;
      const gasto = usan.reduce((t2, v) => t2 + v.total.gasto, 0);
      return { ...h, detalle: `${h.detalle} Hoy lo usan ${usan.length} ${usan.length === 1 ? "video" : "videos"} (${dolR(gasto)} gastados); los de más gasto: ${usan.slice(0, 3).map((v) => `${nombreCorto(v.nombre)} (${dolR(v.total.gasto)})`).join("; ")}.` };
    }
    return h;
  });
}

// ───────────────────────── Cuáles son ─────────────────────────

/** Un video o una campaña detrás de un hallazgo. En una tendencia trae el CPA de antes y de ahora; en lo demás, solo el de todo el historial. */
export interface QuienHallazgo {
  id: string;
  nombre: string;
  /** De qué es (videos de una táctica general). */
  detalle?: string;
  antes?: number | null;
  ahora: number | null;
  gasto: number;
  compras: number;
}

export interface Quienes {
  /** En una táctica general, la frase que se ve sin abrir: de qué son. */
  deQue?: string;
  enComun: RasgoComun[];
  videos: QuienHallazgo[];
  campanas: QuienHallazgo[];
  /** Cuántos hay en total (se guardan los primeros). */
  totalVideos: number;
  totalCampanas: number;
}

/** Cuántos videos y campañas se guardan por hallazgo. */
export const MAX_QUIENES = 8;
/** Lo mínimo gastado en el periodo reciente para decir que un video o una campaña se movió. */
const GASTO_PARA_MOVERSE = 10;

/** Si algo empeoró (`sentido` baja) o mejoró en una ventana: 15 % o más de diferencia en el CPA, dejar de vender o empezar a vender. */
function seMovio(v: Ventana, sentido: "baja" | "mejora"): boolean {
  if (v.rec.gasto < GASTO_PARA_MOVERSE) return false;
  const antes = cpa(v.prev);
  const ahora = cpa(v.rec);
  if (sentido === "baja") return antes !== null && (ahora === null || ahora > antes * 1.15);
  return ahora !== null && (antes === null ? v.prev.gasto > 0 : ahora < antes * 0.85);
}

const rasgosDe = (v: VideoHist) => ({ detalle: v.detalle, gancho: v.ganchoTipo, formato: v.formato, cta: v.ctaTipo });
const comoConAngulo = (v: VideoHist, r: Resultados) => ({ angulo: v.angulo, detalle: v.detalle, gasto: r.gasto, compras: r.compras });
const redondo = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

function armarQuienes(videos: { v: VideoHist; r: Resultados; antes?: Resultados }[], campanas: { c: CampanaHist; r: Resultados; antes?: Resultados }[], angulo: string | null, frase: string): Quienes | undefined {
  if (!videos.length && !campanas.length) return undefined;
  const tactico = !!angulo && esAnguloTactico(angulo);
  const temas = tactico ? textoDeDetalles(detallesDe(videos.map((x) => comoConAngulo(x.v, x.r)))) : "";
  const uno = (id: string, nombre: string, r: Resultados, antes: Resultados | undefined, detalle?: string | null): QuienHallazgo => ({
    id,
    nombre: nombre.slice(0, 80),
    ...(detalle ? { detalle } : {}),
    ...(antes ? { antes: redondo(cpa(antes)) } : {}),
    ahora: redondo(cpa(r)),
    gasto: Math.round(r.gasto * 100) / 100,
    compras: r.compras,
  });
  return {
    ...(temas ? { deQue: `${frase}: ${temas}.` } : {}),
    enComun: enComun(videos.map((x) => rasgosDe(x.v)), { conTema: tactico }),
    videos: videos.slice(0, MAX_QUIENES).map((x) => uno(x.v.id, x.v.nombre, x.r, x.antes, x.v.angulo && esAnguloTactico(x.v.angulo) ? x.v.detalle : null)),
    campanas: campanas.slice(0, MAX_QUIENES).map((x) => uno(x.c.id, x.c.nombre, x.r, x.antes)),
    totalVideos: videos.length,
    totalCampanas: campanas.length,
  };
}

/**
 * A cada hallazgo de tendencia, de ángulo, gancho, formato, llamado, estructura o puja le pone **cuáles son** (25 nov 2026, pedido de Alcides: «no se entiende nada y al darle clic no se despliega cuáles»): en una tendencia, los videos y
 * campañas del grupo que se movieron en ese sentido (si ninguno llega al umbral, los que más gastaron en ese periodo); en una característica, los que la usan. Con los videos, lo que tienen en común.
 */
export function ponerQuienes(hallazgos: readonly Hallazgo[], campanas: readonly CampanaHist[], videos: readonly VideoHist[]): Hallazgo[] {
  return hallazgos.map((h): Hallazgo => {
    const t = /^tendencia:(Todo|Producto|Ángulo|Campaña):(.+):(mes|semana)$/.exec(h.id);
    if (t) {
      const [, nivel, nombre, ventana] = t as unknown as [string, string, string, "mes" | "semana"];
      const sentido = h.tono === "alerta" ? "baja" : "mejora";
      const suCampana = nivel === "Campaña" ? campanas.find((c) => c.nombre === nombre) : undefined;
      const deCampanas = campanas.filter((c) => (nivel === "Todo" ? true : nivel === "Producto" ? c.producto === nombre : nivel === "Ángulo" ? c.angulo === nombre : c === suCampana));
      const deVideos = videos.filter((v) => (nivel === "Todo" ? true : nivel === "Producto" ? v.clave === claveDeProducto(nombre) : nivel === "Ángulo" ? v.angulo === nombre : !!suCampana && !!v.campanas?.includes(suCampana.id)));
      const elegir = <X extends { v?: Ventanas }>(lista: readonly X[]): X[] => {
        const conGasto = lista.filter((x) => (x.v?.[ventana].rec.gasto ?? 0) > 0);
        const movidos = conGasto.filter((x) => seMovio(x.v![ventana], sentido));
        return (movidos.length ? movidos : conGasto).sort((a, b) => b.v![ventana].rec.gasto - a.v![ventana].rec.gasto);
      };
      // `v` en una campaña son sus ventanas; en un video también.
      const vids = elegir(deVideos).map((v) => ({ v, r: v.v![ventana].rec, antes: v.v![ventana].prev }));
      const camps = nivel === "Campaña" ? [] : elegir(deCampanas).map((c) => ({ c, r: c.v[ventana].rec, antes: c.v[ventana].prev }));
      const seMovieron = vids.some((x) => seMovio({ rec: x.r, prev: x.antes }, sentido));
      const frase = seMovieron ? `De qué son los que ${sentido === "baja" ? "empeoraron" : "mejoraron"}` : "De qué son los que más gastaron";
      const quienes = armarQuienes(vids, camps, nivel === "Ángulo" ? nombre : null, frase);
      return quienes ? { ...h, quienes } : h;
    }
    const k = /^(angulo|gancho|formato|cta|estructura|puja)(?:@(\w+))?:(.+):(si|no)$/.exec(h.id);
    if (k) {
      const [, dim, familia, clave, que] = k;
      if (dim === "estructura" || dim === "puja") {
        const camps = campanas.filter((c) => c[dim] === clave && (!familia || c.familia === familia) && c.total.gasto > 0).sort((a, b) => (que === "si" ? Number(funciono(b.total, b.tope)) - Number(funciono(a.total, a.tope)) : 0) || b.total.gasto - a.total.gasto);
        const quienes = armarQuienes([], camps.map((c) => ({ c, r: c.total })), null, "");
        return quienes ? { ...h, quienes } : h;
      }
      const campo = dim === "angulo" ? "angulo" : dim === "gancho" ? "ganchoTipo" : dim === "formato" ? "formato" : "ctaTipo";
      const usan = videos.filter((v) => v[campo] === clave && (!familia || v.familia === familia) && v.total.gasto > 0);
      // En lo que funciona se enseñan (y se resumen) los que sí funcionaron; en lo que no, todos los que lo usan.
      const buenos = que === "si" ? usan.filter((v) => funciono(v.total, v.tope)) : [];
      const lista = (buenos.length ? buenos : usan).sort((a, b) => b.total.gasto - a.total.gasto);
      const quienes = armarQuienes(lista.map((v) => ({ v, r: v.total })), [], dim === "angulo" ? clave : null, buenos.length ? "De qué son los que funcionaron" : "De qué son");
      return quienes ? { ...h, quienes } : h;
    }
    return h;
  });
}

export function analizarHistorico(e: EntradaHistorico): AnalisisHistorico {
  const bandas = bandasDeMetricas(e.campanas);
  const filasTendencia = tendencias(e.campanas, e.productos);
  const entrega = filasDeEntrega(e.productos);
  const promedio = tasaPromedio(e.productos);
  const medibles = e.campanas.filter((c) => confiable(c.total));
  const total = e.campanas.reduce((r, c) => sumar(r, c.total), sinResultados());
  const hallazgos = ordenarHallazgos(ponerQuienes(detallarConCampanas([
    ...hallazgosDeEntrega(entrega, promedio),
    ...hallazgosDeTendencias(filasTendencia),
    ...hallazgosDeBandas(bandas),
    ...hallazgosDeCaracteristicas(e.campanas, e.videos),
  ], e.campanas, e.videos), e.campanas, e.videos));
  return {
    resumen: {
      campanas: e.campanas.length,
      videos: e.videos.length,
      gasto: total.gasto,
      compras: total.compras,
      desde: e.desde,
      hasta: e.hasta,
      tasaEntrega: promedio,
      tasaFuncionaron: medibles.length ? medibles.filter((c) => funciono(c.total, c.tope)).length / medibles.length : 0,
      campanasMedibles: medibles.length,
    },
    hallazgos,
    bandas,
    // En cada ángulo que es una táctica general, de qué son los videos que se movieron así.
    tendencias: filasTendencia.map((f) => {
      const deQue = f.nivel === "Ángulo" ? hallazgos.find((h) => h.id === `tendencia:${f.nivel}:${f.nombre}:${f.ventana}`)?.quienes?.deQue : undefined;
      return deQue ? { ...f, deQue } : f;
    }),
    entrega,
    pedidosDeLaTienda: e.pedidosDeLaTienda ?? null,
    rankings: rankingsDeVentas(e.campanas, e.videos, e.productos),
    enMarcha: calcularEnMarcha(e.campanas.map((c) => ({ nombre: c.nombre, producto: c.producto, activa: c.activa, gasto7: c.v.semana.rec.gasto })), e.hasta ?? ""),
    meses: filasMensuales(e.mensual ?? []),
    mesesPorProducto: (e.mensualPorProducto ?? [])
      .map((p) => ({ nombre: p.nombre, filas: filasMensuales(p.meses), gasto: p.meses.reduce((s, m) => s + m.r.gasto, 0) }))
      .sort((a, b) => b.gasto - a.gasto)
      .slice(0, PRODUCTOS_CON_SERIE)
      .map(({ nombre, filas }) => ({ nombre, filas })),
  };
}

/** Un mínimo de datos para que valga la pena mostrar hallazgos (si no, se explica que todavía hay poco historial). */
export const tieneHistorialSuficiente = (a: AnalisisHistorico): boolean => a.resumen.campanasMedibles >= UMBRALES_HISTORICO.minUnidades;

export { GASTO_MINIMO_CONFIABLE };
