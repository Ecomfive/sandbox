"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { numeroOC, type FilaCompra } from "./def-compras";
import { CAMPOS_EDITABLES, type CampoEditable } from "./def-edicion-compras";

/** Un campo dentro de la celda: mismo borde de control que los demás campos, pero con el tamaño del texto de la tabla. */
const claseCampo =
  "w-full min-w-[8rem] rounded border border-border-control bg-card px-2 py-1 text-sm focus:border-foreground focus:outline-none focus:ring-2 focus:ring-foreground";

export type GuardarCelda = (compra: FilaCompra, campo: string, valor: unknown) => void;

const valorInicial = (def: CampoEditable, compra: FilaCompra): string => {
  const v = compra[def.prop];
  if (def.tipo === "lista") return (v as string[]).join(", ");
  if (def.tipo === "booleano") return v ? "si" : "no";
  return v === null || v === undefined ? "" : String(v);
};

/**
 * Una celda de la lista de Compras que se edita en su sitio: se ve como siempre; al pulsarla se vuelve el campo que
 * corresponde a su dato (texto, número, fecha, selector o casillas de la vía de envío). Se guarda al salir del campo o con
 * Enter; Escape lo deja como estaba. Los selectores y las casillas guardan al elegir. Lo que no se puede editar (sin permiso
 * de escritura, o la cantidad y el monto de una compra con productos, que se calculan de ellos) se dibuja como texto, sin botón.
 */
export function CeldaEditable({
  compra,
  campo,
  puedeEscribir,
  guardar,
  children,
}: {
  compra: FilaCompra;
  /** El `id` de la columna (clave de `CAMPOS_EDITABLES`). */
  campo: string;
  puedeEscribir: boolean;
  guardar: GuardarCelda;
  children: ReactNode;
}) {
  const def = CAMPOS_EDITABLES[campo];
  const [editando, setEditando] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  // Al terminar con el teclado el foco vuelve al botón de la celda; con el ratón sigue donde se pulsó.
  const devolverFoco = useRef(false);

  useEffect(() => {
    if (!editando && devolverFoco.current) {
      devolverFoco.current = false;
      boton.current?.focus();
    }
  }, [editando]);

  if (!puedeEscribir || !def || (def.soloSinProductos && compra.productos > 0)) return <>{children}</>;

  const nombre = compra.productos > 0 ? numeroOC(compra.numero) : compra.nombre;

  function cerrar(conFoco: boolean) {
    devolverFoco.current = conFoco;
    setEditando(false);
  }

  if (!editando) {
    return (
      <button
        ref={boton}
        type="button"
        onClick={() => setEditando(true)}
        className={`-mx-1 block min-h-6 w-[calc(100%+0.5rem)] cursor-text rounded px-1 py-0.5 text-left transition-colors hover:bg-muted ${anilloFoco}`}
      >
        <span className="sr-only">
          Editar {def.etiqueta} de {nombre}:{" "}
        </span>
        {children}
      </button>
    );
  }

  const aria = `${def.etiqueta} de ${nombre}`;
  if (def.tipo === "multiple") {
    return (
      <EditorMultiple
        def={def}
        inicial={compra[def.prop] as string[]}
        aria={aria}
        alCambiar={(valor) => guardar(compra, campo, valor)}
        alCerrar={cerrar}
      />
    );
  }
  if (def.tipo === "seleccion" || def.tipo === "booleano") {
    return (
      <EditorSeleccion
        def={def}
        inicial={valorInicial(def, compra)}
        aria={aria}
        alTerminar={(valor, conFoco) => {
          cerrar(conFoco);
          if (valor !== undefined && valor !== valorInicial(def, compra)) guardar(compra, campo, def.tipo === "booleano" ? valor === "si" : valor);
        }}
      />
    );
  }
  return (
    <EditorTexto
      def={def}
      inicial={valorInicial(def, compra)}
      aria={aria}
      alTerminar={(valor, conFoco) => {
        cerrar(conFoco);
        if (valor !== undefined && valor !== valorInicial(def, compra)) guardar(compra, campo, valor);
      }}
    />
  );
}

/** Texto, número, dinero, fecha y lista: un campo que se guarda al salir de él o con Enter (`undefined` = no hay cambio). */
function EditorTexto({ def, inicial, aria, alTerminar }: { def: CampoEditable; inicial: string; aria: string; alTerminar: (valor: string | undefined, conFoco: boolean) => void }) {
  const [texto, setTexto] = useState(inicial);
  const campo = useRef<HTMLInputElement>(null);
  const terminado = useRef(false);

  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);

  function terminar(guardarCambio: boolean, conFoco: boolean) {
    if (terminado.current) return;
    terminado.current = true;
    alTerminar(guardarCambio ? texto : undefined, conFoco);
  }

  const tipo = def.tipo === "entero" || def.tipo === "dinero" ? "number" : def.tipo === "fecha" ? "date" : "text";
  return (
    <input
      ref={campo}
      type={tipo}
      aria-label={aria}
      value={texto}
      step={def.tipo === "dinero" ? "0.01" : def.tipo === "entero" ? "1" : undefined}
      min={def.tipo === "dinero" || def.tipo === "entero" ? 0 : undefined}
      inputMode={def.tipo === "dinero" ? "decimal" : def.tipo === "entero" ? "numeric" : undefined}
      maxLength={tipo === "text" ? 500 : undefined}
      placeholder={def.tipo === "lista" ? "Ej: reposición, kenku" : undefined}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => terminar(true, false)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          terminar(true, true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          terminar(false, true);
        }
      }}
      className={`${claseCampo} ${tipo === "number" ? "tabular-nums" : ""}`}
    />
  );
}

/** Etapa, estado, prioridad y Sí/No: un selector que se guarda al elegir (`undefined` = se cerró sin elegir). */
function EditorSeleccion({ def, inicial, aria, alTerminar }: { def: CampoEditable; inicial: string; aria: string; alTerminar: (valor: string | undefined, conFoco: boolean) => void }) {
  const campo = useRef<HTMLSelectElement>(null);
  const terminado = useRef(false);
  const opciones = def.tipo === "booleano" ? [{ valor: "si", etiqueta: "Sí" }, { valor: "no", etiqueta: "No" }] : (def.opciones ?? []);

  useEffect(() => {
    campo.current?.focus();
    // La lista se despliega sola para elegir de una vez; donde el navegador no sabe, queda enfocado y se abre con un clic.
    try {
      (campo.current as unknown as { showPicker?: () => void } | null)?.showPicker?.();
    } catch {
      /* sin gesto del usuario o sin soporte */
    }
  }, []);

  function terminar(valor: string | undefined, conFoco: boolean) {
    if (terminado.current) return;
    terminado.current = true;
    alTerminar(valor, conFoco);
  }

  return (
    <select
      ref={campo}
      aria-label={aria}
      defaultValue={inicial}
      onChange={(e) => terminar(e.target.value, true)}
      onBlur={() => terminar(undefined, false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          terminar(undefined, true);
        }
      }}
      className={claseCampo}
    >
      {def.admiteVacio && <option value="">Sin {def.etiqueta.toLowerCase()}</option>}
      {opciones.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
}

/**
 * La vía de envío (se puede elegir más de una): una casilla por vía, en la misma celda. Cada una guarda al marcarla o
 * desmarcarla; la celda se cierra al salir del grupo o con Escape. Las casillas no roban el foco al pulsarlas con el
 * ratón (en Safari y Firefox un botón no recibe foco al clic, y el grupo se cerraba antes de tiempo).
 */
function EditorMultiple({ def, inicial, aria, alCambiar, alCerrar }: { def: CampoEditable; inicial: string[]; aria: string; alCambiar: (valor: string[]) => void; alCerrar: (conFoco: boolean) => void }) {
  const [elegidas, setElegidas] = useState(inicial);
  const grupo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    grupo.current?.querySelector("button")?.focus();
  }, []);

  function alternar(valor: string) {
    const nuevas = elegidas.includes(valor) ? elegidas.filter((v) => v !== valor) : [...elegidas, valor];
    setElegidas(nuevas);
    alCambiar(nuevas);
  }

  return (
    <div
      ref={grupo}
      role="group"
      aria-label={aria}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) alCerrar(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          alCerrar(true);
        }
      }}
      className="flex flex-wrap gap-1"
    >
      {(def.opciones ?? []).map((o) => {
        const activa = elegidas.includes(o.valor);
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={activa}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => alternar(o.valor)}
            className={`rounded border px-2 py-1 text-xs font-medium whitespace-nowrap ${anilloFoco} ${
              activa ? "border-foreground bg-foreground text-background" : "border-border-control bg-card hover:bg-muted"
            }`}
          >
            {o.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
