"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { linkClass } from "@/components/ui/link";
import { ETIQUETA_ESTADO_DROPI, TONO_ESTADO_DROPI, type EstadoDropi } from "@/lib/dropi/emparejar-retiros";
import { formatearFechaNumerica, formatearMoneda } from "@/lib/formato";
import { ArrastrarIcon, ColumnasIcon } from "@/lib/nav-icons";
import { ESTADO_ETIQUETA, filtrarRetiros, filtroActivo } from "./filtros";
import { BotonFiltrosRetiros, useFiltrosRetiros } from "./filtros-retiros";
import { ConsolidadoToggle } from "./consolidado-toggle";

export interface FilaRetiro {
  id: string;
  numeroCorrelativo: number;
  consolidado: boolean;
  fecha: string;
  plataformaNombre: string | null;
  destino: string;
  monto: number;
  estado: string;
  comision: number;
  aRecibir: number;
  montoRecibido: number | null;
  fechaCierre: string | null;
  fechaLimite: string | null;
  asignadoNombre: string | null;
  estadoDropi: string | null;
  notas: string | null;
  soporteNumero: string | null;
}

// Sin filtros se ven los más recientes; con filtros se busca en todos los retiros cargados.
const LIMITE_SIN_FILTROS = 50;

const ESTADO_TONO = {
  abierto: "info",
  cancelado: "neutral",
  novedad: "destructive",
  cerrado: "success",
} as const;

type ColumnaId = "correlativo" | "fecha" | "plataforma" | "destino" | "monto" | "estado" | "dropi";

const COLUMNAS: { id: ColumnaId; label: string; ocultable: boolean; claseCelda?: string }[] = [
  { id: "correlativo", label: "#", ocultable: false, claseCelda: "font-semibold" },
  { id: "fecha", label: "Creación", ocultable: true },
  { id: "plataforma", label: "Plataforma", ocultable: true, claseCelda: "text-muted-foreground" },
  { id: "destino", label: "Destino", ocultable: true, claseCelda: "text-muted-foreground" },
  { id: "monto", label: "Monto", ocultable: true, claseCelda: "tabular-nums font-semibold" },
  { id: "estado", label: "Estado", ocultable: true },
  { id: "dropi", label: "Dropi", ocultable: true },
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
    case "dropi":
      return fila.estadoDropi ? (
        <Badge tone={TONO_ESTADO_DROPI[fila.estadoDropi as EstadoDropi]}>
          {ETIQUETA_ESTADO_DROPI[fila.estadoDropi as EstadoDropi]}
        </Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      );
  }
}

/** Tabla de retiros con menú de columnas: arrastrar para reordenar, casilla para ocultar.
 * La preferencia se guarda en localStorage — cada persona en su navegador ve su propio orden. */
export function TablaRetiros({ retiros, codigoPais }: { retiros: FilaRetiro[]; codigoPais: string }) {
  const [filtros, cambiarFiltros] = useFiltrosRetiros();
  const hayFiltros = filtros.some(filtroActivo);
  const coincidencias = useMemo(() => filtrarRetiros(retiros, filtros), [retiros, filtros]);
  const visibles = hayFiltros ? coincidencias : retiros.slice(0, LIMITE_SIN_FILTROS);

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

  // Alternativa de teclado al arrastrar con mouse: mueve una posición arriba/abajo.
  function moverPorTeclado(id: ColumnaId, direccion: -1 | 1) {
    setOrden((prev) => {
      const indice = prev.indexOf(id);
      const destino = indice + direccion;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
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
    <div className="mt-3 min-w-0 rounded-lg border border-border bg-card">
      <div
        ref={contenedorRef}
        className="flex items-center justify-end gap-2 border-b border-border bg-muted/50 px-2 py-1.5"
      >
        <BotonFiltrosRetiros
          filas={retiros}
          filtros={filtros}
          alCambiar={cambiarFiltros}
          alAbrir={() => setMenuAbierto(false)}
        />
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
              {orden.map((id, indice) => {
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
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        onClick={() => moverPorTeclado(id, -1)}
                        disabled={indice === 0}
                        aria-label={`Mover columna ${columna.label} hacia arriba`}
                        className="rounded px-1 leading-none text-muted-foreground hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-30"
                      >
                        <span aria-hidden="true">▲</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => moverPorTeclado(id, 1)}
                        disabled={indice === orden.length - 1}
                        aria-label={`Mover columna ${columna.label} hacia abajo`}
                        className="rounded px-1 leading-none text-muted-foreground hover:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:opacity-30"
                      >
                        <span aria-hidden="true">▼</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        tabIndex={0}
        role="region"
        aria-label="Tabla de retiros, desplazable horizontalmente con las flechas izquierda y derecha"
        className="min-w-0 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
      >
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-muted text-left text-muted-foreground">
            <th className="border-r border-border/60 px-4 py-3 text-xs font-semibold tracking-wide uppercase">
              Consolidación
            </th>
            {columnasVisibles.map((columna, i) => (
              <th
                key={columna.id}
                className={`px-4 py-3 text-xs font-semibold tracking-wide uppercase ${
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
          {visibles.map((fila) => (
            <tr key={fila.id} className="relative border-b border-border/60 last:border-0 hover:bg-muted/50">
              <td className="border-r border-border/40 px-4 py-3">
                <ConsolidadoToggle id={fila.id} consolidado={fila.consolidado} />
              </td>
              {columnasVisibles.map((columna, i) => (
                <td
                  key={columna.id}
                  className={`px-4 py-3 ${i < columnasVisibles.length - 1 ? "border-r border-border/40" : ""} ${
                    columna.claseCelda ?? ""
                  }`}
                >
                  {renderCelda(columna.id, fila, codigoPais)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {retiros.length === 0 && <EstadoVacio mensaje="Todavía no hay retiros registrados." />}
      {retiros.length > 0 && visibles.length === 0 && <EstadoVacio mensaje="Ningún retiro coincide con los filtros." />}
      {retiros.length > 0 && (hayFiltros || retiros.length > LIMITE_SIN_FILTROS) && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {hayFiltros
            ? `${visibles.length} de ${retiros.length} retiros`
            : `Mostrando los ${LIMITE_SIN_FILTROS} más recientes de ${retiros.length}. Usa los filtros para ver el resto.`}
        </p>
      )}
    </div>
  );
}
