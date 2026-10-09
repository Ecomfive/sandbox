"use client";

import { usePathname, useRouter } from "next/navigation";
import { MenuDesplegable, claseOpcionMenu } from "@/components/ui/menu-desplegable";
import { Bandera } from "@/components/paises/bandera";

const COOKIE = "compras-vista";

/** Recuerda la vista elegida para las otras pestañas de Compras. */
function recordar(valor: string) {
  document.cookie = `${COOKIE}=${encodeURIComponent(valor)}; path=/; max-age=31536000; samesite=lax`;
}

/** El ícono de cada opción: la bandera del país, o un emoji para «Todos». */
function Icono({ valor }: { valor: string }) {
  if (valor === "todos") return <span aria-hidden="true">🗺️</span>;
  return <Bandera codigo={valor} />;
}

/**
 * Qué compras se ven: todos los países o uno solo, cada uno con su bandera (Importadora ya no es una opción: una venta de
 * importación es una compra de un país con su casilla, y se filtra por esa columna). Va en la dirección (`?ver=`)
 * para poder compartirla y se recuerda en una cookie para que se mantenga al pasar de una pestaña a otra. Un país nuevo se
 * agrega desde «Elige el país» de la compra nueva (o en Configuración).
 */
export function SelectorVista({
  vista,
  paises,
}: {
  vista: string;
  paises: { codigo: string; nombre: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  function elegir(valor: string) {
    recordar(valor);
    router.replace(`${pathname}?ver=${valor}`);
  }
  const opciones = [
    { valor: "todos", nombre: "Todos los países" },
    ...paises.map((p) => ({ valor: p.codigo, nombre: p.nombre })),
  ];
  const actual = opciones.find((o) => o.valor === vista) ?? opciones[0];

  return (
    <div className="flex items-center gap-2">
      <MenuDesplegable
        etiqueta={`Qué compras ver: ${actual.nombre}`}
        alineacion="izquierda"
        claseMenu="w-60 max-h-96 overflow-y-auto"
        claseBoton="flex h-[34px] items-center gap-2 rounded-lg border border-border-control bg-card px-2.5 text-[13px] hover:bg-muted"
        contenidoBoton={
          <>
            <Icono valor={actual.valor} />
            <span className="whitespace-nowrap">{actual.nombre}</span>
            <span aria-hidden="true" className="text-muted-foreground">
              ▾
            </span>
          </>
        }
      >
        {(cerrar) =>
          opciones.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="menuitemradio"
              aria-checked={o.valor === actual.valor}
              onClick={() => {
                cerrar(true);
                if (o.valor !== actual.valor) elegir(o.valor);
              }}
              className={`${claseOpcionMenu} ${o.valor === actual.valor ? "bg-accent font-medium" : ""}`}
            >
              <Icono valor={o.valor} />
              {o.nombre}
            </button>
          ))
        }
      </MenuDesplegable>
    </div>
  );
}
