"use client";

import { useEffect, useState } from "react";
import { PortalChin, type DatosPortalChin } from "@/app/proveedor/portal-chin";
import { IdiomaProveedor } from "@/components/proveedor/idioma-contexto";
import { Pestanas, botonNormal } from "@/components/proveedor/piezas-proveedor";
import { Ventana } from "@/components/ui/ventana";
import type { FilaRegistro } from "@/lib/proveedor/registro-pagos";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { CuentaProveedor, type CuentaPortal } from "./cuenta-proveedor";
import { PagosEcomfive } from "./pagos-ecomfive";

type Vista = "tablero" | "pagos";

/**
 * Compras › Tablero de Chin: su portal tal como lo ve él (en español y solo para ver) y «Pagos a Chin» (el cumplimiento y su Registro
 * de pagos, solo para ver). Un administrador ve además «Cuenta de Chin», que se abre en una ventana.
 */
export function TableroChin({
  proveedor,
  tablero,
  pagos,
  traducciones,
  cuentaPortal,
  vistaInicial,
}: {
  proveedor: { id: string; nombre: string };
  tablero: DatosPortalChin;
  /** null si la persona no ve los montos de Compras o falta la migración 0127. */
  pagos: {
    resumen: ResumenPagos;
    /** Cuotas vencidas (el número de la pestaña). */
    vencidas: number;
    filas: FilaRegistro[];
  } | null;
  traducciones: Record<string, string>;
  /** Solo para un administrador: la cuenta con la que el proveedor entra a su portal. */
  cuentaPortal: { cuenta: CuentaPortal | null; entrada: string } | null;
  vistaInicial: Vista;
}) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const nombre = proveedor.nombre;

  // La vista queda en la dirección para volver a ella o compartirla (los avisos de pago de la campana llegan con ?ver=pagos).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (vista === "pagos") url.searchParams.set("ver", "pagos");
    else url.searchParams.delete("ver");
    window.history.replaceState(window.history.state, "", url);
  }, [vista]);

  const vencidas = pagos?.vencidas ?? 0;

  return (
    <IdiomaProveedor idioma="es" traducciones={traducciones}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {pagos ? (
            <div className="min-w-0 flex-1">
              <Pestanas
                etiqueta={`Tablero de ${nombre}`}
                tabs={[
                  {
                    clave: "tablero" as const,
                    titulo: `Lo que ve ${nombre}`,
                    cuenta: 0,
                  },
                  {
                    clave: "pagos" as const,
                    titulo: `Pagos a ${nombre}`,
                    cuenta: vencidas,
                    viva: true,
                  },
                ]}
                valor={vista}
                alCambiar={setVista}
              />
            </div>
          ) : (
            <span />
          )}
          {cuentaPortal && (
            <button
              type="button"
              className={botonNormal}
              onClick={() => setCuentaAbierta(true)}
            >
              Cuenta de {nombre}
            </button>
          )}
        </div>

        {vista === "pagos" && pagos ? (
          <PagosEcomfive nombre={nombre} resumen={pagos.resumen} filas={pagos.filas} />
        ) : (
          <PortalChin {...tablero} idioma="es" soloLectura />
        )}
      </div>

      {cuentaPortal && cuentaAbierta && (
        <Ventana
          abierto
          alCerrar={() => setCuentaAbierta(false)}
          ancho="lg"
          titulo={`Cuenta de ${nombre}`}
        >
          <div className="flex flex-col gap-4 p-4">
            <CuentaProveedor
              proveedor={proveedor}
              cuenta={cuentaPortal.cuenta}
              entrada={cuentaPortal.entrada}
            />
          </div>
        </Ventana>
      )}
    </IdiomaProveedor>
  );
}
