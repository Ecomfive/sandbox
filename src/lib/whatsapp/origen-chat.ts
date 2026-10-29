// Dónde vende y por dónde compra el cliente de un chat (29 oct 2026, pedido de Alcides: la atención va a recibir chats de
// Panamá, Costa Rica y México). **No sale del prefijo del WhatsApp**: alguien con número de Colombia puede vender en Costa Rica. Sale del
// CRM: los países de su dropshipper y los de sus cuentas de plataforma. Lógica pura, con prueba.
import { nombrePais } from "@/lib/paises-mundo";

export { nombrePais };

/** Los países donde vende (códigos ISO, sin repetir): los de su ficha del CRM y los de sus cuentas de plataforma. */
export function paisesDondeVende(paisesDropshipper: readonly (string | null)[], cuentas: readonly { pais: string | null }[]): string[] {
  return [...new Set([...paisesDropshipper, ...cuentas.map((c) => c.pais)].filter((p): p is string => !!p && /^[A-Z]{2}$/.test(p)))];
}

/** Por dónde compra el cliente: las plataformas de sus cuentas, sin repetir («Dropi», «Shopify»). Los países van aparte, en «Vende en». */
export function compraEn(cuentas: readonly { plataforma: string | null }[]): string[] {
  return [...new Set(cuentas.map((c) => c.plataforma).filter((p): p is string => !!p))];
}
