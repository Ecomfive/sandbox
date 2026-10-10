/** Un componente de un producto compuesto, para dibujar su mapa. */
export interface ComponenteMapa {
  id: string;
  codigo: string;
  nombre: string;
  foto?: string | null;
  cantidad: number;
}

/**
 * El mapa de un producto compuesto («Cómo se arma»): a la izquierda cada componente (foto, nombre, SKU y cuántas lleva), unidos
 * por líneas al producto compuesto de la derecha, que dice cuántas piezas suma en total. Se ve al crear el producto, en su
 * ficha (Componentes) y, `compacto`, en la tarjeta que sale al pasar sobre el producto en la lista.
 */
export function MapaComponentes({ componentes, nombre, compacto = false, titulo = "Cómo se arma" }: { componentes: ComponenteMapa[]; nombre: string; compacto?: boolean; titulo?: string }) {
  const piezas = componentes.reduce((s, c) => s + c.cantidad, 0);
  const alto = compacto ? "h-11" : "h-14";
  const mitad = compacto ? "top-[1.375rem] bottom-[1.375rem]" : "top-7 bottom-7";
  return (
    <figure className={`m-0 flex flex-col gap-2 ${compacto ? "" : "rounded-xl border border-dashed border-border bg-muted/40 p-3"}`}>
      <figcaption className="text-xs font-medium text-muted-foreground">{titulo}</figcaption>
      <div className="overflow-x-auto">
        <div className={`flex w-full items-center ${compacto ? "" : "min-w-[32rem]"}`}>
          <ul className={`relative m-0 flex min-w-0 flex-1 list-none flex-col gap-2 p-0 ${compacto ? "pr-5" : "pr-7"}`}>
            {componentes.map((c) => (
              <li key={c.id} className={`relative flex ${alto} w-full items-center gap-2 rounded-lg border border-border bg-card px-2`}>
                {/* La línea que une este componente con la de todos. */}
                <span aria-hidden="true" className={`absolute top-1/2 left-full h-0.5 bg-primario/50 ${compacto ? "w-5" : "w-7"}`} />
                {c.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.foto} alt="" className={`shrink-0 rounded-md border border-border object-cover ${compacto ? "h-7 w-7" : "h-9 w-9"}`} />
                ) : (
                  <span aria-hidden="true" className={`shrink-0 rounded-md border border-dashed border-border ${compacto ? "h-7 w-7" : "h-9 w-9"}`} />
                )}
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className={`truncate font-medium ${compacto ? "text-xs" : "text-[13px]"}`}>{c.nombre}</span>
                  <span className="truncate text-xs text-muted-foreground">{c.codigo}</span>
                </span>
                <span className="shrink-0 rounded-full bg-primario-suave px-2 py-0.5 text-xs font-semibold text-primario tabular-nums">×{c.cantidad}</span>
              </li>
            ))}
            {/* La línea que junta a todos los componentes (del centro del primero al centro del último). */}
            {componentes.length > 1 && <span aria-hidden="true" className={`absolute right-0 w-0.5 bg-primario/50 ${mitad}`} />}
          </ul>
          <span aria-hidden="true" className={`h-0.5 bg-primario/50 ${compacto ? "w-5" : "w-8"}`} />
          <span aria-hidden="true" className="-ml-1 text-primario">
            ▶
          </span>
          <div className={`ml-1 flex shrink-0 flex-col gap-0.5 rounded-xl border-2 border-primario bg-card px-3 py-2.5 shadow-sm ${compacto ? "w-40" : "w-56"}`}>
            <span className="text-xs font-medium text-primario">Producto compuesto</span>
            <span className="truncate text-sm font-semibold">{nombre.trim() || "Nuevo producto"}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {componentes.length} {componentes.length === 1 ? "componente" : "componentes"} · {piezas} {piezas === 1 ? "pieza" : "piezas"}
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}
