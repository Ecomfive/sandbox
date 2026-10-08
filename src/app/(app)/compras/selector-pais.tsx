"use client";

import { useEffect, useRef } from "react";
import { Bandera } from "@/components/paises/bandera";
import { claseOpcionMenu, MenuDesplegable } from "@/components/ui/menu-desplegable";
import { CheckIcon } from "@/lib/nav-icons";

/**
 * El país de una compra con la bandera de cada uno (como el selector «Todos los países» de arriba). Viaja en el formulario
 * con un `<select>` oculto (`nombre`, obligatorio), así el formulario lo ve igual que antes: lo marca si falta y lo envía.
 */
export function SelectorPais({
  id,
  nombre,
  paises,
  valor,
  invalido,
  alCambiar,
}: {
  id: string;
  nombre: string;
  paises: { codigo: string; nombre: string }[];
  valor: string;
  invalido?: boolean;
  alCambiar: (codigo: string) => void;
}) {
  const select = useRef<HTMLSelectElement>(null);
  const primera = useRef(true);
  const actual = paises.find((p) => p.codigo === valor) ?? null;

  // Cada cambio se le avisa al formulario como si se hubiera elegido en el `<select>` (revisa lo obligatorio).
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    select.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [valor]);

  return (
    <>
      <select ref={select} id={id} data-destino={`${id}-boton`} name={nombre} required value={valor} onChange={() => {}} tabIndex={-1} aria-hidden="true" className="sr-only">
        <option value="" />
        {paises.map((p) => (
          <option key={p.codigo} value={p.codigo} />
        ))}
      </select>
      <MenuDesplegable
        etiqueta={actual ? `País de la compra: ${actual.nombre}` : "Elegir el país de la compra"}
        alineacion="izquierda"
        claseMenu="w-64 max-h-80 overflow-y-auto"
        claseBoton={`flex w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-muted ${invalido ? "border-destructive" : "border-border-control"}`}
        contenidoBoton={
          <span id={`${id}-boton`} className="flex w-full items-center gap-2">
            {actual ? (
              <>
                <Bandera codigo={actual.codigo} />
                <span className="truncate">{actual.nombre}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Elige el país</span>
            )}
            <span aria-hidden="true" className="ml-auto text-muted-foreground">
              ▾
            </span>
          </span>
        }
      >
        {(cerrar) =>
          paises.map((p) => (
            <button
              key={p.codigo}
              type="button"
              role="menuitemradio"
              aria-checked={p.codigo === valor}
              onClick={() => {
                cerrar(true);
                if (p.codigo !== valor) alCambiar(p.codigo);
              }}
              className={claseOpcionMenu}
            >
              <Bandera codigo={p.codigo} />
              <span className={p.codigo === valor ? "font-semibold" : ""}>{p.nombre}</span>
              {p.codigo === valor && <CheckIcon className="ml-auto h-4 w-4 text-success" />}
            </button>
          ))
        }
      </MenuDesplegable>
    </>
  );
}
