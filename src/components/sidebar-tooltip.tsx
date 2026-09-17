"use client";

import type { ReactNode } from "react";

export function ConTooltip({
  etiqueta,
  mostrar,
  children,
}: {
  etiqueta: string;
  mostrar: boolean;
  children: ReactNode;
}) {
  return (
    <div className="group relative flex">
      {children}
      {mostrar && (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100">
          {etiqueta}
        </span>
      )}
    </div>
  );
}
