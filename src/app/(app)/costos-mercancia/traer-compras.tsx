"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/toast";
import { anilloFoco } from "@/components/ui/field";
import { ActualizarIcon } from "@/lib/nav-icons";
import { traerComprasAHoja } from "./hoja-actions";

/** Trae ya las compras de Panamá En Bodega o Completado (pasa solo al cambiar la etapa en Compras; esto es por si acaso). */
export function TraerCompras() {
  const [pendiente, start] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        start(async () => {
          const r = await traerComprasAHoja();
          if ("error" in r) return mostrarToast(r.error, "destructive");
          mostrarToast(`Compras al día: ${r.lotes} filas${r.quitados ? `, ${r.quitados} quitadas` : ""}${r.unidas ? `, ${r.unidas} de la carga inicial unidas a su compra` : ""}`, "success");
          router.refresh();
        })
      }
      className={`inline-flex items-center gap-1.5 rounded-md border border-border-control bg-card px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-60 ${anilloFoco}`}
    >
      <ActualizarIcon className={`h-4 w-4 ${pendiente ? "animate-spin" : ""}`} />
      {pendiente ? "Trayendo compras…" : "Traer compras"}
    </button>
  );
}
