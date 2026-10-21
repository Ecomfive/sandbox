"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AvatarRol } from "@/components/permisos/piezas-permisos";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { MasIcon } from "@/lib/nav-icons";
import { COLORES_ROL } from "@/lib/permisos/color-rol";
import { MODULOS_ACCESO, MODULOS_SENSIBLES } from "@/lib/permisos/catalogo";
import { crearRolConPermisos, type InicioRol } from "../permisos-actions";

type Inicio = "copiar" | "blanco" | "lectura";
const SIN_SENSIBLES = MODULOS_ACCESO.filter((m) => !MODULOS_SENSIBLES.has(m.clave)).length;

/** «Crear rol»: la ficha lateral con el punto de partida (copiar de otro rol, en blanco o todo en solo lectura), el nombre, la descripción y el color. */
export function CrearRolPanel({ roles }: { roles: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [inicio, setInicio] = useState<Inicio>(roles.length > 0 ? "copiar" : "blanco");
  const [copiarDe, setCopiarDe] = useState(roles[0]?.id ?? "");
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [color, setColor] = useState(COLORES_ROL[0].valor);
  const botonRef = useRef<HTMLButtonElement>(null);

  function cerrar() {
    if (pendiente) return;
    setAbierto(false);
    setError(null);
    setNombre("");
    setDescripcion("");
    botonRef.current?.focus();
  }

  function crear() {
    if (!nombre.trim()) {
      setError("Falta el nombre del rol.");
      return;
    }
    const inicioRol: InicioRol = inicio === "copiar" ? { tipo: "copiar", rolId: copiarDe } : inicio === "lectura" ? { tipo: "lectura" } : { tipo: "blanco" };
    setError(null);
    empezar(async () => {
      const r = await crearRolConPermisos({ nombre, descripcion, color }, inicioRol).catch(() => ({ error: "Inténtalo de nuevo." }) as { error: string; id?: undefined });
      if (r.error || !r.id) {
        setError(r.error ?? "No se pudo crear el rol.");
        return;
      }
      mostrarToast("Rol creado");
      setAbierto(false);
      setNombre("");
      setDescripcion("");
      router.push(`/usuarios/roles?rol=${r.id}`);
    });
  }

  const opcion = (valor: Inicio, titulo: string, aparte: React.ReactNode, deshabilitada = false) => (
    <label className={`flex items-center gap-3 rounded-xl border p-3 has-[:checked]:border-primario has-[:checked]:bg-primario-suave ${deshabilitada ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted"} border-border`}>
      <input type="radio" name="inicio" checked={inicio === valor} disabled={deshabilitada} onChange={() => setInicio(valor)} className="h-[18px] w-[18px] accent-[var(--nivel-edicion)]" />
      <span className="min-w-0 grow font-semibold">{titulo}</span>
      {aparte}
    </label>
  );

  return (
    <>
      <button ref={botonRef} type="button" onClick={() => setAbierto(true)} className={`boton-neon inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-white ${anilloFoco}`}>
        <MasIcon className="h-3.5 w-3.5" />
        Crear rol
      </button>

      <Ventana abierto={abierto} alCerrar={cerrar} lado="derecha" titulo={<span className="text-lg font-bold">Nuevo rol</span>}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crear();
          }}
          className="flex flex-1 flex-col"
        >
          <div className="flex flex-1 flex-col gap-5 p-5">
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-2 p-0 text-sm font-semibold">Empezar desde</legend>
              {opcion(
                "copiar",
                "Copiar de un rol",
                <select aria-label="Rol que se copia" value={copiarDe} onChange={(e) => setCopiarDe(e.target.value)} onClick={() => setInicio("copiar")} className={`${fieldClass} w-52`}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre}
                    </option>
                  ))}
                </select>,
                roles.length === 0,
              )}
              {opcion("blanco", "En blanco", <span className="rounded-full border border-border bg-muted px-2.5 text-xs font-semibold text-foreground-soft">0 módulos</span>)}
              {opcion(
                "lectura",
                "Todo en solo lectura (sin módulos sensibles)",
                <span className="rounded-full bg-azul-soft px-2.5 text-xs font-semibold whitespace-nowrap text-azul">{SIN_SENSIBLES} módulos</span>,
              )}
            </fieldset>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">
                Nombre
                <span aria-hidden="true" className="text-destructive"> *</span>
              </span>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                maxLength={60}
                data-enfocar
                placeholder="Ej: Soporte de pedidos"
                aria-invalid={error && !nombre.trim() ? true : undefined}
                className={fieldClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold">Descripción</span>
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} maxLength={240} placeholder="Ej: Revisa pedidos y atiende novedades" className={fieldClass} />
            </label>

            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 p-0 text-[13px] font-semibold">Color</legend>
              <div className="flex flex-wrap gap-2">
                {COLORES_ROL.map((c) => (
                  <label key={c.valor} className="relative inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[13px] font-bold has-[:checked]:outline-2 has-[:checked]:outline-offset-2 has-[:checked]:outline-foreground has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primario" style={{ backgroundColor: c.fondo, color: c.texto }}>
                    <input type="radio" name="color" value={c.valor} checked={color === c.valor} onChange={() => setColor(c.valor)} aria-label={c.etiqueta} className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0" />
                    {(nombre.trim().charAt(0) || "A").toUpperCase()}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex items-center gap-3 rounded-xl bg-muted p-4">
              <AvatarRol nombre={nombre || "Nuevo rol"} color={color} />
              <span className="min-w-0 truncate font-semibold">{nombre.trim() || "Nuevo rol"}</span>
            </div>

            {error && (
              <p role="alert" className={labelClassSm + " !text-destructive"}>
                {error}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2.5 border-t border-border bg-muted px-5 py-4">
            <span className="text-xs text-muted-foreground">
              <span aria-hidden="true" className="text-destructive">* </span>Obligatorio
            </span>
            <button
              type="submit"
              aria-disabled={!nombre.trim() || pendiente}
              className={`boton-neon h-12 w-full rounded-[10px] text-[15px] font-semibold text-white aria-disabled:opacity-55 ${anilloFoco}`}
            >
              {pendiente ? "Creando…" : "Crear rol"}
            </button>
            <button type="button" onClick={cerrar} disabled={pendiente} className={`h-9 w-full rounded-[10px] text-[13px] font-semibold hover:bg-card disabled:opacity-50 ${anilloFoco}`}>
              Cancelar
            </button>
          </div>
        </form>
      </Ventana>
    </>
  );
}
