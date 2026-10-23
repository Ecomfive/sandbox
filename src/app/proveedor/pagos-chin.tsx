"use client";

import { useIdioma } from "@/components/proveedor/idioma-contexto";
import { IndicadoresProveedor } from "@/components/proveedor/pagos-proveedor";
import { RegistroPagos } from "@/components/proveedor/registro-pagos";
import type { FilaRegistro } from "@/lib/proveedor/registro-pagos";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { anotarLlegadaProveedor, anotarPagoProveedor, quitarPagoProveedor } from "./actions";

const ACCIONES = { anotarPago: anotarPagoProveedor, quitarPago: quitarPagoProveedor, anotarLlegada: anotarLlegadaProveedor };

/**
 * «Pagos» del portal de Chin: el cumplimiento y su «Registro de pagos» (las columnas de su hoja «payment record»). Desde el 23 oct 2026
 * el proveedor anota él mismo cada pago recibido y su fecha de llegada (Ecomfive le manda el comprobante por privado). Con
 * `soloLectura` (Ecomfive) se ve igual, sin anotar.
 */
export function PagosChin({ resumen, filas, soloLectura = false }: { resumen: ResumenPagos; filas: FilaRegistro[]; soloLectura?: boolean }) {
  const { t } = useIdioma();
  return (
    <>
      <IndicadoresProveedor r={resumen} />
      <RegistroPagos filas={filas} acciones={soloLectura ? undefined : ACCIONES} pista={soloLectura ? t.registroPistaEcomfive : t.registroPista} />
    </>
  );
}
