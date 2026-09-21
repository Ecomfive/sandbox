import type { ComponentType, ReactNode } from "react";

/** Un bloque de una ficha lateral: ícono y título, y sus campos debajo. Los bloques se separan con una línea
 * (`divide-y` en el contenedor) y el primero y el último no llevan relleno de más. */
export function Seccion({
  icono: Icono,
  titulo,
  children,
}: {
  icono: ComponentType<{ className?: string }>;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Icono className="h-4 w-4" />
        </span>
        {titulo}
      </h3>
      {children}
    </section>
  );
}
