// Atención al cliente con el «Manual de gestión de pedidos en Shopify — Nueva estructura ATC» (21 nov 2026) y la reunión con Beatriz (23 nov 2026;
// pedido de Hernán, 24 nov: «el trabajo de los asesores se va a llevar desde el sistema para modificar en Shopify»). Las reglas del manual, sin base ni
// Shopify, para que el sistema no deje cometer los errores que cuestan dinero (anular sin motivo, borrar la zona al anular, dos motivos, inventar
// etiquetas, liberar sin confirmar). Con prueba en `gestion-atc.test.ts`.
//
// Un pedido lleva siempre su zona y, solo si se anula, UN motivo. Mientras tenga «por confirmar datos» o «novedad», despacho no lo prepara.

/** Las etiquetas de control del manual (escritas exactamente así en Shopify). */
export const ETIQUETA_POR_CONFIRMAR = "por confirmar datos";
export const ETIQUETA_NOVEDAD = "novedad";
export const ETIQUETA_ACREDITADO = "acreditado";

/** Las zonas de cada país: Panamá, del manual; Costa Rica, las de Nuvo CR (las mismas de la confirmación con IA). */
export const ZONAS_ATC: Record<string, { etiqueta: string; nombre: string; envio: string }[]> = {
  PA: [
    { etiqueta: "CIUDAD", nombre: "Ciudad", envio: "Reparto local" },
    { etiqueta: "INTERIOR/SERVIENTREGA", nombre: "Interior", envio: "Servientrega (a domicilio o retiro en agencia)" },
  ],
  CR: [
    { etiqueta: "CIUDAD-GAM", nombre: "Ciudad (GAM)", envio: "Reparto local" },
    { etiqueta: "INTERIOR-ZONAS-ALEJADAS", nombre: "Zonas alejadas", envio: "Transportadora" },
  ],
};

export interface MotivoAnulacion {
  etiqueta: string;
  /** Cuándo se usa, en palabras del manual. */
  cuando: string;
  /** El paso del árbol de preguntas del manual: se baja por las preguntas y se detiene en el primer sí. */
  pregunta: string;
  /** Solo la usa supervisión (la coordinadora), no la asesora. */
  supervision?: boolean;
}

/** Los 12 motivos del manual, en el orden del árbol, más MOT-TIENDA-NO-GESTIONA (solo supervisión). No se crea ninguna otra. */
export const MOTIVOS_ANULACION: MotivoAnulacion[] = [
  { etiqueta: "MOT-CLIENTE-DUPLICA", pregunta: "¿El pedido ya existe?", cuando: "El cliente lo cargó dos veces" },
  { etiqueta: "MOT-TIENDA-REEMPLAZA", pregunta: "¿El pedido ya existe?", cuando: "Lo reemitimos corregido" },
  { etiqueta: "MOT-TIENDA-SIN-STOCK", pregunta: "¿No había inventario?", cuando: "No había inventario" },
  { etiqueta: "MOT-CLIENTE-BLOQUEADO", pregunta: "¿El cliente está en lista negra?", cuando: "Cliente en lista negra" },
  { etiqueta: "MOT-TRANSP-SIN-COBERTURA", pregunta: "¿El courier salió y no logró entregar?", cuando: "El courier no cubre o no entra a la zona" },
  { etiqueta: "MOT-TRANSP-NO-ENTREGA", pregunta: "¿El courier salió y no logró entregar?", cuando: "El courier no pudo entregar por otra causa (ni siquiera pudo llegar)" },
  { etiqueta: "MOT-CLIENTE-DATOS-ERRADOS", pregunta: "¿El teléfono o la dirección están mal?", cuando: "Teléfono o dirección mal o incompletos (el número no existe)" },
  { etiqueta: "MOT-CLIENTE-NO-CONTESTA", pregunta: "¿Nunca respondió?", cuando: "Nunca respondió" },
  { etiqueta: "MOT-CLIENTE-SIN-DINERO", pregunta: "Habló y dijo que no", cuando: "Lo quiere pero no tiene el efectivo (se reprograma, no se pierde)" },
  { etiqueta: "MOT-CLIENTE-RECHAZA-PRECIO", pregunta: "Habló y dijo que no", cuando: "Está caro o lo vio más barato" },
  { etiqueta: "MOT-CLIENTE-RECHAZA-PRODUCTO", pregunta: "Habló y dijo que no", cuando: "No era el producto que esperaba" },
  { etiqueta: "MOT-CLIENTE-SE-ARREPIENTE", pregunta: "Habló y dijo que no", cuando: "Ya no lo quiere, sin razón (también si el courier llegó y no recibió)" },
  { etiqueta: "MOT-TIENDA-NO-GESTIONA", pregunta: "Supervisión", cuando: "Nadie lo atendió a tiempo", supervision: true },
];

const clave = (t: string) => t.toLocaleLowerCase("es").replace(/\s+/g, " ").trim();
const ES_MOTIVO = /^mot-/i;
const ES_CONFIRMADA = /^confirmad[ao]$/i;
const ZONA_CUALQUIERA = /^(ciudad|interior)([-/].*)?$/i;

/** La zona del pedido según el manual (la etiqueta tal cual), o null. */
export function zonaAtc(etiquetas: string[]): string | null {
  return etiquetas.find((e) => ZONA_CUALQUIERA.test(e.trim())) ?? null;
}

/** El motivo de anulación del pedido (MOT-…), o null. */
export function motivoAtc(etiquetas: string[]): string | null {
  return etiquetas.find((e) => ES_MOTIVO.test(e.trim())) ?? null;
}

const tiene = (etiquetas: string[], t: string) => etiquetas.some((e) => clave(e) === clave(t));
export const porConfirmar = (etiquetas: string[]) => tiene(etiquetas, ETIQUETA_POR_CONFIRMAR);
export const conNovedad = (etiquetas: string[]) => tiene(etiquetas, ETIQUETA_NOVEDAD);

/**
 * ¿La asesora ya confirmó el pedido? Con la zona y sin «por confirmar datos» ni «novedad» (el manual), o con «Confirmada» (como se trabajaba antes del
 * 24 nov 2026, y lo que pone el bot).
 */
export function confirmadoAtc(etiquetas: string[]): boolean {
  if (porConfirmar(etiquetas) || conNovedad(etiquetas)) return false;
  return !!zonaAtc(etiquetas) || etiquetas.some((e) => ES_CONFIRMADA.test(e.trim()));
}

export type AccionAtc = "confirmar" | "novedad" | "anular";

/** Lo que una acción agrega y quita en Shopify, o el error en palabras del manual. */
export type PlanAtc = { agregar: string[]; quitar: string[] } | { error: string };

/**
 * Cada botón de la ficha, como lo pide el manual:
 *  - confirmar: quita «por confirmar datos», «novedad», la «confirmada» del bot y otra zona; pone la zona elegida;
 *  - novedad: quita la zona y «por confirmar datos»; pone «novedad» (la espera no se puede volver a poner);
 *  - anular: deja la zona (si no tiene, la elegida) y pone UN motivo; quita «por confirmar datos», «novedad» y cualquier otro motivo.
 */
export function planAtc(accion: AccionAtc, actuales: string[], datos: { zona?: string | null; motivo?: string | null; codigoPais: string; supervision?: boolean }): PlanAtc {
  const zonas = (ZONAS_ATC[datos.codigoPais] ?? ZONAS_ATC.PA).map((z) => z.etiqueta);
  const zonaActual = zonaAtc(actuales);
  const quitarSi = (pred: (e: string) => boolean) => actuales.filter(pred);
  const control = (e: string) => clave(e) === clave(ETIQUETA_POR_CONFIRMAR) || clave(e) === clave(ETIQUETA_NOVEDAD);

  if (accion === "confirmar") {
    const zona = zonas.find((z) => clave(z) === clave(datos.zona ?? ""));
    if (!zona) return { error: "Elige la zona del pedido: sin zona, despacho no lo prepara." };
    if (motivoAtc(actuales)) return { error: "El pedido tiene un motivo de anulación: está anulado." };
    return {
      agregar: [zona],
      quitar: quitarSi((e) => control(e) || ES_CONFIRMADA.test(e.trim()) || (ZONA_CUALQUIERA.test(e.trim()) && clave(e) !== clave(zona))),
    };
  }
  if (accion === "novedad") {
    if (motivoAtc(actuales)) return { error: "El pedido tiene un motivo de anulación: está anulado." };
    return { agregar: [ETIQUETA_NOVEDAD], quitar: quitarSi((e) => clave(e) === clave(ETIQUETA_POR_CONFIRMAR) || ZONA_CUALQUIERA.test(e.trim()) || ES_CONFIRMADA.test(e.trim())) };
  }
  const motivo = MOTIVOS_ANULACION.find((m) => clave(m.etiqueta) === clave(datos.motivo ?? ""));
  if (!motivo) return { error: "Elige un motivo: anular sin motivo es una pérdida que nadie puede explicar." };
  if (motivo.supervision && !datos.supervision) return { error: "MOT-TIENDA-NO-GESTIONA solo lo pone la coordinadora." };
  const zona = zonaActual ?? zonas.find((z) => clave(z) === clave(datos.zona ?? ""));
  if (!zona) return { error: "Elige la zona: al anular la zona se deja (sin ella el pedido sale del cálculo de costos y del flete)." };
  return {
    agregar: zonaActual ? [motivo.etiqueta] : [zona, motivo.etiqueta],
    quitar: quitarSi((e) => control(e) || (ES_MOTIVO.test(e.trim()) && clave(e) !== clave(motivo.etiqueta))),
  };
}

/** La línea de la cronología del pedido (Notas del equipo) que deja cada botón: el manual pide decir siempre por qué. */
export function lineaCronologia(accion: AccionAtc, datos: { zona?: string | null; motivo?: string | null; nota?: string | null }): string {
  const por = datos.nota?.trim() ? ` — ${datos.nota.trim()}` : "";
  if (accion === "confirmar") return `Confirmado con el cliente · zona ${datos.zona}${por}`;
  if (accion === "novedad") return `Novedad: el cliente pidió esperar${por}`;
  return `Anulado · ${datos.motivo}${por}`;
}

// ── Las vistas del manual (en lugar de las pestañas del Sheet) y las que pidieron en la reunión.

export interface PedidoAtc {
  estado: "nuevo" | "confirmado" | "en_camino" | "entregado" | "cancelado" | "devuelto";
  etiquetas?: string[];
  /** ISO de cuando entró el pedido. */
  creado: string;
}

export interface VistaAtc {
  id: string;
  etiqueta: string;
  detalle: string;
  incluye: (p: PedidoAtc, ahora: number) => boolean;
}

const sinGestion = (et: string[]) => !zonaAtc(et) && !motivoAtc(et) && !porConfirmar(et) && !conNovedad(et) && !et.some((e) => ES_CONFIRMADA.test(e.trim()));

export const VISTAS_ATC: VistaAtc[] = [
  { id: "por-confirmar", etiqueta: "Por confirmar", detalle: "con «por confirmar datos» o sin zona: contactar al cliente", incluye: (p) => p.estado === "nuevo" && !conNovedad(p.etiquetas ?? []) },
  {
    id: "48h",
    etiqueta: "Más de 48 h sin confirmar",
    detalle: "llamar o anular",
    incluye: (p, ahora) => p.estado === "nuevo" && !conNovedad(p.etiquetas ?? []) && ahora - new Date(p.creado).getTime() > 48 * 3_600_000,
  },
  { id: "novedades", etiqueta: "Novedades", detalle: "el cliente pidió esperar", incluye: (p) => conNovedad(p.etiquetas ?? []) && !["cancelado", "entregado", "devuelto"].includes(p.estado) },
  { id: "listos", etiqueta: "Listos para despacho", detalle: "con zona y sin preparar", incluye: (p) => p.estado === "confirmado" },
  { id: "en-ruta", etiqueta: "En ruta", detalle: "preparados y sin entregar", incluye: (p) => p.estado === "en_camino" },
  { id: "sin-pagar", etiqueta: "Entregados sin acreditar", detalle: "Finanzas: falta «acreditado»", incluye: (p) => p.estado === "entregado" && !tiene(p.etiquetas ?? [], ETIQUETA_ACREDITADO) },
  { id: "anulados-sin-motivo", etiqueta: "Anulados sin motivo", detalle: "falta el motivo o la zona", incluye: (p) => (p.estado === "cancelado" || p.estado === "devuelto") && (!motivoAtc(p.etiquetas ?? []) || !zonaAtc(p.etiquetas ?? [])) },
  { id: "sin-etiqueta", etiqueta: "Sin etiqueta", detalle: "ni zona, ni control, ni motivo", incluye: (p) => !["cancelado", "entregado", "devuelto"].includes(p.estado) && sinGestion(p.etiquetas ?? []) },
];

/** La hora actual para las vistas («más de 48 h»): se lee una vez al abrir la lista. */
export const ahoraMs = () => Date.now();
