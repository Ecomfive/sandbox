"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { linkClass } from "@/components/ui/link";
import { formatearFechaNumerica, formatearMoneda } from "@/lib/formato";
import { ArrastrarIcon, ColumnasIcon } from "@/lib/nav-icons";

export interface FilaRetiro {
  id: string;
  numeroCorrelativo: number;
  fecha: string;
  plataformaNombre: string | null;
  destino: string;
  monto: number;
  estado: string;
}

const ESTADO_TONO = {
  abierto: "info",
  cancelado: "neutral",
  novedad: "destructive",
  cerrado: "success",
} as const;

const ESTADO_ETIQUETA: Record<string, string> = {
  abierto: "Abierto",
  cancelado: "Cancelado",
  novedad: "Novedad",
  cerrado: "Cerrado",
};

type ColumnaId = "correlativo" | "fecha" | "plataforma" | "destino" | "monto" | "estado";

const COLUMNAS: { id: ColumnaId; label: string; ocultable: boolean; claseCelda?: string }[] = [
  { id: "correlativo", label: "#", ocultable: false },
  { id: "fecha", label: "Creación", ocultable: true },
  { id: "plataforma", label: "Plataforma", ocultable: true, claseCelda: "text-muted-foreground" },
  { id: "destino", label: "Destino", ocultable: true, claseCelda: "text-muted-foreground" },
  { id: "monto", label: "Monto", ocultable: true, claseCelda: "tabular-nums" },
  { id: "estado", label: "Estado", ocultable: true },
];

const ORDEN_DEFECTO = COLUMNAS.map((c) => c.id);
const COLUMNAS_POR_ID = new Map(COLUMNAS.map((c) => [c.id, c]));
const STORAGE_KEY = "retiros-columnas-v1";

function esColumnaId(valor: unknown): valor is ColumnaId {
  return typeof valor === "string" && ORDEN_DEFECTO.includes(valor as ColumnaId);
}

function renderCelda(id: ColumnaId, fila: FilaRetiro, codigoPais: string) {
  switch (id) {
    case "correlativo":
      return (
        <Link
          href={`/retiros/${fila.id}`}
          className={`${linkClass} after:absolute after:inset-0 after:content-['']`}
        >
          #{String(fila.numeroCorrelativo).padStart(4, "0")}
        </Link>
      );
    case "fecha":
      return formatearFechaNumerica(fila.fecha);
    case "plataforma":
      return fila.plataformaNombre;
    case "destino":
      return fila.destino;
    case "monto":
      return formatearMoneda(fila.monto, codigoPais);
    case "estado":
      return (
        <Badge tone={ESTADO_TONO[fila.estado as keyof typeof ESTADO_TONO]}>
          {ESTADO_ETIQUETA[fila.estado] ?? fila.estado}
        </Badge>
      );
  }
}

/** Tabla de retiros con menú de columnas: arrastrar para reordenar, casilla para ocultar.
 * La preferencia se guarda en localStorage — cada persona en su navegador ve su propio orden. */
export function TablaRetiros({ retiros, codigoPais }: { retiros: FilaRetiro[]; codigoPais: string }) {
  const [orden, setOrden] = useState<ColumnaId[]>(ORDEN_DEFECTO);
  const [ocultas, setOcultas] = useState<Set<ColumnaId>>(new Set());
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [arrastrando, setArrastrando] = useState<ColumnaId | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (!guardado) return;
      const datos = JSON.parse(guardado) as { orden?: unknown[]; ocultas?: unknown[] };
      const ordenGuardado = (datos.orden ?? []).filter(esColumnaId);
      const faltantes = ORDEN_DEFECTO.filter((id) => !ordenGuardado.includes(id));
      setOrden([...ordenGuardado, ...faltantes]);
      setOcultas(new Set((datos.ocultas ?? []).filter(esColumnaId).filter((id) => id !== "correlativo")));
    } catch {
      // localStorage puede fallar (modo privado, cuotas, etc.) — se usa el orden por defecto.
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ orden, ocultas: [...ocultas] }));
    } catch {}
  }, [orden, ocultas]);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setMenuAbierto(false);
      }
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    return () => document.removeEventListener("mousedown", alHacerClicFuera);
  }, []);

  function moverColumna(origenId: ColumnaId, destinoId: ColumnaId) {
    if (origenId === destinoId) return;
    setOrden((prev) => {
      const sinOrigen = prev.filter((id) => id !== origenId);
      const indiceDestino = sinOrigen.indexOf(destinoId);
      sinOrigen.splice(indiceDestino, 0, origenId);
      return sinOrigen;
    });
  }

  function alternarVisible(id: ColumnaId) {
    setOcultas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  const columnasVisibles = orden.filter((id) => !ocultas.has(id)).map((id) => COLUMNAS_POR_ID.get(id)!);

  return (
    <div className="mt-3 min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
      <div ref={contenedorRef} className="flex items-center justify-end border-b border-border bg-muted/50 px-2 py-1.5">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuAbierto((v) => !v)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            <ColumnasIcon className="h-4 w-4" />
            Columnas
          </button>
          {menuAbierto && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-border bg-card p-1 shadow-lg">
              {orden.map((id) => {
                const columna = COLUMNAS_POR_ID.get(id)!;
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => setArrastrando(id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (arrastrando) moverColumna(arrastrando, id);
                      setArrastrando(null);
                    }}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <ArrastrarIcon className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                    <label className="flex flex-1 items-center gap-2 select-none">
                      <input
                        type="checkbox"
                        checked={!ocultas.has(id)}
                        disabled={!columna.ocultable}
                        onChange={() => alternarVisible(id)}
                        className="h-3.5 w-3.5"
                      />
                      {columna.label}
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted text-left text-muted-foreground">
            {columnasVisibles.map((columna, i) => (
              <th
                key={columna.id}
                className={`py-2 pr-3 text-xs font-semibold tracking-wide uppercase ${i === 0 ? "pl-4" : ""} ${
                  i < columnasVisibles.length - 1 ? "border-r border-border/60" : ""
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <ArrastrarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                  {columna.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {retiros.map((fila) => (
            <tr key={fila.id} className="relative border-b border-border/60 last:border-0 hover:bg-muted/50">
              {columnasVisibles.map((columna, i) => (
                <td key={columna.id} className={`py-2 pr-3 ${i === 0 ? "pl-4" : ""} ${columna.claseCelda ?? ""}`}>
                  {renderCelda(columna.id, fila, codigoPais)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {retiros.length === 0 && <EstadoVacio mensaje="Todavía no hay retiros registrados." />}
    </div>
  );
}
