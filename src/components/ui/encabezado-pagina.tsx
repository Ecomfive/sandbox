import type { ComponentType, ReactNode } from "react";

/**
 * Título de una página y su descripción. Las migas de pan ya dicen dónde estás, así que cuando el título
 * es igual al de las migas va `oculto`: sigue siendo el <h1> para lectores de pantalla, pero no gasta
 * una fila de la pantalla. Si el título dice algo que las migas no dicen ("Cargar extracto bancario"),
 * se deja visible.
 */
export function EncabezadoPagina({
  titulo,
  icono: Icono,
  oculto = false,
  className = "",
  children,
}: {
  titulo: string;
  /** Solo se dibuja cuando el título es visible. */
  icono?: ComponentType<{ className?: string }>;
  /** Título igual al de las migas: solo para lectores de pantalla. */
  oculto?: boolean;
  /** Espaciado propio (un `mb-4`, por ejemplo). */
  className?: string;
  /** Descripción de la página: una o dos líneas. */
  children?: ReactNode;
}) {
  if (oculto) {
    return (
      <>
        <h1 className="sr-only">{titulo}</h1>
        {children && <p className={`text-sm text-muted-foreground ${className}`.trim()}>{children}</p>}
      </>
    );
  }
  return (
    <div className={className || undefined}>
      <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
        {Icono && <Icono className="h-5 w-5 text-muted-foreground" />}
        {titulo}
      </h1>
      {children && <p className="mt-1 text-sm text-muted-foreground">{children}</p>}
    </div>
  );
}
