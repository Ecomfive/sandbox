"use client";

import { useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DescargarIcon } from "@/lib/nav-icons";

/**
 * «Descargar formato para HL Express» de la tarea «Pedir a Dropi el traslado» (18 nov 2026): baja el manifiesto de HL Express Panamá ya lleno con el ID viejo, el nuevo, el
 * producto y las unidades. La descarga se pide con `fetch` para poder decir por qué falla (otro país, tarea que no es de un traslado) en vez de bajar un archivo de error.
 */
export function BotonFormatoTraslado({ tareaId }: { tareaId: string }) {
  const { mostrarToast } = useToast();
  const [bajando, setBajando] = useState(false);

  async function bajar() {
    setBajando(true);
    try {
      const r = await fetch(`/api/publicaciones-dropi/formato-traslado?tarea=${encodeURIComponent(tareaId)}`, { cache: "no-store" });
      if (!r.ok) {
        mostrarToast((await r.text()).slice(0, 200) || "No se pudo armar el formato.", "destructive");
        return;
      }
      const nombre = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "Traslado HL Express.xlsx");
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      mostrarToast("No se pudo armar el formato. Intenta de nuevo.", "destructive");
    } finally {
      setBajando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={bajar}
      disabled={bajando}
      className={`inline-flex min-h-11 items-center gap-2 rounded-md bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-60 ${anilloFoco}`}
    >
      <DescargarIcon aria-hidden="true" className="h-4 w-4" />
      {bajando ? "Armando el formato…" : "Descargar formato para HL Express"}
    </button>
  );
}
