// Portal del proveedor: qué paso puede dar cada lado. Las acciones de las dos vistas (fases 2 a 4) lo comprueban en el servidor.
// Lógica pura.

import type { EtapaPortal } from "./espejo";

export type Lado = "ecomfive" | "proveedor";

interface Paso {
  lado: Lado;
  de: EtapaPortal;
  a: readonly EtapaPortal[];
}

/** Ecomfive pide la cotización desde Compras (la compra entra en «Por cotizar»): no es un paso del portal. */
export const PASOS: Readonly<Record<string, Paso>> = {
  cotizar: { lado: "proveedor", de: "por_cotizar", a: ["cotizado"] },
  // Corregir una cotización mientras Ecomfive no decide.
  recotizar: { lado: "proveedor", de: "cotizado", a: ["cotizado"] },
  decidir: { lado: "ecomfive", de: "cotizado", a: ["produccion", "descartado"] },
  // Editar la cotización ya confirmada (Ecomfive confirmó otras unidades y falta el costo de esas): sigue en producción (27 oct 2026).
  editarEnProduccion: { lado: "proveedor", de: "produccion", a: ["produccion"] },
  enviar: { lado: "proveedor", de: "produccion", a: ["enviado"] },
  llegada: { lado: "ecomfive", de: "enviado", a: ["llegado"] },
};

/** Si `lado` puede pasar un pedido de `de` a `a`. */
export function puedePasar(lado: Lado, de: EtapaPortal, a: EtapaPortal): boolean {
  return Object.values(PASOS).some((p) => p.lado === lado && p.de === de && p.a.includes(a));
}

/** Los avisos de pago los crea Ecomfive y solo el proveedor los confirma. */
export const puedeAvisarPago = (lado: Lado) => lado === "ecomfive";
export const puedeConfirmarPago = (lado: Lado) => lado === "proveedor";
