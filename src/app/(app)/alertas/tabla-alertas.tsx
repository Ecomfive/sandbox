"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { linkClass } from "@/components/ui/link";
import { useToast } from "@/components/ui/toast";
import { formatearFecha } from "@/lib/formato";
import { actualizarEstadoAlerta, actualizarEstadoAlertasMasivo } from "./actions";

const ESTADO_TONO = {
  abierta: "warning",
  reclamada: "info",
  resuelta: "success",
} as const;

export interface AlertaFila {
  id: string;
  sku: string;
  nombre: string;
  cantidad: number;
  fecha_deteccion: string;
  fecha_reclamo: string | null;
  estado: keyof typeof ESTADO_TONO;
}

export function TablaAlertas({ alertas }: { alertas: AlertaFila[] }) {
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();

  function alternar(id: string) {
    setSeleccionadas((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });
  }

  function alternarTodas() {
    setSeleccionadas((actual) => (actual.size === alertas.length ? new Set() : new Set(alertas.map((a) => a.id))));
  }

  function aplicarMasivo(estado: "reclamada" | "resuelta") {
    const ids = Array.from(seleccionadas);
    startTransition(async () => {
      await actualizarEstadoAlertasMasivo(ids, estado);
      mostrarToast(
        `${ids.length} alerta${ids.length === 1 ? "" : "s"} marcada${ids.length === 1 ? "" : "s"} como ${estado}`
      );
      setSeleccionadas(new Set());
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Alertas</h2>
        <a href="/api/exportar-alertas" className={linkClass}>
          Descargar CSV
        </a>
      </div>
      <div className="mt-3 min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
        {seleccionadas.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-muted px-4 py-2 text-sm">
            <span>{seleccionadas.size} seleccionada{seleccionadas.size === 1 ? "" : "s"}</span>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs"
              disabled={pending}
              onClick={() => aplicarMasivo("reclamada")}
            >
              Marcar reclamadas
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1 text-xs"
              disabled={pending}
              onClick={() => aplicarMasivo("resuelta")}
            >
              Marcar resueltas
            </Button>
          </div>
        )}
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="py-2 pr-2 pl-4">
                <input
                  type="checkbox"
                  checked={alertas.length > 0 && seleccionadas.size === alertas.length}
                  onChange={alternarTodas}
                  aria-label="Seleccionar todas"
                />
              </th>
              <th className="py-2 pr-3 font-medium">SKU</th>
              <th className="py-2 pr-3 font-medium">Producto</th>
              <th className="py-2 pr-3 font-medium">Cantidad</th>
              <th className="py-2 pr-3 font-medium">Detectada</th>
              <th className="py-2 pr-3 font-medium">Reclamada</th>
              <th className="py-2 pr-3 font-medium">Estado</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {alertas.map((a) => (
              <tr key={a.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-2 pl-4">
                  <input
                    type="checkbox"
                    checked={seleccionadas.has(a.id)}
                    onChange={() => alternar(a.id)}
                    aria-label={`Seleccionar alerta de ${a.nombre}`}
                  />
                </td>
                <td className="py-2 pr-3 font-medium">{a.sku}</td>
                <td className="py-2 pr-3 text-muted-foreground">{a.nombre}</td>
                <td className="py-2 pr-3 tabular-nums">{a.cantidad}</td>
                <td className="py-2 pr-3">{formatearFecha(a.fecha_deteccion)}</td>
                <td className="py-2 pr-3">{a.fecha_reclamo ? formatearFecha(a.fecha_reclamo) : "—"}</td>
                <td className="py-2 pr-3">
                  <Badge tone={ESTADO_TONO[a.estado]}>{a.estado}</Badge>
                </td>
                <td className="py-2 pr-4">
                  <div className="flex justify-end gap-2">
                    {a.estado === "abierta" && (
                      <form action={actualizarEstadoAlerta}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="estado" value="reclamada" />
                        <Button type="submit" variant="secondary" className="px-3 py-1 text-xs">
                          Marcar reclamada
                        </Button>
                      </form>
                    )}
                    {a.estado !== "resuelta" && (
                      <form action={actualizarEstadoAlerta}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="estado" value="resuelta" />
                        <Button type="submit" variant="secondary" className="px-3 py-1 text-xs">
                          Marcar resuelta
                        </Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {alertas.length === 0 && <EstadoVacio mensaje="Todavía no hay alertas generadas." />}
      </div>
    </div>
  );
}
