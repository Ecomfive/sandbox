"use client";

import { IndicadoresEcomfive } from "@/components/proveedor/pagos-proveedor";
import { RegistroPagos, type CambioRegistro } from "@/components/proveedor/registro-pagos";
import type { FilaRegistro } from "@/lib/proveedor/registro-pagos";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { guardarCeldaRegistroEcomfive } from "./registro-actions";

/**
 * «Pagos a Chin» (lado de Ecomfive): el cumplimiento y el «Registro de pagos» con las columnas de la hoja de Chin. Desde el 23 oct 2026
 * (decisión de Hernán) Francis y Chin cambian cualquier celda; ya no se avisan pagos desde aquí: el comprobante va por privado. Lo de
 * la tabla no toca la compra (Compras se actualiza a mano). Lo que Chin cambia llega como «Nuevo» en «Qué hacer con Chin» y a la campana.
 */
export function PagosEcomfive({ nombre, resumen, filas, cambios, editable }: { nombre: string; resumen: ResumenPagos; filas: FilaRegistro[]; cambios: CambioRegistro[]; editable: boolean }) {
  return (
    <>
      <RegistroPagos
        filas={filas}
        cambios={cambios}
        guardar={editable ? guardarCeldaRegistroEcomfive : undefined}
        pista={editable ? `Las columnas de la hoja «payment record» de ${nombre}. Toca cualquier celda para cambiarla; ${nombre} recibe el aviso.` : `Las columnas de la hoja «payment record» de ${nombre}.`}
      />
      <IndicadoresEcomfive r={resumen} />
    </>
  );
}
