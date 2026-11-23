// Anuncios Meta › Sugerencias (18 nov 2026, pedido de Alcides: «como en Gestión de IDs, que nos sugiera»): lo que el sistema ve en los números y propone hacer. No toca Meta: avisa, y la persona acepta,
// rechaza (con porqué) o pospone, como las recomendaciones de Gestión de IDs Dropi. Las reglas son simples a propósito, con umbrales a la vista, para que el equipo las entienda y las discuta. Lógica pura, con prueba.

import { conversion, confiable, cpa, ctr, dolares, GASTO_MINIMO_CONFIABLE, hookRate, sinResultados, sumar, type Resultados } from "./metricas";
import { decisionesDeAnuncios, NOMBRE_DECISION, UMBRALES_ANUNCIO, type AnuncioParaDecidir } from "./decision-anuncio";
import type { CampanaVista, VideoVista } from "./vistas";

export type TipoSugerencia = "sin_compras" | "cpa_alto" | "escalar" | "cpa_subiendo" | "testing_sin_cierre" | "anuncio_apagar" | "anuncio_rotar" | "anuncio_rebalancear" | "video_ganador" | "video_hook_bajo" | "landing_floja" | "etiquetas_faltan";
export type Severidad = "alta" | "media" | "info";

export interface Sugerencia {
  /** `tipo:objeto`: la misma sugerencia sobre lo mismo tiene siempre la misma clave (así se recuerda lo que se decidió). */
  clave: string;
  tipo: TipoSugerencia;
  severidad: Severidad;
  /** Lo bueno (escalar, usar un video) se muestra distinto de un problema. */
  positiva: boolean;
  titulo: string;
  detalle: string;
  /** Qué se propone hacer. */
  accion: string;
  objeto: { tipo: "campana" | "video" | "cuenta"; id: string };
  gasto: number;
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
}

const ORDEN: Record<Severidad, number> = { alta: 0, media: 1, info: 2 };

export function sugerir(e: EntradaSugerencias): Sugerencia[] {
  const s: Sugerencia[] = [];
  const U = UMBRALES;

  for (const c of e.campanas.filter((x) => x.activa)) {
    const gasto = c.r.gasto;
    const costo = cpa(c.r);
    const serie = e.serie.get(c.id) ?? [];
    const producto = c.producto ?? "su producto";

    if (c.r.compras === 0 && gasto >= U.sinComprasVeces * c.tope) {
      s.push({ clave: `sin_compras:${c.id}`, tipo: "sin_compras", severidad: "alta", positiva: false, titulo: `${c.nombre}: ${dolares(gasto)} sin ninguna compra`, detalle: `Ya gastó ${(gasto / c.tope).toFixed(1)} veces el CPA tope de ${producto} (${dolares(c.tope)}) en 7 días.`, accion: "Revisar el anuncio y la landing, o pausarla.", objeto: { tipo: "campana", id: c.id }, gasto });
      continue;
    }
    if (costo !== null && gasto >= U.cpaAltoGastoMinimo && costo > c.tope * U.cpaAltoFactor) {
      // Un CPA por encima del tope en la semana no siempre es para apagarla (23 nov 2026, indicado por Alcides): puede ser un mal día. Si en los últimos días el CPA ya está dentro del tope, se está recuperando y no se avisa.
      const ultimos = serie.filter((d) => diasEntre(d.fecha, e.hoy) < U.recuperandoDias).reduce((a, d) => sumar(a, d.r), sinResultados());
      const costoReciente = cpa(ultimos);
      if (!(costoReciente !== null && costoReciente <= c.tope)) {
        const reciente = costoReciente !== null ? ` y ${dolares(costoReciente)} en los últimos ${U.recuperandoDias}` : ultimos.gasto > 0 ? ` y sin compras en los últimos ${U.recuperandoDias} (gastó ${dolares(ultimos.gasto)})` : "";
        s.push({ clave: `cpa_alto:${c.id}`, tipo: "cpa_alto", severidad: gasto >= 150 ? "alta" : "media", positiva: false, titulo: `${c.nombre}: CPA ${dolares(costo)} en 7 días${reciente}, con tope ${dolares(c.tope)}`, detalle: `${c.r.compras} compras por ${dolares(gasto)} en 7 días: cada compra cuesta ${dolares(costo - c.tope)} más de lo que deja. Pasarse del tope una semana no obliga a apagarla: puede ser un mal día.`, accion: `No la apagues todavía: mira sus anuncios y apaga los que ya pasaron de ${dolares(UMBRALES_ANUNCIO.cpaRojo)} sin vender (salen aparte). Pausarla solo si ninguno rinde o el CPA de los últimos ${U.recuperandoDias} días sigue arriba del tope.`, objeto: { tipo: "campana", id: c.id }, gasto });
        continue;
      }
    }
    if (c.etapa === "testing" && costo !== null && c.r.compras >= U.escalarCompras && confiable(c.r) && costo <= c.tope * U.escalarFactor) {
      s.push({ clave: `escalar:${c.id}`, tipo: "escalar", severidad: "media", positiva: true, titulo: `${c.nombre}: lista para escalar`, detalle: `${c.r.compras} compras con CPA ${dolares(costo)} (tope ${dolares(c.tope)}) y ${dolares(gasto)} gastados en 7 días.`, accion: "Subir el presupuesto un 20 a 30 % o duplicarla en una campaña de escala.", objeto: { tipo: "campana", id: c.id }, gasto });
    }
    // Una campaña de ventas se vigila como una de escala: si su CPA empieza a subir, se avisa.
    if (c.etapa === "escala" || c.etapa === "venta") {
      const ultimos = serie.filter((d) => diasEntre(d.fecha, e.hoy) < 3).reduce((a, d) => sumar(a, d.r), sinResultados());
      const antes = serie.filter((d) => diasEntre(d.fecha, e.hoy) >= 3 && diasEntre(d.fecha, e.hoy) < 10).reduce((a, d) => sumar(a, d.r), sinResultados());
      const cu = cpa(ultimos);
      const ca = cpa(antes);
      if (cu !== null && ca !== null && ultimos.gasto >= U.subiendoGastoMinimo && cu > ca * U.subiendoFactor) {
        s.push({ clave: `cpa_subiendo:${c.id}`, tipo: "cpa_subiendo", severidad: "alta", positiva: false, titulo: `${c.nombre}: el CPA está subiendo`, detalle: `Pasó de ${dolares(ca)} (los 7 días anteriores) a ${dolares(cu)} en los últimos 3 días.`, accion: "Probar un anuncio nuevo, bajar el presupuesto o revisar si el público se cansó.", objeto: { tipo: "campana", id: c.id }, gasto: ultimos.gasto });
      }
    }
    const edad = c.creadaEn ? diasEntre(c.creadaEn.slice(0, 10), e.hoy) : 0;
    if (c.etapa === "testing" && costo !== null && edad >= U.testingDias && gasto >= U.testingGastoVeces * c.tope && costo <= c.tope * U.cpaAltoFactor && costo > c.tope * U.escalarFactor) {
      s.push({ clave: `testing_sin_cierre:${c.id}`, tipo: "testing_sin_cierre", severidad: "info", positiva: false, titulo: `${c.nombre}: lleva ${edad} días en testing sin decidirse`, detalle: `CPA ${dolares(costo)} contra tope ${dolares(c.tope)}: ni gana ni pierde.`, accion: "Decidir: escalarla con otro anuncio o apagarla.", objeto: { tipo: "campana", id: c.id }, gasto });
    }
    const porClic = ctr(c.r);
    const conv = conversion(c.r);
    if (porClic !== null && conv !== null && c.r.clics >= U.landingClicsMinimos && porClic >= U.landingCtr && conv < U.landingConversion) {
      s.push({ clave: `landing_floja:${c.id}`, tipo: "landing_floja", severidad: "media", positiva: false, titulo: `${c.nombre}: el anuncio atrae pero la landing no convierte`, detalle: `CTR ${porClic.toFixed(1)} % (bueno) y solo ${conv.toFixed(1)} % de las visitas compran.`, accion: "Revisar la landing: oferta, velocidad, precio o confianza.", objeto: { tipo: "campana", id: c.id }, gasto });
    }
  }

  // A nivel de anuncio (23 nov 2026, escalera del documento «Métrica» de Oferfy, ver `decision-anuncio.ts`): se apaga el que ya pasó de $12 sin una venta (sin importar su CTR ni su conversión) o no logró bajar el CPA a $12 con
  // $25; con más razón si su campaña va por debajo del tope (le quita presupuesto). La propuesta dice cuál apagar y con cuál ángulo sustituirlo: el del anuncio de la misma campaña que sí vende dentro del tope.
  const activas = new Map(e.campanas.filter((x) => x.activa).map((x) => [x.id, x]));
  const todosAnuncios = e.anuncios ?? [];
  const decisiones = decisionesDeAnuncios(todosAnuncios, e.campanas);
  for (const a of todosAnuncios) {
    const d = decisiones.get(a.id);
    const c = activas.get(a.campanaId);
    if (!d || !c) continue;
    const etiqueta = a.numero ?? a.nombre;
    if (d.decision === "cortar") {
      const costoCampana = cpa(c.r);
      const campanaVaBien = costoCampana !== null && costoCampana <= c.tope;
      const ganador = todosAnuncios
        .filter((x) => x.campanaId === a.campanaId && x.id !== a.id && x.r.compras > 0 && (cpa(x.r) ?? Infinity) <= c.tope)
        .sort((x, y) => (cpa(x.r) ?? Infinity) - (cpa(y.r) ?? Infinity))[0];
      const sustituir = ganador
        ? ` y sustituirlo con anuncios ${ganador.angulo ? `del ángulo «${ganador.angulo}» ` : ""}como ${ganador.numero ?? ganador.nombre} (CPA ${dolares(cpa(ganador.r) ?? 0)})`
        : " y probar otro ángulo";
      s.push({
        clave: `anuncio_apagar:${a.id}`, tipo: "anuncio_apagar", severidad: campanaVaBien ? "alta" : "media", positiva: false,
        titulo: `${c.nombre}: apagar ${etiqueta} (${dolares(a.r.gasto)} gastados${a.r.compras === 0 ? " sin ventas" : ""})`,
        detalle: `${d.motivo}${campanaVaBien ? ` La campaña va bien (CPA ${dolares(costoCampana ?? 0)}, tope ${dolares(c.tope)}): este anuncio le está quitando presupuesto.` : ""}`,
        accion: `Apagar ${etiqueta}${sustituir}.`,
        objeto: { tipo: "campana", id: c.id }, gasto: a.r.gasto,
      });
    } else if (d.decision === "rotar") {
      s.push({ clave: `anuncio_rotar:${a.id}`, tipo: "anuncio_rotar", severidad: "media", positiva: false, titulo: `${c.nombre}: ${NOMBRE_DECISION.rotar.toLowerCase()} de ${etiqueta}`, detalle: d.motivo, accion: `Rotar el gancho de ${etiqueta}: 2 o 3 variantes con otros primeros 3 segundos.`, objeto: { tipo: "campana", id: c.id }, gasto: a.r.gasto });
    } else if (d.decision === "rebalancear") {
      s.push({ clave: `anuncio_rebalancear:${a.id}`, tipo: "anuncio_rebalancear", severidad: "info", positiva: false, titulo: `${c.nombre}: ${etiqueta} se come la CBO (opcional)`, detalle: d.motivo, accion: `Apagar ${etiqueta} un rato para que la CBO reparta el presupuesto.`, objeto: { tipo: "campana", id: c.id }, gasto: a.r.gasto });
    }
  }

  for (const v of e.videos) {
    const h = hookRate(v.r);
    const costo = cpa(v.r);
    if (confiable(v.r) && h !== null && h >= U.hookBueno && costo !== null && costo <= v.tope && v.campanas <= 1) {
      s.push({ clave: `video_ganador:${v.id}`, tipo: "video_ganador", severidad: "media", positiva: true, titulo: `Video «${v.nombre}»: gana y solo se usa en una campaña`, detalle: `Hook ${h.toFixed(0)} % y CPA ${dolares(costo)} (tope ${dolares(v.tope)}) con ${dolares(v.r.gasto)} gastados.`, accion: "Usarlo en otras campañas o probar su ángulo con otro producto.", objeto: { tipo: "video", id: v.id }, gasto: v.r.gasto });
    } else if (v.r.gasto >= GASTO_MINIMO_CONFIABLE && h !== null && h < U.hookMalo) {
      s.push({ clave: `video_hook_bajo:${v.id}`, tipo: "video_hook_bajo", severidad: "media", positiva: false, titulo: `Video «${v.nombre}»: casi nadie pasa los primeros 3 segundos`, detalle: `Hook ${h.toFixed(0)} % con ${dolares(v.r.gasto)} gastados (lo bueno es sobre ${U.hookBueno} %).`, accion: "Cambiar la apertura del video o dejar de usarlo.", objeto: { tipo: "video", id: v.id }, gasto: v.r.gasto });
    }
  }

  // El ángulo no cuenta: se lee de cada video (18 nov 2026), no del nombre de la campaña.
  const sinEtiqueta = e.campanas.filter((c) => c.activa && faltanEtiquetas(c).length > 0);
  if (sinEtiqueta.length)
    s.push({ clave: "etiquetas_faltan:cuenta", tipo: "etiquetas_faltan", severidad: "info", positiva: false, titulo: `${sinEtiqueta.length} ${sinEtiqueta.length === 1 ? "campaña activa sin" : "campañas activas sin"} producto o etapa`, detalle: "Sin el producto no se sabe contra qué CPA tope se mide, y sin la etapa no entra al análisis de «Qué funciona». Salen solas si el nombre sigue la regla (PAÍS | Producto | CBO | Puja | T).", accion: "Completarlas en la ficha de cada campaña (se abren al pulsar).", objeto: { tipo: "cuenta", id: "todas" }, gasto: sinEtiqueta.reduce((t, c) => t + c.r.gasto, 0) });

  return s.sort((a, b) => ORDEN[a.severidad] - ORDEN[b.severidad] || b.gasto - a.gasto);
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
