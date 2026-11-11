// Mejora 32: lo que mide el navegador de cada página (Web Vitals) y cómo se lee. Sin React ni base, con prueba.

export const METRICAS = ["TTFB", "FCP", "LCP", "INP", "CLS"] as const;
export type Metrica = (typeof METRICAS)[number];
export const esMetrica = (v: unknown): v is Metrica => METRICAS.includes(v as Metrica);

/** La ruta sin ids ni números (`/compras/8f3e…` → `/compras/:id`), sin parámetros y de hasta 200 caracteres. */
export function rutaGenerica(pathname: string): string {
  const limpia = (pathname.split(/[?#]/)[0] || "/")
    .split("/")
    .map((t) => (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(t) || /^\d+$/.test(t) || /^[A-Za-z0-9_-]{20,}$/.test(t) ? ":id" : t))
    .join("/");
  return limpia.slice(0, 200) || "/";
}

/** Umbrales de Google (bueno / a mejorar); por encima, malo. TTFB, FCP, LCP e INP en ms; CLS sin unidad. */
export const UMBRALES: Record<Metrica, [number, number]> = {
  TTFB: [800, 1800],
  FCP: [1800, 3000],
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
};

export function nivel(m: Metrica, valor: number): "bueno" | "mejorar" | "malo" {
  const [b, r] = UMBRALES[m];
  return valor <= b ? "bueno" : valor <= r ? "mejorar" : "malo";
}

/** Una medición que llega del navegador, validada; null si no sirve. */
export function leerMedicion(v: unknown): { ruta: string; metrica: Metrica; valor: number } | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const valor = Number(o.valor);
  if (!esMetrica(o.metrica) || !Number.isFinite(valor) || valor < 0 || valor > 600_000 || typeof o.ruta !== "string" || !o.ruta.startsWith("/")) return null;
  return { ruta: rutaGenerica(o.ruta), metrica: o.metrica, valor: Math.round(valor * 10_000) / 10_000 };
}
