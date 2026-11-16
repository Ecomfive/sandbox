import type { ComponentType, ReactNode } from "react";

/**
 * Una sección de la pantalla Con IA, con el mismo aspecto que las de Reglas de Gestión de IDs: una tarjeta con su franja de título (ícono y nombre, y a la derecha lo que hace falta a mano) y una
 * línea que dice para qué sirve. Tiene `id` para que el índice de arriba lleve hasta ella.
 */
export function SeccionCard({
  id,
  icono: Icono,
  titulo,
  ayuda,
  derecha,
  children,
}: {
  id: string;
  icono: ComponentType<{ className?: string }>;
  titulo: string;
  /** Una línea: para qué sirve y qué hacer aquí. */
  ayuda?: ReactNode;
  derecha?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-titulo`} className="min-w-0 scroll-mt-24 rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-xl border-b border-border bg-muted px-4 py-2.5">
        <h2 id={`${id}-titulo`} className="m-0 flex items-center gap-2 text-sm font-semibold">
          <Icono aria-hidden="true" className="h-4 w-4 text-primario" />
          {titulo}
        </h2>
        {derecha}
      </div>
      <div className="flex flex-col gap-4 p-4">
        {ayuda && <p className="m-0 text-sm text-muted-foreground">{ayuda}</p>}
        {children}
      </div>
    </section>
  );
}
