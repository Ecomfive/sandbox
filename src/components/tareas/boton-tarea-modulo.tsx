"use client";

import { useEffect, useRef, useState } from "react";
import { datosNuevaTarea } from "@/app/(app)/tareas/actions";
import { NuevaTarea } from "@/app/(app)/tareas/nueva-tarea";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { TareasIcon } from "@/lib/nav-icons";

type Datos = Awaited<ReturnType<typeof datosNuevaTarea>>;

const clase = `flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 ${anilloFoco}`;

/**
 * «Asignar tarea» en la barra de cada módulo (9 nov 2026, pedido de Hernán: «si se le asigna a alguien una tarea en Inventario o en Gestión de IDs, que le
 * aparezca y sepa en qué módulo es»). Abre la ficha de «Nueva tarea» del tablero del equipo con el módulo ya puesto; la tarea sale en «Mis tareas por
 * módulo» de la persona, en ese módulo. A quién se puede asignar lo decide el tablero (un administrador, a cualquiera; los demás, a sí mismos).
 */
export function BotonTareaModulo({ moduloClave, moduloEtiqueta }: { moduloClave: string; moduloEtiqueta: string }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const abrirRef = useRef<(() => void) | null>(null);
  const abrirAlCargar = useRef(false);

  useEffect(() => {
    if (datos && abrirAlCargar.current && abrirRef.current) {
      abrirAlCargar.current = false;
      abrirRef.current();
    }
  }, [datos]);

  const texto = `Asignar una tarea en ${moduloEtiqueta}`;
  const icono = <TareasIcon aria-hidden="true" className="h-4 w-4" />;

  if (!datos)
    return (
      <Tooltip texto={error ? "No se pudo abrir: inténtalo de nuevo" : texto}>
        <button
          type="button"
          aria-label={texto}
          disabled={cargando}
          className={clase}
          onClick={async () => {
            setCargando(true);
            setError(false);
            try {
              abrirAlCargar.current = true;
              setDatos(await datosNuevaTarea());
            } catch {
              abrirAlCargar.current = false;
              setError(true);
            } finally {
              setCargando(false);
            }
          }}
        >
          {icono}
        </button>
      </Tooltip>
    );

  return (
    <NuevaTarea
      personas={datos.personas}
      miId={datos.miId}
      admin={datos.admin}
      modulos={[]}
      moduloFijo={{ clave: moduloClave, etiqueta: moduloEtiqueta }}
      boton={(abrir) => {
        abrirRef.current = abrir;
        return (
          <Tooltip texto={texto}>
            <button type="button" aria-label={texto} className={clase} onClick={abrir}>
              {icono}
            </button>
          </Tooltip>
        );
      }}
    />
  );
}
