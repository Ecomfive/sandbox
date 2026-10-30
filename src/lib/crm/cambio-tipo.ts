/**
 * Si un dropshipper subió o bajó de tipo de cliente (Rookie → VIP → Black), para dibujar la flecha junto a su pastilla (30 oct 2026, pedido de Alcides).
 * Sale de la Actividad: cada cambio de tipo, automático (`crm_recalcular_tipo_cliente`, migración 0196) o a mano (`cambiarTipoCliente`), deja una línea
 * `tipo_cliente_dropshipper` con «Tipo de cliente» antes y después («VIP», «VIP (a mano)»).
 */

/** De menos a más pedidos. */
const ORDEN: Record<string, number> = { regular: 0, vip: 1, black: 2 };

export interface EventoTipo {
  antes: unknown;
  despues: unknown;
  creado_en: string;
}

export interface CambioTipo {
  sube: boolean;
  /** Los niveles («regular», «vip», «black»). */
  desde: string;
  hasta: string;
  /** Cuándo cambió (ISO). */
  fecha: string;
}

/** «VIP (a mano)» → «vip»; «Rookie» → «regular». Lo que no se reconoce, null. */
export function nivelDeTexto(valor: unknown): string | null {
  const texto = valor && typeof valor === "object" ? (valor as Record<string, unknown>)["Tipo de cliente"] : null;
  if (typeof texto !== "string") return null;
  const limpio = texto.replace(/\(.*\)/, "").trim().toLowerCase();
  if (limpio === "rookie" || limpio === "regular" || limpio === "nuevo") return "regular";
  if (limpio === "vip") return "vip";
  if (limpio === "black") return "black";
  return null;
}

/**
 * El último cambio de nivel de verdad (no cuenta pasar de «a mano» a «automático» con el mismo tipo). Solo vale si el dropshipper sigue en el nivel
 * al que llegó: si después lo cambiaron por otro camino, no se adivina.
 */
export function cambioDeTipo(eventos: EventoTipo[], nivelActual: string): CambioTipo | null {
  const ordenados = [...eventos].sort((a, b) => b.creado_en.localeCompare(a.creado_en));
  for (const e of ordenados) {
    const desde = nivelDeTexto(e.antes);
    const hasta = nivelDeTexto(e.despues);
    if (!desde || !hasta || desde === hasta) continue;
    if (hasta !== (nivelActual || "regular")) return null;
    return { sube: ORDEN[hasta] > ORDEN[desde], desde, hasta, fecha: e.creado_en };
  }
  return null;
}
