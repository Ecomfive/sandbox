import type { ReactNode } from "react";

/**
 * La foto comercial con una marca «+N» en la esquina cuando la compra trae N productos más que el de la foto (pedido de Alcides,
 * 25 oct 2026). Sin otros productos, solo la foto.
 */
export function ConMasProductos({ n, children }: { n: number; children: ReactNode }) {
  if (n <= 0) return <>{children}</>;
  return (
    <span className="relative inline-flex w-fit shrink-0">
      {children}
      <span className="pointer-events-none absolute -right-1.5 -bottom-1.5 rounded-full border-2 border-card bg-foreground px-1.5 text-[10px] leading-4 font-semibold text-background tabular-nums">
        <span aria-hidden="true">+{n}</span>
        <span className="sr-only">y {n === 1 ? "1 producto más" : `${n} productos más`}</span>
      </span>
    </span>
  );
}
