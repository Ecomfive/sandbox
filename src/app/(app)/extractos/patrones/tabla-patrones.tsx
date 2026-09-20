"use client";

import { Button } from "@/components/ui/button";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { ExtractoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { eliminarPatron } from "./actions";
import { DEF_PATRONES, type FilaPatron } from "./def-patrones";

const NOMBRE: NombreFilas = { singular: "patrón", plural: "patrones" };
const ICONOS: Record<string, IconoComp> = { plataforma: TiendaIcon, fragmento: ExtractoIcon };

const COLUMNAS: ColumnaTabla<FilaPatron>[] = [
  { id: "fragmento", label: "Texto a buscar", ocultable: false, clase: "font-mono text-xs", render: (p) => p.fragmento },
  { id: "plataforma", label: "Plataforma", ocultable: true, render: (p) => p.plataforma ?? "—" },
];

/** Diccionario de patrones bancarios con la barra de herramientas común (agrupar por plataforma y filtros). */
export function TablaPatrones({ patrones }: { patrones: FilaPatron[] }) {
  return (
    <TablaDatos
      def={DEF_PATRONES}
      filas={patrones}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(p) => p.id}
      anchoMinimo="30rem"
      accion={{
        etiqueta: "Acciones",
        render: (p) => (
          <form action={eliminarPatron} className="text-right">
            <input type="hidden" name="id" value={p.id} />
            <Button type="submit" variant="ghost" className="text-xs">
              Eliminar
            </Button>
          </form>
        ),
      }}
      ariaLabel="Patrones bancarios"
      vacio="Todavía no hay patrones guardados. Asigna una plataforma a un movimiento en Extractos y quedará guardado aquí."
    />
  );
}
