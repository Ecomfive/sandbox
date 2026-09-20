"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import { createPortal } from "react-dom";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import {
  BuscarIcon,
  CalendarioIcon,
  CerrarIcon,
  EstadoIcon,
  ExtractoIcon,
  FiltroIcon,
  GastoIcon,
  MasIcon,
  PedidoIcon,
  PersonaIcon,
  TiendaIcon,
} from "@/lib/nav-icons";
import {
  CAMPOS,
  CAMPO_POR_ID,
  PRESETS_FECHA,
  filtroActivo,
  filtroVacio,
  normalizar,
  opcionesDeSeleccion,
  parsearFiltros,
  rangoDePreset,
  type CampoId,
  type Filtro,
  type TipoCampo,
  type ValorFiltro,
} from "./filtros";
import type { FilaRetiro } from "./tabla-retiros";

export const ICONOS: Record<CampoId, ComponentType<SVGProps<SVGSVGElement>>> = {
  estado: EstadoIcon,
  plataforma: TiendaIcon,
  destino: ExtractoIcon,
  dropi: PedidoIcon,
  asignado: PersonaIcon,
  creacion: CalendarioIcon,
  cierre: CalendarioIcon,
  limite: CalendarioIcon,
  monto: GastoIcon,
  comision: GastoIcon,
  arecibir: GastoIcon,
  recibido: GastoIcon,
  notas: ExtractoIcon,
  soporte: ExtractoIcon,
};

const OPERADOR: Record<TipoCampo, string> = {
  seleccion: "es cualquiera de",
  fecha: "entre",
  numero: "entre",
  texto: "contiene",
};

// Los filtros viven en sessionStorage para que sobrevivan a entrar a un retiro y volver.
const CLAVE_STORAGE = "retiros-filtros-v1";
const oyentes = new Set<() => void>();
let filtrosEnMemoria: string | null = null;

function suscribir(avisar: () => void) {
  oyentes.add(avisar);
  return () => {
    oyentes.delete(avisar);
  };
}

function leerFiltrosGuardados(): string {
  if (filtrosEnMemoria !== null) return filtrosEnMemoria;
  try {
    return sessionStorage.getItem(CLAVE_STORAGE) ?? "";
  } catch {
    return "";
  }
}

function guardarFiltros(json: string) {
  filtrosEnMemoria = json;
  try {
    sessionStorage.setItem(CLAVE_STORAGE, json);
  } catch {
    // Sin sessionStorage (modo privado, cuotas) los filtros siguen funcionando mientras no se recargue.
  }
  oyentes.forEach((avisar) => avisar());
}

export function useFiltrosRetiros(): [Filtro[], (filtros: Filtro[]) => void] {
  const json = useSyncExternalStore(suscribir, leerFiltrosGuardados, () => "");
  const filtros = useMemo(() => parsearFiltros(json), [json]);
  const cambiar = useCallback((nuevos: Filtro[]) => guardarFiltros(JSON.stringify(nuevos)), []);
  return [filtros, cambiar];
}

function Chip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      title={typeof children === "string" ? children : undefined}
      className={`max-w-full truncate !rounded-full px-2.5 py-1 text-xs ${anilloFoco} ${
        activo
          ? "bg-foreground font-medium text-background"
          : "border border-border text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function EditorValor({
  campo,
  valor,
  filas,
  alCambiar,
}: {
  campo: CampoId;
  valor: ValorFiltro;
  filas: FilaRetiro[];
  alCambiar: (valor: ValorFiltro) => void;
}) {
  switch (valor.tipo) {
    case "seleccion": {
      const opciones = opcionesDeSeleccion(filas, campo);
      if (opciones.length === 0) {
        return <p className="text-xs text-muted-foreground">Todavía no hay valores para elegir.</p>;
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {opciones.map((opcion) => {
            const activo = valor.valores.includes(opcion.valor);
            return (
              <Chip
                key={opcion.valor}
                activo={activo}
                onClick={() =>
                  alCambiar({
                    tipo: "seleccion",
                    valores: activo ? valor.valores.filter((v) => v !== opcion.valor) : [...valor.valores, opcion.valor],
                  })
                }
              >
                {opcion.etiqueta}
              </Chip>
            );
          })}
        </div>
      );
    }
    case "fecha":
      return (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS_FECHA.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => alCambiar({ tipo: "fecha", ...rangoDePreset(preset.id, new Date()) })}
                className={`border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted ${anilloFoco}`}
              >
                {preset.etiqueta}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-0.5 text-xs text-muted-foreground">
              Desde
              <input
                type="date"
                value={valor.desde}
                onChange={(e) => alCambiar({ ...valor, desde: e.target.value })}
                className={fieldClassSm}
              />
            </label>
            <label className="flex flex-1 flex-col gap-0.5 text-xs text-muted-foreground">
              Hasta
              <input
                type="date"
                value={valor.hasta}
                onChange={(e) => alCambiar({ ...valor, hasta: e.target.value })}
                className={fieldClassSm}
              />
            </label>
          </div>
        </div>
      );
    case "numero":
      return (
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-0.5 text-xs text-muted-foreground">
            Mínimo
            <input
              type="number"
              step="0.01"
              value={valor.min}
              onChange={(e) => alCambiar({ ...valor, min: e.target.value })}
              className={`${fieldClassSm} tabular-nums`}
            />
          </label>
          <label className="flex flex-1 flex-col gap-0.5 text-xs text-muted-foreground">
            Máximo
            <input
              type="number"
              step="0.01"
              value={valor.max}
              onChange={(e) => alCambiar({ ...valor, max: e.target.value })}
              className={`${fieldClassSm} tabular-nums`}
            />
          </label>
        </div>
      );
    case "texto":
      return (
        <input
          type="text"
          value={valor.texto}
          placeholder="Escribe para buscar..."
          aria-label={`Texto que contiene ${CAMPO_POR_ID.get(campo)?.etiqueta ?? "el campo"}`}
          onChange={(e) => alCambiar({ tipo: "texto", texto: e.target.value })}
          className={`${fieldClassSm} w-full`}
        />
      );
  }
}

/**
 * Botón de filtros (ícono de embudo) que abre un panel estilo ClickUp: se elige un
 * campo del retiro en una lista con buscador y se le asigna el valor. Los filtros
 * se combinan con "y". El panel se dibuja en document.body para que el overflow
 * de la tabla no lo recorte.
 */
export function BotonFiltrosRetiros({
  filas,
  filtros,
  alCambiar,
  alAbrir,
}: {
  filas: FilaRetiro[];
  filtros: Filtro[];
  alCambiar: (filtros: Filtro[]) => void;
  alAbrir?: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [eligiendo, setEligiendo] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [caja, setCaja] = useState({ top: 0, left: 8, ancho: 448, altoMaximo: 480 });
  const botonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buscadorRef = useRef<HTMLInputElement>(null);

  const activos = filtros.filter(filtroActivo).length;
  const usados = new Set(filtros.map((f) => f.campo));
  const camposDisponibles = CAMPOS.filter(
    (campo) => !usados.has(campo.id) && normalizar(campo.etiqueta).includes(normalizar(busqueda.trim()))
  );

  useEffect(() => {
    if (!abierto) return;
    function alPulsar(e: MouseEvent) {
      const objetivo = e.target as Node;
      if (panelRef.current?.contains(objetivo) || botonRef.current?.contains(objetivo)) return;
      setAbierto(false);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setAbierto(false);
        botonRef.current?.focus();
        return;
      }
      // El panel vive al final del <body>: Tab da la vuelta dentro de él para no perder al usuario de teclado.
      if (e.key !== "Tab" || !panelRef.current || !panelRef.current.contains(document.activeElement)) return;
      // (el propio panel también cuenta como "dentro": recibe el foco al abrir)
      const enfocables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (enfocables.length === 0) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === panelRef.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    function alDesplazar(e: Event) {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) return;
      setAbierto(false);
    }
    function cerrar() {
      setAbierto(false);
    }
    document.addEventListener("mousedown", alPulsar);
    document.addEventListener("keydown", alTeclear);
    window.addEventListener("resize", cerrar);
    window.addEventListener("scroll", alDesplazar, true);
    return () => {
      document.removeEventListener("mousedown", alPulsar);
      document.removeEventListener("keydown", alTeclear);
      window.removeEventListener("resize", cerrar);
      window.removeEventListener("scroll", alDesplazar, true);
    };
  }, [abierto]);

  // Al abrir, el foco entra al panel (al buscador si se está eligiendo campo; si no, al panel mismo).
  useEffect(() => {
    if (!abierto) return;
    if (eligiendo) buscadorRef.current?.focus();
    else if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
  }, [abierto, eligiendo]);

  function alternar() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    const posicion = botonRef.current?.getBoundingClientRect();
    if (posicion) {
      const ancho = Math.min(448, window.innerWidth - 16);
      setCaja({
        top: posicion.bottom + 6,
        left: Math.max(8, Math.min(posicion.right - ancho, window.innerWidth - ancho - 8)),
        ancho,
        altoMaximo: Math.max(240, window.innerHeight - posicion.bottom - 20),
      });
    }
    setEligiendo(filtros.length === 0);
    setBusqueda("");
    alAbrir?.();
    setAbierto(true);
  }

  function agregar(campo: CampoId) {
    alCambiar([...filtros, filtroVacio(campo)]);
    setEligiendo(false);
    setBusqueda("");
  }

  function quitar(campo: CampoId) {
    const resto = filtros.filter((f) => f.campo !== campo);
    alCambiar(resto);
    if (resto.length === 0) setEligiendo(true);
  }

  function reemplazar(campo: CampoId, valor: ValorFiltro) {
    alCambiar(filtros.map((f) => (f.campo === campo ? { campo, valor } : f)));
  }

  return (
    <>
      <Tooltip texto="Filtrar retiros">
        <button
          ref={botonRef}
          type="button"
          onClick={alternar}
          aria-label={activos > 0 ? `Filtros, ${activos} ${activos === 1 ? "activo" : "activos"}` : "Filtros"}
          aria-haspopup="dialog"
          aria-expanded={abierto}
          className={`relative flex h-8 w-8 items-center justify-center !rounded-full transition-colors ${anilloFoco} ${
            activos > 0
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:bg-border"
          }`}
        >
          <FiltroIcon className="h-4 w-4" />
          {activos > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-border bg-card px-1 text-xs leading-none font-semibold text-foreground"
            >
              {activos}
            </span>
          )}
        </button>
      </Tooltip>

      {abierto &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Filtros"
            tabIndex={-1}
            style={{ top: caja.top, left: caja.left, width: caja.ancho, maxHeight: caja.altoMaximo }}
            className="fixed z-50 overflow-y-auto rounded-xl border border-border bg-card text-sm text-foreground normal-case shadow-xl focus:outline-none"
          >
            <div className="flex items-center justify-between px-3 pt-3 pb-2">
              <span className="text-sm font-semibold">Filtros</span>
              {filtros.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    alCambiar([]);
                    setEligiendo(true);
                  }}
                  className={`px-2 py-1.5 text-xs text-muted-foreground underline hover:text-foreground ${anilloFoco}`}
                >
                  Limpiar todo
                </button>
              )}
            </div>

            {filtros.length > 0 && (
              <div className="flex flex-col gap-2 px-3 pb-2">
                {filtros.map((filtro) => {
                  const definicion = CAMPO_POR_ID.get(filtro.campo)!;
                  const Icono = ICONOS[filtro.campo];
                  return (
                    <div key={filtro.campo} className="rounded-lg border border-border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <Icono className="h-4 w-4 text-muted-foreground" />
                          {definicion.etiqueta}
                          <span className="font-normal text-muted-foreground">{OPERADOR[definicion.tipo]}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => quitar(filtro.campo)}
                          aria-label={`Quitar filtro ${definicion.etiqueta}`}
                          className={`p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
                        >
                          <CerrarIcon className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2">
                        <EditorValor
                          campo={filtro.campo}
                          valor={filtro.valor}
                          filas={filas}
                          alCambiar={(valor) => reemplazar(filtro.campo, valor)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {eligiendo ? (
              <div className="px-3 pb-3">
                <div className="relative">
                  <BuscarIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={buscadorRef}
                    type="text"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                    placeholder="Buscar..."
                    aria-label="Buscar campo para filtrar"
                    className="w-full rounded-xl border border-border bg-card py-2 pr-3 pl-8 text-sm focus:border-foreground focus:ring-2 focus:ring-foreground focus:outline-none"
                  />
                </div>
                <div className="mt-2 max-h-64 overflow-y-auto">
                  {camposDisponibles.map((campo) => {
                    const Icono = ICONOS[campo.id];
                    return (
                      <button
                        key={campo.id}
                        type="button"
                        onClick={() => agregar(campo.id)}
                        className={`flex w-full items-center gap-2.5 px-2 py-2 text-left hover:bg-muted ${anilloFoco}`}
                      >
                        <Icono className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {campo.etiqueta}
                      </button>
                    );
                  })}
                  {camposDisponibles.length === 0 && (
                    <p className="px-2 py-3 text-muted-foreground">
                      {usados.size === CAMPOS.length ? "Ya usaste todos los campos." : "Sin resultados."}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              usados.size < CAMPOS.length && (
                <div className="px-3 pb-3">
                  <button
                    type="button"
                    onClick={() => setEligiendo(true)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
                  >
                    <MasIcon className="h-4 w-4" />
                    Agregar filtro
                  </button>
                </div>
              )
            )}
          </div>,
          document.body
        )}
    </>
  );
}
