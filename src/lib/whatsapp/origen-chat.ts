// Dónde vende el cliente de un chat (29 oct 2026, pedido de Alcides: la atención va a recibir chats de Panamá, Costa Rica y México). **No sale
// del prefijo del WhatsApp**: alguien con número de Colombia puede vender en Costa Rica. Sale del CRM: sus cuentas vinculadas (de los pedidos
// importados) y lo que el equipo puso a mano (`dropshipper_vende_en`, migración 0193). Lógica pura, con prueba.
import { nombrePais } from "@/lib/paises-mundo";

export { nombrePais };

/** Una plataforma en un país: «Dropi» en «PA». `manual` = lo puso el equipo; si no, sale de una cuenta vinculada. Los dos se pueden quitar. */
export interface VendeEn {
  plataforma: string;
  pais: string;
  manual: boolean;
}

/** La bandera de un país a partir de su código ISO («PA» → 🇵🇦). */
export function bandera(codigo: string): string {
  if (!/^[A-Z]{2}$/.test(codigo)) return "";
  return String.fromCodePoint(...[...codigo].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/**
 * El país de un número de WhatsApp **de la empresa** por su prefijo, cuando es de un país de la operación (31 oct 2026, pedido de Hernán: el número
 * de Costa Rica entra a Atención con su bandera sin elegirla a mano): +507 Panamá, +506 Costa Rica, +52 México; si no, null. Lo mismo hace la
 * migración 0212 al guardar el número. No sirve para el país del cliente (ver arriba).
 */
export function paisDeNumeroEmpresa(numero: string | null | undefined): string | null {
  const d = String(numero ?? "").replace(/\D/g, "");
  if (d.startsWith("507")) return "PA";
  if (d.startsWith("506")) return "CR";
  if (d.startsWith("52")) return "MX";
  return null;
}

const clave = (plataforma: string, pais: string) => `${plataforma.trim().toLowerCase()}|${pais}`;

/**
 * Dónde vende, sin repetir: lo de las cuentas vinculadas y lo puesto a mano (migraciones 0193 y 0194). Una fila `oculto` quita de la lista lo que
 * venía de una cuenta (la cuenta no se toca). Los nombres se comparan sin mayúsculas. Ordenado por país y plataforma.
 */
export function dondeVende(
  cuentas: readonly { plataforma: string | null; pais: string | null }[],
  manuales: readonly { plataforma: string; pais: string; oculto?: boolean }[],
): VendeEn[] {
  const ocultos = new Set(manuales.filter((m) => m.oculto).map((m) => clave(m.plataforma, m.pais)));
  const vistos = new Map<string, VendeEn>();
  for (const c of cuentas) {
    if (!c.plataforma || !c.pais || ocultos.has(clave(c.plataforma, c.pais))) continue;
    vistos.set(clave(c.plataforma, c.pais), { plataforma: c.plataforma, pais: c.pais, manual: false });
  }
  for (const m of manuales) {
    if (m.oculto || vistos.has(clave(m.plataforma, m.pais))) continue;
    vistos.set(clave(m.plataforma, m.pais), { plataforma: m.plataforma, pais: m.pais, manual: true });
  }
  return [...vistos.values()].sort((a, b) => a.pais.localeCompare(b.pais) || a.plataforma.localeCompare(b.plataforma, "es"));
}

/** Los países donde vende (sin repetir): los de su ficha del CRM y los de dónde vende. */
export function paisesDondeVende(paisesDropshipper: readonly (string | null)[], vende: readonly { pais: string }[]): string[] {
  return [...new Set([...paisesDropshipper, ...vende.map((v) => v.pais)].filter((p): p is string => !!p && /^[A-Z]{2}$/.test(p)))];
}
