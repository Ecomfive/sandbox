import { textoContador, textoPendientes } from "@/lib/contadores-menu";

/**
 * Pastilla con lo que hay por atender en una página del menú. Se ve el número; un lector de pantalla oye
 * «3 pendientes» (con contexto, no un «3» suelto) como parte del nombre del enlace o botón. No es una
 * región en vivo: el número cambia al cargar la página, no mientras se lee.
 */
export function ContadorMenu({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="shrink-0 rounded-full bg-warning-soft px-1.5 py-0.5 text-xs leading-none font-medium text-warning tabular-nums"
      >
        {textoContador(cantidad)}
      </span>
      <span className="sr-only">, {textoPendientes(cantidad)}</span>
    </>
  );
}

/** La del riel negro del menú: rosa, en la esquina de arriba a la derecha del ícono, con un borde negro que la separa de él. */
export function ContadorSobreIcono({ cantidad }: { cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute -top-2 left-1/2 ml-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-aviso px-1 text-[0.6rem] leading-none font-semibold text-white tabular-nums ring-2 ring-riel"
      >
        {textoContador(cantidad)}
      </span>
      <span className="sr-only">, {textoPendientes(cantidad)}</span>
    </>
  );
}
