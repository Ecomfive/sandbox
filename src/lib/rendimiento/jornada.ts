// Equipo › Rendimiento: la jornada de una persona a partir de sus minutos en el sistema (`actividad_minutos`, migración 0166) y de lo
// que guardó (`historial_auditoria`). Sin base ni React, con prueba.

/** Hora de Panamá (UTC−5, sin horario de verano): todo se cuenta en ella. */
export const ZONA = "America/Panama";
/** Un hueco de más de esto entre dos minutos trabajados es una pausa. */
export const MINUTOS_PAUSA = 5;

export interface MinutoTrabajado {
  /** ISO, redondeado al minuto. */
  minuto: string;
  ruta: string;
}

export interface AccionHecha {
  creadoEn: string;
  texto: string;
}

export interface Tramo {
  desde: string;
  hasta: string;
  minutos: number;
}

export interface HoraJornada {
  /** 0 a 23, hora de Panamá. */
  hora: number;
  minutos: number;
  /** Las páginas de esa hora, de la que más tiempo tuvo a la que menos. */
  paginas: { pagina: string; minutos: number }[];
  acciones: AccionHecha[];
}

export interface Jornada {
  entrada: string | null;
  salida: string | null;
  minutosActivos: number;
  tramos: Tramo[];
  pausas: Tramo[];
  horas: HoraJornada[];
  acciones: number;
  /** La página donde pasó más tiempo en el día. */
  principal: string | null;
}

/** La ruta que manda el navegador, limpia: solo el camino (sin `?` ni `#`), que empiece por «/» y de hasta 200 caracteres. */
export function rutaDeLatido(ruta: unknown): string | null {
  if (typeof ruta !== "string") return null;
  const r = ruta.split(/[?#]/)[0].trim();
  if (!r.startsWith("/") || r.length > 200 || /[\s<>"']/.test(r)) return null;
  return r.length > 1 ? r.replace(/\/+$/, "") : r;
}

const MINUTO = 60_000;

/** La hora (0–23) de Panamá de un instante. */
export function horaPanama(iso: string): number {
  return Number(new Date(iso).toLocaleString("en-US", { timeZone: ZONA, hour: "numeric", hourCycle: "h23" }));
}

/** El día (AAAA-MM-DD) de Panamá de un instante. */
export function diaPanama(iso: string | Date = new Date()): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONA });
}

/** El rango en UTC de un día de Panamá, para pedirlo a la base. */
export function rangoDelDia(dia: string): { desde: string; hasta: string } {
  const desde = new Date(`${dia}T00:00:00-05:00`);
  return { desde: desde.toISOString(), hasta: new Date(desde.getTime() + 24 * 60 * MINUTO).toISOString() };
}

/**
 * Arma la jornada: entrada (el primer minuto trabajado) y salida (el último, más ese minuto), tiempo activo (los minutos
 * trabajados), los tramos seguidos y las pausas de más de `MINUTOS_PAUSA` entre ellos, y por cada hora cuántos minutos, en qué
 * páginas (`paginaDe` da el nombre de una ruta) y qué guardó. Una acción sin minutos alrededor (un script, otra pestaña) igual cuenta.
 */
export function armarJornada(minutosEnBruto: MinutoTrabajado[], acciones: AccionHecha[], paginaDe: (ruta: string) => string): Jornada {
  const vistos = new Set<number>();
  const minutos = minutosEnBruto
    .map((m) => ({ t: Math.floor(new Date(m.minuto).getTime() / MINUTO) * MINUTO, pagina: paginaDe(m.ruta) }))
    .filter((m) => !Number.isNaN(m.t) && !vistos.has(m.t) && vistos.add(m.t))
    .sort((a, b) => a.t - b.t);
  const ordenadas = [...acciones].sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));

  const tramos: Tramo[] = [];
  const pausas: Tramo[] = [];
  let inicio = 0;
  for (let i = 1; i <= minutos.length; i++) {
    const corte = i === minutos.length || minutos[i].t - minutos[i - 1].t > MINUTOS_PAUSA * MINUTO;
    if (!corte) continue;
    const desde = minutos[inicio].t;
    const hasta = minutos[i - 1].t + MINUTO;
    tramos.push({ desde: new Date(desde).toISOString(), hasta: new Date(hasta).toISOString(), minutos: i - inicio });
    if (i < minutos.length) pausas.push({ desde: new Date(hasta).toISOString(), hasta: new Date(minutos[i].t).toISOString(), minutos: Math.round((minutos[i].t - hasta) / MINUTO) });
    inicio = i;
  }

  const porHora = new Map<number, { minutos: number; paginas: Map<string, number>; acciones: AccionHecha[] }>();
  const de = (h: number) => {
    let x = porHora.get(h);
    if (!x) porHora.set(h, (x = { minutos: 0, paginas: new Map(), acciones: [] }));
    return x;
  };
  const totalPorPagina = new Map<string, number>();
  for (const m of minutos) {
    const x = de(horaPanama(new Date(m.t).toISOString()));
    x.minutos++;
    x.paginas.set(m.pagina, (x.paginas.get(m.pagina) ?? 0) + 1);
    totalPorPagina.set(m.pagina, (totalPorPagina.get(m.pagina) ?? 0) + 1);
  }
  for (const a of ordenadas) de(horaPanama(a.creadoEn)).acciones.push(a);

  const ordenar = (m: Map<string, number>) => [...m].map(([pagina, minutos]) => ({ pagina, minutos })).sort((a, b) => b.minutos - a.minutos || a.pagina.localeCompare(b.pagina));
  const primero = [minutos[0]?.t, ordenadas[0] ? new Date(ordenadas[0].creadoEn).getTime() : undefined].filter((x): x is number => x !== undefined);
  const ultimo = [minutos.at(-1) ? minutos.at(-1)!.t + MINUTO : undefined, ordenadas.at(-1) ? new Date(ordenadas.at(-1)!.creadoEn).getTime() : undefined].filter(
    (x): x is number => x !== undefined,
  );
  return {
    entrada: primero.length ? new Date(Math.min(...primero)).toISOString() : null,
    salida: ultimo.length ? new Date(Math.max(...ultimo)).toISOString() : null,
    minutosActivos: minutos.length,
    tramos,
    pausas,
    horas: [...porHora]
      .sort((a, b) => a[0] - b[0])
      .map(([hora, x]) => ({ hora, minutos: x.minutos, paginas: ordenar(x.paginas), acciones: x.acciones })),
    acciones: ordenadas.length,
    principal: ordenar(totalPorPagina)[0]?.pagina ?? null,
  };
}

/** «7 h 25 min», «45 min», «0 min». */
export function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}
