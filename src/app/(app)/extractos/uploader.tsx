"use client";

import { useActionState, useMemo, useState } from "react";
import { importarExtracto, type ImportarExtractoState } from "./actions";
import { parseExtracto, mapearMovimientos, type MapeoColumnas } from "@/lib/extractos/parse";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass, labelClassSm } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";
import { formatearFecha, formatearMoneda } from "@/lib/formato";

interface Pais {
  id: string;
  nombre: string;
  codigo: string;
}

const ESTADO_INICIAL: ImportarExtractoState = { status: "idle" };

export function ExtractoUploader({ pais }: { pais: Pais }) {
  const [estado, formAction, pending] = useActionState(importarExtracto, ESTADO_INICIAL);
  const [headers, setHeaders] = useState<string[]>([]);
  const [filas, setFilas] = useState<string[][]>([]);
  const [mapeo, setMapeo] = useState<Partial<MapeoColumnas>>({});

  const mapeoCompleto = mapeo.fecha !== undefined && mapeo.monto !== undefined;

  const preview = useMemo(() => {
    if (!mapeoCompleto) return [];
    try {
      return mapearMovimientos(filas.slice(0, 8), mapeo as MapeoColumnas);
    } catch {
      return [];
    }
  }, [filas, mapeo, mapeoCompleto]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const buffer = await archivo.arrayBuffer();
    const { headers, filas } = parseExtracto(buffer);
    setHeaders(headers);
    setFilas(filas);
    setMapeo({});
  }

  function columnaSelect(campo: keyof MapeoColumnas, requerido: boolean) {
    return (
      <select
        className={fieldClass}
        value={mapeo[campo] ?? ""}
        onChange={(e) =>
          setMapeo((prev) => ({
            ...prev,
            [campo]: e.target.value === "" ? undefined : Number(e.target.value),
          }))
        }
      >
        <option value="">{requerido ? "Selecciona columna…" : "(sin usar)"}</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Columna ${i + 1}`}
          </option>
        ))}
      </select>
    );
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
      <input type="hidden" name="pais_id" value={pais.id} />
      <div className="flex flex-col gap-1">
        <span className={labelClass}>País</span>
        <p className="text-sm text-muted-foreground">
          {pais.nombre} — cambia el país activo desde la barra superior.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="archivo-extracto" className={labelClass}>Archivo (CSV o Excel)</label>
        <input
          id="archivo-extracto"
          type="file"
          name="archivo"
          accept=".csv,.xlsx,.xls"
          required
          onChange={onFileChange}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-border"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Columnas esperadas: <strong>Fecha</strong> y <strong>Monto</strong> (obligatorias);
          Descripción y Tipo (depósito/retiro) son opcionales — si falta Tipo, se infiere del signo
          del monto. Puedes usar cualquier nombre de columna — luego las mapeas abajo.{" "}
          <a href="/plantillas/extractos-ejemplo.csv" download className="underline underline-offset-2 hover:text-foreground">
            Descargar plantilla de ejemplo
          </a>
          .
        </p>
      </div>

      {headers.length > 0 && (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-medium">Mapeo de columnas</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Fecha *</span>
              {columnaSelect("fecha", true)}
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Monto *</span>
              {columnaSelect("monto", true)}
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Descripción</span>
              {columnaSelect("descripcion", false)}
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>
                Tipo (depósito/retiro) — si no hay columna, se infiere del signo del monto
              </span>
              {columnaSelect("tipo", false)}
            </label>
          </div>

          {preview.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <p className="mb-1 text-xs text-muted-foreground">
                Vista previa ({filas.length} filas totales, mostrando {preview.length}):
              </p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">Fecha</th>
                    <th className="py-1.5 pr-3 font-medium">Monto</th>
                    <th className="py-1.5 pr-3 font-medium">Tipo</th>
                    <th className="py-1.5 pr-3 font-medium">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((m, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-1.5 pr-3">{formatearFecha(m.fecha)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{formatearMoneda(m.monto, pais.codigo)}</td>
                      <td className="py-1.5 pr-3">{m.tipo}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{m.descripcion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <input type="hidden" name="mapeo" value={JSON.stringify(mapeo)} />
        </div>
      )}

      <Button type="submit" disabled={!mapeoCompleto || pending} className="w-fit">
        {pending ? "Importando…" : "Confirmar importación"}
      </Button>

      {pending && (
        <ProgresoCarga
          mensaje={`Importando ${filas.length} filas… esto puede tardar unos segundos si el archivo es grande.`}
        />
      )}

      {estado.status === "success" && (
        <p className="text-sm text-success">Importados {estado.filasImportadas} movimientos.</p>
      )}
      {estado.status === "error" && <p className="text-sm text-destructive">{estado.mensaje}</p>}
    </form>
  );
}
