"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { LapizIcon } from "@/lib/nav-icons";
import { Tooltip } from "@/components/ui/tooltip";
import { CAMPOS_DATO, NUMERO_REGISTRADO, type CampoDato } from "@/lib/crm/dato-dropshipper";
import { textoParaBuscar, type CiudadSugerida } from "@/lib/crm/ciudades";
import { bandera } from "@/lib/whatsapp/origen-chat";
import { buscarCiudades, cambiarDatoDropshipper } from "./dato-actions";
import { ESTADOS, etiquetaEstado } from "./def-crm";

const TIPO: Record<CampoDato, string> = { nombre: "text", estado: "select", telefono: "tel", tiendas: "text", ciudad: "text", ingreso: "date", productos: "text", correo: "email" };
const EJEMPLO: Record<CampoDato, string> = {
  nombre: "Ej: Ana Pérez",
  estado: "",
  telefono: "Nuevo número con prefijo, ej: +57 300 111 2233",
  tiendas: "Separadas por coma, ej: Yappea, Clovin web",
  ciudad: "Ej: Ciudad de Panamá",
  ingreso: "",
  productos: "Separados por coma, ej: Crema, Aceite",
  correo: "Ej: nombre@correo.com",
};

/** Tiendas y productos se ven como pastillas, una por elemento, en vez de un párrafo separado por comas (30 oct 2026, pedido de Alcides). */
const EN_PASTILLAS: CampoDato[] = ["tiendas", "productos"];

function Valor({ campo, valor }: { campo: CampoDato; valor: string | null }) {
  if (valor && EN_PASTILLAS.includes(campo))
    return (
      <span className="flex min-w-0 flex-wrap gap-1">
        {valor.split(", ").map((v) => (
          <span key={v} className="rounded-md border border-border bg-card px-1.5 py-px text-[12px] leading-snug">
            {v}
          </span>
        ))}
      </span>
    );
  // Una sola línea por dato (30 oct 2026, pedido de Alcides): si no cabe, se corta con «…».
  return <span className={`min-w-0 truncate ${valor ? "" : "text-muted-foreground"}`}>{mostrar(campo, valor)}</span>;
}

function mostrar(campo: CampoDato, valor: string | null): string {
  // Sin el nombre del dato a la vista (solo su ícono), lo que falta dice qué es: «Sin ciudad».
  if (!valor) return `Sin ${CAMPOS_DATO[campo].etiqueta.toLowerCase()}`;
  if (campo === "ingreso") return `Ingresó el ${formatearFecha(valor)}`;
  if (campo === "estado") return etiquetaEstado(valor);
  if (campo === "telefono") return valor === NUMERO_REGISTRADO ? "Registrado" : "—";
  return valor;
}

/**
 * Un dato del bloque «Datos» que se cambia ahí mismo, como una celda de Compras (29 oct 2026, pedido de Alcides; desde el 30 oct 2026 también el nombre, el
 * estado, el WhatsApp, las tiendas y los productos, y ya no hay un botón «Editar» aparte): se ve como texto, al pasar el cursor se marca y sale el lápiz, y un
 * clic lo vuelve un campo. Enter o pulsar fuera guardan, Escape lo deja como estaba, y vaciarlo quita el dato (el nombre, el estado y el WhatsApp no se
 * pueden dejar vacíos). El estado es una lista: al elegir uno se guarda. El WhatsApp nunca se muestra: el campo arranca vacío y solo recibe el número nuevo.
 * No es un `<form>` porque el bloque puede ir dentro de otro formulario. Sin permiso de escritura solo se lee. El valor guardado se queda en la ficha
 * aunque la fila no se vuelva a pedir (la ficha del chat).
 */
export function DatoEditable({ dropshipperId, campo, inicial, puede }: { dropshipperId: string; campo: CampoDato; inicial: string | null; puede: boolean }) {
  const [valor, setValor] = useState(inicial);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, empezar] = useTransition();
  const boton = useRef<HTMLButtonElement>(null);
  // Ya se cerró (Escape, o ya se guardó): el blur que llega al quitar el campo no debe guardar otra vez.
  const descartar = useRef(false);
  const idError = useId();
  const nombre = CAMPOS_DATO[campo].etiqueta.toLowerCase();

  if (!puede)
    return (
      <span className="flex min-w-0 px-1.5 py-0.5">
        <Valor campo={campo} valor={valor} />
      </span>
    );

  function abrir() {
    // El número de WhatsApp no se enseña: se escribe el nuevo desde cero.
    setBorrador(campo === "telefono" ? "" : (valor ?? ""));
    setError(null);
    descartar.current = false;
    setEditando(true);
  }
  function cerrar(enfocar: boolean) {
    descartar.current = true;
    setEditando(false);
    setError(null);
    if (enfocar) requestAnimationFrame(() => boton.current?.focus());
  }
  function guardar(enfocar: boolean, texto = borrador) {
    if (ocupado || descartar.current) return;
    // Sin cambios (o, en el WhatsApp, sin escribir nada: vacío no borra el número) no se guarda.
    if (campo === "telefono" ? !texto.trim() : texto.trim() === (valor ?? "")) return cerrar(enfocar);
    setError(null);
    empezar(async () => {
      const r = await cambiarDatoDropshipper(dropshipperId, campo, texto).catch(() => ({ error: "No se pudo guardar." }));
      if ("error" in r) return setError(r.error);
      setValor(r.valor);
      cerrar(enfocar);
    });
  }

  if (!editando)
    return (
      <Tooltip texto={`Editar ${nombre}`}>
        <button
          ref={boton}
          type="button"
          onClick={abrir}
          className={`group flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left hover:bg-muted ${anilloFoco}`}
        >
          <Valor campo={campo} valor={valor} />
          <LapizIcon width={12} height={12} aria-hidden="true" className="ml-auto flex-none text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
        </button>
      </Tooltip>
    );

  const alTeclear = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      guardar(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cerrar(true);
    }
  };

  // La ciudad lleva su lista de sugerencias, que no puede ir dentro de la etiqueta del campo.
  if (campo === "ciudad")
    return (
      <span className="flex flex-col gap-1">
        <CampoCiudad
          borrador={borrador}
          setBorrador={setBorrador}
          alGuardar={(texto, enfocar) => guardar(enfocar, texto)}
          alCancelar={() => cerrar(true)}
          ocupado={ocupado}
          idError={error ? idError : undefined}
        />
        {error && (
          <span id={idError} role="alert" className="text-xs text-destructive">
            {error}
          </span>
        )}
      </span>
    );

  return (
    <span className="flex flex-col gap-1">
      <label className="flex min-w-0">
        <span className="sr-only">{CAMPOS_DATO[campo].etiqueta}</span>
        {TIPO[campo] === "select" ? (
          <select
            value={borrador}
            autoFocus
            disabled={ocupado}
            onChange={(e) => {
              setBorrador(e.target.value);
              guardar(true, e.target.value);
            }}
            onBlur={() => guardar(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                cerrar(true);
              }
            }}
            className={`${fieldClassSm} -my-1 w-full min-w-0 text-[13px]`}
          >
            {ESTADOS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={TIPO[campo]}
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onBlur={() => guardar(false)}
            placeholder={EJEMPLO[campo] || undefined}
            autoFocus
            autoComplete="off"
            readOnly={ocupado}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? idError : undefined}
            onKeyDown={alTeclear}
            className={`${fieldClassSm} -my-1 w-full min-w-0 text-[13px]`}
          />
        )}
      </label>
      {error && (
        <span id={idError} role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}

/**
 * El campo «Ciudad» con sugerencias (30 oct 2026, pedido de Alcides): al escribir «Cali» propone «Santiago de Cali, Colombia» (y las demás que se llamen
 * así, primero las de los países donde trabajamos). Flechas y Enter eligen; pulsar una la guarda; Escape cierra la lista y, otra vez, cancela. Si no se
 * elige ninguna, se guarda lo escrito, como antes.
 */
function CampoCiudad({
  borrador,
  setBorrador,
  alGuardar,
  alCancelar,
  ocupado,
  idError,
}: {
  borrador: string;
  setBorrador: (v: string) => void;
  alGuardar: (texto: string, enfocar: boolean) => void;
  alCancelar: () => void;
  ocupado: boolean;
  idError?: string;
}) {
  const [ciudades, setCiudades] = useState<CiudadSugerida[]>([]);
  const [activa, setActiva] = useState(-1);
  const [abierta, setAbierta] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const idLista = useId();
  // Lo que se buscó por última vez: una respuesta vieja que llega tarde no pisa la nueva.
  const ultima = useRef("");

  useEffect(() => {
    const texto = textoParaBuscar(borrador);
    if (!texto || !abierta) return;
    const espera = setTimeout(() => {
      ultima.current = texto;
      buscarCiudades(texto)
        .then((r) => {
          if (ultima.current !== texto) return;
          if ("error" in r) {
            setAviso(r.error);
            setCiudades([]);
          } else {
            setAviso(null);
            setCiudades(r.ciudades);
          }
          setActiva(-1);
        })
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(espera);
  }, [borrador, abierta]);

  const visibles = abierta && textoParaBuscar(borrador) ? ciudades : [];
  const elegir = (c: CiudadSugerida) => {
    setBorrador(c.etiqueta);
    setAbierta(false);
    alGuardar(c.etiqueta, true);
  };

  return (
    <span className="flex w-full min-w-0 flex-col gap-1">
      <input
        type="text"
        role="combobox"
        aria-label="Ciudad"
        aria-expanded={visibles.length > 0}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={activa >= 0 && visibles[activa] ? `${idLista}-${activa}` : undefined}
        aria-describedby={idError}
        aria-invalid={idError ? true : undefined}
        value={borrador}
        onChange={(e) => {
          setBorrador(e.target.value);
          setAbierta(true);
        }}
        onBlur={() => alGuardar(borrador, false)}
        placeholder="Ej: Cali, Colombia"
        autoFocus
        autoComplete="off"
        readOnly={ocupado}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && visibles.length) {
            e.preventDefault();
            setActiva((i) => (i + 1) % visibles.length);
          } else if (e.key === "ArrowUp" && visibles.length) {
            e.preventDefault();
            setActiva((i) => (i <= 0 ? visibles.length - 1 : i - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (activa >= 0 && visibles[activa]) elegir(visibles[activa]);
            else alGuardar(borrador, true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (visibles.length) setAbierta(false);
            else alCancelar();
          }
        }}
        className={`${fieldClassSm} -my-1 w-full min-w-0 text-[13px]`}
      />
      <ul id={idLista} role="listbox" aria-label="Ciudades" className={visibles.length ? "m-0 mt-1 list-none overflow-hidden rounded-md border border-border-control bg-card p-0.5" : "hidden"}>
        {visibles.map((c, i) => (
          <li
            key={`${c.etiqueta}|${c.region ?? ""}`}
            id={`${idLista}-${i}`}
            role="option"
            aria-selected={i === activa}
            // Se elige con el ratón sin que el campo pierda el foco (si no, el blur guardaría lo escrito antes de elegir).
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => elegir(c)}
            onMouseEnter={() => setActiva(i)}
            className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[13px] ${i === activa ? "bg-muted" : ""}`}
          >
            <span aria-hidden="true">{bandera(c.codigo)}</span>
            <span className="min-w-0 truncate">
              {c.nombre}
              <span className="text-muted-foreground">
                {" · "}
                {c.region ? `${c.region}, ` : ""}
                {c.pais}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {aviso && abierta && <span className="text-xs text-muted-foreground">{aviso}</span>}
    </span>
  );
}
