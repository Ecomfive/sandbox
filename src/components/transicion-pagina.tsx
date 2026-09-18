"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Vuelve a montar (y por lo tanto a animar) su contenido cada vez que cambia la ruta. */
export function TransicionPagina({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="flex min-h-full min-w-0 flex-1 flex-col animate-fade-in">
      {children}
    </div>
  );
}
