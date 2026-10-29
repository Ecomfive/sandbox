// CRM › WhatsApp (29 oct 2026, pedido de Hernán): las reacciones se ven sobre el mensaje al que se reaccionó, como en WhatsApp, y no como un
// mensaje suelto «Reaccionó ❤️». Sin base ni React, con prueba (reacciones.test.ts).

export interface MensajeConReaccion {
  id: string;
  direccion: "entrante" | "saliente" | "nota";
  tipo: string;
  texto: string | null;
  /** El id en WhatsApp («wamid…») del mensaje. */
  waId?: string | null;
  /** En una reacción, el `waId` del mensaje reaccionado (migración 0185); null en las de antes. */
  reaccionA?: string | null;
}

/** Una reacción puesta sobre un mensaje: el emoji y de qué lado vino (el dropshipper o la empresa). */
export interface ReaccionVista {
  emoji: string;
  direccion: "entrante" | "saliente";
}

/**
 * Separa las reacciones de los mensajes: devuelve los mensajes que se dibujan (sin las reacciones) y, por id de mensaje, las reacciones que
 * lleva. Cada lado tiene una sola reacción por mensaje (la última; una sin emoji la quita), igual que WhatsApp. Una reacción se pone sobre
 * el mensaje cuyo `waId` es su `reaccionA`; las de antes de la migración 0185 no lo traen y van sobre el último mensaje anterior del otro
 * lado (a lo que se suele reaccionar). Si el mensaje reaccionado no está entre los cargados, la reacción no se ve (como en WhatsApp, que
 * tampoco la muestra suelta).
 */
export function agruparReacciones<M extends MensajeConReaccion>(mensajes: M[]): { visibles: M[]; reacciones: Map<string, ReaccionVista[]> } {
  const porWaId = new Map<string, M>();
  for (const m of mensajes) if (m.tipo !== "reaccion" && m.waId) porWaId.set(m.waId, m);
  // Por mensaje y por lado, la última reacción (en orden de llegada).
  const ultima = new Map<string, Map<"entrante" | "saliente", string | null>>();
  const visibles: M[] = [];
  for (const m of mensajes) {
    if (m.tipo !== "reaccion") {
      visibles.push(m);
      continue;
    }
    if (m.direccion === "nota") continue;
    let destino = m.reaccionA ? porWaId.get(m.reaccionA) : undefined;
    if (!destino && !m.reaccionA) {
      const otroLado = m.direccion === "entrante" ? "saliente" : "entrante";
      destino = [...visibles].reverse().find((x) => x.direccion === otroLado) ?? visibles[visibles.length - 1];
    }
    if (!destino) continue;
    const lados = ultima.get(destino.id) ?? new Map();
    lados.set(m.direccion, m.texto?.trim() || null);
    ultima.set(destino.id, lados);
  }
  const reacciones = new Map<string, ReaccionVista[]>();
  for (const [id, lados] of ultima) {
    const lista: ReaccionVista[] = [];
    for (const lado of ["entrante", "saliente"] as const) {
      const emoji = lados.get(lado);
      if (emoji) lista.push({ emoji, direccion: lado });
    }
    if (lista.length) reacciones.set(id, lista);
  }
  return { visibles, reacciones };
}
