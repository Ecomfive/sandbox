"use client";

import { IndicadoresEcomfive } from "@/components/proveedor/pagos-proveedor";
import { RegistroPagos } from "@/components/proveedor/registro-pagos";
import type { FilaRegistro } from "@/lib/proveedor/registro-pagos";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";

/**
 * «Pagos a Chin» (lado de Ecomfive): el cumplimiento y el «Registro de pagos» de Chin, solo para ver. Desde el 23 oct 2026 ya no se
 * avisan pagos desde aquí (decisión de Hernán): el comprobante va por privado, Chin anota el pago en su portal y Ecomfive actualiza
 * Compras a mano. Lo que Chin anota llega como «Nuevo» en «Qué hacer con Chin» y a la campana.
 */
export function PagosEcomfive({ nombre, resumen, filas }: { nombre: string; resumen: ResumenPagos; filas: FilaRegistro[] }) {
  return (
    <>
      <IndicadoresEcomfive r={resumen} />
      <RegistroPagos filas={filas} pista={`Lo anota ${nombre} desde su portal; aquí es solo para ver`} />
    </>
  );
}
