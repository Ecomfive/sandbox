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
import { claseOpcionPanel, PanelCelda, type MotivoCierre } from "./panel-celda";
import { PastillaEtiqueta } from "./selector-etiquetas";
import { PanelLista } from "./selector-lista";
import { PastillaTienda, useTiendas } from "./tiendas";

/** Lo que la barra le pide a la lista: guardar un dato en todas las compras marcadas. */
export type AplicarEnLote = (campo: string, valor: unknown, modo?: ModoLote) => void;

/** Los datos que van directo en la barra, en el orden en que se usan al armar un envío; el resto va en «Más». */
const PRINCIPALES = ["etiquetas", "fechaLimite", "fechaEnvio", "etapa", "estado", "viaEnvio", "proveedor", "tienda"] as const;

const ICONO: Record<string, IconoComp> = {
  etapa: EstadoIcon,
  estado: EstadoIcon,
  etiquetas: EtiquetaIcon,
  viaEnvio: ComprasIcon,
  proveedor: ProductoIcon,
  agenteEnvio: ComprasIcon,
  ventaImportacion: ComprasIcon,
  tienda: ComprasIcon,
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
  tiendas,
  colores,
  guardando,
}: {
  filas: FilaCompra[];
  alQuitar: () => void;
  aplicar: AplicarEnLote;
  /** Todas las etiquetas que existen, para elegir. */
  etiquetas: string[];
  /** Todas las tiendas que existen, para elegir (lo escrito que no esté se crea). */
  tiendas: string[];
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
        <BotonCampoLote key={campo} campo={campo} filas={filas} aplicar={aplicar} etiquetas={etiquetas} tiendas={tiendas} colores={colores} deshabilitado={guardando} />
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
          tiendas={tiendas}
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
  tiendas,
  colores,
  deshabilitado,
}: {
  campo: string;
  filas: FilaCompra[];
  aplicar: AplicarEnLote;
  etiquetas: string[];
  tiendas: string[];
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
          tiendas={tiendas}
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
  tiendas,
  colores,
  alCerrar,
}: {
  campo: string;
  ancla: RefObject<HTMLButtonElement | null>;
  filas: FilaCompra[];
  aplicar: AplicarEnLote;
  etiquetas: string[];
  tiendas: string[];
  colores: Record<string, string>;
  alCerrar: (motivo: MotivoCierre | "elegido") => void;
}) {
  const def = CAMPOS_EDITABLES[campo];
  const vias = useRef<string[] | null>(null);
  const aria = `${def.etiqueta} de ${filas.length} ${filas.length === 1 ? "compra" : "compras"}`;

  if (def.tipo === "lista") {
    return (
      <EditorListaLote
        campo={campo}
        ancla={ancla}
        filas={filas}
        aplicar={aplicar}
        opciones={campo === "etiquetas" ? etiquetas : tiendas}
        colores={campo === "etiquetas" ? colores : undefined}
        alCerrar={alCerrar}
      />
    );
  }
  if (def.tipo === "multiple" && def.unica) {
    return (
      <EditorOpciones
        def={def}
        ancla={ancla}
        aria={aria}
        elegidas={[]}
        alElegir={(v) => {
          alCerrar("elegido");
          aplicar(campo, v[0] ? [v[0]] : []);
        }}
        alCerrar={alCerrar}
      />
    );
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
 * Una lista (las etiquetas o la tienda) para todas las marcadas: cada nombre dice si lo tienen todas (✓), algunas (–) o
 * ninguna. Pulsar uno lo pone en todas, o lo quita de todas si ya lo tenían todas; escribir uno nuevo y Enter lo crea y se
 * lo pone a todas. Cada pulsación se guarda al instante, respetando lo que cada compra ya tenía.
 */
function EditorListaLote({
  campo,
  ancla,
  filas,
  aplicar,
  opciones,
  colores,
  alCerrar,
}: {
  campo: string;
  ancla: RefObject<HTMLButtonElement | null>;
  filas: FilaCompra[];
  aplicar: AplicarEnLote;
  opciones: string[];
  /** Con color por nombre (las etiquetas) se dibujan como pastillas; sin él (la tienda), como texto. */
  colores?: Record<string, string>;
  alCerrar: (motivo: MotivoCierre | "elegido") => void;
}) {
  const def = CAMPOS_EDITABLES[campo];
  const listas = filas.map((f) => f[def.prop] as string[]);
  const tiendas = useTiendas();
  return (
    <PanelLista
      ancla={ancla}
      etiqueta={`${def.etiqueta} de ${filas.length} compras`}
      opciones={[...opciones, ...listas.flat()]}
      marca={(n) => {
        const p = presenciaEnLote(listas, n);
        return p === "todas" ? "si" : p === "algunas" ? "algunas" : "no";
      }}
      renderOpcion={colores ? (n) => <PastillaEtiqueta nombre={n} color={colores[n]} /> : campo === "tienda" ? (n) => <PastillaTienda nombre={n} /> : undefined}
      gestion={campo === "tienda" ? tiendas : null}
      placeholder={campo === "etiquetas" ? "Buscar o añadir etiquetas…" : `Buscar o añadir ${def.etiqueta.toLowerCase()}…`}
      alAlternar={(n) => aplicar(campo, [n], presenciaEnLote(listas, n) === "todas" ? "quitar" : "agregar")}
      alCrear={(n) => aplicar(campo, [n], "agregar")}
      alCerrar={alCerrar}
    />
  );
}