// Dónde vende el cliente de un chat (29 oct 2026, pedido de Alcides: la atención va a recibir chats de Panamá, Costa Rica y México). **No sale
// del prefijo del WhatsApp**: alguien con número de Colombia puede vender en Costa Rica. Sale del CRM: sus cuentas vinculadas (de los pedidos
// importados) y lo que el equipo puso a mano (`dropshipper_vende_en`, migración 0193). Lógica pura, con prueba.
import { nombrePais } from "@/lib/paises-mundo";

export { nombrePais };

/** Una plataforma en un país: «Dropi» en «PA». `manual` = lo puso el equipo (se puede quitar); si no, sale de una cuenta vinculada. */
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

/** Dónde vende, sin repetir: primero lo de las cuentas vinculadas y luego lo puesto a mano. Ordenado por país y plataforma. */
export function dondeVende(cuentas: readonly { plataforma: string | null; pais: string | null }[], manuales: readonly { plataforma: string; pais: string }[]): VendeEn[] {
  const vistos = new Map<string, VendeEn>();
  for (const c of cuentas) if (c.plataforma && c.pais) vistos.set(`${c.plataforma}|${c.pais}`, { plataforma: c.plataforma, pais: c.pais, manual: false });
  for (const m of manuales) if (!vistos.has(`${m.plataforma}|${m.pais}`)) vistos.set(`${m.plataforma}|${m.pais}`, { plataforma: m.plataforma, pais: m.pais, manual: true });
  return [...vistos.values()].sort((a, b) => a.pais.localeCompare(b.pais) || a.plataforma.localeCompare(b.plataforma, "es"));
}

/** Los países donde vende (sin repetir): los de su ficha del CRM y los de dónde vende. */
export function paisesDondeVende(paisesDropshipper: readonly (string | null)[], vende: readonly { pais: string }[]): string[] {
  return [...new Set([...paisesDropshipper, ...vende.map((v) => v.pais)].filter((p): p is string => !!p && /^[A-Z]{2}$/.test(p)))];
}
