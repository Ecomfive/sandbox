"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export interface OpcionEnlace {
  valor: string;
  etiqueta: string;
  href: string;
}

/**
 * Una lista desplegable cuyas opciones son direcciones (un mes, una tienda entre muchas): al elegir, navega. Es la
 * versión compacta de `ControlSegmentado` cuando las opciones no caben como botones. Las direcciones vienen armadas
 * desde el servidor (un componente de cliente no recibe funciones).
 */
export function SelectorEnlace({
  etiqueta,
  opciones,
  elegido,
  vacio,
}: {
  /** Nombre del control para lectores de pantalla («Elegir mes»). */
  etiqueta: string;
  opciones: OpcionEnlace[];
  /** El valor elegido; si no está entre las opciones se muestra `vacio`. */
  elegido: string | null;
  /** El texto de la opción vacía («Mes…»). */
  vacio?: string;
}) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const activo = opciones.some((o) => o.valor === elegido);
  return (
    <select
      aria-label={etiqueta}
      aria-busy={pendiente || undefined}
      value={activo ? (elegido ?? "") : ""}
      onChange={(e) => {
        const o = opciones.find((x) => x.valor === e.target.value);
        if (o) iniciar(() => router.push(o.href, { scroll: false }));
      }}
      className={`h-8 rounded-md border px-2 text-sm focus:ring-2 focus:ring-foreground focus:outline-none ${
        activo ? "border-foreground bg-foreground text-background" : "border-border-control bg-card text-foreground"
      } ${pendiente ? "opacity-70" : ""}`}
    >
      {!activo && <option value="">{vacio ?? etiqueta}</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
}
