"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { dinero, entero, SIN_DATO } from "@/lib/af4/formato";
import { validarRucDv } from "@/lib/finanzas/ruc-panama";
import { CerrarIcon } from "@/lib/nav-icons";
import { actualizarProveedor, crearProveedor, quitarAlias, unificarProveedores } from "./actions";

export interface FilaProveedor {
  id: string;
  nombre: string;
  ruc: string | null;
  dv: string | null;
  rucValido: boolean | null;
  activo: boolean;
  alias: { id: string; alias: string }[];
  veces: number;
  monto: number;
}

export interface NombreSinProveedor {
  nombre: string;
  veces: number;
  monto: number;
  ejemplo: string;
}

interface Grupo {
  canonico: string;
  miembros: { nombre: string; veces: number; monto: number }[];
  veces: number;
  monto: number;
  existente: string | null;
}

const usd = (v: number) => dinero(v, "USD");
const boton = `rounded-md border border-border bg-card px-2.5 py-1 text-sm font-medium hover:bg-muted disabled:opacity-40 ${anilloFoco}`;

export function VistaProveedores({ proveedores, nombres, grupos, puedeEscribir }: { proveedores: FilaProveedor[]; nombres: NombreSinProveedor[]; grupos: Grupo[]; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [ficha, setFicha] = useState<FilaProveedor | "nuevo" | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [destino, setDestino] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");

  const unificar = (lista: string[], proveedorId: string | null, nombre: string | null, alTerminar?: () => void) =>
    empezar(async () => {
      const r = await unificarProveedores(lista, proveedorId, nombre).catch(() => ({ error: "Se cortó la conexión." }));
      if ("error" in r) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(`${entero(r.alias)} nombres unificados`);
        alTerminar?.();
        router.refresh();
      }
    });

  const activos = proveedores.filter((p) => p.activo);

  return (
    <div className="flex flex-col gap-6">
      {grupos.length > 0 && (
        <MarcoAF4 id="titulo-sugerencias" titulo="Sugerencias de unificación" sinRelleno>
          <ul className="flex flex-col divide-y divide-border">
            {grupos.map((g) => (
              <GrupoSugerido key={g.miembros.map((m) => m.nombre).join("|")} g={g} puedeEscribir={puedeEscribir} pendiente={pendiente} unificar={unificar} />
            ))}
          </ul>
        </MarcoAF4>
      )}

      <MarcoAF4
        id="titulo-proveedores"
        titulo="Proveedores"
        detalle="gasto de los últimos 12 meses"
        accion={puedeEscribir ? <BotonAgregar onClick={() => setFicha("nuevo")} /> : undefined}
        sinRelleno
      >
        {proveedores.length === 0 ? (
          <div className="p-3">
            <EstadoVacioAF4 compacto titulo="Todavía no hay proveedores" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla-datos w-full text-sm">
              <caption className="sr-only">Proveedores</caption>
              <thead>
                <tr className={claseFilaEncabezado}>
                  <th scope="col" className={claseEncabezadoColumna}>Proveedor</th>
                  <th scope="col" className={claseEncabezadoColumna}>RUC</th>
                  <th scope="col" className={claseEncabezadoColumna}>Alias</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Movimientos</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {[...proveedores].sort((a, b) => b.monto - a.monto).map((p) => (
                  <tr key={p.id} className={`border-t border-border/60 ${p.activo ? "" : "text-muted-foreground"}`}>
                    <th scope="row" className={`${claseCeldaColumna} text-left font-medium`}>
                      <button type="button" onClick={() => setFicha(p)} className={`text-left underline-offset-2 hover:underline ${anilloFoco}`}>
                        {p.nombre}
                      </button>
                      {!p.activo && <span className="ml-2 text-xs">(inactivo)</span>}
                    </th>
                    <td className={`${claseCeldaColumna} whitespace-nowrap`}>
                      {p.ruc ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${p.rucValido ? "bg-success" : "bg-destructive"}`} />
                          {p.ruc}
                          {p.dv ? ` DV ${p.dv}` : ""}
                          <span className="sr-only">{p.rucValido ? " (válido)" : " (no válido)"}</span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{SIN_DATO}</span>
                      )}
                    </td>
                    <td className={claseCeldaColumna}>
                      <span className="flex flex-wrap gap-1">
                        {p.alias.map((a) => (
                          <span key={a.id} className="inline-flex items-center gap-1 rounded-[5px] bg-muted px-1.5 py-0.5 text-xs">
                            {a.alias}
                            {puedeEscribir && (
                              <Tooltip texto="Quitar alias">
                                <button
                                  type="button"
                                  aria-label={`Quitar el alias ${a.alias}`}
                                  disabled={pendiente}
                                  onClick={() =>
                                    empezar(async () => {
                                      const r = await quitarAlias(a.id);
                                      if (r.error) mostrarToast(r.error, "destructive");
                                      else router.refresh();
                                    })
                                  }
                                  className={`rounded ${anilloFoco}`}
                                >
                                  <CerrarIcon className="h-3 w-3" />
                                </button>
                              </Tooltip>
                            )}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className={`${claseCeldaColumna} text-right ${claseCifra}`}>{entero(p.veces)}</td>
                    <td className={`${claseCeldaColumna} text-right whitespace-nowrap ${claseCifra}`}>{usd(p.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MarcoAF4>

      <MarcoAF4 id="titulo-sin-proveedor" titulo="Nombres del libro sin proveedor" detalle="últimos 12 meses" sinRelleno>
        {nombres.length === 0 ? (
          <div className="p-3">
            <EstadoVacioAF4 compacto titulo="Todo el libro tiene proveedor" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tabla-datos w-full text-sm">
              <caption className="sr-only">Nombres del libro sin proveedor</caption>
              <thead>
                <tr className={claseFilaEncabezado}>
                  {puedeEscribir && <th scope="col" className="w-10 border-r border-border/60 px-2 py-3"><span className="sr-only">Seleccionar</span></th>}
                  <th scope="col" className={claseEncabezadoColumna}>Nombre</th>
                  <th scope="col" className={claseEncabezadoColumna}>Ejemplo</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Movimientos</th>
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>Monto</th>
                </tr>
              </thead>
              <tbody>
                {nombres.map((n) => (
                  <tr key={n.nombre} className="border-t border-border/60">
                    {puedeEscribir && (
                      <td className="w-10 border-r border-border/40 px-2 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-foreground"
                          aria-label={`Seleccionar ${n.nombre}`}
                          checked={marcados.has(n.nombre)}
                          onChange={(e) =>
                            setMarcados((s) => {
                              const x = new Set(s);
                              if (e.target.checked) x.add(n.nombre);
                              else x.delete(n.nombre);
                              return x;
                            })
                          }
                        />
                      </td>
                    )}
                    <th scope="row" className={`${claseCeldaColumna} text-left font-medium whitespace-nowrap`}>{n.nombre}</th>
                    <td className={`${claseCeldaColumna} max-w-md truncate text-muted-foreground`}>{n.ejemplo}</td>
                    <td className={`${claseCeldaColumna} text-right ${claseCifra}`}>{entero(n.veces)}</td>
                    <td className={`${claseCeldaColumna} text-right whitespace-nowrap ${claseCifra}`}>{usd(n.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </MarcoAF4>

      {puedeEscribir && marcados.size > 0 && (
        <div
          role="region"
          aria-label="Nombres seleccionados"
          className="sticky bottom-6 z-30 mx-auto flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-control bg-card px-3 py-2 text-sm shadow-lg"
        >
          <p role="status" className="m-0 font-medium tabular-nums">
            {marcados.size} {marcados.size === 1 ? "seleccionado" : "seleccionados"}
          </p>
          <select aria-label="Proveedor donde unificar" className={`${fieldClassSm} max-w-56`} value={destino} onChange={(e) => setDestino(e.target.value)}>
            <option value="">Proveedor nuevo…</option>
            {activos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          {!destino && (
            <input aria-label="Nombre del proveedor nuevo" placeholder="Ej: META" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} maxLength={120} className={`${fieldClassSm} w-40`} />
          )}
          <button
            type="button"
            className={boton}
            disabled={pendiente || (!destino && !nuevoNombre.trim())}
            onClick={() =>
              unificar([...marcados], destino || null, destino ? null : nuevoNombre, () => {
                setMarcados(new Set());
                setNuevoNombre("");
              })
            }
          >
            Unificar
          </button>
          <Tooltip texto="Quitar selección">
            <button type="button" onClick={() => setMarcados(new Set())} aria-label="Quitar la selección" className={`flex min-h-8 min-w-8 items-center justify-center !rounded-md text-muted-foreground hover:bg-muted ${anilloFoco}`}>
              <CerrarIcon className="h-4 w-4" />
            </button>
          </Tooltip>
        </div>
      )}

      {ficha && <FichaProveedor p={ficha === "nuevo" ? null : ficha} puedeEscribir={puedeEscribir} alCerrar={() => setFicha(null)} />}
    </div>
  );
}

function GrupoSugerido({
  g,
  puedeEscribir,
  pendiente,
  unificar,
}: {
  g: Grupo;
  puedeEscribir: boolean;
  pendiente: boolean;
  unificar: (lista: string[], proveedorId: string | null, nombre: string | null) => void;
}) {
  const [nombre, setNombre] = useState(g.canonico);
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(g.miembros.map((m) => m.nombre)));
  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm lg:flex-row lg:items-center">
      <div className="flex flex-1 flex-wrap gap-2">
        {g.miembros.map((m) => (
          <label key={m.nombre} className="inline-flex items-center gap-1.5 rounded-[5px] border border-border px-2 py-1">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 accent-foreground"
              disabled={!puedeEscribir}
              checked={elegidos.has(m.nombre)}
              onChange={(e) =>
                setElegidos((s) => {
                  const x = new Set(s);
                  if (e.target.checked) x.add(m.nombre);
                  else x.delete(m.nombre);
                  return x;
                })
              }
            />
            <span className="font-medium">{m.nombre}</span>
            <span className={`text-xs text-muted-foreground ${claseCifra}`}>
              {entero(m.veces)} · {dinero(m.monto)}
            </span>
          </label>
        ))}
      </div>
      {puedeEscribir && (
        <div className="flex shrink-0 items-center gap-2">
          <span aria-hidden="true">→</span>
          <input aria-label={`Nombre del proveedor para ${g.canonico}`} value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} className={`${fieldClassSm} w-40`} disabled={!!g.existente} />
          <button type="button" className={boton} disabled={pendiente || elegidos.size === 0 || !nombre.trim()} onClick={() => unificar([...elegidos], g.existente, nombre)}>
            Unificar
          </button>
        </div>
      )}
    </li>
  );
}

function FichaProveedor({ p, puedeEscribir, alCerrar }: { p: FilaProveedor | null; puedeEscribir: boolean; alCerrar: () => void }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ruc, setRuc] = useState(p?.ruc ?? "");
  const [dv, setDv] = useState(p?.dv ?? "");
  const v = ruc.trim() ? validarRucDv(ruc, dv) : null;

  function guardar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (p) f.set("id", p.id);
    setError(null);
    empezar(async () => {
      const r = await (p ? actualizarProveedor(f) : crearProveedor(f)).catch(() => ({ error: "Se cortó la conexión." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(p ? "Proveedor guardado" : "Proveedor creado");
        router.refresh();
        alCerrar();
      }
    });
  }

  return (
    <Ventana abierto alCerrar={() => !pendiente && alCerrar()} lado="derecha" ancho="md" titulo={<span className="text-lg font-semibold">{p ? p.nombre : "Nuevo proveedor"}</span>}>
      <form onSubmit={guardar} className="flex flex-col gap-4 p-5">
        <fieldset disabled={!puedeEscribir || pendiente} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Nombre</span>
            <input name="nombre" required defaultValue={p?.nombre ?? ""} maxLength={120} placeholder="Ej: Meta" data-enfocar className={`${fieldClass} w-full`} />
          </label>
          <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>RUC</span>
              <input name="ruc" value={ruc} onChange={(e) => setRuc(e.target.value)} maxLength={40} placeholder="Ej: 1000-200-3000" aria-invalid={v?.error ? true : undefined} className={`${fieldClass} w-full`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>DV</span>
              <input name="dv" value={dv} onChange={(e) => setDv(e.target.value)} maxLength={2} inputMode="numeric" placeholder="Ej: 60" className={`${fieldClass} w-full`} />
            </label>
          </div>
          {v && (
            <p className="m-0 flex items-center gap-1.5 text-xs">
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${v.error ? "bg-destructive" : "bg-success"}`} />
              {v.error ?? `RUC válido · DV ${v.dv}`}
            </p>
          )}
          {!p && (
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Alias (separados por coma)</span>
              <input name="alias" maxLength={600} placeholder="Ej: META ADS, FACEBK" className={`${fieldClass} w-full`} />
            </label>
          )}
          {p && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="activo" value="si" defaultChecked={p.activo} className="h-4 w-4" />
              Activo
            </label>
          )}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {puedeEscribir && (
          <div className="flex gap-2">
            <button type="submit" disabled={pendiente || !!v?.error} className={`rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
              {pendiente ? "Guardando..." : p ? "Guardar cambios" : "Crear proveedor"}
            </button>
            <button type="button" onClick={alCerrar} disabled={pendiente} className={`rounded-md border border-border px-4 py-2 text-sm hover:bg-muted ${anilloFoco}`}>
              Cancelar
            </button>
          </div>
        )}
      </form>
    </Ventana>
  );
}
