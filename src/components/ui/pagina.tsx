import type { ReactNode } from "react";

/**
 * Anchos del contenido de una página. Una tabla o lista de datos usa "ancha" para aprovechar la pantalla;
 * lo que se lee o se llena como formulario usa un ancho menor para que las líneas no se estiren.
 *  - ancha:  tablas y listas de datos (hasta 1800 px, después queda centrada).
 *  - media:  listas de tarjetas y textos (1024 px).
 *  - angosta: formularios y ajustes (768 px).
 *  - ficha:  la ficha de un solo registro (672 px).
 * Las páginas de un mismo módulo (las pestañas) usan el mismo ancho para que el contenido no salte al cambiar.
 */
const ANCHOS = {
  ancha: "max-w-[1800px]",
  media: "max-w-5xl",
  angosta: "max-w-3xl",
  ficha: "max-w-2xl",
} as const;

export type AnchoPagina = keyof typeof ANCHOS;

/** Contenedor del contenido de una página (y de su `loading.tsx`, para que no salte al cargar). */
export function Pagina({
  ancho = "media",
  className = "",
  children,
}: {
  ancho?: AnchoPagina;
  /** Disposición interna: `flex flex-col gap-10`, etc. */
  className?: string;
  children: ReactNode;
}) {
  return (
    <main className={`mx-auto w-full px-6 py-6 ${ANCHOS[ancho]} ${className}`.trim()}>{children}</main>
  );
}
