// Gestión de tienda › Cambios y reembolsos (16 nov 2026, migración 0972): el tablero «CAMBIOS Y REEMBOLSOS PANAMA» de Monday dentro del sistema. Aquí
// están sus etiquetas con los colores de Monday, sus tres grupos y sus automatizaciones como reglas puras (sin base ni React):
//   * Estado → grupo: Hecho va a Realizados, Esperando Comprobante de Reembolso a Asuntos de Finanzas, Pagado Enviar al Cliente a Cambios/Retiros/…
//   * Hecho pone «Notificar al cliente» en Notificar con la fecha de hoy, y avisa a quien la creó (reembolso: mandar el comprobante; cambio: el envío).
//   * Asignado avisa al responsable. Cada mañana: Asignado con la Fecha para mañana o antes pasa a Estancado; Notificar de ayer o antes pasa a Estancado.
// Monday tenía estas reglas, pero 12 ya no corrían: dependían de la columna «Tipo», que se borró del tablero.

import { normalizar } from "@/lib/finanzas/clasificacion";
import type { TipoPostventa } from "@/lib/monday/postventa";

export interface Etiqueta {
  nombre: string;
  color: string;
}

export const ESTADOS: Etiqueta[] = [
  { nombre: "En Proceso", color: "#fdab3d" },
  { nombre: "Asignado", color: "#784bd1" },
  { nombre: "Esperando Revisión", color: "#579bfc" },
  { nombre: "Esperando Comprobante de Reembolso", color: "#ff007f" },
  { nombre: "Pagado Enviar al Cliente", color: "#007eb5" },
  { nombre: "Estancado", color: "#df2f4a" },
  { nombre: "No se retira aprobado por Administración", color: "#175a63" },
  { nombre: "Hecho", color: "#00c875" },
];

export const NOTIFICAR: Etiqueta[] = [
  { nombre: "Notificar", color: "#784bd1" },
  { nombre: "En proceso", color: "#fdab3d" },
  { nombre: "Estancado", color: "#df2f4a" },
  { nombre: "Hecho", color: "#00c875" },
];

export const TIENDAS: Etiqueta[] = [
  { nombre: "KENKU", color: "#4eccc6" },
  { nombre: "OFERFY", color: "#00c875" },
  { nombre: "NUVO", color: "#333333" },
  { nombre: "CLICKSI", color: "#ffcb00" },
];

/** «Responsable» (25 nov 2026): quién causó la solicitud. Cliente = fue su decisión; Tienda = la tienda envió mal el producto. */
export const CAUSAS: Etiqueta[] = [
  { nombre: "Cliente", color: "#a25ddc" },
  { nombre: "Tienda", color: "#e2445c" },
];

export const TIPOS: (Etiqueta & { clave: TipoPostventa })[] = [
  { clave: "cambio", nombre: "Cambio", color: "#5559df" },
  { clave: "reembolso", nombre: "Reembolso", color: "#784bd1" },
  { clave: "retiro", nombre: "Retiro", color: "#037f4c" },
  { clave: "complemento", nombre: "Complemento", color: "#ffadad" },
  { clave: "faltante", nombre: "Faltante", color: "#ff6d3b" },
  { clave: "garantia", nombre: "Garantía", color: "#9d50dd" },
  { clave: "envio", nombre: "Envío", color: "#579bfc" },
];

export const GRUPO_FINANZAS = "Asuntos de Finanzas";
export const GRUPO_ABIERTOS = "Cambios/Retiros/Reembolsos/Complementos";
export const GRUPO_REALIZADOS = "Realizados";
export const GRUPOS: Etiqueta[] = [
  { nombre: GRUPO_FINANZAS, color: "#0086c0" },
  { nombre: GRUPO_ABIERTOS, color: "#579bfc" },
  { nombre: GRUPO_REALIZADOS, color: "#00c875" },
];

const igual = (a: string | null | undefined, b: string) => normalizar(a ?? "") === normalizar(b);

/** El nombre de la lista que coincide sin tildes ni mayúsculas («No se retira aprovado por Administracion» de Monday incluido); si no, el texto. */
export function etiquetaDe(lista: Etiqueta[], texto: string | null | undefined): string | null {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const n = normalizar(t).replace("APROVADO", "APROBADO");
  return lista.find((e) => normalizar(e.nombre) === n)?.nombre ?? t;
}

/** El grupo de un texto de Monday; el de abiertos si no se reconoce. */
export function grupoDe(texto: string | null | undefined): string {
  const n = normalizar(texto ?? "");
  if (/FINANZ/.test(n)) return GRUPO_FINANZAS;
  if (/REALIZAD/.test(n)) return GRUPO_REALIZADOS;
  return GRUPO_ABIERTOS;
}

export const colorDe = (lista: Etiqueta[], nombre: string | null | undefined): string | null => (nombre ? (lista.find((e) => e.nombre === nombre)?.color ?? "#9ca3af") : null);

/** El grupo al que mueve un estado (automatización de Monday), o null si no mueve. */
export function grupoPorEstado(estado: string | null | undefined): string | null {
  if (igual(estado, "Hecho")) return GRUPO_REALIZADOS;
  if (igual(estado, "Esperando Comprobante de Reembolso")) return GRUPO_FINANZAS;
  if (igual(estado, "Pagado Enviar al Cliente")) return GRUPO_ABIERTOS;
  return null;
}

export type Destino = "responsable" | "creador";
export interface Aviso {
  a: Destino;
  titulo: string;
  texto: string;
}

export interface CasoRegla {
  nombre: string;
  tipos: string[];
  grupo: string | null;
  seguimiento?: string | null;
}

/**
 * Lo que pasa al cambiar el Estado (las automatizaciones de Monday): los datos que cambian solos y los avisos. `hoy` es AAAA-MM-DD.
 */
export function efectosDeEstado(caso: CasoRegla, nuevo: string, hoy: string): { set: Record<string, unknown>; avisos: Aviso[]; borrarCuenta: boolean } {
  const set: Record<string, unknown> = { estado: nuevo };
  const avisos: Aviso[] = [];
  const grupo = grupoPorEstado(nuevo);
  if (grupo && grupo !== caso.grupo) set.grupo = grupo;
  const reembolso = caso.tipos.includes("reembolso");
  const accion = reembolso ? "reembolso" : caso.tipos.includes("cambio") ? "cambio" : (TIPOS.find((t) => caso.tipos.includes(t.clave))?.nombre.toLowerCase() ?? "trámite");
  if (igual(nuevo, "Hecho")) {
    set.notificar = "Notificar";
    set.fecha_notificacion = hoy;
    avisos.push(
      reembolso
        ? { a: "creador", titulo: `Reembolso hecho: ${caso.nombre}`, texto: "Se hizo el reembolso: revisa el comprobante y envíaselo al cliente." }
        : { a: "creador", titulo: `${accion.charAt(0).toUpperCase()}${accion.slice(1)} hecho: ${caso.nombre}`, texto: `Se hizo el ${accion}${caso.seguimiento ? `; seguimiento: ${caso.seguimiento}` : ""}. Avísale al cliente.` },
    );
  }
  if (igual(nuevo, "Asignado")) avisos.push({ a: "responsable", titulo: `Te asignaron: ${caso.nombre}`, texto: `Hay que hacer un ${accion} para este pedido. Coordínalo para mañana.` });
  if (igual(nuevo, "Esperando Comprobante de Reembolso")) avisos.push({ a: "responsable", titulo: `Falta el comprobante: ${caso.nombre}`, texto: "Sube el comprobante del reembolso en la solicitud." });
  if (igual(nuevo, "Estancado")) avisos.push({ a: "responsable", titulo: `Estancado: ${caso.nombre}`, texto: `El ${accion} está estancado. ¿Lo puedes resolver hoy?` });
  return { set, avisos, borrarCuenta: igual(nuevo, "Hecho") };
}

export interface CasoDiario {
  itemId: string;
  nombre: string;
  tipos: string[];
  estado: string | null;
  fecha: string | null;
  notificar: string | null;
  fechaNotificacion: string | null;
}

/**
 * Las reglas de cada mañana (9:00 en Monday): Asignado con la Fecha para mañana o antes → Estancado (aviso al responsable); «Notificar al cliente» en
 * Notificar desde ayer o antes → Estancado (aviso a quien la creó). `hoy` es AAAA-MM-DD.
 */
export function reglasDelDia(casos: CasoDiario[], hoy: string): { itemId: string; set: Record<string, unknown>; avisos: Aviso[]; texto: string }[] {
  const manana = new Date(Date.parse(`${hoy}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const salida: { itemId: string; set: Record<string, unknown>; avisos: Aviso[]; texto: string }[] = [];
  for (const c of casos) {
    if (igual(c.estado, "Asignado") && c.fecha && c.fecha <= manana) {
      salida.push({ itemId: c.itemId, set: { estado: "Estancado" }, avisos: [{ a: "responsable", titulo: `Estancado: ${c.nombre}`, texto: "Sigue en Asignado y la fecha es mañana o ya pasó. ¿Lo puedes hacer hoy?" }], texto: "Estado: Asignado → Estancado (regla diaria)" });
    } else if (igual(c.notificar, "Notificar") && c.fechaNotificacion && c.fechaNotificacion < hoy) {
      salida.push({ itemId: c.itemId, set: { notificar: "Estancado" }, avisos: [{ a: "creador", titulo: `Sin avisar al cliente: ${c.nombre}`, texto: "Aún no se le avisó al cliente. Por favor hazlo cuanto antes." }], texto: "Notificar al cliente: Notificar → Estancado (regla diaria)" });
    }
  }
  return salida;
}

export const esTipo = (v: unknown): v is TipoPostventa => typeof v === "string" && TIPOS.some((t) => t.clave === v);

export interface Linea {
  cantidad: number;
  producto: string;
}

export interface DatosSolicitud {
  tienda: string;
  numero: string;
  tipos: TipoPostventa[];
  retirar: Linea[];
  enviar: Linea[];
  reembolso: number | null;
  reembolsoComo: string | null;
  motivo: string;
  detalle: string | null;
  costoEnvio: number | null;
  enviaPaga: "empresa" | "cliente";
}

const NOMBRE_TIENDA: Record<string, string> = { KENKU: "Kenku", OFERFY: "Oferfy", NUVO: "Nuvo", CLICKSI: "ClickSi" };
const lineasTexto = (l: Linea[]) => l.map((x) => `${x.cantidad} × ${x.producto}`).join(", ");
const plata = (n: number) => `$${n.toFixed(2)}`;
const numeroLimpio = (n: string) => n.trim().replace(/^#\s*/, "").toUpperCase();

/** El nombre de la solicitud, como el equipo lo escribía en Monday: «Nuvo: realizar cambio al pedido #44510». */
export function nombreSolicitud(d: Pick<DatosSolicitud, "tienda" | "numero" | "tipos">): string {
  const t = (x: TipoPostventa) => d.tipos.includes(x);
  const accion = t("cambio") ? "realizar cambio" : t("reembolso") ? "realizar reembolso" : t("complemento") || t("faltante") ? "enviar complemento" : t("garantia") ? "garantía" : t("retiro") ? "retirar producto" : "enviar";
  return `${NOMBRE_TIENDA[d.tienda] ?? d.tienda}: ${accion} al pedido #${numeroLimpio(d.numero)}`;
}

/** El texto de la solicitud con el formato de siempre (el primer comentario en Monday): RETIRAR, ENTREGAR, REEMBOLSAR, Motivo y Costo del envío. */
export function textoSolicitud(d: DatosSolicitud): string {
  const lineas = [`SOLICITUD DE ${d.tipos.map((x) => TIPOS.find((t) => t.clave === x)?.nombre.toUpperCase() ?? x).join(" + ")}:`, "", `${d.tienda} #${numeroLimpio(d.numero)}`, ""];
  if (d.retirar.length) lineas.push(`RETIRAR: ${lineasTexto(d.retirar)}`);
  if (d.enviar.length) lineas.push(`ENTREGAR: ${lineasTexto(d.enviar)}`);
  if (d.reembolso !== null) lineas.push(`REEMBOLSAR: ${plata(d.reembolso)}${d.reembolsoComo ? ` (${d.reembolsoComo.toLowerCase()})` : ""}`);
  lineas.push("", `Motivo: ${[d.motivo, d.detalle].filter(Boolean).join(". ")}`);
  if (d.costoEnvio !== null) lineas.push("", `Costo del envío: ${plata(d.costoEnvio)} costeado por ${d.enviaPaga === "empresa" ? "la empresa" : "el cliente"}`);
  return lineas.join("\n");
}

/** La forma de pago de la fila en Envíos Delivery: COMPLEMENTO, CAMBIO (se entrega algo) o RETIRO (solo se retira). */
export function formaPagoDespacho(tipos: string[], conEnviar: boolean): "COMPLEMENTO" | "CAMBIO" | "RETIRO" {
  if (tipos.includes("complemento") || tipos.includes("faltante")) return "COMPLEMENTO";
  return conEnviar ? "CAMBIO" : "RETIRO";
}

/** El número para WhatsApp (wa.me) de un teléfono de Panamá: 507 + 8 dígitos; con otro código de país, tal cual. Null si no parece un teléfono. */
export function whatsappDe(telefono: string | null | undefined): string | null {
  const d = (telefono ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (d.length === 7 || d.length === 8) return `507${d}`;
  if (d.length >= 10 && d.length <= 15) return d;
  return null;
}

/**
 * El mensaje de WhatsApp para el cliente («Notificar al cliente», 25 nov 2026): qué se hizo con su pedido y, si hay, el enlace al comprobante.
 */
export function mensajeCliente(d: { cliente: string | null; tienda: string | null; numero: string | null; tipos: string[]; reembolso: number | null; enlace: string | null }): string {
  const nombre = (d.cliente ?? "").trim().split(/\s+/)[0] ?? "";
  const tienda = d.tienda ? (NOMBRE_TIENDA[d.tienda] ?? d.tienda) : null;
  const pedido = d.numero ? ` #${numeroLimpio(d.numero)}` : "";
  const t = (x: string) => d.tipos.includes(x);
  const hecho = t("reembolso")
    ? `Ya hicimos el reembolso de tu pedido${pedido}${d.reembolso !== null ? ` por ${plata(d.reembolso)}` : ""}.`
    : t("cambio")
      ? `Ya hicimos el cambio de tu pedido${pedido}.`
      : t("complemento") || t("faltante")
        ? `Ya te enviamos lo que faltaba de tu pedido${pedido}.`
        : `Ya quedó resuelta tu solicitud del pedido${pedido}.`;
  return [
    `Hola${nombre ? ` ${nombre}` : ""}, te escribimos de ${tienda ?? "la tienda"}.`,
    hecho,
    d.enlace ? `Aquí puedes ver el comprobante: ${d.enlace}` : null,
    "¡Gracias por tu paciencia!",
  ]
    .filter(Boolean)
    .join("\n\n");
}
