import type { ComponentType, ReactNode } from "react";

/** Un bloque de una página de Usuarios y roles: una tarjeta con su ícono y título arriba, y el contenido debajo. */
export function SeccionTarjeta({
  id,
  icono: Icono,
  titulo,
  acciones,
  sinRelleno = false,
  children,
}: {
  id: string;
  icono: ComponentType<{ className?: string }>;
  titulo: string;
  /** Lo que va a la derecha del título (un contador, un botón). */
  acciones?: ReactNode;
  /** El contenido trae su propio relleno (una lista que llega de borde a borde). */
  sinRelleno?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-[14px] border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-border px-[18px] py-3.5">
        <span aria-hidden="true" className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-primario-suave text-primario">
          <Icono className="h-4 w-4" />
        </span>
        <h2 id={id} className="text-[15px] font-bold">
          {titulo}
        </h2>
        {acciones && <div className="ml-auto flex items-center gap-2">{acciones}</div>}
      </div>
      <div className={sinRelleno ? "" : "p-[18px]"}>{children}</div>
    </section>
  );
}
