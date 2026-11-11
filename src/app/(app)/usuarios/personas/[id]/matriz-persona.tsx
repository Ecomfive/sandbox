"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ChipSensible, Chip } from "@/components/permisos/piezas-permisos";
import { SelectorNivel } from "@/components/permisos/selector-segmentado";
import { AfinarIcon, BuscarIcon, LapizIcon, OjoIcon, OjoTachadoIcon } from "@/lib/nav-icons";
import { AREAS_ACCESO, MODULOS_SENSIBLES, catalogoDe, type Nivel } from "@/lib/permisos/catalogo";
import { fijarNivelPersonaLote } from "../../permisos-actions";

type Filtro = "todos" | "propios" | "con";
type Estado = "guardado" | "guardando" | "error";

const TEXTO: Record<Nivel, string> = { n: "sin acceso", r: "solo lectura", w: "edición" };
const normalizar = (t: string) => t.trim().toLowerCase();

/**
 * Los permisos de una persona en la misma matriz que el rol (11 nov 2026, pedido de Hernán: «cambiarlo por persona, no en general del rol, con el panel
 * así como se ve en el rol»): cada módulo, agrupado por área, con su nivel de verdad (sin acceso, solo lectura o edición) y los botones de cada área.
 * Lo que se aparta de su rol lleva la marca «Propio» con lo que da el rol y «Volver al rol»; lo que queda igual al rol no se guarda como propio. Cada
 * cambio se ve al instante y se guarda solo.
 */
export function MatrizPersona({
  personaId,
  nombre,
  efectivos,
  delRol,
  ajustesTotales,
  puedeEscribir,
}: {
  personaId: string;
  nombre: string;
  /** Lo que la persona puede de verdad en cada módulo (su rol con sus permisos propios encima). */
  efectivos: Record<string, Nivel>;
  /** Lo que le da su rol en cada módulo. */
  delRol: Record<string, Nivel>;
  ajustesTotales: Record<string, number>;
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [, empezar] = useTransition();
  const [niveles, setNiveles] = useState<Record<string, Nivel>>(efectivos);
  const [estado, setEstado] = useState<Estado>("guardado");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const enCurso = useRef(0);

  const nivelDe = (clave: string): Nivel => niveles[clave] ?? "n";
  const rolDe = (clave: string): Nivel => delRol[clave] ?? "n";
  const esPropio = (clave: string) => nivelDe(clave) !== rolDe(clave);
  const totalPropios = AREAS_ACCESO.flatMap((a) => a.modulos).filter((m) => esPropio(m.clave)).length;

  /** Cambia uno o varios módulos a un nivel, o cada uno a lo de su rol (`"rol"`). Se ve al instante; si el servidor lo rechaza, vuelve. */
  function cambiar(claves: string[], nivel: Nivel | "rol") {
    if (!puedeEscribir || !claves.length) return;
    const antes = niveles;
    const siguiente = { ...niveles };
    for (const c of claves) siguiente[c] = nivel === "rol" ? rolDe(c) : nivel;
    setNiveles(siguiente);
    setEstado("guardando");
    enCurso.current++;
    // «Como el rol» agrupa por el nivel que da el rol: un pedido por nivel.
    const grupos: [Nivel, string[]][] =
      nivel === "rol" ? (["n", "r", "w"] as Nivel[]).map((n): [Nivel, string[]] => [n, claves.filter((c) => rolDe(c) === n)]).filter(([, cs]) => cs.length > 0) : [[nivel, claves]];
    empezar(async () => {
      let error: string | null = null;
      for (const [n, cs] of grupos) {
        const r = await fijarNivelPersonaLote(personaId, cs, n).catch(() => ({ error: "Inténtalo de nuevo." }));
        if (r.error) {
          error = r.error;
          break;
        }
      }
      enCurso.current--;
      if (error) {
        setNiveles(antes);
        setEstado("error");
        mostrarToast(error, "destructive");
        return;
      }
      if (enCurso.current === 0) setEstado("guardado");
      router.refresh();
    });
  }

  const visibles = useMemo(() => {
    const q = normalizar(busqueda);
    return AREAS_ACCESO.map((area) => ({
      area,
      modulos: area.modulos.filter((m) => {
        const n = niveles[m.clave] ?? "n";
        if (filtro === "con" && n === "n") return false;
        if (filtro === "propios" && n === (delRol[m.clave] ?? "n")) return false;
        return !q || normalizar(m.etiqueta).includes(q);
      }),
    })).filter((g) => g.modulos.length > 0);
  }, [busqueda, filtro, niveles, delRol]);

  const conAccesoTotal = AREAS_ACCESO.flatMap((a) => a.modulos).filter((m) => nivelDe(m.clave) !== "n").length;
  const boton = `inline-flex h-[30px] items-center rounded-lg border border-border-control bg-card px-2.5 text-[12.5px] font-semibold hover:bg-accent disabled:opacity-50 ${anilloFoco}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative w-full max-w-[260px] min-w-44">
          <BuscarIcon aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar módulo" aria-label="Buscar módulo" className={`${fieldClass} w-full pl-9`} />
        </div>
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="sr-only">Mostrar módulos</legend>
          <div className="inline-flex gap-0.5 rounded-[11px] border border-border bg-muted p-[3px]">
            {(
              [
                ["todos", "Todos"],
                ["con", `Con acceso ${conAccesoTotal}`],
                ["propios", `Propios ${totalPropios}`],
              ] as const
            ).map(([valor, etiqueta]) => (
              <label
                key={valor}
                className="relative inline-flex h-[30px] cursor-pointer items-center rounded-lg px-3 text-[12.5px] font-semibold whitespace-nowrap text-muted-foreground hover:text-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primario"
              >
                <input type="radio" name="filtro-modulos-persona" checked={filtro === valor} onChange={() => setFiltro(valor)} className="absolute inset-0 m-0 h-full w-full cursor-pointer opacity-0" />
                {etiqueta}
              </label>
            ))}
          </div>
        </fieldset>
        <span className="grow" />
        <span aria-live="polite" className={`text-xs ${estado === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {estado === "guardando" ? "Guardando…" : estado === "error" ? "No se guardó el último cambio" : "Cambios guardados"}
        </span>
      </div>

      <div className="matriz-permisos overflow-hidden rounded-[14px] border border-border bg-card shadow-sm">
        <div className="mp-fila border-b border-border bg-muted px-[18px] py-2.5 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">
          <span className="mp-nm">Módulo</span>
          <span className="mp-lv mp-cab-lv flex gap-[18px]">
            <span className="inline-flex items-center gap-1.5">
              <OjoTachadoIcon className="h-3.5 w-3.5" />
              Sin acceso
            </span>
            <span className="inline-flex items-center gap-1.5">
              <OjoIcon className="h-3.5 w-3.5" />
              Solo lectura
            </span>
            <span className="inline-flex items-center gap-1.5">
              <LapizIcon className="h-3.5 w-3.5" />
              Edición
            </span>
          </span>
          <span className="mp-dt mp-cab-dt">Detalle</span>
        </div>

        {visibles.map(({ area, modulos }) => {
          const claves = area.modulos.map((m) => m.clave);
          const conAcceso = claves.filter((c) => nivelDe(c) !== "n").length;
          const propiosArea = claves.filter(esPropio).length;
          return (
            <div key={area.id}>
              <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-muted px-[18px] py-3">
                <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: area.color }} />
                <h3 className="text-sm font-bold">{area.nombre}</h3>
                <Chip>
                  {conAcceso} de {claves.length} con acceso
                </Chip>
                {propiosArea > 0 && <Chip tono="primario">{propiosArea === 1 ? "1 propio" : `${propiosArea} propios`}</Chip>}
                {puedeEscribir && (
                  <div role="group" aria-label={`Aplicar a toda el área ${area.nombre} para ${nombre}`} className="ml-auto flex flex-wrap gap-1.5">
                    {(
                      [
                        ["n", "Ninguno"],
                        ["r", "Lectura"],
                        ["w", "Edición"],
                      ] as const
                    ).map(([nivel, texto]) => (
                      <button key={nivel} type="button" onClick={() => cambiar(claves, nivel)} className={boton}>
                        {texto}
                      </button>
                    ))}
                    <button type="button" onClick={() => cambiar(claves, "rol")} disabled={propiosArea === 0} className={boton} title="Deja toda el área como la da su rol">
                      Como el rol
                    </button>
                  </div>
                )}
              </div>
              {modulos.map((m) => {
                const nivel = nivelDe(m.clave);
                const propio = esPropio(m.clave);
                const afinable = !!catalogoDe(m.clave);
                const n = nivel === "n" ? 0 : (ajustesTotales[m.clave] ?? 0);
                return (
                  <div key={m.clave} className="mp-fila border-b border-border px-[18px] py-[7px] last:border-0 hover:bg-muted/50">
                    <span className="mp-nm flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className={`font-medium ${nivel === "n" ? "text-muted-foreground" : ""}`}>{m.etiqueta}</span>
                      {MODULOS_SENSIBLES.has(m.clave) && <ChipSensible />}
                      {propio && (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <Chip tono="primario">Propio</Chip>
                          <span className="text-muted-foreground">el rol da {TEXTO[rolDe(m.clave)]}</span>
                          {puedeEscribir && (
                            <button type="button" onClick={() => cambiar([m.clave], "rol")} className={`rounded px-1 font-semibold text-primario hover:underline ${anilloFoco}`}>
                              Volver al rol
                            </button>
                          )}
                        </span>
                      )}
                    </span>
                    <span className="mp-lv">
                      <SelectorNivel nombre={`nivel-persona-${m.clave}`} modulo={m.etiqueta} valor={nivel} alCambiar={(v) => cambiar([m.clave], v)} deshabilitado={!puedeEscribir} />
                    </span>
                    <span className="mp-dt">
                      {afinable && nivel !== "n" ? (
                        <Link
                          href={`/usuarios/personas/${personaId}/afinar/${m.clave}`}
                          className={`inline-flex h-[30px] items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold hover:bg-primario-suave ${anilloFoco} ${n > 0 ? "bg-primario-suave text-primario" : "text-muted-foreground"}`}
                        >
                          <AfinarIcon className="h-3.5 w-3.5" />
                          {n > 0 ? `${n} ajuste${n === 1 ? "" : "s"}` : "Afinar"}
                        </Link>
                      ) : (
                        <span aria-hidden="true" className="text-muted-foreground">
                          —
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}

        {visibles.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <b className="text-[15px]">{filtro === "propios" && !busqueda ? "Sin permisos propios: tiene lo que da su rol" : "Ningún módulo coincide"}</b>
            {(busqueda || filtro !== "todos") && (
              <button
                type="button"
                onClick={() => {
                  setBusqueda("");
                  setFiltro("todos");
                }}
                className={boton}
              >
                Ver todos
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
