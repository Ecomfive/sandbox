// «Copiar cotización» de la ficha de una compra (17 oct 2026): lo que el equipo pegaba en WhatsApp con dos capturas (las
// métricas del test y la fila del sheet de cotizaciones) armado con los datos de la compra. Lógica pura, con prueba.

export type ColorPunto = "rojo" | "amarillo" | "verde";

export interface FilaMetrica {
  nombre: string;
  valor: string;
  /** El punto de color que trae la métrica en la descripción (🔴 🟡 🟢); null si no trae. */
  color: ColorPunto | null;
}

export interface MetricasCotizacion {
  /** «Métricas (Panamá - Fecha del Test 28/08/2026)». */
  titulo: string;
  filas: FilaMetrica[];
}

export interface Cotizacion {
  producto: string;
  fotoUrl: string | null;
  destino: string;
  /** «DDP BY SEA». */
  logistica: string;
  cantidad: number | null;
  monto: number | null;
  porUnidad: number | null;
  metricas: MetricasCotizacion | null;
}

const PUNTOS: Record<string, ColorPunto> = { "🔴": "rojo", "🟠": "amarillo", "🟡": "amarillo", "🟢": "verde" };
const BANDERA = /[\u{1F1E6}-\u{1F1FF}]{2}/gu;

/** Lee el bloque «**Métricas (…):**» con su tabla de la descripción de una compra (así llega de Test productos). */
export function leerMetricasDescripcion(descripcion: string | null): MetricasCotizacion | null {
  if (!descripcion) return null;
  const lineas = descripcion.split(/\r?\n/);
  const i = lineas.findIndex((l) => /^\s*\*\*\s*M[ée]tricas\b/i.test(l));
  if (i < 0) return null;
  const titulo = lineas[i]
    .replace(/\*\*/g, "")
    .replace(BANDERA, "")
    .replace(/\s+/g, " ")
    .replace(/\s*\(\s*/, " (")
    .replace(/\s+\)/, ")")
    .replace(/:\s*$/, "")
    .trim();
  const filas: FilaMetrica[] = [];
  for (const linea of lineas.slice(i + 1)) {
    const l = linea.trim();
    if (!l) {
      if (filas.length) break;
      continue;
    }
    if (!l.startsWith("|")) break;
    const celdas = l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (celdas.length < 2 || /^-+$/.test(celdas[0]) || /^m[ée]trica$/i.test(celdas[0])) continue;
    let valor = celdas[1];
    let color: ColorPunto | null = null;
    for (const [emoji, c] of Object.entries(PUNTOS))
      if (valor.includes(emoji)) {
        color = c;
        valor = valor.replace(emoji, "");
      }
    filas.push({ nombre: celdas[0], valor: valor.trim(), color });
  }
  return filas.length ? { titulo, filas } : null;
}

export interface TestParaCotizacion {
  fecha_test: string | null;
  metrica_oferta: number | null;
  metrica_cpm: number | null;
  metrica_efectividad: number | null;
  metrica_hook_rate: number | null;
  metrica_ctr: number | null;
  metrica_cpa: number | null;
  metrica_gasto: number | null;
  metrica_compras: number | null;
  metrica_cvr: number | null;
}

/** Las mismas métricas armadas desde el test (cuando la descripción no las trae): sin puntos de color. */
export function metricasDeTest(t: TestParaCotizacion, pais: string | null): MetricasCotizacion | null {
  const usd = (x: number) => `$${x.toFixed(2)}`;
  const pct = (x: number) => `${x.toFixed(2)}%`;
  const filas: [string, number | null, (x: number) => string][] = [
    ["Oferta", t.metrica_oferta, usd],
    ["CPM", t.metrica_cpm, usd],
    ["% Efectividad página destino", t.metrica_efectividad, pct],
    ["Hook Rate", t.metrica_hook_rate, pct],
    ["CTR", t.metrica_ctr, pct],
    ["CPA", t.metrica_cpa, usd],
    ["Gasto", t.metrica_gasto, usd],
    ["Compras", t.metrica_compras, (x) => String(x)],
    ["CVR", t.metrica_cvr, pct],
  ];
  const conValor = filas.filter(([, v]) => v !== null && v !== undefined);
  if (!conValor.length) return null;
  const fecha = t.fecha_test ? t.fecha_test.slice(0, 10).split("-").reverse().join("/") : null;
  const partes = [pais, fecha ? `Fecha del Test ${fecha}` : null].filter(Boolean).join(" - ");
  return {
    titulo: partes ? `Métricas (${partes})` : "Métricas",
    filas: conValor.map(([nombre, v, f]) => ({ nombre, valor: f(Number(v)), color: null })),
  };
}

const VIA_EN: Record<string, string> = { mar: "SEA", aire: "AIR", tierra: "LAND" };

/** «DDP BY SEA»: la modalidad de la ruta del agente (Envíos) y la vía de la compra. */
export function textoLogistica(modalidad: string | null, vias: string[]): string {
  const via = vias.map((v) => VIA_EN[v] ?? v.toUpperCase()).join(" / ");
  return [modalidad, via ? `BY ${via}` : null].filter(Boolean).join(" ");
}

/** El precio por unidad: monto ÷ cantidad, con 2 decimales. */
export function precioUnidad(monto: number | null, cantidad: number | null): number | null {
  if (monto === null || !cantidad) return null;
  return Math.round((monto / cantidad) * 100) / 100;
}

/** El mismo contenido en texto, por si el navegador no deja copiar la imagen. */
export function textoCotizacion(c: Cotizacion): string {
  const usd = (x: number | null) => (x === null ? "—" : `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  const lineas: string[] = [];
  if (c.metricas) {
    const punto = { rojo: "🔴 ", amarillo: "🟡 ", verde: "🟢 " };
    lineas.push(`*${c.metricas.titulo}*`, ...c.metricas.filas.map((f) => `${f.nombre}: ${f.color ? punto[f.color] : ""}${f.valor}`), "");
  }
  lineas.push(
    `*${c.producto}*`,
    `Destino: ${c.destino}`,
    `Logística: ${c.logistica || "—"}`,
    `Cantidad: ${c.cantidad?.toLocaleString("en-US") ?? "—"}`,
    `Monto: ${usd(c.monto)}`,
    `Por unidad: ${usd(c.porUnidad)}`,
  );
  return lineas.join("\n");
}
