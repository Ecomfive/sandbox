"use client";

import { useEffect, useState } from "react";
import { PortalChin, type DatosPortalChin } from "@/app/proveedor/portal-chin";
import { IdiomaProveedor } from "@/components/proveedor/idioma-contexto";
import { Pestanas, botonNormal, botonPrincipal } from "@/components/proveedor/piezas-proveedor";
import { Ventana } from "@/components/ui/ventana";
import type { CambioRegistro } from "@/components/proveedor/registro-pagos";
import type { FilaRegistro } from "@/lib/proveedor/registro-pagos";
import type { ResumenPagos } from "@/lib/proveedor/resumen-pagos";
import { CrearCuentaProveedor, CuentasProveedor, type CuentaPortal } from "./cuenta-proveedor";
import { PagosEcomfive } from "./pagos-ecomfive";

type Vista = "tablero" | "pagos";

/**
 * Compras › Tablero de Shen Zhen: su portal tal como lo ve él (en español y solo para ver) y «Pagos a Shen Zhen» (el cumplimiento y su Registro
 * de pagos, solo para ver). Un administrador ve además «Cuenta de Shen Zhen» (las cuentas con las que entra a su portal) y, a su lado, «Crear
 * cuenta» para darle acceso a otra persona; cada uno se abre en una ventana.
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
    /** Puede cambiar celdas del Registro de pagos (modificar Compras). */
    editable: boolean;
    cambios: CambioRegistro[];
  } | null;
  traducciones: Record<string, string>;
  /** Solo para un administrador: las cuentas con las que el proveedor entra a su portal. */
  cuentaPortal: { cuentas: CuentaPortal[]; entrada: string } | null;
  vistaInicial: Vista;
}) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const [ventanaCuenta, setVentanaCuenta] = useState<"ver" | "crear" | null>(null);
  const [cuentas, setCuentas] = useState(cuentaPortal?.cuentas ?? []);
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={botonNormal}
                onClick={() => setVentanaCuenta("ver")}
              >
                Cuenta de {nombre}
                {cuentas.length > 1 ? ` (${cuentas.length})` : ""}
              </button>
              <button
                type="button"
                className={botonPrincipal}
                onClick={() => setVentanaCuenta("crear")}
              >
                Crear cuenta
              </button>
            </div>
          )}
        </div>

        {vista === "pagos" && pagos ? (
          <PagosEcomfive nombre={nombre} resumen={pagos.resumen} filas={pagos.filas} cambios={pagos.cambios} editable={pagos.editable} />
        ) : (
          <PortalChin {...tablero} idioma="es" soloLectura />
        )}
      </div>

      {cuentaPortal && ventanaCuenta === "ver" && (
        <Ventana
          abierto
          alCerrar={() => setVentanaCuenta(null)}
          ancho="lg"
          titulo={`Cuenta de ${nombre}`}
        >
          <div className="flex flex-col gap-4 p-4">
            <CuentasProveedor
              proveedor={proveedor}
              cuentas={cuentas}
              entrada={cuentaPortal.entrada}
              alCambiar={(c) =>
                setCuentas((todas) => todas.map((x) => (x.id === c.id ? c : x)))
              }
            />
          </div>
        </Ventana>
      )}

      {cuentaPortal && ventanaCuenta === "crear" && (
        <Ventana
          abierto
          alCerrar={() => setVentanaCuenta(null)}
          ancho="md"
          titulo={`Crear cuenta para ${nombre}`}
        >
          <div className="p-4">
            <CrearCuentaProveedor
              proveedor={proveedor}
              entrada={cuentaPortal.entrada}
              alCrear={(c) => setCuentas((todas) => [...todas, c])}
              alTerminar={() => setVentanaCuenta(null)}
            />
          </div>
        </Ventana>
      )}
    </IdiomaProveedor>
  );
}
