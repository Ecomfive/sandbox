"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { combinarLista, presenciaEnLote } from "@/lib/compras/lote";
import { hoy } from "./calculos-compras";
import { numeroOC, type FilaCompra } from "./def-compras";
import { CAMPOS_EDITABLES, type CampoEditable } from "./def-edicion-compras";
import { claseCampoPanel, claseOpcionPanel, PanelCelda, type MotivoCierre } from "./panel-celda";
import { PanelLista } from "./selector-lista";
import { PastillaTienda, useTiendas } from "./tiendas";

export type GuardarCelda = (compra: FilaCompra, campo: string, valor: unknown) => void;

const valorInicial = (def: CampoEditable, compra: FilaCompra): string => {
  const v = compra[def.prop];
  if (def.tipo === "lista") return (v as string[]).join(", ");
  if (def.tipo === "booleano") return v ? "si" : "no";
  return v === null || v === undefined ? "" : String(v);
};

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Una celda de la lista de Compras que se edita en su sitio, igual en todas las columnas (como en ClickUp): se ve como
 * siempre y al pulsarla se abre bajo ella el mismo panel. Las listas (etapa, estado, Sí/No) guardan al elegir;
 * la vía de envío marca y desmarca; el texto, los números y las fechas se guardan con Enter o al pulsar fuera, y Escape
 * lo deja como estaba. Lo que no se puede editar (sin permiso de escritura, o la cantidad y el monto de una compra con
 * productos, que se calculan de ellos) se dibuja como texto, sin botón.
 */
export function CeldaEditable({
  compra,
  campo,
  puedeEscribir,
  guardar,
  opcionesLista,
  children,
}: {
  compra: FilaCompra;
  /** El `id` de la columna (clave de `CAMPOS_EDITABLES`). */
  campo: string;
  puedeEscribir: boolean;
  guardar: GuardarCelda;
  /** En un dato que es una lista (la tienda): todos los nombres que existen, para elegir; lo escrito que no esté se crea. */
  opcionesLista?: string[];
  children: ReactNode;
}) {
  const def = CAMPOS_EDITABLES[campo];
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const tiendas = useTiendas();

  if (!puedeEscribir || !def || (def.soloSinProductos && compra.productos > 0)) return <>{children}</>;

  const nombre = compra.productos > 0 ? numeroOC(compra.numero) : compra.nombre;
  const aria = `${def.etiqueta} de ${nombre}`;
  const inicial = valorInicial(def, compra);

  /** Cierra el panel; con el teclado el foco vuelve a la celda. */
  function cerrar(motivo: MotivoCierre | "elegido") {
    setAbierto(false);
    if (motivo !== "fuera") boton.current?.focus();
  }
  /** Guarda si el dato cambió. */
  function enviar(valor: string) {
    if (valor !== inicial) guardar(compra, campo, def.tipo === "booleano" ? valor === "si" : valor);
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto(true)}
        className={`-mx-1 block min-h-6 w-[calc(100%+0.5rem)] cursor-pointer rounded px-1 py-0.5 text-left transition-colors hover:bg-muted ${
          abierto ? "bg-muted ring-1 ring-primario/60" : ""
        } ${anilloFoco}`}
      >
        <span className="sr-only">Editar {aria}: </span>
        {children}
      </button>
      {abierto &&
        (def.tipo === "lista" ? (
          // Una lista abierta (la tienda): se elige una o varias y, si no existe, se crea ahí mismo; cada cambio se guarda al instante.
          <PanelLista
            ancla={boton}
            etiqueta={aria}
            opciones={[...(opcionesLista ?? []), ...(compra[def.prop] as string[])]}
            marca={(n) => (presenciaEnLote([compra[def.prop] as string[]], n) === "todas" ? "si" : "no")}
            placeholder={`Buscar o añadir ${def.etiqueta.toLowerCase()}…`}
            alAlternar={(n) => {
              const puestas = compra[def.prop] as string[];
              guardar(compra, campo, combinarLista(puestas, presenciaEnLote([puestas], n) === "todas" ? "quitar" : "agregar", [n]));
            }}
            alCrear={(n) => guardar(compra, campo, combinarLista(compra[def.prop] as string[], "agregar", [n]))}
            alCerrar={cerrar}
            renderOpcion={campo === "tienda" ? (n) => <PastillaTienda nombre={n} /> : undefined}
            gestion={campo === "tienda" ? tiendas : null}
          />
        ) : def.tipo === "multiple" && def.unica ? (
          // Una sola opción aunque se guarde como lista (la vía de envío): elegir guarda y cierra; «Sin …» la deja vacía.
          <EditorOpciones
            def={def}
            ancla={boton}
            aria={aria}
            elegidas={(compra[def.prop] as string[]).slice(0, 1)}
            alElegir={(v) => {
              cerrar("elegido");
              const nueva = v[0] ? [v[0]] : [];
              if (JSON.stringify(nueva) !== JSON.stringify(compra[def.prop])) guardar(compra, campo, nueva);
            }}
            alCerrar={cerrar}
          />
        ) : def.tipo === "multiple" ? (
          <EditorOpciones
            def={def}
            ancla={boton}
            aria={aria}
            multiple
            elegidas={compra[def.prop] as string[]}
            alElegir={(v) => guardar(compra, campo, v)}
            alCerrar={cerrar}
          />
        ) : def.tipo === "seleccion" || def.tipo === "booleano" ? (
          <EditorOpciones
            def={def}
            ancla={boton}
            aria={aria}
            elegidas={inicial ? [inicial] : []}
            alElegir={(v) => {
              cerrar("elegido");
              enviar(v[0] ?? "");
            }}
            alCerrar={cerrar}
          />
        ) : def.tipo === "fecha" ? (
          <EditorFecha
            ancla={boton}
            aria={aria}
            inicial={inicial}
            alTerminar={(valor, motivo) => {
              cerrar(motivo);
              if (valor !== undefined) enviar(valor);
            }}
          />
        ) : (
          <EditorTexto
            def={def}
            ancla={boton}
            aria={aria}
            inicial={inicial}
            alTerminar={(valor, motivo) => {
              cerrar(motivo);
              if (valor !== undefined) enviar(valor);
            }}
          />
        ))}
    </>
  );
}

/** Cómo se ve una opción: con su color, la misma insignia de la celda; sin color, el texto tal cual. */
function Opcion({ def, valor, etiqueta }: { def: CampoEditable; valor: string; etiqueta: string }) {
  const color = def.color?.(valor);
  return color ? <Badge color={color}>{etiqueta}</Badge> : <span className="truncate">{etiqueta}</span>;
}

/**
 * Etapa, estado, Sí/No y la vía de envío: la lista de opciones con buscador (si son muchas), flechas y Enter.
 * Una sola opción guarda al elegirla y cierra; con `multiple` se marcan varias y cada una guarda al instante.
 */
export function EditorOpciones({
  def,
  ancla,
  aria,
  elegidas: inicial,
  multiple = false,
  alElegir,
  alCerrar,
}: {
  def: CampoEditable;
  ancla: RefObject<HTMLButtonElement | null>;
  aria: string;
  elegidas: string[];
  multiple?: boolean;
  alElegir: (valores: string[]) => void;
  alCerrar: (motivo: MotivoCierre) => void;
}) {
  const [elegidas, setElegidas] = useState(inicial);
  const [busqueda, setBusqueda] = useState("");
  const todas = useMemo(() => {
    const base =
      def.tipo === "booleano"
        ? [
            { valor: "si", etiqueta: def.siNo?.si ?? "Sí" },
            { valor: "no", etiqueta: def.siNo?.no ?? "No" },
          ]
        : [...(def.opciones ?? [])];
    return def.admiteVacio ? [...base, { valor: "", etiqueta: `Sin ${def.etiqueta.toLowerCase()}` }] : base;
  }, [def]);
  const conBuscador = todas.length > 6;
  const q = normal(busqueda);
  const opciones = q ? todas.filter((o) => normal(o.etiqueta).includes(q)) : todas;
  const [activa, setActiva] = useState(() =>
    Math.max(
      0,
      todas.findIndex((o) => inicial.includes(o.valor)),
    ),
  );
  const lista = useRef<HTMLUListElement>(null);
  const buscador = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (conBuscador) buscador.current?.focus();
    else lista.current?.focus();
  }, [conBuscador]);
  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${activa}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activa]);

  function elegir(valor: string) {
    if (!multiple) return alElegir([valor]);
    const nuevas = elegidas.includes(valor) ? elegidas.filter((v) => v !== valor) : [...elegidas, valor];
    setElegidas(nuevas);
    alElegir(nuevas);
  }

  function teclas(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = opciones.length;
      if (n) setActiva((i) => (Math.min(i, n - 1) + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = opciones[Math.min(activa, opciones.length - 1)];
      if (o) elegir(o.valor);
    }
  }

  return (
    <PanelCelda ancla={ancla} etiqueta={aria} alCerrar={alCerrar} ancho={240}>
      {conBuscador && (
        <input
          ref={buscador}
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setActiva(0);
          }}
          onKeyDown={teclas}
          placeholder="Buscar…"
          aria-label={`Buscar ${def.etiqueta.toLowerCase()}`}
          className={claseCampoPanel}
        />
      )}
      <ul
        ref={lista}
        role="listbox"
        aria-label={aria}
        aria-multiselectable={multiple || undefined}
        aria-activedescendant={opciones.length ? `opcion-celda-${activa}` : undefined}
        tabIndex={conBuscador ? -1 : 0}
        onKeyDown={teclas}
        className="m-0 flex max-h-72 list-none flex-col gap-0.5 overflow-y-auto p-1.5 outline-none"
      >
        {opciones.map((o, i) => {
          const marcada = elegidas.includes(o.valor);
          return (
            <li
              key={o.valor || "vacio"}
              id={`opcion-celda-${i}`}
              data-indice={i}
              role="option"
              aria-selected={marcada}
              onMouseEnter={() => setActiva(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => elegir(o.valor)}
              className={`${claseOpcionPanel} cursor-pointer ${i === activa ? "bg-muted" : ""}`}
            >
              {o.valor ? <Opcion def={def} valor={o.valor} etiqueta={o.etiqueta} /> : <span className="text-muted-foreground">{o.etiqueta}</span>}
              {marcada && (
                <span aria-hidden="true" className="text-xs text-primario">
                  ✓
                </span>
              )}
            </li>
          );
        })}
        {opciones.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados.</li>}
      </ul>
    </PanelCelda>
  );
}

/** Texto, números y dinero: un solo campo; Enter o pulsar fuera guarda, Escape descarta (`undefined` = sin cambio). */
export function EditorTexto({
  def,
  ancla,
  aria,
  inicial,
  alTerminar,
}: {
  def: CampoEditable;
  ancla: RefObject<HTMLButtonElement | null>;
  aria: string;
  inicial: string;
  alTerminar: (valor: string | undefined, motivo: MotivoCierre | "elegido") => void;
}) {
  const [texto, setTexto] = useState(inicial);
  const campo = useRef<HTMLInputElement>(null);
  const numero = def.tipo === "entero" || def.tipo === "dinero";

  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);

  // En los números se acepta la coma decimal («12,5»).
  const limpio = () => (numero ? texto.replace(/\s/g, "").replace(",", ".") : texto);

  return (
    <PanelCelda ancla={ancla} etiqueta={aria} alCerrar={(m) => alTerminar(m === "escape" ? undefined : limpio(), m)} ancho={numero ? 200 : 280}>
      <span className="flex items-center">
        {def.tipo === "dinero" && <span className="pl-3 text-muted-foreground">$</span>}
        <input
          ref={campo}
          type="text"
          aria-label={aria}
          value={texto}
          inputMode={def.tipo === "dinero" ? "decimal" : def.tipo === "entero" ? "numeric" : undefined}
          maxLength={500}
          placeholder={numero ? "0" : def.etiqueta}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              alTerminar(limpio(), "elegido");
            }
          }}
          className={`${claseCampoPanel} border-b-0 ${numero ? "tabular-nums" : ""} ${def.tipo === "dinero" ? "pl-1.5" : ""}`}
        />
      </span>
    </PanelCelda>
  );
}

const sumarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/** Fechas: el campo de fecha y atajos (Hoy, Mañana, En una semana, Quitar), como el selector de fechas de ClickUp. */
export function EditorFecha({
  ancla,
  aria,
  inicial,
  conQuitar = !!inicial,
  alQuitar,
  alTerminar,
}: {
  ancla: RefObject<HTMLElement | null>;
  aria: string;
  inicial: string;
  /** Ofrece «Quitar fecha» (por defecto, solo si ya había una). En la barra de varias compras siempre. */
  conQuitar?: boolean;
  /** Si se da, «Quitar fecha» llama a esto en vez de `alTerminar("")`: así quien lo usa distingue quitarla de no haber elegido nada. */
  alQuitar?: () => void;
  alTerminar: (valor: string | undefined, motivo: MotivoCierre | "elegido") => void;
}) {
  const [texto, setTexto] = useState(inicial);
  const campo = useRef<HTMLInputElement>(null);
  const dia = hoy();
  const atajos = [
    { etiqueta: "Hoy", valor: dia },
    { etiqueta: "Mañana", valor: sumarDias(dia, 1) },
    { etiqueta: "En una semana", valor: sumarDias(dia, 7) },
    ...(conQuitar ? [{ etiqueta: "Quitar fecha", valor: "" }] : []),
  ];

  useEffect(() => {
    campo.current?.focus();
  }, []);

  return (
    <PanelCelda ancla={ancla} etiqueta={aria} alCerrar={(m) => alTerminar(m === "escape" ? undefined : texto, m)} ancho={220}>
      <input
        ref={campo}
        type="date"
        aria-label={aria}
        value={texto}
        min="2000-01-01"
        max="2100-12-31"
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            alTerminar(texto, "elegido");
          }
        }}
        className={`${claseCampoPanel} tabular-nums`}
      />
      <ul className="m-0 flex list-none flex-col gap-0.5 p-1.5">
        {atajos.map((a) => (
          <li key={a.etiqueta}>
            <button
              type="button"
              onClick={() => (!a.valor && alQuitar ? alQuitar() : alTerminar(a.valor, "elegido"))}
              className={`${claseOpcionPanel} hover:bg-muted ${a.valor ? "" : "text-muted-foreground"} ${anilloFoco}`}
            >
              <span>{a.etiqueta}</span>
              {a.valor && <span className="text-xs text-muted-foreground tabular-nums">{a.valor.split("-").reverse().join("/")}</span>}
            </button>
          </li>
        ))}
      </ul>
    </PanelCelda>
  );
}
