"use client";

import { useRef, useState, useTransition } from "react";
import { crearUsuario, eliminarRol } from "./actions";
import type { FilaUsuario, Rol } from "./def-usuarios";
import { FichaRol } from "./ficha-rol";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { LapizIcon, MasIcon, PapeleraIcon } from "@/lib/nav-icons";

const Obligatorio = () => (
  <span aria-hidden="true" className="text-destructive">
    {" "}
    *
  </span>
);

/** Botón "Crear usuario" y su ficha: nombre, correo, el rol elegido de una tarjeta (con su descripción, como en
 * "Nuevo retiro") y una contraseña temporal. Al guardar, la muestra una sola vez para pasarla a mano.
 * Cada tarjeta de rol lleva, aparte, un lápiz (abre su `FichaRol` completa, encima de esta ventana) y una
 * papelera (elimina de una vez, con confirmación) — así no hace falta salir de "Crear usuario" para arreglar
 * un rol, como uno creado por error. */
export function CrearUsuarioPanel({
  roles,
  modulosPorRol,
  soloLecturaPorRol,
  personasPorRol,
}: {
  roles: Rol[];
  modulosPorRol: Map<string, Set<string>>;
  soloLecturaPorRol: Map<string, Set<string>>;
  personasPorRol: Map<string, FilaUsuario[]>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [contrasena, setContrasena] = useState<string | null>(null);
  const [rolEditando, setRolEditando] = useState<Rol | null>(null);
  const [eliminandoRolId, setEliminandoRolId] = useState<string | null>(null);
  const [, startTransitionRol] = useTransition();
  const botonAbrirRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { mostrarToast } = useToast();

  function cerrar() {
    if (pending) return;
    setAbierto(false);
    setError(null);
    setContrasena(null);
    formRef.current?.reset();
    botonAbrirRef.current?.focus();
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const resultado = await crearUsuario(formData);
      if (resultado?.error) setError(resultado.error);
      else setContrasena(resultado.contrasena ?? null);
    });
  }

  function alEliminarRol(r: Rol) {
    if (!confirm(`¿Está seguro de que desea eliminar el rol "${r.nombre}"?`)) return;
    setEliminandoRolId(r.id);
    const formData = new FormData();
    formData.set("id", r.id);
    startTransitionRol(async () => {
      const resultado = await eliminarRol(formData).catch(() => ({ error: "Inténtalo de nuevo." }));
      setEliminandoRolId(null);
      if (resultado?.error) mostrarToast(resultado.error, "destructive");
      else mostrarToast("Rol eliminado");
    });
  }

  return (
    <>
      <button
        ref={botonAbrirRef}
        type="button"
        onClick={() => setAbierto(true)}
        className={`inline-flex items-center gap-1.5 rounded-full bg-[#202020] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d2d2d] ${anilloFoco}`}
      >
        <MasIcon className="h-4 w-4" />
        Crear usuario
      </button>

      <Ventana abierto={abierto} alCerrar={cerrar} lado="derecha" titulo={<span className="text-lg font-semibold">Crear usuario</span>}>
        {contrasena ? (
          <div className="flex flex-col gap-4 p-5">
            <p className="text-sm">La cuenta ya se creó. Pásale esta contraseña — no se vuelve a mostrar:</p>
            <p className="rounded-md border border-border bg-muted p-3 text-center font-mono text-lg font-semibold select-all">
              {contrasena}
            </p>
            <button
              type="button"
              onClick={cerrar}
              className={`self-start rounded-md bg-[#202020] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d2d2d] ${anilloFoco}`}
            >
              Listo
            </button>
          </div>
        ) : (
          <form ref={formRef} onSubmit={alEnviar} className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col gap-4 p-5">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>
                  Nombre y apellido
                  <Obligatorio />
                </span>
                <input type="text" name="nombre" required data-enfocar className={fieldClass} />
              </label>

              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>
                  Correo con el que va a entrar
                  <Obligatorio />
                </span>
                <input type="email" name="email" required className={fieldClass} />
              </label>

              <div>
                <p className={labelClassSm}>
                  Rol: qué va a poder hacer
                  <Obligatorio />
                </p>
                <div className="mt-1 flex flex-col gap-2">
                  {roles.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-start gap-2.5 rounded-md border border-border p-3 has-[:checked]:border-foreground"
                    >
                      <label className="flex flex-1 cursor-pointer items-start gap-2.5">
                        <input type="radio" name="rol_id" value={r.id} required className="mt-1 accent-foreground" />
                        <span>
                          <span className="block text-sm font-semibold">{r.nombre}</span>
                          {r.descripcion && <span className="block text-xs text-muted-foreground">{r.descripcion}</span>}
                        </span>
                      </label>
                      <div className="flex shrink-0 items-center gap-1">
                        <Tooltip texto={`Editar ${r.nombre}`}>
                          <button
                            type="button"
                            onClick={() => setRolEditando(r)}
                            aria-label={`Editar ${r.nombre}`}
                            className={`rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
                          >
                            <LapizIcon className="h-4 w-4" />
                          </button>
                        </Tooltip>
                        <Tooltip texto={`Eliminar ${r.nombre}`}>
                          <button
                            type="button"
                            onClick={() => alEliminarRol(r)}
                            disabled={eliminandoRolId === r.id || (personasPorRol.get(r.id)?.length ?? 0) > 0}
                            aria-label={`Eliminar ${r.nombre}`}
                            className={`rounded p-1.5 text-muted-foreground hover:bg-destructive-soft hover:text-destructive disabled:opacity-50 ${anilloFoco}`}
                          >
                            <PapeleraIcon className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Contraseña temporal (opcional)</span>
                <input type="text" name="contrasena" placeholder="La generamos si la dejas vacía" className={`${fieldClass} font-mono`} />
              </label>
              <p className="text-xs text-muted-foreground">Al crear la cuenta te la mostramos, para que se la envíes.</p>

              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button type="button" onClick={cerrar} disabled={pending} className={`rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending || roles.length === 0}
                className={`rounded-full bg-[#202020] px-4 py-2 text-sm font-medium text-white hover:bg-[#2d2d2d] disabled:opacity-50 ${anilloFoco}`}
              >
                {pending ? "Creando..." : "Crear usuario"}
              </button>
            </div>
          </form>
        )}
      </Ventana>

      <FichaRol
        rol={rolEditando ?? undefined}
        modulosActivos={rolEditando ? (modulosPorRol.get(rolEditando.id) ?? new Set()) : new Set()}
        modulosSoloLectura={rolEditando ? (soloLecturaPorRol.get(rolEditando.id) ?? new Set()) : new Set()}
        personas={rolEditando ? (personasPorRol.get(rolEditando.id)?.length ?? 0) : 0}
        alCerrar={() => setRolEditando(null)}
      />
    </>
  );
}
