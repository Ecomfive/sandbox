"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ResumenConexionEffi } from "@/lib/effi/api";
import { probarEffi } from "./effi-actions";

/** Prueba la API de Effi (Costa Rica) con la llave guardada en Vercel. Solo lee: no cambia nada en Effi. */
export function ConexionEffi({ hayLlave }: { hayLlave: boolean }) {
  const [pending, startTransition] = useTransition();
  const [resultado, setResultado] = useState<{ resumen?: ResumenConexionEffi; error?: string } | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            API de Effi ERP (cuenta ECOMFIVE de Costa Rica), con el usuario de solo consulta «Sistema MOM».
          </p>
          <p className="text-xs text-muted-foreground">
            {hayLlave ? "La llave está guardada en el servidor." : "Falta la llave: variable EFFI_API_KEY en Vercel."} Vence cada 360 días y se renueva en Effi.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={pending || !hayLlave}
          onClick={() => startTransition(async () => setResultado(await probarEffi()))}
        >
          {pending ? "Probando…" : "Probar conexión con Effi"}
        </Button>
      </div>

      {resultado?.error && (
        <p role="alert" className="text-sm text-destructive">
          {resultado.error}
        </p>
      )}
      {resultado?.resumen && (
        <div role="status" className="flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="success">Conectado</Badge>
            <span>
              {resultado.resumen.articulos} artículos
              {resultado.resumen.ejemplo && ` · el último: «${resultado.resumen.ejemplo.nombre}» (ID ${resultado.resumen.ejemplo.id})`}
            </span>
          </div>
          {resultado.resumen.bodegas.length > 0 && <p className="text-muted-foreground">Bodegas: {resultado.resumen.bodegas.join(", ")}</p>}
          <p className="text-muted-foreground">Tarifas que manda Effi: {resultado.resumen.tarifas ?? "Effi no mandó tarifas"}</p>
          <p className="break-words text-muted-foreground">
            Órdenes de venta{resultado.resumen.ordenes.total !== null ? ` (${resultado.resumen.ordenes.total.toLocaleString("es-PA")})` : ""}: {resultado.resumen.ordenes.campos || "Effi no mandó ninguna"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge tone={resultado.resumen.conStock ? "success" : "warning"}>{resultado.resumen.conStock ? "Ve el stock" : "No ve el stock"}</Badge>
            <Badge tone={resultado.resumen.conCostos ? "success" : "warning"}>{resultado.resumen.conCostos ? "Ve los costos" : "No ve los costos"}</Badge>
          </div>
        </div>
      )}
    </div>
  );
}
