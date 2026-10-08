"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bandera } from "@/components/paises/bandera";
import { anilloFoco } from "@/components/ui/field";
import { claseOpcionMenu, MenuDesplegable } from "@/components/ui/menu-desplegable";
import { agregarPaisRapido } from "@/lib/paises-actions";
import { normalPais, paisesDelMundo } from "@/lib/paises-mundo";
import { CheckIcon, MasIcon } from "@/lib/nav-icons";
import { claseCampoPanel, claseOpcionPanel, PanelCelda } from "./panel-celda";

type Pais = { id?: string; codigo: string; nombre: string };

/**
 * El país de una compra con la bandera de cada uno (como el selector «Todos los países» de arriba). Viaja en el formulario
 * con un `<select>` oculto (`nombre`, obligatorio), así el formulario lo ve igual que antes: lo marca si falta y lo envía.
 *
 * Con `puedeAgregar` (quien modifica Configuración), al final de la lista está «Agregar país», como en ClickUp: se escribe el
 * nombre, se elige de los países del mundo (con su bandera) y queda agregado al sistema y elegido en la compra, sin otra ficha.
 */
export function SelectorPais({
  id,
  nombre,
  paises,
  valor,
  invalido,
  alCambiar,
  puedeAgregar = false,
  alAgregado,
}: {
  id: string;
  nombre: string;
  paises: Pais[];
  valor: string;
  invalido?: boolean;
  alCambiar: (codigo: string) => void;
  puedeAgregar?: boolean;
  /** El país recién agregado al sistema (para sumarlo a la lista). */
  alAgregado?: (pais: { id: string; codigo: string; nombre: string }) => void;
}) {
  const select = useRef<HTMLSelectElement>(null);
  const ancla = useRef<HTMLDivElement>(null);
  const primera = useRef(true);
  const [agregando, setAgregando] = useState(false);
  const actual = paises.find((p) => p.codigo === valor) ?? null;

  // Cada cambio se le avisa al formulario como si se hubiera elegido en el `<select>` (revisa lo obligatorio).
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    select.current?.dispatchEvent(new Event("change", { bubbles: true }));
  }, [valor]);

  return (
    <div ref={ancla}>
      <select ref={select} id={id} data-destino={`${id}-boton`} name={nombre} required value={valor} onChange={() => {}} tabIndex={-1} aria-hidden="true" className="sr-only">
        <option value="" />
        {paises.map((p) => (
          <option key={p.codigo} value={p.codigo} />
        ))}
      </select>
      <MenuDesplegable
        etiqueta={actual ? `País de la compra: ${actual.nombre}` : "Elegir el país de la compra"}
        alineacion="izquierda"
        claseMenu="w-64 max-h-80 overflow-y-auto"
        claseBoton={`flex w-full items-center gap-2 rounded-md border bg-card px-3 py-2 text-left text-sm hover:bg-muted ${invalido ? "border-destructive" : "border-border-control"}`}
        contenidoBoton={
          <span id={`${id}-boton`} className="flex w-full items-center gap-2">
            {actual ? (
              <>
                <Bandera codigo={actual.codigo} />
                <span className="truncate">{actual.nombre}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Elige el país</span>
            )}
            <span aria-hidden="true" className="ml-auto text-muted-foreground">
              ▾
            </span>
          </span>
        }
      >
        {(cerrar) => (
          <>
            {paises.map((p) => (
              <button
                key={p.codigo}
                type="button"
                role="menuitemradio"
                aria-checked={p.codigo === valor}
                onClick={() => {
                  cerrar(true);
                  if (p.codigo !== valor) alCambiar(p.codigo);
                }}
                className={claseOpcionMenu}
              >
                <Bandera codigo={p.codigo} />
                <span className={p.codigo === valor ? "font-semibold" : ""}>{p.nombre}</span>
                {p.codigo === valor && <CheckIcon className="ml-auto h-4 w-4 text-success" />}
              </button>
            ))}
            {puedeAgregar && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  cerrar(false);
                  setAgregando(true);
                }}
                className={`${claseOpcionMenu} border-t border-border text-muted-foreground`}
              >
                <MasIcon className="h-3.5 w-3.5" />
                Agregar país
              </button>
            )}
          </>
        )}
      </MenuDesplegable>
      {agregando && (
        <AgregarPais
          ancla={ancla}
          existentes={paises.map((p) => p.codigo)}
          alCerrar={() => setAgregando(false)}
          alAgregado={(p) => {
            setAgregando(false);
            alAgregado?.(p);
            alCambiar(p.codigo);
          }}
        />
      )}
    </div>
  );
}

/** El panel de «Agregar país»: se busca por nombre entre los países del mundo que aún no están y se pulsa uno. */
function AgregarPais({
  ancla,
  existentes,
  alCerrar,
  alAgregado,
}: {
  ancla: React.RefObject<HTMLDivElement | null>;
  existentes: string[];
  alCerrar: () => void;
  alAgregado: (pais: { id: string; codigo: string; nombre: string }) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    campo.current?.focus();
  }, []);

  const q = normalPais(busqueda);
  const opciones = useMemo(() => {
    const libres = paisesDelMundo().filter((p) => !existentes.includes(p.codigo));
    return (q ? libres.filter((p) => normalPais(p.nombre).includes(q) || p.codigo.toLowerCase() === q) : libres).slice(0, 60);
  }, [existentes, q]);

  async function agregar(p: { codigo: string; nombre: string }) {
    if (guardando) return;
    setGuardando(p.codigo);
    setError(null);
    const r = await agregarPaisRapido(p.codigo, p.nombre).catch(() => ({ error: "No se pudo agregar el país." }) as { error?: string; pais?: undefined });
    setGuardando(null);
    if (r.error || !r.pais) return setError(r.error ?? "No se pudo agregar el país.");
    alAgregado(r.pais);
  }

  return (
    <PanelCelda ancla={ancla} etiqueta="Agregar país" ancho={280} alCerrar={alCerrar}>
      <input
        ref={campo}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopPropagation();
          if (opciones.length === 1) void agregar(opciones[0]);
        }}
        placeholder="Escribe el país…"
        aria-label="Buscar el país para agregar"
        className={claseCampoPanel}
      />
      {error && (
        <p role="alert" className="m-0 px-3 pt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <ul className="m-0 flex max-h-64 list-none flex-col gap-0.5 overflow-y-auto p-1.5">
        {opciones.map((p) => (
          <li key={p.codigo}>
            <button type="button" disabled={!!guardando} onClick={() => void agregar(p)} className={`${claseOpcionPanel} justify-start hover:bg-muted disabled:opacity-60 ${anilloFoco}`}>
              <Bandera codigo={p.codigo} />
              <span className="truncate">{p.nombre}</span>
              <span className="ml-auto text-xs text-muted-foreground">{guardando === p.codigo ? "Agregando…" : p.codigo}</span>
            </button>
          </li>
        ))}
        {opciones.length === 0 && <li className="px-2 py-1.5 text-xs text-muted-foreground">Sin resultados.</li>}
      </ul>
    </PanelCelda>
  );
}
