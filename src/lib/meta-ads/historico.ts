// Anuncios Meta › Hallazgos (24 nov 2026, pedido de Alcides: «que uses toda la información y el conjunto de datos y estadísticos que tienes para dar recomendaciones en cuanto al historial»). Lee **todo el historial**
// de campañas, anuncios y videos y dice, frío y con números, lo que los datos muestran aunque no esté en ningún documento:
//   · qué nunca funcionó (campañas con cierto CTR, hook o CPM de las que ninguna llegó a su CPA tope) y qué tiende a funcionar mejor (ángulos, ganchos, formatos… en general y por tipo de producto);
//   · si algo empieza a desmejorar (o a mejorar) frente a las semanas o al mes anterior, y **por qué motivo** (CPM, CTR, hook, clic a visita, conversión de la página);
//   · la **tasa de entrega** de cada producto: un producto puede vender muy bien en Meta y entregar mal, y entonces cada compra entregada cuesta más de lo que parece;
//   · qué genera más ventas en cada parte (campañas, videos, ángulos, ganchos, productos), con lo que de verdad se entrega.
// Sin la calculadora de costos: «funcionó» = tuvo gasto suficiente para compararse y su CPA quedó dentro del CPA tope del producto. Lógica pura, con prueba; las lecturas están en `historico-datos.ts`.

import { certezaDe, confiable, cpa, cpm, ctr, cvr, efectividad, GASTO_MINIMO_CONFIABLE, hookRate, sinResultados, sumar, type Certeza, type Resultados } from "./metricas";

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
  ganchoTipo: string | null;
  formato: string | null;
  ctaTipo: string | null;
  tope: number;
  total: Resultados;
}

/** Lo que dicen los pedidos de un producto en la tienda (lo que Meta no sabe): cuántos se entregaron y cuántos volvieron. */
export interface EntregaProducto {
  nombre: string;
  entregadas: number;
  devueltas: number;
  canceladas: number;
  enCamino: number;
}

export interface ProductoHist {
  clave: string;
  nombre: string;
  familia: Familia;
  tope: number;
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
  tasa: number | null;
  cerradas: number;
  entregadas: number;
  devueltas: number;
  canceladas: number;
  enCamino: number;
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
      const comprasEntregadas = tasa === null ? null : p.total.compras * tasa;
      const cpaEntregado = comprasEntregadas && comprasEntregadas > 0 ? p.total.gasto / comprasEntregadas : null;
      let veredicto: VeredictoEntrega;
      if (tasa === null) veredicto = "sin_entrega";
      else if (p.total.gasto < U.entregaGastoMinimo || p.total.compras < U.entregaComprasMinimas) veredicto = "poca_data";
      else if (c !== null && c <= p.tope && (tasa <= U.entregaMala || (promedio !== null && tasa <= promedio - U.entregaBrecha) || (cpaEntregado !== null && cpaEntregado > p.tope * 1.3))) veredicto = "vende_pero_no_entrega";
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
        tasa,
        cerradas: e ? e.entregadas + e.devueltas : 0,
        entregadas: e?.entregadas ?? 0,
        devueltas: e?.devueltas ?? 0,
        canceladas: e?.canceladas ?? 0,
        enCamino: e?.enCamino ?? 0,
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
        accion: `Antes de volver a usar «${g.clave}»${donde}, revisar qué lo distingue de lo que sí funcionó.`,
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
  let mejor: { fuerza: number; texto: string } | null = null;
  for (const m of METRICAS_MOTIVO) {
    const a = m.valor(prev);
    const b = m.valor(rec);
    if (a === null || b === null || a <= 0) continue;
    const relativo = b / a - 1;
    // «En contra» es bajar si más es mejor, o subir si menos es mejor.
    const enContra = m.masEsMejor ? -relativo : relativo;
    const fuerza = empeora ? enContra : -enContra;
    if (fuerza < UMBRALES_HISTORICO.metricaCambio) continue;
    if (!mejor || fuerza > mejor.fuerza) mejor = { fuerza, texto: (empeora ? m.malo : m.bueno)(Math.round(Math.abs(relativo) * 100)) };
  }
  return mejor?.texto ?? null;
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
  /** «mes» (último mes contra el anterior) o «semana» (última semana contra las tres anteriores). */
  ventana: "mes" | "semana";
  gastoRec: number;
  comprasPrev: number;
  comprasRec: number;
  cambio: Cambio;
}

const TEXTO_VENTANA = { mes: "el último mes frente al mes anterior", semana: "la última semana frente a las tres anteriores" } as const;
const MIN_GASTO = { mes: UMBRALES_HISTORICO.gastoMes, semana: UMBRALES_HISTORICO.gastoSemana } as const;

/** Cómo va todo, cada producto, cada ángulo y las campañas activas más grandes: el último mes y la última semana contra lo anterior. */
export function tendencias(campanas: readonly CampanaHist[], productos: readonly ProductoHist[]): FilaTendencia[] {
  const filas: FilaTendencia[] = [];
  const poner = (nivel: NivelTendencia, nombre: string, v: Ventanas) => {
    for (const ventana of ["mes", "semana"] as const) {
      const cambio = valorarCambio(v[ventana], MIN_GASTO[ventana]);
      filas.push({ nivel, nombre, ventana, gastoRec: v[ventana].rec.gasto, comprasPrev: v[ventana].prev.compras, comprasRec: v[ventana].rec.compras, cambio });
    }
  };
  const sumarVentanas = (lista: readonly Ventanas[]): Ventanas =>
    lista.reduce<Ventanas>(
      (t, v) => ({ mes: { rec: sumar(t.mes.rec, v.mes.rec), prev: sumar(t.mes.prev, v.mes.prev) }, semana: { rec: sumar(t.semana.rec, v.semana.rec), prev: sumar(t.semana.prev, v.semana.prev) } }),
      sinVentanas(),
    );
  poner("Todo", "Todas las campañas", sumarVentanas(campanas.map((c) => c.v)));
  for (const p of productos) poner("Producto", p.nombre, p.v);
  const porAngulo = new Map<string, Ventanas[]>();
  for (const c of campanas) if (c.angulo) porAngulo.set(c.angulo, [...(porAngulo.get(c.angulo) ?? []), c.v]);
  for (const [angulo, v] of porAngulo) poner("Ángulo", angulo, sumarVentanas(v));
  for (const c of campanas.filter((x) => x.activa).sort((a, b) => b.v.semana.rec.gasto - a.v.semana.rec.gasto).slice(0, 15)) poner("Campaña", c.nombre, c.v);
  return filas;
}

function hallazgosDeTendencias(filas: readonly FilaTendencia[]): Hallazgo[] {
  const out: Hallazgo[] = [];
  for (const f of filas) {
    if (f.cambio.sentido !== "baja" && f.cambio.sentido !== "mejora") continue;
    const baja = f.cambio.sentido === "baja";
    const { cpaPrev, cpaRec } = f.cambio;
    const antes = cpaPrev === null ? "sin ventas" : dol(cpaPrev);
    const ahora = cpaRec === null ? "sin ventas" : dol(cpaRec);
    out.push({
      id: `tendencia:${f.nivel}:${f.nombre}:${f.ventana}`,
      categoria: "tendencia",
      tono: baja ? "alerta" : "bueno",
      titulo: `${f.nivel === "Todo" ? "Todas las campañas" : `${f.nivel} «${f.nombre}»`}: el CPA ${baja ? "empeoró" : "mejoró"} (${antes} → ${ahora})`,
      detalle: `En ${TEXTO_VENTANA[f.ventana]}, ${f.nivel === "Todo" ? "el conjunto" : `${f.nivel.toLowerCase()} «${f.nombre}»`} pasó de ${entero(f.comprasPrev)} a ${entero(f.comprasRec)} compras y su CPA de ${antes} a ${ahora}. En el periodo reciente gastó ${dol(f.gastoRec)}.`,
      motivo: f.cambio.motivo ?? undefined,
      accion: baja ? (f.nivel === "Campaña" ? "Revisar sus anuncios: si el creativo se cansó, rotarlo antes de seguir gastando." : "Mirar qué campañas de ahí bajaron y por qué motivo antes de seguir subiendo presupuesto.") : "Mantenerlo y, si el CPA sigue dentro del tope, escalar con cuidado.",
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
      out.push({
        id: `entrega:${f.clave}:mala`,
        categoria: "entrega",
        tono: "alerta",
        titulo: `${f.nombre}: vende bien pero solo se entrega ${pct(f.tasa)}`,
        detalle: `En Meta tiene un CPA de ${f.cpa === null ? "—" : dol(f.cpa)} (dentro de su tope de ${dol(f.tope)}), pero de ${entero(f.cerradas)} pedidos resueltos solo ${entero(f.entregadas)} se entregaron y ${entero(f.devueltas)} volvieron${promedio !== null ? ` (el promedio de todos los productos es ${pct(promedio)})` : ""}. Contando solo lo que llega al cliente, cada compra cuesta ${f.cpaEntregado === null ? "—" : dol(f.cpaEntregado)}.`,
        motivo: "Las ventas se ven bien en Meta, pero una parte no llega al cliente: el costo real por venta es más alto que el CPA.",
        accion: "Antes de escalarlo, revisar por qué se devuelve (dirección, confirmación, producto, tiempos de entrega) y considerar un tope de CPA más bajo para este producto.",
        certeza: f.cerradas >= 40 ? "firme" : "probable",
        gasto: f.gasto,
      });
    } else if (f.veredicto === "vende_y_entrega" && f.tasa !== null && promedio !== null && f.tasa >= promedio + 0.08 && f.gasto >= UMBRALES_HISTORICO.mejorGasto) {
      out.push({
        id: `entrega:${f.clave}:buena`,
        categoria: "entrega",
        tono: "bueno",
        titulo: `${f.nombre}: entrega mejor que el resto (${pct(f.tasa)})`,
        detalle: `Se entrega ${pct(f.tasa)} de lo despachado (el promedio es ${pct(promedio)}) y su CPA es ${f.cpa === null ? "—" : dol(f.cpa)}: cada compra entregada cuesta ${f.cpaEntregado === null ? "—" : dol(f.cpaEntregado)}.`,
        accion: "Es de los productos más seguros para escalar: lo que se vende se entrega.",
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
  const promedio = tasaPromedio(productos);
  const tasaPorClave = new Map(productos.map((p) => [p.clave, tasaDeEntrega(p.entrega)]));
  const tasaDe = (clave: string) => tasaPorClave.get(clave) ?? null;
  const totalCompras = campanas.reduce((s, c) => s + c.total.compras, 0);
  const totalVideos = videos.reduce((s, v) => s + v.total.compras, 0);
  const deVideo = (cara: (v: VideoHist) => string | null) => videos.flatMap((v) => (cara(v) ? [{ nombre: cara(v)!, r: v.total, clave: v.clave }] : []));
  return {
    campanas: rankear(campanas.map((c) => ({ nombre: c.nombre, r: c.total, clave: c.clave, campana: c.id })), tasaDe, promedio, totalCompras),
    videos: rankear(videos.map((v) => ({ nombre: v.nombre, r: v.total, clave: v.clave })), tasaDe, promedio, totalVideos),
    productos: rankear(productos.map((p) => ({ nombre: p.nombre, r: p.total, clave: p.clave })), tasaDe, promedio, totalCompras),
    angulos: rankear(deVideo((v) => v.angulo), tasaDe, promedio, totalVideos),
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
  rankings: Rankings;
  /** Mes a mes de todas las campañas, y de los productos con más gasto. */
  meses: FilaMes[];
  mesesPorProducto: { nombre: string; filas: FilaMes[] }[];
}

const ORDEN_CATEGORIA: CategoriaHallazgo[] = ["entrega", "tendencia", "no_funciona", "funciona"];
const PESO_TONO: Record<TonoHallazgo, number> = { alerta: 0, info: 1, bueno: 2 };

/** Ordena los hallazgos: primero los que piden atención (entrega, tendencias a la baja, lo que no funciona), después lo bueno; dentro de cada grupo, los de más gasto. */
export function ordenarHallazgos(lista: readonly Hallazgo[]): Hallazgo[] {
  return [...lista].sort((a, b) => PESO_TONO[a.tono] - PESO_TONO[b.tono] || ORDEN_CATEGORIA.indexOf(a.categoria) - ORDEN_CATEGORIA.indexOf(b.categoria) || b.gasto - a.gasto || a.id.localeCompare(b.id));
}

export function analizarHistorico(e: EntradaHistorico): AnalisisHistorico {
  const bandas = bandasDeMetricas(e.campanas);
  const filasTendencia = tendencias(e.campanas, e.productos);
  const entrega = filasDeEntrega(e.productos);
  const promedio = tasaPromedio(e.productos);
  const medibles = e.campanas.filter((c) => confiable(c.total));
  const total = e.campanas.reduce((r, c) => sumar(r, c.total), sinResultados());
  const hallazgos = ordenarHallazgos([
    ...hallazgosDeEntrega(entrega, promedio),
    ...hallazgosDeTendencias(filasTendencia),
    ...hallazgosDeBandas(bandas),
    ...hallazgosDeCaracteristicas(e.campanas, e.videos),
  ]);
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
    tendencias: filasTendencia,
    entrega,
    rankings: rankingsDeVentas(e.campanas, e.videos, e.productos),
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
