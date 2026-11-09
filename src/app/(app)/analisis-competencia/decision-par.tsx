"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { anilloFoco } from "@/components/ui/field";
import { decidirParCompetencia } from "./actions";

const boton = `rounded-md px-1.5 py-0.5 text-xs hover:bg-muted disabled:opacity-60 ${anilloFoco}`;

/**
 * Los botones de un producto de la competencia frente a uno nuestro (8 nov 2026, pedido de Alcides): un dudoso se confirma («Es el mismo») o se quita
 * («No es el mismo»); uno igual se puede quitar, y uno quitado o confirmado a mano vuelve a la regla con «Deshacer».
 */
export function DecisionPar({ productoId, nuestroId, nombre, modo }: { productoId: string; nuestroId: string; nombre: string; modo: "dudoso" | "igual" | "decidido" }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const decidir = (veredicto: "mismo" | "distinto" | null) =>
    empezar(async () => {
      const r = await decidirParCompetencia(productoId, nuestroId, veredicto).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      mostrarToast(r.error ?? r.detalle ?? "Listo", r.error ? "destructive" : undefined);
      if (!r.error) router.refresh();
    });
  if (pendiente) return <span className="text-xs text-muted-foreground">Guardando…</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {modo === "dudoso" && (
        <button type="button" onClick={() => decidir("mismo")} aria-label={`Es el mismo producto: contar «${nombre}» como igual al nuestro`} className={`${boton} font-medium text-primario`}>
          Es el mismo
        </button>
      )}
      {modo !== "decidido" && (
        <button type="button" onClick={() => decidir("distinto")} aria-label={`No es el mismo producto: dejar de contar «${nombre}»`} className={`${boton} text-muted-foreground hover:text-foreground`}>
          No es el mismo
        </button>
      )}
      {modo === "decidido" && (
        <button type="button" onClick={() => decidir(null)} aria-label={`Deshacer la decisión sobre «${nombre}»`} className={`${boton} text-primario`}>
          Deshacer
        </button>
      )}
    </span>
  );
}
