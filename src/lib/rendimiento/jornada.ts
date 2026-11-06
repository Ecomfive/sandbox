// Equipo › Rendimiento: la jornada de una persona a partir de sus minutos en el sistema (`actividad_minutos`, migración 0166) y de lo
// que guardó (`historial_auditoria`). Sin base ni React, con prueba.

import { FRENTES_USO, frenteDeRuta } from "./uso-personas";

/** Hora de Panamá (UTC−5, sin horario de verano): todo se cuenta en ella. */
export const ZONA = "America/Panama";
/** Un hueco de más de esto entre dos minutos trabajados es una pausa. */
export const MINUTOS_PAUSA = 5;

/** Desde dónde se conectó (migración 0241). Lo que se anotó antes no lo dice: `null`, «sin dato». */
export type Dispositivo = "computadora" | "telefono" | "tablet";

export const NOMBRE_DISPOSITIVO: Record<Dispositivo, string> = { computadora: "Computadora", telefono: "Teléfono", tablet: "Tablet" };

export interface MinutoTrabajado {
  /** ISO, redondeado al minuto. */
  minuto: string;
  ruta: string;
  dispositivo?: Dispositivo | null;
}

export interface AccionHecha {
  creadoEn: string;
  texto: string;
}

/** Un WhatsApp que la persona mandó desde el CRM. */
export interface MensajeEnviado {
  momento: string;
  chat: string;
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

/**
 * Un rato seguido en la misma página y desde el mismo dispositivo, con lo que hizo mientras tanto: un renglón de la cronología de la ficha.
 * Lo que se guardó sin minutos alrededor (un script, otra pestaña) sale en su propio bloque, sin página y con 0 minutos.
 */
export interface Bloque {
  desde: string;
  hasta: string;
  minutos: number;
  area: string | null;
  pagina: string | null;
  dispositivo: Dispositivo | null;
  acciones: AccionHecha[];
  /** Los WhatsApp, juntos por chat: uno por mensaje llenaría la ficha. */
  mensajes: { chat: string; n: number; primero: string }[];
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
  /** La cronología del día, de la mañana a la noche. */
  bloques: Bloque[];
  /** Cuánto tiempo en cada área del sistema y en qué páginas, de la que más a la que menos. */
  areas: { area: string; minutos: number; paginas: { pagina: string; minutos: number }[] }[];
  /** Cuánto tiempo desde cada dispositivo. `null`: minutos anotados antes de guardarlo. */
  dispositivos: { dispositivo: Dispositivo | null; minutos: number }[];
  /** Los WhatsApp que mandó desde el CRM. */
  mensajes: number;
}

/** De qué dispositivo viene un aviso, por el «user-agent» del navegador. Un iPad que se presenta como Mac cuenta como computadora. */
export function dispositivoDeAgente(agente: string | null | undefined): Dispositivo | null {
  if (!agente) return null;
  if (/iPad|Tablet|Kindle|Silk/i.test(agente) || (/Android/i.test(agente) && !/Mobile/i.test(agente))) return "tablet";
  return /Mobi|iPhone|iPod|Android/i.test(agente) ? "telefono" : "computadora";
}

/** La ruta que manda el navegador, limpia: solo el camino (sin `?` ni `#`), que empiece por «/» y de hasta 200 caracteres. */
export function rutaDeLatido(ruta: unknown): string | null {
  if (typeof ruta !== "string") return null;
  const r = ruta.split(/[?#]/)[0].trim();
  if (!r.startsWith("/") || r.length > 200 || /[\s<>"']/.test(r)) return null;
  return r.length > 1 ? r.replace(/\/+$/, "") : r;
}

const MINUTO = 60_000;

const areaDeRuta = (ruta: string) => FRENTES_USO.find((f) => f.id === frenteDeRuta(ruta))?.etiqueta ?? "General";

/** Lo agrupa en bloques: un cambio de página o de dispositivo, o una pausa, empieza otro. */
function armarBloques(minutos: { t: number; pagina: string; area: string; dispositivo: Dispositivo | null }[]): Bloque[] {
  const bloques: Bloque[] = [];
  for (const m of minutos) {
    const ultimo = bloques.at(-1);
    if (ultimo && ultimo.pagina === m.pagina && ultimo.dispositivo === m.dispositivo && m.t + MINUTO - new Date(ultimo.hasta).getTime() <= MINUTOS_PAUSA * MINUTO) {
      ultimo.hasta = new Date(m.t + MINUTO).toISOString();
      ultimo.minutos++;
    } else {
      bloques.push({ desde: new Date(m.t).toISOString(), hasta: new Date(m.t + MINUTO).toISOString(), minutos: 1, area: m.area, pagina: m.pagina, dispositivo: m.dispositivo, acciones: [], mensajes: [] });
    }
  }
  return bloques;
}

/** El bloque donde cae un momento: el que estaba abierto o el que acaba de terminar. Si no hay, abre uno sin página (la lista queda en orden). */
function bloqueDe(bloques: Bloque[], iso: string): Bloque {
  const t = new Date(iso).getTime();
  const b = bloques.findLast((x) => new Date(x.desde).getTime() <= t && t <= new Date(x.hasta).getTime() + MINUTOS_PAUSA * MINUTO);
  if (b) {
    if (!b.minutos && t > new Date(b.hasta).getTime()) b.hasta = iso;
    return b;
  }
  const nuevo: Bloque = { desde: iso, hasta: iso, minutos: 0, area: null, pagina: null, dispositivo: null, acciones: [], mensajes: [] };
  bloques.push(nuevo);
  bloques.sort((x, y) => x.desde.localeCompare(y.desde));
  return nuevo;
}

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
export function armarJornada(minutosEnBruto: MinutoTrabajado[], acciones: AccionHecha[], paginaDe: (ruta: string) => string, mensajes: MensajeEnviado[] = []): Jornada {
  const vistos = new Set<number>();
  const minutos = minutosEnBruto
    .map((m) => ({ t: Math.floor(new Date(m.minuto).getTime() / MINUTO) * MINUTO, pagina: paginaDe(m.ruta), area: areaDeRuta(m.ruta), dispositivo: m.dispositivo ?? null }))
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

  const bloques = armarBloques(minutos);
  for (const a of ordenadas) bloqueDe(bloques, a.creadoEn).acciones.push(a);
  for (const m of [...mensajes].sort((a, b) => a.momento.localeCompare(b.momento))) {
    const b = bloqueDe(bloques, m.momento);
    const grupo = b.mensajes.find((x) => x.chat === m.chat);
    if (grupo) grupo.n++;
    else b.mensajes.push({ chat: m.chat, n: 1, primero: m.momento });
  }
  const porArea = new Map<string, Map<string, number>>();
  const porDispositivo = new Map<Dispositivo | null, number>();
  for (const m of minutos) {
    const paginas = porArea.get(m.area) ?? porArea.set(m.area, new Map()).get(m.area)!;
    paginas.set(m.pagina, (paginas.get(m.pagina) ?? 0) + 1);
    porDispositivo.set(m.dispositivo, (porDispositivo.get(m.dispositivo) ?? 0) + 1);
  }

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
    bloques,
    areas: [...porArea]
      .map(([area, paginas]) => ({ area, minutos: [...paginas.values()].reduce((t, n) => t + n, 0), paginas: ordenar(paginas) }))
      .sort((a, b) => b.minutos - a.minutos || a.area.localeCompare(b.area)),
    dispositivos: [...porDispositivo].map(([dispositivo, minutos]) => ({ dispositivo, minutos })).sort((a, b) => b.minutos - a.minutos),
    mensajes: mensajes.length,
  };
}

/** «7 h 25 min», «45 min», «0 min». */
export function duracion(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

/** «3:00 p. m.» (largo) o «3 p» (corto, para el eje). */
export function etiquetaHora(h: number, corta = false): string {
  const doce = h % 12 || 12;
  const sufijo = h < 12 ? "a. m." : "p. m.";
  return corta ? `${doce}${h < 12 ? "a" : "p"}` : `${doce}:00 ${sufijo}`;
}

/** Las horas que muestra la gráfica: de 7 a. m. a 6 p. m. como mínimo, ampliadas a lo que haya trabajado antes o después. */
export function rangoDeHoras(horas: { hora: number }[]): number[] {
  const usadas = horas.map((h) => h.hora);
  const desde = Math.min(7, ...usadas);
  const hasta = Math.max(18, ...usadas);
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}
