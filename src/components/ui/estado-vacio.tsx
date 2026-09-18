import type { ReactNode } from "react";

/** Ícono genérico de "bandeja vacía", usado en todas las pantallas sin datos. */
function IconoVacio() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 text-muted-foreground/50" fill="none">
      <path
        d="M4 13V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6M4 13l2.2 5.4a1 1 0 0 0 .93.6h9.74a1 1 0 0 0 .93-.6L20 13M4 13h4.5a1 1 0 0 1 .9.55l.6 1.2a1 1 0 0 0 .9.55h2.2a1 1 0 0 0 .9-.55l.6-1.2a1 1 0 0 1 .9-.55H20"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Pantalla o tabla sin datos todavía — reemplaza al texto gris suelto para que se sienta terminada, no rota. */
export function EstadoVacio({ mensaje, className = "" }: { mensaje: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 p-8 text-center text-sm text-muted-foreground ${className}`}>
      <IconoVacio />
      <p>{mensaje}</p>
    </div>
  );
}
