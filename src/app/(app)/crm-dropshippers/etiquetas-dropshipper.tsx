"use client";

import { useEffect, useRef, useState } from "react";
import { PanelEtiquetas, PastillaEtiqueta } from "@/components/etiquetas/etiquetas";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { EtiquetaIcon } from "@/lib/nav-icons";
import { etiquetasCrmDisponibles, guardarColorEtiquetaCrm, guardarEtiquetasDropshipper } from "./etiquetas-actions";

type Disponibles = { todas: string[]; colores: Record<string, string> };
// Las etiquetas y colores del CRM se piden una vez por página, al primer uso.
let pedido: Promise<Disponibles> | null = null;
const cargar = () =>
  (pedido ??= etiquetasCrmDisponibles()
    .then((r) => ("error" in r ? { todas: [], colores: {} } : r))
    .catch(() => {
      pedido = null;
      return { todas: [], colores: {} };
    }));

/**
 * Las etiquetas de un dropshipper en su ficha del CRM, como en ClickUp (29 oct 2026, pedido de Alcides): pastillas con su color y «Editar
 * etiquetas» abre el selector para ponerlas, quitarlas, crearlas y elegir su color. Son las mismas que se editan arriba de la ficha del chat.
 */
export function EtiquetasDropshipper({ dropshipperId, iniciales, puedeEscribir }: { dropshipperId: string; iniciales: string[]; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [etiquetas, setEtiquetas] = useState(iniciales);
  const [disp, setDisp] = useState<Disponibles>({ todas: [], colores: {} });
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let vigente = true;
    void cargar().then((d) => vigente && setDisp(d));
    return () => {
      vigente = false;
    };
  }, []);

  function cambiar(nuevas: string[]) {
    const antes = etiquetas;
    setEtiquetas(nuevas);
    setDisp((d) => ({ ...d, todas: [...new Set([...d.todas, ...nuevas])] }));
    void guardarEtiquetasDropshipper(dropshipperId, nuevas)
      .then((r) => ("error" in r ? (setEtiquetas(antes), mostrarToast(r.error, "destructive")) : setEtiquetas(r.etiquetas)))
      .catch(() => {
        setEtiquetas(antes);
        mostrarToast("No se pudieron guardar las etiquetas.", "destructive");
      });
  }
  function cambiarColor(nombre: string, color: string) {
    const antes = disp.colores[nombre];
    const poner = (c: string | undefined) =>
      setDisp((d) => ({ ...d, colores: Object.fromEntries(Object.entries({ ...d.colores, [nombre]: c }).filter(([, v]) => v)) as Record<string, string> }));
    poner(color);
    void guardarColorEtiquetaCrm(nombre, color)
      .then((r) => {
        if ("error" in r) {
          poner(antes);
          mostrarToast(r.error, "destructive");
        }
      })
      .catch(() => poner(antes));
  }

  return (
    <span className="flex flex-wrap items-center gap-1">
      {etiquetas.map((e) => (
        <PastillaEtiqueta key={e} nombre={e} color={disp.colores[e]} />
      ))}
      {!etiquetas.length && !puedeEscribir && "—"}
      {puedeEscribir && (
        <button
          ref={boton}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          className={`inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-border-control px-2 text-[11.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
        >
          <EtiquetaIcon aria-hidden="true" className="h-3 w-3" />
          {etiquetas.length ? "Editar etiquetas" : "Agregar etiqueta"}
        </button>
      )}
      {abierto && (
        <PanelEtiquetas
          ancla={boton}
          titulo="Etiquetas del dropshipper"
          puestas={etiquetas}
          todas={disp.todas}
          colores={disp.colores}
          alCambiar={cambiar}
          alColor={cambiarColor}
          alCerrar={(m) => {
            setAbierto(false);
            if (m === "escape") boton.current?.focus();
          }}
        />
      )}
    </span>
  );
}
