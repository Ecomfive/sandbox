"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { dinero } from "@/lib/af4/formato";
import { guardarConsignacion, llevarProvisionAlLibro } from "./actions";

const boton = `h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`;

/** Marca las bodegas cuya mercancía no es nuestra (mejora 78). */
export function BodegasConsignacion({ bodegas, marcadas, puedeEscribir }: { bodegas: { id: string; nombre: string; valor: number }[]; marcadas: string[]; puedeEscribir: boolean }) {
  const [sel, setSel] = useState(new Set(marcadas));
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  const cambio = sel.size !== marcadas.length || marcadas.some((m) => !sel.has(m));
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border">
        {bodegas.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sel.has(b.id)}
                disabled={!puedeEscribir || pendiente}
                onChange={(e) =>
                  setSel((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(b.id);
                    else n.delete(b.id);
                    return n;
                  })
                }
              />
              <span>{b.nombre}</span>
            </label>
            <span className={`text-muted-foreground ${claseCifra}`}>{dinero(b.valor)}</span>
          </li>
        ))}
      </ul>
      {puedeEscribir && cambio && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() =>
            empezar(async () => {
              const r = await guardarConsignacion([...sel]).catch(() => ({ error: "Se cortó la conexión." }));
              mostrarToast(r.error ?? "Consignación guardada", r.error ? "destructive" : "success");
              if (!r.error) router.refresh();
            })
          }
          className={`self-start ${boton}`}
        >
          Guardar
        </button>
      )}
    </div>
  );
}

/** Lleva la provisión por obsoleto del mes al libro (mejora 73). */
export function BotonProvision({ ajuste }: { ajuste: number }) {
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        empezar(async () => {
          const r = await llevarProvisionAlLibro().catch(() => ({ error: "Se cortó la conexión." }) as { error?: string; monto?: number });
          if (r.error) return mostrarToast(r.error, "destructive");
          mostrarToast(`Provisión asentada: ${dinero(r.monto ?? 0, "USD", { decimales: 2 })}`);
          router.refresh();
        })
      }
      className={boton}
    >
      {pendiente ? "Asentando…" : `Llevar al libro ${ajuste >= 0 ? "" : "el reverso "}(${dinero(Math.abs(ajuste), "USD", { decimales: 2 })})`}
    </button>
  );
}
