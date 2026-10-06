"use client";

import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { fieldClass } from "@/components/ui/field";
import { usuariosMencionables, type UsuarioMencionable } from "@/lib/menciones-actions";

// La lista de personas se pide una sola vez por página y la comparten todos los campos.
let cache: Promise<UsuarioMencionable[]> | null = null;
function cargarUsuarios() {
  cache ??= usuariosMencionables().catch(() => {
    cache = null;
    return [];
  });
  return cache;
}

/** Las personas del sistema (para el campo y para resaltar las menciones al mostrar un texto). */
export function useUsuariosMencionables(): UsuarioMencionable[] {
  const [usuarios, setUsuarios] = useState<UsuarioMencionable[]>([]);
  useEffect(() => {
    let vigente = true;
    void cargarUsuarios().then((u) => vigente && setUsuarios(u));
    return () => {
      vigente = false;
    };
  }, []);
  return usuarios;
}

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Los ids de las personas elegidas que siguen escritas en el texto («@Nombre»). */
export function mencionesEnTexto(texto: string, elegidos: UsuarioMencionable[]): string[] {
  return [...new Set(elegidos.filter((u) => texto.includes(`@${u.nombre}`)).map((u) => u.id))];
}

/**
 * Un campo de texto donde se etiqueta a otras personas con «@», como en ClickUp: al escribir «@» aparece la lista de
 * personas del sistema, se filtra con lo que se escribe después y se elige con el ratón o con las flechas y Enter (Escape la
 * cierra). Lo elegido queda escrito como «@Nombre». Con `name`, va en un formulario: el texto en ese campo y los ids de las
 * personas etiquetadas en campos ocultos `menciones`. Sin `name`, se usa controlado (`valor`, `alCambiar`) y `alMencionar`
 * avisa los ids.
 */
export function CampoMenciones({
  name,
  valor,
  alCambiar,
  alMencionar,
  filas = 3,
  maxLength = 5000,
  placeholder,
  id,
  ariaLabel,
  required,
  ariaInvalid,
  enfocar,
  className = "",
}: {
  name?: string;
  valor?: string;
  alCambiar?: (texto: string) => void;
  alMencionar?: (ids: string[]) => void;
  filas?: number;
  maxLength?: number;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  required?: boolean;
  ariaInvalid?: boolean | "true" | "false";
  enfocar?: boolean;
  className?: string;
}) {
  const usuarios = useUsuariosMencionables();
  const [interno, setInterno] = useState("");
  const texto = valor ?? interno;
  const [elegidos, setElegidos] = useState<UsuarioMencionable[]>([]);
  const [consulta, setConsulta] = useState<{ desde: number; q: string } | null>(null);
  const [activo, setActivo] = useState(0);
  const campo = useRef<HTMLTextAreaElement>(null);
  const idLista = useId();

  const opciones = useMemo(() => {
    if (!consulta) return [];
    const q = normal(consulta.q);
    return usuarios.filter((u) => normal(u.nombre).includes(q)).slice(0, 8);
  }, [consulta, usuarios]);

  function cambiar(t: string) {
    if (valor === undefined) setInterno(t);
    alCambiar?.(t);
    alMencionar?.(mencionesEnTexto(t, elegidos));
  }

  /** ¿Se está escribiendo una mención? Desde la última «@» (al inicio o tras un espacio) hasta el cursor, sin saltos de línea. */
  function revisarConsulta(t: string, cursor: number) {
    const antes = t.slice(0, cursor);
    const at = antes.lastIndexOf("@");
    if (at < 0 || (at > 0 && !/\s/.test(antes[at - 1]))) return setConsulta(null);
    const q = antes.slice(at + 1);
    if (/\n/.test(q) || q.length > 40) return setConsulta(null);
    setConsulta({ desde: at, q });
    setActivo(0);
  }

  function elegir(u: UsuarioMencionable) {
    if (!consulta || !campo.current) return;
    const cursor = campo.current.selectionStart ?? texto.length;
    const nuevo = `${texto.slice(0, consulta.desde)}@${u.nombre} ${texto.slice(cursor)}`;
    const lista = elegidos.some((e) => e.id === u.id) ? elegidos : [...elegidos, u];
    setElegidos(lista);
    setConsulta(null);
    if (valor === undefined) setInterno(nuevo);
    alCambiar?.(nuevo);
    alMencionar?.(mencionesEnTexto(nuevo, lista));
    const posicion = consulta.desde + u.nombre.length + 2;
    requestAnimationFrame(() => {
      campo.current?.focus();
      campo.current?.setSelectionRange(posicion, posicion);
    });
  }

  const ids = mencionesEnTexto(texto, elegidos);
  const abierta = !!consulta && opciones.length > 0;

  return (
    <div className="relative w-full">
      <textarea
        ref={campo}
        id={id}
        name={name}
        rows={filas}
        maxLength={maxLength}
        value={texto}
        required={required}
        data-enfocar={enfocar ? "" : undefined}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid}
        aria-autocomplete="list"
        placeholder={placeholder ?? "Escribe… usa @ para etiquetar a alguien"}
        onChange={(e) => {
          cambiar(e.target.value);
          revisarConsulta(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyDown={(e) => {
          if (!abierta) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActivo((a) => (a + 1) % opciones.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActivo((a) => (a - 1 + opciones.length) % opciones.length);
          } else if (e.key === "Enter" || e.key === "Tab") {
            e.preventDefault();
            elegir(opciones[activo]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            setConsulta(null);
          }
        }}
        onBlur={() => setTimeout(() => setConsulta(null), 150)}
        className={`${fieldClass} w-full resize-y ${className}`}
      />
      {abierta && (
        <ul id={idLista} role="listbox" aria-label="Personas para etiquetar" className="absolute top-full left-0 z-50 m-0 mt-1 w-64 list-none rounded-lg border border-border bg-card p-1 shadow-lg">
          {opciones.map((u, i) => (
            <li
              key={u.id}
              role="option"
              aria-selected={i === activo}
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(u);
              }}
              onMouseEnter={() => setActivo(i)}
              className={`cursor-pointer rounded-md px-2.5 py-1.5 text-sm ${i === activo ? "bg-accent" : ""}`}
            >
              @{u.nombre}
            </li>
          ))}
        </ul>
      )}
      {name && ids.map((m) => <input key={m} type="hidden" name="menciones" value={m} />)}
    </div>
  );
}

/** Un texto con las menciones («@Nombre» de personas del sistema) resaltadas. */
export function TextoConMenciones({ texto }: { texto: string }): ReactNode {
  const usuarios = useUsuariosMencionables();
  const partes = useMemo(() => {
    const nombres = usuarios.map((u) => u.nombre).sort((a, b) => b.length - a.length);
    if (nombres.length === 0) return [texto];
    const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return texto.split(new RegExp(`(@(?:${nombres.map(escapar).join("|")}))`, "g"));
  }, [texto, usuarios]);
  return (
    <>
      {partes.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-medium text-primario">
            {p}
          </strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
