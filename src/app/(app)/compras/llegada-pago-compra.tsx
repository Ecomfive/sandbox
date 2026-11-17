"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { GastoIcon } from "@/lib/nav-icons";
import { obtenerLlegadaDePago } from "./llegada-pago-compra-actions";

/** En la ficha de una compra «07 - En Bodega»: el camino a registrar el segundo pago de su llegada (ahí se paga una por una o todas juntas con «Registrar pago total»). */
export function LlegadaDePagoBloque({ compraId }: { compraId: string }) {
  const [llegada, setLlegada] = useState<{ llegadaId: string; pagada: boolean } | null>(null);
  useEffect(() => {
    let vigente = true;
    obtenerLlegadaDePago(compraId)
      .then((r) => vigente && setLlegada(r))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [compraId]);
  if (!llegada || llegada.pagada) return null;
  return (
    <div className="px-5">
      <Seccion icono={GastoIcon} titulo="Segundo pago">
        <p className="m-0 text-[13px] text-muted-foreground">La mercancía ya está en bodega. El segundo pago se registra en la página de su llegada, solo o junto con las demás compras que llegaron.</p>
        <div>
          <Link href={`/llegadas/${llegada.llegadaId}`} className={`inline-flex min-h-9 items-center rounded-md bg-foreground px-3 text-[13px] font-semibold text-background ${anilloFoco}`}>
            Registrar el pago
          </Link>
        </div>
      </Seccion>
    </div>
  );
}
