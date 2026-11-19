// Confirmación con IA › «Probar con pedidos reales» (19 nov 2026, pedido de Jhokser): se toman pedidos de los últimos meses que ya tienen su etiqueta de zona real (CIUDAD o INTERIOR), se le pasa la
// dirección al mismo análisis que usa el sistema (palabras de zona, ejemplos, las dos IA) y se compara lo que dijo con la etiqueta que de verdad se le puso. Sirve para medir qué tan bien acierta y
// para mejorar el prompt, los ejemplos y las palabras de zona con lo que falla. Esto es la lógica pura (la muestra y el resumen), con su prueba.

export type ZonaReal = "ciudad" | "interior";

/** Un pedido con su zona real (la que dicen sus etiquetas en Shopify). */
export interface PedidoMuestra {
  id: string;
  tiendaId: string | null;
  real: ZonaReal;
}

/** Un número estable (FNV-1a) para ordenar sin azar: la misma muestra cada vez que se pide, así se puede seguir por tandas. */
export function huellaDeId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * La muestra de hasta `max` pedidos, repartida por igual entre cada tienda y cada zona real (para que Oferfy, que tiene muchísimos, no tape a Kenku, y para que haya tantos de ciudad como de
 * interior). Dentro de cada grupo van ordenados por su huella (estable). Se reparten una vuelta a la vez entre los grupos.
 */
export function muestraBalanceada<T extends PedidoMuestra>(pedidos: readonly T[], max: number): T[] {
  const grupos = new Map<string, T[]>();
  for (const p of pedidos) {
    const clave = `${p.tiendaId ?? "-"}|${p.real}`;
    const g = grupos.get(clave) ?? [];
    g.push(p);
    grupos.set(clave, g);
  }
  const ordenados = [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g.sort((x, y) => huellaDeId(x.id) - huellaDeId(y.id)));
  const salida: T[] = [];
  for (let vuelta = 0; salida.length < max; vuelta++) {
    let hubo = false;
    for (const g of ordenados) {
      if (vuelta < g.length && salida.length < max) {
        salida.push(g[vuelta]);
        hubo = true;
      }
    }
    if (!hubo) break;
  }
  return salida;
}

/** Lo que dijo el sistema de un pedido, junto a lo real. */
export interface ResultadoPrueba {
  id: string;
  numero: string | null;
  tienda: string;
  tiendaId: string | null;
  ciudad: string | null;
  direccion: string;
  real: ZonaReal;
  /** `listo` con zona, `falta_dato` (la dirección parece incompleta), `revisar` (las IA no coinciden o no se pudo), `error` o `adelantado`. */
  estado: string;
  zona: ZonaReal | "adelantado" | null;
  /** Quién decidió la zona: una palabra de zona o las IA. */
  zonaPor: "regla" | "ia" | null;
  falta: string | null;
  motivo: string;
  modelos: { proveedor: string; ok: boolean; zona: string | null; completa: boolean | null; motivo: string | null }[];
  reglas: string[];
}

/** Cómo salió contra lo real: acertó, se equivocó de zona, o no decidió (pidió un dato, quedó para revisar o falló). */
export type Veredicto = "acerto" | "fallo" | "sin_decision";

export function veredictoDe(r: Pick<ResultadoPrueba, "estado" | "zona" | "real">): Veredicto {
  if (r.estado === "listo" && (r.zona === "ciudad" || r.zona === "interior")) return r.zona === r.real ? "acerto" : "fallo";
  return "sin_decision";
}

export interface ResumenPrueba {
  total: number;
  acerto: number;
  fallo: number;
  sinDecision: number;
  /** De los que decidió, qué parte acertó (null si no decidió ninguno). */
  precision: number | null;
  /** Qué parte del total decidió (sin pedir un dato ni quedar para revisar). */
  cobertura: number | null;
  porTienda: { tienda: string; total: number; acerto: number; fallo: number; sinDecision: number }[];
  /** Cuántos de cada zona real salieron como qué: la matriz de confusión. */
  matriz: Record<ZonaReal, { ciudad: number; interior: number; sinDecision: number }>;
  /** Cuántos decidió una palabra de zona y cuántos las IA, y cuánto acertó cada una. */
  porQuien: { regla: { total: number; acerto: number }; ia: { total: number; acerto: number } };
}

export function resumirPrueba(resultados: readonly ResultadoPrueba[]): ResumenPrueba {
  const porTienda = new Map<string, { tienda: string; total: number; acerto: number; fallo: number; sinDecision: number }>();
  const matriz: ResumenPrueba["matriz"] = { ciudad: { ciudad: 0, interior: 0, sinDecision: 0 }, interior: { ciudad: 0, interior: 0, sinDecision: 0 } };
  const porQuien: ResumenPrueba["porQuien"] = { regla: { total: 0, acerto: 0 }, ia: { total: 0, acerto: 0 } };
  let acerto = 0;
  let fallo = 0;
  let sinDecision = 0;
  for (const r of resultados) {
    const v = veredictoDe(r);
    const t = porTienda.get(r.tienda) ?? { tienda: r.tienda, total: 0, acerto: 0, fallo: 0, sinDecision: 0 };
    t.total++;
    if (v === "acerto") {
      acerto++;
      t.acerto++;
    } else if (v === "fallo") {
      fallo++;
      t.fallo++;
    } else {
      sinDecision++;
      t.sinDecision++;
    }
    porTienda.set(r.tienda, t);
    if (v === "sin_decision") matriz[r.real].sinDecision++;
    else matriz[r.real][r.zona as ZonaReal]++;
    if (v !== "sin_decision" && r.zonaPor) {
      porQuien[r.zonaPor].total++;
      if (v === "acerto") porQuien[r.zonaPor].acerto++;
    }
  }
  const decididos = acerto + fallo;
  return {
    total: resultados.length,
    acerto,
    fallo,
    sinDecision,
    precision: decididos ? acerto / decididos : null,
    cobertura: resultados.length ? decididos / resultados.length : null,
    porTienda: [...porTienda.values()].sort((a, b) => a.tienda.localeCompare(b.tienda, "es")),
    matriz,
    porQuien,
  };
}

/** Un lugar (la ciudad o el corregimiento que puso el cliente) con lo que pasó en los pedidos de la muestra. */
export interface LugarConDesacuerdo {
  lugar: string;
  /** Pedidos de la muestra de ese lugar. */
  total: number;
  /** Cuántos tienen cada zona real. */
  ciudad: number;
  interior: number;
  /** En cuántos el sistema se equivocó o no decidió. */
  fallos: number;
}

/** Los lugares donde más se equivocó o no decidió el sistema, de mayor a menor, con la zona real de cada uno; solo los que tienen al menos `minimo` pedidos fallados. */
export function lugaresConDesacuerdo(resultados: readonly ResultadoPrueba[], minimo = 2): LugarConDesacuerdo[] {
  const por = new Map<string, LugarConDesacuerdo>();
  for (const r of resultados) {
    const lugar = (r.ciudad ?? "").trim();
    if (!lugar) continue;
    const clave = lugar.toLowerCase();
    const l = por.get(clave) ?? { lugar, total: 0, ciudad: 0, interior: 0, fallos: 0 };
    l.total++;
    l[r.real]++;
    if (veredictoDe(r) !== "acerto") l.fallos++;
    por.set(clave, l);
  }
  return [...por.values()].filter((l) => l.fallos >= minimo).sort((a, b) => b.fallos - a.fallos || b.total - a.total);
}

/** Si la zona real de un lugar es casi siempre la misma (≥ 85 % y al menos 3 pedidos), cuál es: la candidata a «palabra de zona». Null si está repartido. */
export function zonaDominante(l: Pick<LugarConDesacuerdo, "ciudad" | "interior">): ZonaReal | null {
  const total = l.ciudad + l.interior;
  if (total < 3) return null;
  if (l.ciudad / total >= 0.85) return "ciudad";
  if (l.interior / total >= 0.85) return "interior";
  return null;
}
