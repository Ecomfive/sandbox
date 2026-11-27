// Borrador del Levantamiento (23 nov 2026, pedido de inventario a través de Hernán: «que no se pierda lo que llevo contado si salgo»). Lo escrito y sin
// guardar (contado, lotes, cajas, sumar, restar, transferir y la referencia) se guarda en este navegador, por país y por bodega, y vuelve al abrir el
// levantamiento de esa bodega. Al guardar el levantamiento (o con «Descartar») se borra. Aquí solo las reglas, sin React ni navegador, con prueba.

export interface BorradorLevantamiento {
  version: 1;
  /** Cuándo se escribió lo último (ISO). */
  guardadoEn: string;
  contados: Record<string, string>;
  lotes: Record<string, unknown[]>;
  cajas: Record<string, unknown[]>;
  sumas: Record<string, string>;
  restas: Record<string, string>;
  traslados: Record<string, { cantidad: string; destino: string }>;
  referencia: string;
}

/** Un borrador vale una semana: lo contado hace más tiempo ya no sirve para cuadrar. */
export const VIGENCIA_BORRADOR_MS = 7 * 24 * 3_600_000;

export const claveBorrador = (pais: string, bodega: string) => `levantamiento-borrador:${pais}:${bodega}`;

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const soloTextos = (x: unknown): Record<string, string> => (esObjeto(x) ? Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v === "string")) as Record<string, string> : {});
const soloListas = (x: unknown): Record<string, unknown[]> => (esObjeto(x) ? Object.fromEntries(Object.entries(x).filter(([, v]) => Array.isArray(v))) as Record<string, unknown[]> : {});

/** ¿Tiene algo escrito? Un campo vacío no cuenta. */
export function hayAlgo(b: Omit<BorradorLevantamiento, "version" | "guardadoEn">): boolean {
  const conTexto = (r: Record<string, string>) => Object.values(r).some((v) => v.trim() !== "");
  return (
    conTexto(b.contados) ||
    conTexto(b.sumas) ||
    conTexto(b.restas) ||
    Object.values(b.traslados).some((t) => t.cantidad.trim() !== "") ||
    Object.keys(b.lotes).length > 0 ||
    Object.keys(b.cajas).length > 0 ||
    b.referencia.trim() !== ""
  );
}

/** Lee un borrador guardado; null si no hay, si está dañado, si está vacío o si tiene más de una semana. */
export function leerBorrador(texto: string | null, ahora = Date.now()): BorradorLevantamiento | null {
  if (!texto) return null;
  let x: unknown;
  try {
    x = JSON.parse(texto);
  } catch {
    return null;
  }
  if (!esObjeto(x) || x.version !== 1 || typeof x.guardadoEn !== "string") return null;
  const t = Date.parse(x.guardadoEn);
  if (!Number.isFinite(t) || ahora - t > VIGENCIA_BORRADOR_MS) return null;
  const traslados = esObjeto(x.traslados)
    ? (Object.fromEntries(
        Object.entries(x.traslados).filter(([, v]) => esObjeto(v) && typeof v.cantidad === "string" && typeof v.destino === "string"),
      ) as Record<string, { cantidad: string; destino: string }>)
    : {};
  const b: BorradorLevantamiento = {
    version: 1,
    guardadoEn: x.guardadoEn,
    contados: soloTextos(x.contados),
    lotes: soloListas(x.lotes),
    cajas: soloListas(x.cajas),
    sumas: soloTextos(x.sumas),
    restas: soloTextos(x.restas),
    traslados,
    referencia: typeof x.referencia === "string" ? x.referencia : "",
  };
  return hayAlgo(b) ? b : null;
}
