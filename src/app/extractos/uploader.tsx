"use client";

import { useActionState, useMemo, useState } from "react";
import { importarExtracto, type ImportarExtractoState } from "./actions";
import { parseExtracto, mapearMovimientos, type MapeoColumnas } from "@/lib/extractos/parse";

interface Pais {
  id: string;
  nombre: string;
}

const ESTADO_INICIAL: ImportarExtractoState = { status: "idle" };

export function ExtractoUploader({ paises }: { paises: Pais[] }) {
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
        className="border rounded px-2 py-1 text-sm"
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
    <form action={formAction} className="flex flex-col gap-4 max-w-2xl">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">País</label>
        <select name="pais_id" required className="border rounded px-2 py-1 text-sm">
          <option value="">Selecciona país…</option>
          {paises.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Archivo (CSV o Excel)</label>
        <input
          type="file"
          name="archivo"
          accept=".csv,.xlsx,.xls"
          required
          onChange={onFileChange}
          className="text-sm"
        />
      </div>

      {headers.length > 0 && (
        <div className="flex flex-col gap-3 border rounded p-3">
          <p className="text-sm font-medium">Mapeo de columnas</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Fecha *</label>
              {columnaSelect("fecha", true)}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Monto *</label>
              {columnaSelect("monto", true)}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">Descripción</label>
              {columnaSelect("descripcion", false)}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-600">
                Tipo (depósito/retiro) — si no hay columna, se infiere del signo del monto
              </label>
              {columnaSelect("tipo", false)}
            </div>
          </div>

          {preview.length > 0 && (
            <div className="overflow-x-auto">
              <p className="text-xs text-gray-600 mb-1">
                Vista previa ({filas.length} filas totales, mostrando {preview.length}):
              </p>
              <table className="text-xs border-collapse w-full">
                <thead>
                  <tr className="text-left border-b">
                    <th className="pr-3 py-1">Fecha</th>
                    <th className="pr-3 py-1">Monto</th>
                    <th className="pr-3 py-1">Tipo</th>
                    <th className="pr-3 py-1">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((m, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="pr-3 py-1">{m.fecha}</td>
                      <td className="pr-3 py-1">{m.monto.toFixed(2)}</td>
                      <td className="pr-3 py-1">{m.tipo}</td>
                      <td className="pr-3 py-1">{m.descripcion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <input type="hidden" name="mapeo" value={JSON.stringify(mapeo)} />
        </div>
      )}

      <button
        type="submit"
        disabled={!mapeoCompleto || pending}
        className="bg-black text-white rounded px-4 py-2 text-sm disabled:opacity-40 w-fit"
      >
        {pending ? "Importando…" : "Confirmar importación"}
      </button>

      {estado.status === "success" && (
        <p className="text-sm text-green-700">
          Importados {estado.filasImportadas} movimientos.
        </p>
      )}
      {estado.status === "error" && <p className="text-sm text-red-700">{estado.mensaje}</p>}
    </form>
  );
}
