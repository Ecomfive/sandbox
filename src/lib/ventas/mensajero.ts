// Web app del mensajero: reglas puras. El mensajero entra con un enlace secreto (sin cuenta); solo puede mover SUS órdenes en ruta.
import { createHash, randomBytes } from "node:crypto";
import { MOTIVOS_FALLO } from "./operacion";
import type { CambioFase } from "./mover-fase";

export const LARGO_TOKEN = 32;
const FORMA_TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** Código nuevo: 24 bytes al azar en base64url (32 caracteres, 192 bits). */
export const nuevoToken = () => randomBytes(24).toString("base64url");
export const tokenPlausible = (t: unknown): t is string => typeof t === "string" && FORMA_TOKEN.test(t);
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export type FaseMensajero = "entregada" | "fallida";

/** Qué puede hacer con una orden: solo si está en ruta y es suya. */
export function accionesDelMensajero(orden: { fase: string | null; repartidor_id: string | null }, repartidorId: string): FaseMensajero[] {
  return orden.fase === "despachada" && orden.repartidor_id === repartidorId ? ["entregada", "fallida"] : [];
}

const t = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/**
 * Del formulario del mensajero solo pasa lo que le toca: lo cobrado, quién recibió, el código de entrega, el motivo del fallo y la
 * reprogramación. Nunca cambia a quién va la orden ni su guía, aunque lo mande.
 */
export function cambioDeMensajero(fase: FaseMensajero, d: Record<string, unknown>): CambioFase {
  if (fase === "entregada") {
    const cobrado = d.cobrado === null || d.cobrado === undefined || d.cobrado === "" ? null : Number(d.cobrado);
    return {
      cobrado: cobrado !== null && Number.isFinite(cobrado) ? cobrado : null,
      motivoDiferencia: t(d.motivoDiferencia, 200),
      recibeNombre: t(d.recibeNombre, 80),
      recibeDocumento: t(d.recibeDocumento, 40),
      codigo: t(d.codigo, 20),
    };
  }
  const codigo = MOTIVOS_FALLO.find((m) => m.codigo === d.motivoCodigo)?.codigo ?? null;
  const rep = typeof d.reprogramadaPara === "string" && Number.isFinite(Date.parse(d.reprogramadaPara)) ? d.reprogramadaPara : null;
  return { motivoCodigo: codigo, motivo: t(d.motivo, 300), reprogramadaPara: rep };
}
