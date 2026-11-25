// Anuncios Meta › Sugerencias (18 nov 2026, pedido de Alcides: «como en Gestión de IDs, que nos sugiera»): lo que el sistema ve en los números y propone hacer. No toca Meta: avisa, y la persona acepta,
// rechaza (con porqué) o pospone, como las recomendaciones de Gestión de IDs Dropi. Las reglas son simples a propósito, con umbrales a la vista, para que el equipo las entienda y las discuta. Lógica pura, con prueba.

import { conversion, confiable, cpa, ctr, dolares, GASTO_MINIMO_CONFIABLE, hookRate, sinResultados, sumar, type Resultados } from "./metricas";
import { CERCA_DEL_TOPE, FACTOR_DE_APAGADO, zonaDe, zonaDeCpa, type GuiaDeTope } from "./limite";
import { decisionesDeAnuncios, NOMBRE_DECISION, UMBRALES_ANUNCIO, type AnuncioParaDecidir } from "./decision-anuncio";
import { diagnosticoDeLanding } from "./diagnostico-concreto";
import { pesoDeHallazgo, type Hallazgo } from "./historico";
import type { CampanaVista, VideoVista } from "./vistas";

export type TipoSugerencia = "sin_compras" | "apagar_campana" | "cpa_alto" | "sumar_videos" | "en_recuperacion" | "escalar" | "cpa_subiendo" | "testing_sin_cierre" | "anuncio_apagar" | "anuncio_rotar" | "anuncio_rebalancear" | "video_ganador" | "video_hook_bajo" | "landing_floja" | "etiquetas_faltan" | "hallazgo";
export type Severidad = "alta" | "media" | "info";
/** En qué grupo de «Para decidir hoy» sale, de lo que no espera a lo que solo hay que mirar (25 nov 2026, pedido de Alcides: «los que necesitan más, primero; lo raro dentro del límite, de último»). */
export type Prioridad = "apagar" | "actuar" | "oportunidad" | "observar" | "historial";
export const PRIORIDADES: readonly Prioridad[] = ["apagar", "actuar", "oportunidad", "observar", "historial"];

/** Una cifra que se ve de un vistazo en la tarjeta de una campaña. */
export interface CifraSugerencia {
  etiqueta: string;
  valor: string;
  tono?: "bueno" | "medio" | "malo";
}

export interface Sugerencia {
  /** `tipo:objeto`: la misma sugerencia sobre lo mismo tiene siempre la misma clave (así se recuerda lo que se decidió). */
  clave: string;
  tipo: TipoSugerencia;
  severidad: Severidad;
  prioridad: Prioridad;
  /** CPA de la campaña a 7 días, últimos 3, la semana anterior y su tope. */
  cifras?: CifraSugerencia[];
  /** Lo bueno (escalar, usar un video) se muestra distinto de un problema. */
  positiva: boolean;
  titulo: string;
  detalle: string;
  /** Qué se propone hacer. */
  accion: string;
  objeto: { tipo: "campana" | "video" | "cuenta"; id: string };
  gasto: number;
  /** Si su producto tiene el tope más bajo (envía o entrega menos): desde cuánto vigilarlo y apagarlo. */
  guia?: GuiaDeTope;
  /** Los anuncios de la campaña que ya pasaron del límite, con su cifra (para decir cuáles en vez de «los que pasaron»). */
  anuncios?: AnuncioEnSugerencia[];
}

export interface AnuncioEnSugerencia {
  id: string;
  /** «V3» o el nombre del anuncio. */
  nombre: string;
  /** «$14.20 sin ventas» o «CPA $18.00 con 3 compras». */
  cifra: string;
  /** «apagar»: la escalera de decisiones dice cortarlo; «vigilar»: su CPA pasa del límite pero todavía lleva poco gasto. */
  grupo: "apagar" | "vigilar";
}

/** Los umbrales, en un solo lugar y a la vista. */
export const UMBRALES = {
  /** Gastó esto (en veces el CPA tope) sin una compra → revisar. */
  sinComprasVeces: 1.5,
  /** CPA por encima del tope por este factor, con gasto suficiente. */
  cpaAltoFactor: 1.3,
  cpaAltoGastoMinimo: 60,
  /** Escalar: compras mínimas, y CPA a este factor del tope o menos. */
  escalarCompras: 8,
  escalarFactor: 0.9,
  /** El CPA de los últimos 3 días contra el de los 7 anteriores. */
  subiendoFactor: 1.3,
  subiendoGastoMinimo: 40,
  /** Para saber si una campaña con el CPA alto se está recuperando se mira el CPA de estos últimos días. */
  recuperandoDias: 4,
  /** Desde esta parte del tope una campaña (o su anuncio que más vende) está «cerca del límite»: $9 con un tope de $10. */
  cercaDelTope: CERCA_DEL_TOPE,
  /** Para contar como «el anuncio que la sostiene» tiene que haber vendido al menos esto en 7 días. */
  comprasDelQueSostiene: 2,
  /** Gasto mínimo de cada semana para decir que el CPA cambió de una semana a otra. */
  semanaGastoMinimo: 60,
  /** Testing que lleva días y gasta sin decidirse. */
  testingDias: 7,
  testingGastoVeces: 2,
  /** Video: hook bueno / malo (los de Productos Test). */
  hookBueno: 40,
  hookMalo: 30,
  /** Landing: el anuncio atrae (CTR) pero la página no convierte. */
  landingCtr: 2.5,
  landingConversion: 4,
  landingClicsMinimos: 200,
} as const;

/**
 * El CPA de una campaña a partir del cual deja de ser rentable (25 nov 2026, pedido de Alcides: «que diga cuándo sí debe apagarse porque el CPA a nivel de campaña ya pasa de $12»): $12, el CPA en rojo del documento «Métrica». Si el producto
 * tiene un CPA tope propio más alto (definido en Cuentas), manda ese; si su tope se ajustó por envío y entrega, baja en la misma proporción (un tope de $7 se apaga desde $8.40).
 */
export const limiteDeApagado = (c: { tope: number; topeDefinido?: boolean; topeAjustado?: boolean }): number =>
  c.topeAjustado ? Math.round(c.tope * FACTOR_DE_APAGADO * 100) / 100 : c.topeDefinido && c.tope > UMBRALES_ANUNCIO.cpaRojo ? c.tope : UMBRALES_ANUNCIO.cpaRojo;

/** Los anuncios activos de una campaña que ya pasaron del límite: los que hay que apagar y los que van caros con poco gasto, de más a menos gasto. */
export function anunciosPasados(anuncios: readonly AnuncioSugerencia[], campanaId: string, decisiones: ReadonlyMap<string, { decision: string }>, limite: number): AnuncioEnSugerencia[] {
  const out: (AnuncioEnSugerencia & { gasto: number })[] = [];
  for (const a of anuncios) {
    if (a.campanaId !== campanaId || !a.activo) continue;
    const costo = cpa(a.r);
    const cortar = decisiones.get(a.id)?.decision === "cortar";
    if (!cortar && !(costo !== null && costo > limite)) continue;
    const cifra = a.r.compras === 0 ? `${dolares(a.r.gasto)} sin ventas` : `CPA ${dolares(costo ?? 0)} con ${a.r.compras} ${a.r.compras === 1 ? "compra" : "compras"}`;
    out.push({ id: a.id, nombre: a.numero ?? a.nombre, cifra, grupo: cortar ? "apagar" : "vigilar", gasto: a.r.gasto });
  }
  return out.sort((x, y) => y.gasto - x.gasto).map(({ gasto: _gasto, ...x }) => (void _gasto, x));
}

/** Qué etiquetas le faltan a una campaña: el producto y la etapa. El ángulo no se pide aquí: se lee de cada video. */
export function faltanEtiquetas(c: Pick<CampanaVista, "producto" | "etapa">): ("producto" | "etapa")[] {
  const f: ("producto" | "etapa")[] = [];
  if (!c.producto) f.push("producto");
  if (!c.etapa) f.push("etapa");
  return f;
}

const DIA = 86_400_000;
/** Días enteros de `desde` a `hasta` (AAAA-MM-DD). */
export const diasEntre = (desde: string, hasta: string) => Math.floor((new Date(`${hasta}T00:00:00Z`).getTime() - new Date(`${desde}T00:00:00Z`).getTime()) / DIA);

/** Un anuncio con lo que lleva (acumulado, 48 horas y último día) para decidir qué hacer con él (`decision-anuncio.ts`). */
export interface AnuncioSugerencia extends AnuncioParaDecidir {
  nombre: string;
  /** «V3»: el número del video dentro de su tanda, según el nombre del anuncio. */
  numero: string | null;
  /** El ángulo de su video, según el análisis. */
  angulo: string | null;
  /** Lo de los últimos 7 días; sin esto se usa lo acumulado. */
  r7?: Resultados;
}

export interface EntradaSugerencias {
  /** Anuncios con lo que llevan, para decidir cuál apagar, rotar o dejar (escalera del documento «Métrica»). */
  anuncios?: AnuncioSugerencia[];
  /** Campañas con los resultados de los últimos 7 días (`r`). */
  campanas: CampanaVista[];
  /** Resultados por día de cada campaña, de los últimos 14 días. */
  serie: Map<string, { fecha: string; r: Resultados }[]>;
  /** Videos con los resultados de los últimos 30 días. */
  videos: VideoVista[];
  /** AAAA-MM-DD de hoy en Panamá. */
  hoy: string;
  /** Las páginas de destino de cada campaña (la del anuncio con más gasto primero) con lo que se midió de ellas, para decir qué le falta a la landing en vez de «revísala». */
  paginasPorCampana?: Map<string, { url: string; rasgos: string[] }[]>;
}

const ORDEN: Record<Severidad, number> = { alta: 0, media: 1, info: 2 };
const nombreDe = (a: AnuncioSugerencia) => a.numero ?? a.nombre;

/** El anuncio activo de la campaña que más vendió en 7 días (con al menos 2 compras): el que la sostiene. */
export function anuncioQueSostiene(anuncios: readonly AnuncioSugerencia[], campanaId: string): { anuncio: AnuncioSugerencia; cpa: number; compras: number } | null {
  const lista = anuncios
    .filter((a) => a.campanaId === campanaId && a.activo)
    .map((a) => ({ anuncio: a, r: a.r7 ?? a.r }))
    .filter((x) => x.r.compras >= UMBRALES.comprasDelQueSostiene)
    .sort((x, y) => y.r.compras - x.r.compras || x.r.gasto - y.r.gasto);
  const mejor = lista[0];
  return mejor ? { anuncio: mejor.anuncio, cpa: mejor.r.gasto / mejor.r.compras, compras: mejor.r.compras } : null;
}

/** Las sumas de la serie de una campaña entre hace `desde` y hace `hasta` días (hoy es 0), sin incluir `hasta`. */
const tramo = (serie: readonly { fecha: string; r: Resultados }[], hoy: string, desde: number, hasta: number): Resultados =>
  serie
    .filter((d) => {
      const n = diasEntre(d.fecha, hoy);
      return n >= desde && n < hasta;
    })
    .reduce((a, d) => sumar(a, d.r), sinResultados());

const tonoDeCpa = (v: number, tope: number): "bueno" | "medio" | "malo" => (v > tope ? "malo" : v >= tope * UMBRALES.cercaDelTope ? "medio" : "bueno");

/** El CPA de la campaña de un vistazo: 7 días, los últimos 3, la semana anterior y el tope. */
function cifrasDeCampana(semana: number | null, ultimos3: Resultados, semanaAntes: Resultados, tope: number): CifraSugerencia[] {
  const una = (etiqueta: string, r: Resultados): CifraSugerencia[] => {
    if (r.gasto <= 0) return [];
    const v = cpa(r);
    return [v === null ? { etiqueta, valor: "sin compras", tono: "malo" } : { etiqueta, valor: dolares(v), tono: tonoDeCpa(v, tope) }];
  };
  const deLaSemana: CifraSugerencia[] = semana === null ? [] : [{ etiqueta: "CPA 7 días", valor: dolares(semana), tono: tonoDeCpa(semana, tope) }];
  return [...deLaSemana, ...una("Últimos 3 días", ultimos3), ...una("Semana anterior", semanaAntes), { etiqueta: "CPA tope", valor: dolares(tope) }];
}

/** Qué hacer con una campaña que gastó sin comprar: si su landing ya se midió, dice qué le falta; si no, el texto de siempre. */
function accionSinCompras(paginas: { url: string; rasgos: string[] }[] | undefined): string {
  const d = diagnosticoDeLanding(paginas);
  if (!d) return "Revisar el anuncio y la landing, o pausarla.";
  return d.fallas.length ? `Pausarla o corregir su landing (${d.url}), que ${d.fallas.join(", ")}.` : `Su landing (${d.url}) ya dice lo básico (precio, pago contra entrega, garantía y reseñas): lo más probable es que falle el anuncio; cambiar su ángulo o su video, o pausarla.`;
}

/** Qué hacer cuando el anuncio atrae y la landing no convierte: lo que le falta a esa página, medido. */
function accionLandingFloja(paginas: { url: string; rasgos: string[] }[] | undefined): string {
  const d = diagnosticoDeLanding(paginas);
  if (!d) return "Revisar la landing: oferta, velocidad, precio o confianza.";
  return d.fallas.length ? `La landing ${d.url} ${d.fallas.join(", ")}: completarlo en ese orden.` : `La landing ${d.url} ya dice lo básico (precio, pago contra entrega, garantía y reseñas) y carga bien: probar otra oferta, otro precio mostrado o una versión más corta de la página.`;
}

export function sugerir(e: EntradaSugerencias): Sugerencia[] {
  const s: Sugerencia[] = [];
  const U = UMBRALES;
  const todosAnuncios = e.anuncios ?? [];
  const decisiones = decisionesDeAnuncios(todosAnuncios, e.campanas);
  // Una campaña que hay que apagar no repite avisos de sus anuncios ni de su landing; una cuya tarjeta ya lista los anuncios para apagar no los repite uno por uno.
  const apagadas = new Set<string>();
  const conAnunciosListados = new Set<string>();

  for (const c of e.campanas.filter((x) => x.activa)) {
    const gasto = c.r.gasto;
    const costo = cpa(c.r);
    const serie = e.serie.get(c.id) ?? [];
    const producto = c.producto ?? "su producto";

    const ultimos3 = tramo(serie, e.hoy, 0, 3);
    const semanaAntes = tramo(serie, e.hoy, 7, 14);
    const cifras = cifrasDeCampana(costo, ultimos3, semanaAntes, c.tope);

    if (c.r.compras === 0 && gasto >= U.sinComprasVeces * c.tope) {
      apagadas.add(c.id);
      s.push({ clave: `sin_compras:${c.id}`, tipo: "sin_compras", severidad: "alta", prioridad: "apagar", positiva: false, titulo: `${c.nombre}: ${dolares(gasto)} sin ninguna compra`, detalle: `Ya gastó ${(gasto / c.tope).toFixed(1)} veces el CPA tope de ${producto} (${dolares(c.tope)}) en 7 días.`, accion: accionSinCompras(e.paginasPorCampana?.get(c.id)), objeto: { tipo: "campana", id: c.id }, gasto });
      continue;
    }

    // Cómo está la campaña frente a su tope (25 nov 2026, pedido de Alcides): sin vida (apagarla), cara pero con un anuncio que la sostiene, cerca del límite (agregar videos antes de llegar) o recuperándose.
    const limite = limiteDeApagado(c);
    const cerca = c.tope * U.cercaDelTope;
    let conTarjeta = false;
    if (costo !== null && gasto >= U.cpaAltoGastoMinimo && costo >= cerca) {
      const recientes = tramo(serie, e.hoy, 0, U.recuperandoDias);
      const costoReciente = cpa(recientes);
      const reciente = costoReciente !== null ? ` y CPA ${dolares(costoReciente)} en los últimos ${U.recuperandoDias} días` : recientes.gasto > 0 ? ` y sin compras en los últimos ${U.recuperandoDias} días (gastó ${dolares(recientes.gasto)})` : "";
      const detalle = `${c.r.compras} compras con ${dolares(gasto)} en 7 días${reciente}.`;
      const anuncios = anunciosPasados(todosAnuncios, c.id, decisiones, limite);
      const marcados = anuncios.some((a) => a.grupo === "apagar");
      const sostiene = anuncioQueSostiene(todosAnuncios, c.id);
      const hayAnuncios = todosAnuncios.some((a) => a.campanaId === c.id && a.activo);
      const vivo = sostiene && sostiene.cpa < cerca ? sostiene : null;
      const sinVida = hayAnuncios && !vivo;
      const quePasa = sostiene ? `su anuncio que más vende (${nombreDe(sostiene.anuncio)}) ya va en ${dolares(sostiene.cpa)} en 7 días` : `ningún anuncio activo tiene ${U.comprasDelQueSostiene} compras en 7 días`;
      const conAngulo = vivo?.anuncio.angulo ? `con el ángulo «${vivo.anuncio.angulo}»` : vivo ? `parecidos a ${nombreDe(vivo.anuncio)}` : "con otro ángulo";
      const base = { positiva: false, objeto: { tipo: "campana" as const, id: c.id }, gasto, anuncios, cifras };
      if (costo > c.tope && costoReciente !== null && costoReciente <= c.tope) {
        conTarjeta = true;
        s.push({ ...base, anuncios: undefined, clave: `en_recuperacion:${c.id}`, tipo: "en_recuperacion", severidad: "info", prioridad: "observar", titulo: `${c.nombre}: se está recuperando`, detalle, accion: `Mantenerla en observación: el CPA de 7 días (${dolares(costo)}) pasa del tope, pero en los últimos ${U.recuperandoDias} días ya va en ${dolares(costoReciente)}, dentro de ${dolares(c.tope)}.` });
      } else if (costo > c.tope) {
        conTarjeta = true;
        const pasaYNoBaja = costo > limite && !(costoReciente !== null && costoReciente <= limite);
        if (pasaYNoBaja || sinVida) {
          apagadas.add(c.id);
          const ganador = todosAnuncios
            .filter((x) => x.campanaId === c.id && x.r.compras > 0 && (cpa(x.r) ?? Infinity) < cerca)
            .sort((x, y) => (cpa(x.r) ?? Infinity) - (cpa(y.r) ?? Infinity))[0];
          const rescatar = ganador ? ` Lo que sí vende dentro del tope es ${nombreDe(ganador)} (CPA ${dolares(cpa(ganador.r) ?? 0)}${ganador.angulo ? `, ángulo «${ganador.angulo}»` : ""}): llévalo a una campaña nueva.` : " Sustitúyela con una campaña nueva y videos de otro ángulo.";
          const accion = pasaYNoBaja
            ? `Apaga la campaña: su CPA de 7 días (${dolares(costo)}) pasa de ${dolares(limite)} y los últimos ${U.recuperandoDias} días no lo han bajado.${sinVida ? ` Además, ${quePasa}.` : ""}${rescatar}`
            : `Apaga la campaña y sustitúyela: ya no tiene vida. Su CPA de 7 días (${dolares(costo)}) pasa del tope y ${quePasa}; dejarla encendida es seguir gastando.${rescatar}`;
          s.push({ ...base, clave: `apagar_campana:${c.id}`, tipo: "apagar_campana", severidad: "alta", prioridad: "apagar", titulo: `${c.nombre}: apagar la campaña (CPA ${dolares(costo)})`, detalle, accion });
        } else {
          conAnunciosListados.add(c.id);
          const porQue = costo > limite
            ? `en los últimos ${U.recuperandoDias} días su CPA ya bajó a ${dolares(costoReciente ?? 0)}, dentro de ${dolares(limite)}`
            : `su CPA de 7 días (${dolares(costo)}) todavía no pasa de ${dolares(limite)}${costoReciente !== null && costoReciente > limite ? `, pero en los últimos ${U.recuperandoDias} días va en ${dolares(costoReciente)}` : ""}`;
          const vende = vivo ? `, y ${nombreDe(vivo.anuncio)} todavía vende a ${dolares(vivo.cpa)} en 7 días` : "";
          const pasos = [marcados ? "apaga los anuncios marcados abajo" : "", vivo ? `agrega 2 o 3 videos ${conAngulo}` : ""].filter(Boolean).join(" y ");
          const hacer = pasos ? ` ${pasos[0].toUpperCase()}${pasos.slice(1)}.` : "";
          s.push({ ...base, clave: `cpa_alto:${c.id}`, tipo: "cpa_alto", severidad: gasto >= 150 ? "alta" : "media", prioridad: "actuar", titulo: `${c.nombre}: CPA ${dolares(costo)}, sobre el tope de ${dolares(c.tope)}`, detalle, accion: `No la apagues todavía: ${porQue}${vende}.${hacer} La campaña se apaga si su CPA pasa de ${dolares(limite)} y no baja en ${U.recuperandoDias} días${vivo ? `, o si ${nombreDe(vivo.anuncio)} llega a ${dolares(cerca)}` : ""}.` });
        }
      } else if (hayAnuncios && costoReciente !== null && costoReciente < cerca) {
        // Cerca del tope pero ya se está acomodando sola: tocarla ahora reiniciaría su aprendizaje.
        conTarjeta = true;
        s.push({ ...base, anuncios: undefined, clave: `en_recuperacion:${c.id}`, tipo: "en_recuperacion", severidad: "info", prioridad: "observar", titulo: `${c.nombre}: cerca del tope, pero ya está bajando`, detalle, accion: `No la toques todavía: en los últimos ${U.recuperandoDias} días va en ${dolares(costoReciente)}, por debajo de ${dolares(cerca)}. Agregar videos ahora reiniciaría su aprendizaje.` });
      } else if (hayAnuncios) {
        conTarjeta = true;
        conAnunciosListados.add(c.id);
        const costo3 = cpa(ultimos3);
        const subiendo = costo3 !== null && costo3 > c.tope;
        const apagarMarcados = marcados ? " Apaga los anuncios marcados abajo." : "";
        const accion = vivo
          ? `Ya no está bajando sola: agrega 2 o 3 videos ${conAngulo} (${nombreDe(vivo.anuncio)} vende a ${dolares(vivo.cpa)} con ${vivo.compras} compras) antes de que la campaña pase de ${dolares(c.tope)}. Reinicia su aprendizaje, así que hazlo una sola vez.${apagarMarcados}`
          : `Prueba videos nuevos de otro ángulo ya: ${quePasa}.${apagarMarcados} Si pasa de ${dolares(c.tope)} sin un anuncio que venda más barato, apágala.`;
        s.push({ ...base, clave: `sumar_videos:${c.id}`, tipo: "sumar_videos", severidad: subiendo || !vivo ? "alta" : "media", prioridad: "actuar", titulo: `${c.nombre}: ${vivo ? "cerca del tope, agrégale videos" : "cerca del tope y sin un anuncio que la sostenga"}`, detalle, accion });
      }
    }
    if (c.etapa === "testing" && costo !== null && c.r.compras >= U.escalarCompras && confiable(c.r) && costo <= c.tope * U.escalarFactor) {
      s.push({ clave: `escalar:${c.id}`, tipo: "escalar", severidad: "media", prioridad: "oportunidad", positiva: true, titulo: `${c.nombre}: lista para escalar`, detalle: `${c.r.compras} compras con CPA ${dolares(costo)} (tope ${dolares(c.tope)}) y ${dolares(gasto)} gastados en 7 días.`, accion: "Subir el presupuesto de a 20 % como mucho, o duplicarla en una campaña de escala sin tocar esta: un cambio grande reinicia su aprendizaje.", objeto: { tipo: "campana", id: c.id }, gasto });
    }
    // Una campaña de ventas se vigila como una de escala: si su CPA sube pero sigue lejos del tope, queda en observación (con la semana anterior para ver el cambio de los últimos 14 días).
    if (!conTarjeta && (c.etapa === "escala" || c.etapa === "venta")) {
      const cu = cpa(ultimos3);
      const ca = cpa(tramo(serie, e.hoy, 3, 10));
      const cp = cpa(semanaAntes);
      const enTresDias = cu !== null && ca !== null && ultimos3.gasto >= U.subiendoGastoMinimo && cu > ca * U.subiendoFactor;
      const enDosSemanas = costo !== null && cp !== null && gasto >= U.semanaGastoMinimo && semanaAntes.gasto >= U.semanaGastoMinimo && costo > cp * U.subiendoFactor;
      if (enTresDias || enDosSemanas) {
        const cambios = [
          enTresDias ? `Pasó de ${dolares(ca as number)} (los 7 días anteriores) a ${dolares(cu as number)} en los últimos 3 días.` : "",
          enDosSemanas ? `En 14 días: de ${dolares(cp as number)} la semana anterior a ${dolares(costo as number)} esta semana.` : "",
        ].filter(Boolean).join(" ");
        const accion = costo !== null && costo < cerca
          ? `No la toques: el CPA de 7 días (${dolares(costo)}) va dentro del tope de ${dolares(c.tope)}, y agregar videos ahora reiniciaría su aprendizaje. Solo si llega a ${dolares(cerca)} y no baja en ${U.recuperandoDias} días, agrega videos.`
          : "Observarla unos días antes de mover presupuesto: todavía lleva poco gasto para decidir.";
        s.push({ clave: `cpa_subiendo:${c.id}`, tipo: "cpa_subiendo", severidad: "info", prioridad: "observar", positiva: false, titulo: `${c.nombre}: el CPA subió, en observación`, detalle: cambios, accion, objeto: { tipo: "campana", id: c.id }, gasto, cifras });
      }
    }
    const edad = c.creadaEn ? diasEntre(c.creadaEn.slice(0, 10), e.hoy) : 0;
    if (!conTarjeta && c.etapa === "testing" && costo !== null && edad >= U.testingDias && gasto >= U.testingGastoVeces * c.tope && costo <= c.tope * U.cpaAltoFactor && costo > c.tope * U.escalarFactor) {
      s.push({ clave: `testing_sin_cierre:${c.id}`, tipo: "testing_sin_cierre", severidad: "info", prioridad: "observar", positiva: false, titulo: `${c.nombre}: lleva ${edad} días en testing sin decidirse`, detalle: `CPA ${dolares(costo)} contra tope ${dolares(c.tope)}: ni gana ni pierde.`, accion: "Decidir: escalarla con otro anuncio o apagarla.", objeto: { tipo: "campana", id: c.id }, gasto });
    }
    const porClic = ctr(c.r);
    const conv = conversion(c.r);
    if (!apagadas.has(c.id) && porClic !== null && conv !== null && c.r.clics >= U.landingClicsMinimos && porClic >= U.landingCtr && conv < U.landingConversion) {
      const dentro = zonaDe(c.r, c.tope) === "dentro";
      const mejorar = accionLandingFloja(e.paginasPorCampana?.get(c.id));
      s.push({ clave: `landing_floja:${c.id}`, tipo: "landing_floja", severidad: "media", prioridad: dentro ? "observar" : "actuar", positiva: false, titulo: `${c.nombre}: el anuncio atrae pero la landing no convierte`, detalle: `CTR ${porClic.toFixed(1)} % (bueno) y solo ${conv.toFixed(1)} % de las visitas compran.`, accion: dentro ? `${mejorar} La campaña va dentro de su tope: cambia el contenido de la misma página, sin cambiar el enlace del anuncio (eso reinicia su aprendizaje).` : mejorar, objeto: { tipo: "campana", id: c.id }, gasto });
    }
  }

  // A nivel de anuncio (23 nov 2026, escalera del documento «Métrica» de Oferfy, ver `decision-anuncio.ts`): se apaga el que ya pasó de $12 sin una venta (sin importar su CTR ni su conversión) o no logró bajar el CPA a $12 con
  // $25; con más razón si su campaña va por debajo del tope (le quita presupuesto). La propuesta dice cuál apagar y con cuál ángulo sustituirlo: el del anuncio de la misma campaña que sí vende dentro del tope.
  const activas = new Map(e.campanas.filter((x) => x.activa).map((x) => [x.id, x]));
  for (const a of todosAnuncios) {
    const d = decisiones.get(a.id);
    const c = activas.get(a.campanaId);
    if (!d || !c || apagadas.has(c.id)) continue;
    const etiqueta = a.numero ?? a.nombre;
    const campanaDentro = zonaDe(c.r, c.tope) === "dentro";
    if (d.decision === "cortar") {
      if (conAnunciosListados.has(c.id)) continue;
      const costoCampana = cpa(c.r);
      const campanaVaBien = costoCampana !== null && zonaDeCpa(costoCampana, c.tope) !== "sobre";
      const ganador = todosAnuncios
        .filter((x) => x.campanaId === a.campanaId && x.id !== a.id && x.r.compras > 0 && (cpa(x.r) ?? Infinity) <= c.tope)
        .sort((x, y) => (cpa(x.r) ?? Infinity) - (cpa(y.r) ?? Infinity))[0];
      const sustituir = ganador
        ? ` y sustituirlo con anuncios ${ganador.angulo ? `del ángulo «${ganador.angulo}» ` : ""}como ${ganador.numero ?? ganador.nombre} (CPA ${dolares(cpa(ganador.r) ?? 0)})`
        : " y probar otro ángulo";
      s.push({
        clave: `anuncio_apagar:${a.id}`, tipo: "anuncio_apagar", severidad: campanaDentro ? "media" : "alta", prioridad: "actuar", positiva: false,
        titulo: `${c.nombre}: apagar ${etiqueta} (${dolares(a.r.gasto)} gastados${a.r.compras === 0 ? " sin ventas" : ""})`,
        detalle: `${d.motivo}${campanaVaBien ? ` La campaña va bien (CPA ${dolares(costoCampana ?? 0)}, tope ${dolares(c.tope)}): este anuncio le está quitando presupuesto.` : ""}`,
        accion: campanaDentro ? `Apagar ${etiqueta}. No subas otro todavía: la campaña va dentro de su tope y un video nuevo reiniciaría su aprendizaje.` : `Apagar ${etiqueta}${sustituir}.`,
        objeto: { tipo: "campana", id: c.id }, gasto: a.r.gasto,
      });
    } else if (d.decision === "rotar") {
      s.push({ clave: `anuncio_rotar:${a.id}`, tipo: "anuncio_rotar", severidad: campanaDentro ? "info" : "media", prioridad: campanaDentro ? "observar" : "actuar", positiva: false, titulo: `${c.nombre}: ${NOMBRE_DECISION.rotar.toLowerCase()} de ${etiqueta}`, detalle: d.motivo, accion: campanaDentro ? `Todavía no: la campaña va dentro de su tope y un video nuevo reiniciaría su aprendizaje. Ten listas 2 o 3 variantes de ${etiqueta} (otros primeros 3 segundos) para cuando llegue a ${dolares(c.tope * U.cercaDelTope)}.` : `Rotar el gancho de ${etiqueta}: 2 o 3 variantes con otros primeros 3 segundos.`, objeto: { tipo: "campana", id: c.id }, gasto: a.r.gasto });
    } else if (d.decision === "rebalancear") {
      s.push({ clave: `anuncio_rebalancear:${a.id}`, tipo: "anuncio_rebalancear", severidad: "info", prioridad: "observar", positiva: false, titulo: `${c.nombre}: ${etiqueta} se come la CBO (opcional)`, detalle: d.motivo, accion: campanaDentro ? "Opcional, y mejor no tocarla: la campaña va dentro de su tope." : `Apagar ${etiqueta} un rato para que la CBO reparta el presupuesto.`, objeto: { tipo: "campana", id: c.id }, gasto: a.r.gasto });
    }
  }

  for (const v of e.videos) {
    const h = hookRate(v.r);
    const costo = cpa(v.r);
    if (confiable(v.r) && h !== null && h >= U.hookBueno && costo !== null && costo <= v.tope && v.campanas <= 1) {
      s.push({ clave: `video_ganador:${v.id}`, tipo: "video_ganador", severidad: "media", prioridad: "oportunidad", positiva: true, titulo: `Video «${v.nombre}»: gana y solo se usa en una campaña`, detalle: `Hook ${h.toFixed(0)} % y CPA ${dolares(costo)} (tope ${dolares(v.tope)}) con ${dolares(v.r.gasto)} gastados.`, accion: `Usarlo en una campaña nueva o en una que ya pasó su tope (no agregarlo a una que va bien: reinicia su aprendizaje), o probar su ángulo${v.angulo ? ` («${v.angulo}»)` : ""} con otro producto.`, objeto: { tipo: "video", id: v.id }, gasto: v.r.gasto });
    } else if (v.anunciosDetalle.some((a) => a.activo) && v.r.gasto >= GASTO_MINIMO_CONFIABLE && h !== null && h < U.hookMalo) {
      s.push({ clave: `video_hook_bajo:${v.id}`, tipo: "video_hook_bajo", severidad: "media", prioridad: "observar", positiva: false, titulo: `Video «${v.nombre}»: casi nadie pasa los primeros 3 segundos`, detalle: `Hook ${h.toFixed(0)} % con ${dolares(v.r.gasto)} gastados (lo bueno es sobre ${U.hookBueno} %).`, accion: v.anunciosDetalle.filter((a) => a.activo).every((a) => { const c = activas.get(a.campanaId); return !!c && zonaDe(c.r, c.tope) === "dentro"; }) ? "Sus campañas van dentro del tope: no lo cambies ahí (reiniciaría el aprendizaje). Arregla la apertura antes de usarlo en una campaña nueva." : "Cambiar la apertura del video o dejar de usarlo.", objeto: { tipo: "video", id: v.id }, gasto: v.r.gasto });
    }
  }

  // El ángulo no cuenta: se lee de cada video (18 nov 2026), no del nombre de la campaña.
  const sinEtiqueta = e.campanas.filter((c) => c.activa && faltanEtiquetas(c).length > 0);
  if (sinEtiqueta.length)
    s.push({ clave: "etiquetas_faltan:cuenta", tipo: "etiquetas_faltan", severidad: "info", prioridad: "observar", positiva: false, titulo: `${sinEtiqueta.length} ${sinEtiqueta.length === 1 ? "campaña activa sin" : "campañas activas sin"} producto o etapa`, detalle: "Sin el producto no se sabe contra qué CPA tope se mide, y sin la etapa no entra al análisis de «Qué funciona». Salen solas si el nombre sigue la regla (PAÍS | Producto | CBO | Puja | T).", accion: "Completarlas en la ficha de cada campaña (se abren al pulsar).", objeto: { tipo: "cuenta", id: "todas" }, gasto: sinEtiqueta.reduce((t, c) => t + c.r.gasto, 0) });

  // En lo de un producto con el tope más bajo se dice desde cuánto vigilarlo y apagarlo.
  const guiaDe = new Map(e.campanas.flatMap((c) => (c.guiaTope ? [[c.id, c.guiaTope] as const] : [])));
  for (const x of s) {
    const guia = x.objeto.tipo === "campana" ? guiaDe.get(x.objeto.id) : undefined;
    if (guia) x.guia = guia;
  }

  return s.sort((a, b) => PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad) || ORDEN[a.severidad] - ORDEN[b.severidad] || b.gasto - a.gasto);
}

export interface DecisionGuardada {
  clave: string;
  estado: "aceptada" | "rechazada" | "pospuesta";
  /** AAAA-MM-DD hasta cuándo vale la decisión. */
  vigenteHasta: string;
}

/** Cuánto dura cada decisión: aceptada 30 días (se sigue de cerca), rechazada 90 (el equipo ya dijo que no), pospuesta 7. */
export const DIAS_DE_DECISION = { aceptada: 30, rechazada: 90, pospuesta: 7 } as const;

/** Las que todavía no tienen una decisión vigente. */
export function pendientes(sugerencias: Sugerencia[], decisiones: DecisionGuardada[], hoy: string): Sugerencia[] {
  const vigentes = new Set(decisiones.filter((d) => d.vigenteHasta >= hoy).map((d) => d.clave));
  return sugerencias.filter((x) => !vigentes.has(x.clave));
}

// — Los hallazgos del historial como sugerencias (24 nov 2026, pedido de Alcides: «que salgan también como sugerencias que se aceptan o rechazan, en el Resumen»).

/** Una llave corta y estable para un hallazgo (su id lleva espacios y acentos y la de una decisión no puede): la misma sugerencia sobre lo mismo tiene siempre la misma. FNV-1a de 32 bits en hexadecimal. */
export function claveDeHallazgo(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `hallazgo:${h.toString(16).padStart(8, "0")}`;
}

/** La llave con la que se recuerda lo decidido sobre un hallazgo. Lo que va «en observación» lleva otra: si después pasa a pedir atención, vuelve a salir. */
export const claveDeDecision = (h: Pick<Hallazgo, "id" | "tono">): string => claveDeHallazgo(h.tono === "info" ? `${h.id}:observar` : h.id);

/** Cuántos hallazgos se convierten en sugerencia: lo que pide atención (por gasto) y unas pocas buenas noticias; el resto se ve en Hallazgos. */
export const HALLAZGOS_COMO_SUGERENCIA = { atencion: 8, buenas: 3 } as const;

/** Un hallazgo que pide atención con tanto gasto detrás es «urgente»; el resto, «importante». */
const GASTO_URGENTE = 300;

/**
 * Los hallazgos del historial (ya ordenados: primero los que piden atención) como sugerencias que se aceptan, rechazan o posponen igual que las demás. Entrega y tendencias a la baja con gasto alto son urgentes;
 * lo que nunca funcionó, importante; lo bueno, una buena noticia. La decisión se recuerda por su llave (`claveDeHallazgo`).
 */
export function sugerenciasDeHallazgos(hallazgos: readonly Hallazgo[]): Sugerencia[] {
  // Solo lo que el sistema está seguro de que es real (24 nov 2026, pedido de Alcides: «las que sean firmes»): primero los firmes y, si faltan, los probables; la «poca data» nunca llega al Resumen.
  const rango = (h: Hallazgo) => (h.certeza === "firme" ? 0 : h.certeza === "probable" ? 1 : 2);
  // Lo que la persona pidió vigilar manda: una vigilancia de prioridad alta va antes que cualquier hallazgo, la media entre los firmes y los probables, y la baja al final.
  const prioridad = (h: Hallazgo) => (h.prioridad === "alta" ? 0 : h.prioridad === "media" ? 1.5 : h.prioridad === "baja" ? 2.5 : 1);
  const mejores = (tono: Hallazgo["tono"], cuantos: number) =>
    hallazgos
      .filter((h) => h.tono === tono && (h.certeza !== "poca" || h.prioridad === "alta"))
      .sort((a, b) => prioridad(a) - prioridad(b) || rango(a) - rango(b) || pesoDeHallazgo(b) - pesoDeHallazgo(a))
      .slice(0, cuantos);
  const atencion = mejores("alerta", HALLAZGOS_COMO_SUGERENCIA.atencion);
  const buenas = mejores("bueno", HALLAZGOS_COMO_SUGERENCIA.buenas);
  return [...atencion, ...buenas].map((h): Sugerencia => ({
    clave: claveDeDecision(h),
    ...(h.guia ? { guia: h.guia } : {}),
    tipo: "hallazgo",
    // Lo que la persona pidió vigilar sale con lo del día; lo demás del historial, aparte.
    prioridad: h.prioridad === "alta" ? "actuar" : h.prioridad === "media" ? "observar" : "historial",
    severidad: h.tono === "bueno" ? "info" : (h.categoria === "entrega" || h.categoria === "tendencia") && h.gasto >= GASTO_URGENTE ? "alta" : "media",
    positiva: h.tono === "bueno",
    titulo: h.titulo,
    detalle: [h.detalle, h.quienes?.deQue, h.motivo ? `Por qué: ${h.motivo}` : ""].filter(Boolean).join(" "),
    accion: h.accion ?? "Revisar los detalles en Hallazgos.",
    objeto: { tipo: "cuenta", id: "historial" },
    gasto: h.gasto,
  }));
}
