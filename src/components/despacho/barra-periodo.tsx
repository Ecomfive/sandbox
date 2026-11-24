"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { fieldClassSm } from "@/components/ui/field";
import { MenuDesplegable, TituloGrupoMenu, claseOpcionMenu } from "@/components/ui/menu-desplegable";
import { CalendarioIcon, MasIcon } from "@/lib/nav-icons";

const botonBarra = (activo: boolean) =>
  `inline-flex min-h-9 items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium whitespace-nowrap ${activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`;

export interface OpcionPeriodo {
  etiqueta: string;
  href: string;
  activa: boolean;
}

/**
 * La barra de arriba de Despacho ciudad (24 nov 2026, pedido de despacho: menos botones sueltos, como Monday): el período en un solo botón con su menú (los
 * atajos y «Del … al …») y lo demás (hoja del día, cuentas de repartidores, archivados) en «Más».
 */
export function BarraPeriodo({ actual, opciones, desde, hasta, mas }: { actual: string; opciones: OpcionPeriodo[]; desde: string; hasta: string; mas: OpcionPeriodo[] }) {
  const router = useRouter();
  const [d, setD] = useState(desde);
  const [h, setH] = useState(hasta);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <MenuDesplegable
        etiqueta="Período"
        alineacion="izquierda"
        claseMenu="w-72"
        claseBoton={botonBarra(true)}
        contenidoBoton={
          <>
            <CalendarioIcon aria-hidden="true" className="h-4 w-4" />
            {actual}
            <span aria-hidden="true">▾</span>
          </>
        }
      >
        {(cerrar) => (
          <>
            {opciones.map((o) => (
              <Link key={o.href} href={o.href} role="menuitemradio" aria-checked={o.activa} onClick={() => cerrar()} className={`${claseOpcionMenu} ${o.activa ? "font-semibold text-primario" : ""}`}>
                {o.etiqueta}
              </Link>
            ))}
            <TituloGrupoMenu>Otro rango</TituloGrupoMenu>
            <form
              className="flex flex-col gap-2 px-3 pb-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!d) return;
                cerrar();
                router.push(`/despacho-ciudad?desde=${d}&hasta=${h || d}`);
              }}
            >
              <div className="flex items-center gap-2 text-[13px]">
                <label className="flex flex-1 flex-col gap-1">
                  Del
                  <input type="date" value={d} onChange={(e) => setD(e.target.value)} required className={fieldClassSm} />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  al
                  <input type="date" value={h} onChange={(e) => setH(e.target.value)} className={fieldClassSm} />
                </label>
              </div>
              <button type="submit" role="menuitem" className={`${botonBarra(false)} justify-center`}>
                Ver ese rango
              </button>
            </form>
          </>
        )}
      </MenuDesplegable>
      <MenuDesplegable
        etiqueta="Más opciones de Despacho ciudad"
        alineacion="izquierda"
        claseMenu="w-60"
        claseBoton={botonBarra(mas.some((o) => o.activa))}
        contenidoBoton={
          <>
            <MasIcon aria-hidden="true" className="h-4 w-4" />
            Más
            <span aria-hidden="true">▾</span>
          </>
        }
      >
        {(cerrar) =>
          mas.map((o) => (
            <Link key={o.href} href={o.href} role="menuitem" onClick={() => cerrar()} className={`${claseOpcionMenu} ${o.activa ? "font-semibold text-primario" : ""}`}>
              {o.etiqueta}
            </Link>
          ))
        }
      </MenuDesplegable>
    </div>
  );
}
