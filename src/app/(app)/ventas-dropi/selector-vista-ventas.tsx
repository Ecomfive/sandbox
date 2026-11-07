"use client";

import Link from "next/link";
import { LOGO_PLATAFORMA } from "@/components/plataformas/selector-plataforma";
import { anilloFoco } from "@/components/ui/field";
import { plataformasDePais, type VistaVentas } from "@/lib/plataformas";

function TodasIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  );
}

const CLASE = (activa: boolean) =>
  `inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-semibold ${activa ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"} ${anilloFoco}`;

/**
 * Ventas Proveeduría (7 nov 2026, pedido de Hernán): «Todas» (el análisis general) y una opción por plataforma, con los mismos logos del selector de Análisis de competencia. Solo sale si el país
 * tiene más de una plataforma (hoy, Costa Rica: Dropi, Drop y Effi); en los demás países solo hay Dropi y no hay nada que elegir. Son enlaces a `?ver=`, así que el cambio se ve en la dirección.
 */
export function SelectorVistaVentas({ vista, codigoPais }: { vista: VistaVentas; codigoPais: string }) {
  const plataformas = plataformasDePais(codigoPais);
  if (plataformas.length < 2) return null;
  return (
    <nav aria-label="Plataforma de las ventas" className="inline-flex w-fit items-center gap-1 rounded-xl border border-border bg-card p-1">
      <Link href="/ventas-dropi" aria-current={vista === "todas" ? "page" : undefined} className={CLASE(vista === "todas")}>
        <TodasIcon className="h-5 w-5" />
        Todas
      </Link>
      {plataformas.map((p) => {
        const Logo = LOGO_PLATAFORMA[p.id];
        return (
          <Link key={p.id} href={`/ventas-dropi?ver=${p.id}`} aria-current={vista === p.id ? "page" : undefined} className={CLASE(vista === p.id)}>
            <Logo marca className="h-5 w-5" />
            {p.nombre}
          </Link>
        );
      })}
    </nav>
  );
}
