"use client";

import { useRef, useState, type RefObject } from "react";
import { BotonDescargar } from "@/components/tabla/boton-descargar";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { presenciaEnLote, type ModoLote } from "@/lib/compras/lote";
import { CalendarioIcon, CerrarIcon, ComprasIcon, EstadoIcon, EtiquetaIcon, FlechaAbajoIcon, GastoIcon, ProductoIcon } from "@/lib/nav-icons";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { EditorFecha, EditorOpciones, EditorTexto } from "./celda-editable";
import { DEF_COMPRAS, type FilaCompra } from "./def-compras";
import { CAMPOS_EDITABLES } from "./def-edicion-compras";
import { claseCampoPanel, claseOpcionPanel, PanelCelda, type MotivoCierre } from "./panel-celda";
import { PastillaEtiqueta } from "./selector-etiquetas";

/** Lo que la barra le pide a la lista: guardar un dato en todas las compras marcadas. */
export type AplicarEnLote = (campo: string, valor: unknown, modo?: ModoLote) => void;

/** Los datos que van directo en la barra, en el orden en que se usan al armar un envío; el resto va en «Más». */
const PRINCIPALES = ["etiquetas", "fechaLimite", "planificacion", "etapa", "estado", "viaEnvio", "proveedor", "tienda"] as const;

const ICONO: Record<string, IconoComp> = {
  etapa: EstadoIcon,
  estado: EstadoIcon,
  etiquetas: EtiquetaIcon,
  viaEnvio: ComprasIcon,
  proveedor: ProductoIcon,
  tienda: ComprasIcon,
  planificacion: CalendarioIcon,
  qtyTotal: ProductoIcon,
  montoTotal: GastoIcon,
  primerPago: GastoIcon,
  segundoPago: GastoIcon,
  pagadoAProveedor: GastoIcon,
  factura: EstadoIcon,
  financiamiento: GastoIcon,
};
const claseBoton = `inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[13px] hover:bg-muted ${anilloFoco}`;

/**
 * Barra de las compras que se marcaron en la lista (como la de acciones en lote de ClickUp): dice cuántas hay marcadas y deja
 * cambiarles **un mismo dato a todas a la vez** (la etiqueta del envío, la fecha límite, la planificación, la etapa…). Cada
 * botón abre el mismo panel que las celdas; lo que se elige se guarda en todas las marcadas y la selección sigue ahí para
 * seguir con otro dato. También descarga solo lo marcado. Queda fija abajo mientras la tabla está a la vista.
 */
export function BarraLoteCompras({
  filas,
  alQuitar,
  aplicar,
  etiquetas,
  colores,
  guardando,
}: {
  filas: FilaCompra[];
  alQuitar: () => void;
  aplicar: AplicarEnLote;
  /** Todas las etiquetas que existen, para elegir. */
  etiquetas: string[];
  colores: Record<string, string>;
  guardando: boolean;
}) {
  const cantidad = `${filas.length} ${filas.length === 1 ? "compra seleccionada" : "compras seleccionadas"}`;
  const botonMas = useRef<HTMLButtonElement>(null);
  const [menuMas, setMenuMas] = useState(false);
  const [campoMas, setCampoMas] = useState<string | null>(null);
  const restantes = Object.keys(CAMPOS_EDITABLES).filter((c) => !(PRINCIPALES as readonly string[]).includes(c));

  return (
    <div
      role="region"
      aria-label="Compras seleccionadas"
      aria-busy={guardando}
      // Más arriba que la barra de otras tablas: debajo van la fila de totales y la barra de desplazamiento, que no se tapan.
      className="sticky bottom-24 z-30 mx-auto my-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-border-control bg-card px-3 py-2 text-sm shadow-lg"
    >
      <p role="status" className="mr-1 font-medium tabular-nums">
        {cantidad}
      </p>
      {PRINCIPALES.map((campo) => (
        <BotonCampoLote key={campo} campo={campo} filas={filas} aplicar={aplicar} etiquetas={etiquetas} colores={colores} deshabilitado={guardando} />
      ))}
      <button
        ref={botonMas}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={menuMas}
        disabled={guardando}
        onClick={() => setMenuMas((v) => !v)}
        className={`${claseBoton} disabled:opacity-50`}
      >
        Más
        <FlechaAbajoIcon className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {menuMas && (
        <PanelCelda
          ancla={botonMas}
          etiqueta="Más datos para cambiar"
          ancho={230}
          alCerrar={(m) => {
            setMenuMas(false);
            if (m === "escape") botonMas.current?.focus();
          }}
        >
          <ul className="m-0 flex max-h-72 list-none flex-col gap-0.5 overflow-y-auto p-1.5">
            {restantes.map((campo) => (
              <li key={campo}>
                <button
                  type="button"
                  onClick={() => {
                    setMenuMas(false);
                    setCampoMas(campo);
                  }}
                  className={`${claseOpcionPanel} hover:bg-muted ${anilloFoco}`}
                >
                  {CAMPOS_EDITABLES[campo].etiqueta}
                </button>
              </li>
            ))}
          </ul>
        </PanelCelda>
      )}
      {campoMas && (
        <EditorCampoLote
          campo={campoMas}
          ancla={botonMas}
          filas={filas}
          aplicar={aplicar}
          etiquetas={etiquetas}
          colores={colores}
          alCerrar={(m) => {
            setCampoMas(null);
            if (m !== "fuera") botonMas.current?.focus();
          }}
        />
      )}
      <BotonDescargar def={DEF_COMPRAS} filas={filas} nombreFilas="compras" ayuda="Descargar seleccionadas" />
      <Tooltip texto="Quitar selección">
        <button
          type="button"
          onClick={alQuitar}
          aria-label="Quitar la selección"
          className={`flex min-h-8 min-w-8 items-center justify-center !rounded-md text-muted-foreground hover:bg-muted ${anilloFoco}`}
        >
          <CerrarIcon className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}

/** Un dato de la barra: el botón con su ícono y, al pulsarlo, el panel para elegir el valor que va a todas las marcadas. */
function BotonCampoLote({
  campo,
  filas,
  aplicar,
  etiquetas,
  colores,
  deshabilitado,
}: {
  campo: string;
  filas: FilaCompra[];
  aplicar: AplicarEnLote;
  etiquetas: string[];
  colores: Record<string, string>;
  deshabilitado: boolean;
}) {
  const def = CAMPOS_EDITABLES[campo];
  const ancla = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  if (!def) return null;
  const Icono = ICONO[campo] ?? CalendarioIcon;
  return (
    <>
      <button
        ref={ancla}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        disabled={deshabilitado}
        onClick={() => setAbierto((v) => !v)}
        className={`${claseBoton} ${abierto ? "bg-muted" : ""} disabled:opacity-50`}
      >
        <Icono className="h-3.5 w-3.5 text-muted-foreground" />
        {def.etiqueta}
      </button>
      {abierto && (
        <EditorCampoLote
          campo={campo}
          ancla={ancla}
          filas={filas}
          aplicar={aplicar}
          etiquetas={etiquetas}
          colores={colores}
          alCerrar={(m) => {
            setAbierto(false);
            if (m !== "fuera") ancla.current?.focus();
          }}
        />
      )}
    </>
  );
}

/**
 * El panel de un dato para todas las marcadas: el mismo de las celdas (lista de opciones, texto o número, fecha con atajos),
 * sin valor de partida. Un texto o un monto vacío no cambia nada (no se borra un dato de varias compras sin querer); una
 * fecha se quita con «Quitar fecha». La vía de envío, que marca varias, se guarda al cerrar el panel.
 */
function EditorCampoLote({
  campo,
  ancla,
  filas,
  aplicar,
  etiquetas,
  colores,
  alCerrar,
}: {
  campo: string;
  ancla: RefObject<HTMLButtonElement | null>;
  filas: FilaCompra[];
  aplicar: AplicarEnLote;
  etiquetas: string[];
  colores: Record<string, string>;
  alCerrar: (motivo: MotivoCierre | "elegido") => void;
}) {
  const def = CAMPOS_EDITABLES[campo];
  const vias = useRef<string[] | null>(null);
  const aria = `${def.etiqueta} de ${filas.length} ${filas.length === 1 ? "compra" : "compras"}`;

  if (def.tipo === "lista") {
    return <EditorEtiquetasLote ancla={ancla} filas={filas} aplicar={aplicar} etiquetas={etiquetas} colores={colores} alCerrar={alCerrar} />;
  }
  if (def.tipo === "multiple") {
    return (
      <EditorOpciones
        def={def}
        ancla={ancla}
        aria={aria}
        multiple
        elegidas={[]}
        alElegir={(v) => {
          vias.current = v;
        }}
        alCerrar={(m) => {
          if (m !== "escape" && vias.current) aplicar(campo, vias.current);
          alCerrar(m);
        }}
      />
    );
  }
  if (def.tipo === "seleccion" || def.tipo === "booleano") {
    return (
      <EditorOpciones
        def={def}
        ancla={ancla}
        aria={aria}
        elegidas={[]}
        alElegir={(v) => {
          alCerrar("elegido");
          aplicar(campo, def.tipo === "booleano" ? v[0] === "si" : (v[0] ?? ""));
        }}
        alCerrar={alCerrar}
      />
    );
  }
  if (def.tipo === "fecha") {
    return (
      <EditorFecha
        ancla={ancla}
        aria={aria}
        inicial=""
        conQuitar
        alQuitar={() => {
          alCerrar("elegido");
          aplicar(campo, "");
        }}
        alTerminar={(valor, motivo) => {
          alCerrar(motivo);
          if (valor) aplicar(campo, valor);
        }}
      />
    );
  }
  return (
    <EditorTexto
      def={def}
      ancla={ancla}
      aria={aria}
      inicial=""
      alTerminar={(valor, motivo) => {
        alCerrar(motivo);
        if (valor) aplicar(campo, valor);
      }}
    />
  );
}

/**
 * Las etiquetas para todas las marcadas: cada una dice si la tienen todas (✓), algunas (–) o ninguna. Pulsar una la pone en
 * todas, o la quita de todas si ya la tenían todas; escribir una nueva y Enter la crea y se la pone a todas. Cada pulsación se
 * guarda al instante, respetando las que cada compra ya tenía.
 */
function EditorEtiquetasLote({
  ancla,
  filas,
  aplicar,
  etiquetas,
  colores,
  alCerrar,
}: {
  ancla: RefObject<HTMLButtonElement | null>;
  filas: FilaCompra[];
  aplicar: AplicarEnLote;
  etiquetas: string[];
  colores: Record<string, string>;
  alCerrar: (motivo: MotivoCierre | "elegido") => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const q = normal(busqueda);
  const listas = filas.map((f) => f.etiquetas);
  const todas = [...new Set([...etiquetas, ...listas.flat()])].sort((a, b) => a.localeCompare(b, "es"));
  const opciones = q ? todas.filter((e) => normal(e).includes(q)) : todas;
  const nueva = busqueda.trim().replace(/\s+/g, " ").slice(0, 40);
  const puedeCrear = !!nueva && !todas.some((e) => normal(e) === normal(nueva));

  function alternar(e: string) {
    aplicar("etiquetas", [e], presenciaEnLote(listas, e) === "todas" ? "quitar" : "agregar");
  }
  function crear() {
    if (!puedeCrear) return;
    aplicar("etiquetas", [nueva], "agregar");
    setBusqueda("");
  }

  return (
    <PanelCelda ancla={ancla} etiqueta={`Etiquetas de ${filas.length} compras`} ancho={280} alCerrar={alCerrar}>
      <input
        autoFocus
        value={busqueda}
        onChange={(ev) => setBusqueda(ev.target.value)}
        onKeyDown={(ev) => {
          if (ev.key === "Enter") {
            ev.preventDefault();
            if (puedeCrear) crear();
            else if (opciones.length === 1) alternar(opciones[0]);
          }
        }}
        placeholder="Buscar o añadir etiquetas…"
        aria-label="Buscar o añadir etiquetas"
        className={claseCampoPanel}
      />
      <ul className="m-0 flex max-h-64 list-none flex-col gap-0.5 overflow-y-auto p-1.5">
        {puedeCrear && (
          <li>
            <button type="button" onClick={crear} className={`${claseOpcionPanel} justify-start hover:bg-muted ${anilloFoco}`}>
              <span className="text-muted-foreground">Crear</span> <PastillaEtiqueta nombre={nueva} color={colores[nueva]} />
            </button>
          </li>
        )}
        {opciones.map((e) => {
          const presencia = presenciaEnLote(listas, e);
          return (
            <li key={e}>
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={presencia === "todas" ? true : presencia === "algunas" ? "mixed" : false}
                onClick={() => alternar(e)}
                className={`${claseOpcionPanel} hover:bg-muted ${anilloFoco}`}
              >
                <PastillaEtiqueta nombre={e} color={colores[e]} />
                {presencia !== "ninguna" && (
                  <span aria-hidden="true" className="text-xs text-primario">
                    {presencia === "todas" ? "✓" : "–"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
        {opciones.length === 0 && !puedeCrear && <li className="px-2 py-1.5 text-xs text-muted-foreground">Sin etiquetas.</li>}
      </ul>
    </PanelCelda>
  );
}
