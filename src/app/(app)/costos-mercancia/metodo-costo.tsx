"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cambiarMetodoCosto } from "./actions";

/** El método del costo vigente: el último lote o el promedio ponderado de 12 meses (mejora 32). */
export function MetodoCosto({ metodo, puedeEscribir }: { metodo: "ultimo" | "promedio"; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [valor, setValor] = useState(metodo);
  const [pendiente, empezar] = useTransition();
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Costo vigente</span>
      <select
        value={valor}
        disabled={!puedeEscribir || pendiente}
        onChange={(e) => {
          const nuevo = e.target.value as "ultimo" | "promedio";
          setValor(nuevo);
          empezar(async () => {
            const r = await cambiarMetodoCosto(nuevo).catch(() => ({ error: "Se cortó la conexión." }));
            if (r.error) {
              mostrarToast(r.error, "destructive");
              setValor(metodo);
            } else {
              mostrarToast("Método del costo cambiado");
              router.refresh();
            }
          });
        }}
        className={fieldClassSm}
      >
        <option value="ultimo">Último lote</option>
        <option value="promedio">Promedio ponderado (12 meses)</option>
      </select>
    </label>
  );
}
