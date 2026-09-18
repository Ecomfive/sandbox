"use client";

import { useActionState, useMemo, useState } from "react";
import { importarInventario, type ImportarInventarioState } from "./actions";
import { parseExtracto } from "@/lib/extractos/parse";
import { mapearMovimientosInventario, type MapeoColumnasInventario } from "@/lib/inventario/parse";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass, labelClassSm } from "@/components/ui/field";
import { ProgresoCarga } from "@/components/ui/progreso-carga";

interface Pais {
  id: string;
  nombre: string;
}

const ESTADO_INICIAL: ImportarInventarioState = { status: "idle" };

export function InventarioUploader({ pais }: { pais: Pais }) {
  const [estado, formAction, pending] = useActionState(importarInventario, ESTADO_INICIAL);
  const [headers, setHeaders] = useState<string[]>([]);
  const [filas, setFilas] = useState<string[][]>([]);
  const [mapeo, setMapeo] = useState<Partial<MapeoColumnasInventario>>({});
  const [tipoFijo, setTipoFijo] = useState<"" | "entrada" | "salida">("salida");

  const mapeoCompleto = mapeo.sku !== undefined && mapeo.cantidad !== undefined;

  const preview = useMemo(() => {
    if (!mapeoCompleto) return [];
    try {
      return mapearMovimientosInventario(
        filas.slice(0, 8),
        mapeo as MapeoColumnasInventario,
        tipoFijo || undefined
      );
    } catch {
      return [];
    }
  }, [filas, mapeo, mapeoCompleto, tipoFijo]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    const buffer = await archivo.arrayBuffer();
    const { headers, filas } = parseExtracto(buffer);
    setHeaders(headers);
    setFilas(filas);
    setMapeo({});
  }

  function columnaSelect(campo: keyof MapeoColumnasInventario, requerido: boolean) {
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
        <label className={labelClass}>País</label>
        <p className="text-sm text-muted-foreground">
          {pais.nombre} — cambia el país activo desde la barra superior.
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelClass}>Archivo del pistoleo (CSV o Excel)</label>
        <input
          type="file"
          name="archivo"
          accept=".csv,.xlsx,.xls"
          required
          onChange={onFileChange}
          className="text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-border"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          Columnas esperadas: <strong>SKU</strong> y <strong>Cantidad</strong> (obligatorias); Tipo
          (entrada/salida), Nombre, Fecha y Referencia son opcionales. Puedes usar cualquier nombre
          de columna — luego las mapeas abajo.{" "}
          <a href="/plantillas/inventario-ejemplo.csv" download className="underline underline-offset-2 hover:text-foreground">
            Descargar plantilla de ejemplo
          </a>
          .
        </p>
      </div>

      {headers.length > 0 && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium">Mapeo de columnas</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>SKU / código *</label>
              {columnaSelect("sku", true)}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>Cantidad *</label>
              {columnaSelect("cantidad", true)}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>Nombre del producto (solo si es nuevo)</label>
              {columnaSelect("nombre", false)}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>Fecha (si no hay, usa hoy)</label>
              {columnaSelect("fecha", false)}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>Referencia</label>
              {columnaSelect("referencia", false)}
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>Tipo (columna, si existe)</label>
              {columnaSelect("tipo", false)}
            </div>
          </div>

          {mapeo.tipo === undefined && (
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>
                El archivo no tiene columna de tipo — aplicar a todas las filas:
              </label>
              <select
                className={`${fieldClass} w-fit`}
                value={tipoFijo}
                onChange={(e) => setTipoFijo(e.target.value as "entrada" | "salida")}
              >
                <option value="salida">Salida (mercancía que sale)</option>
                <option value="entrada">Entrada (devolución/reingreso)</option>
              </select>
            </div>
          )}

          {preview.length > 0 && (
            <div className="min-w-0 overflow-x-auto">
              <p className="mb-1 text-xs text-muted-foreground">
                Vista previa ({filas.length} filas totales, mostrando {preview.length}):
              </p>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 pr-3 font-medium">SKU</th>
                    <th className="py-1.5 pr-3 font-medium">Cantidad</th>
                    <th className="py-1.5 pr-3 font-medium">Tipo</th>
                    <th className="py-1.5 pr-3 font-medium">Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((m, i) => (
                    <tr key={i} className="border-b border-border/60">
                      <td className="py-1.5 pr-3">{m.sku}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{m.cantidad}</td>
                      <td className="py-1.5 pr-3">{m.tipo}</td>
                      <td className="py-1.5 pr-3 text-muted-foreground">{m.fecha ?? "(hoy)"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <input type="hidden" name="mapeo" value={JSON.stringify(mapeo)} />
          <input type="hidden" name="tipo_fijo" value={mapeo.tipo === undefined ? tipoFijo : ""} />
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
