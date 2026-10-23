"use client";

import { useIdioma } from "@/components/proveedor/idioma-contexto";
import { IndicadoresProveedor } from "@/components/proveedor/pagos-proveedor";
import { RegistroPagos } from "@/components/proveedor/registro-pagos";
import type { FilaRegistro } from "@/lib/proveedor/registro-pagos";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { guardarCeldaRegistroProveedor } from "./actions";

/**
 * «Pagos» del portal de Chin: el cumplimiento y su «Registro de pagos» (las columnas de su hoja «payment record»). Desde el 23 oct 2026
 * el proveedor cambia cualquier celda (Ecomfive le manda el comprobante por privado y recibe el aviso). Con `soloLectura` («Lo que ve
 * Chin» en el Tablero de Chin) se ve igual, sin editar: Ecomfive edita en «Pagos a Chin».
 */
export function PagosChin({ resumen, filas, soloLectura = false }: { resumen: ResumenPagos; filas: FilaRegistro[]; soloLectura?: boolean }) {
  const { t } = useIdioma();
  return (
    <>
      <IndicadoresProveedor r={resumen} />
      <RegistroPagos filas={filas} guardar={soloLectura ? undefined : guardarCeldaRegistroProveedor} pista={soloLectura ? t.registroPistaEcomfive : t.registroPista} />
    </>
  );
}
