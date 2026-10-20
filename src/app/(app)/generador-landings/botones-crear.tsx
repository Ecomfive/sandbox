"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { crearLanding } from "./actions";

function useCrear() {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const crear = (seleccionId: string | null, modo: "cero" | "clonar") =>
    iniciar(async () => {
      const r = await crearLanding({ seleccionId, modo });
      if (r.error || !r.id) return mostrarToast(r.error ?? "No se pudo crear la landing.", "destructive");
      router.push(`/generador-landings/${r.id}`);
    });
  return { crear, pendiente };
}

/** Los dos caminos para un producto de Selección: armar su landing desde cero o tomando otra como modelo. */
export function BotonesCrearLanding({ seleccionId, nombre }: { seleccionId: string; nombre: string }) {
  const { crear, pendiente } = useCrear();
  return (
    <span className="flex shrink-0 gap-1.5">
      <Button type="button" variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={pendiente} aria-label={`Crear la landing de ${nombre} desde cero`} onClick={() => crear(seleccionId, "cero")}>
        Desde cero
      </Button>
      <Button type="button" variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={pendiente} aria-label={`Crear la landing de ${nombre} clonando otra`} onClick={() => crear(seleccionId, "clonar")}>
        Clonar una landing
      </Button>
    </span>
  );
}

/** «Agregar»: una landing sin producto de Selección (el nombre y lo demás se escriben en su editor). */
export function BotonLandingSuelta() {
  const { crear, pendiente } = useCrear();
  return <BotonAgregar disabled={pendiente} onClick={() => crear(null, "cero")} />;
}
