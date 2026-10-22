"use client";

import { useEffect, useState } from "react";
import { TONO, dinero, fecha } from "@/components/proveedor/piezas-proveedor";
import { Badge } from "@/components/ui/badge";
import { Seccion } from "@/components/ui/seccion-ficha";
import { GastoIcon } from "@/lib/nav-icons";
import { obtenerPagosProveedorCompra, type PagosProveedorCompra } from "./pagos-proveedor-compra-actions";

/** «Pagos a Chin» en la ficha de una compra: solo lectura (se avisa y se confirma en Portal del proveedor › Pagos). */
export function PagosProveedorCompraBloque({ compraId }: { compraId: string }) {
  const [datos, setDatos] = useState<PagosProveedorCompra | null>(null);
  useEffect(() => {
    let vigente = true;
    obtenerPagosProveedorCompra(compraId)
      .then((r) => vigente && setDatos(r))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [compraId]);
  if (!datos) return null;
  return (
    <div className="px-5">
      <Seccion icono={GastoIcon} titulo={`Pagos a ${datos.proveedor}`}>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-medium">Cuota</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Monto</th>
              <th scope="col" className="py-1 pr-3 font-medium">Vence</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Pagado</th>
              <th scope="col" className="py-1 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {datos.cuotas.map((c) => (
              <tr key={c.cuota} className="border-t border-border">
                <td className="py-1.5 pr-3">{c.cuota === "anticipo" ? "Anticipo" : "Saldo"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{dinero(c.monto, 2)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{c.vence ? fecha(c.vence) : "Al llegar"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {c.pagado ? dinero(c.pagado, 2) : "—"}
                  {c.fechaPago && <span className="block text-xs text-muted-foreground">{fecha(c.fechaPago)}</span>}
                </td>
                <td className="py-1.5">{c.avisado ? <Badge tone="info">Avisado</Badge> : <Badge tone={TONO[c.estado.tono]}>{c.estado.texto}</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="m-0 mt-2 text-xs text-muted-foreground">Se avisan y se confirman en Portal del proveedor › Pagos.</p>
      </Seccion>
    </div>
  );
}
