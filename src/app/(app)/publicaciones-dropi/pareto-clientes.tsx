"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { COLORES } from "@/components/panel/colores-tablero";
import { anilloFoco } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { fraseDelAnalisis, GRUPOS_PARETO, paretoDe, textoParte, type GrupoPareto, type ResultadoPareto } from "@/lib/crm/pareto";
import { DropshipperIcon } from "@/lib/nav-icons";
import { Barra, Chip } from "../crm-dropshippers/direccion/piezas-direccion";
import { cargarParetoClientes, type ParetoClientes } from "./pareto-actions";

/** Los periodos que se pueden mirar (como en Dirección); la tarjeta muestra el de 12 meses. */
const PERIODOS = [3, 6, 12];
const LEYENDA: Record<GrupoPareto, string> = { top: "El 20 % de los clientes", resto: "El 80 % restante" };
const n = (v: number) => v.toLocaleString("es-PA");
const guias = (v: number) => `${n(v)} ${v === 1 ? "guía" : "guías"}`;

/**
 * La tarjeta «Pareto de clientes» del tablero (12 nov 2026, pedido de Hernán): cuántos clientes son el 20 % que más guías hace y qué parte de las guías
 * hacen, en los últimos 12 meses. No filtra la lista de publicaciones (cuenta clientes, no publicaciones): abre la lista de esos clientes. Las guías son
 * las del Pareto de Dirección en el CRM y se piden al abrir la página.
 */
export function TarjetaParetoClientes() {
  const [datos, setDatos] = useState<ParetoClientes | null>(null);
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    let vigente = true;
    cargarParetoClientes()
      .then((d) => vigente && setDatos(d))
      .catch(() => vigente && setDatos({ error: "No se pudo cargar el Pareto de clientes." }));
    return () => {
      vigente = false;
    };
  }, []);
  const series = useMemo(() => new Map(Object.entries(datos && !("error" in datos) ? datos.porMes : {})), [datos]);
  const r12 = useMemo(() => paretoDe(series, 12), [series]);
  const c = COLORES.violeta;
  const cargando = !datos;
  const error = datos && "error" in datos ? datos.error : null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierta}
        disabled={cargando}
        onClick={() => setAbierta(true)}
        className={`group flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition duration-150 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-progress disabled:hover:translate-y-0 disabled:hover:shadow-sm motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${anilloFoco}`}
      >
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${c.icono}`}>
            <DropshipperIcon className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 text-xs leading-tight font-medium tracking-wide text-muted-foreground uppercase hyphens-auto">Pareto de clientes</span>
        </span>
        <span className="flex items-baseline gap-1">
          <span className={`text-3xl leading-none font-semibold tabular-nums ${c.numero}`}>{cargando ? "…" : error ? "—" : n(r12.grupos.top.n)}</span>
          {!cargando && !error && r12.n > 0 && <span className="text-sm text-muted-foreground tabular-nums">/ {n(r12.n)} clientes</span>}
        </span>
        <span className="text-xs text-muted-foreground">
          {cargando ? (
            "Contando las guías de 12 meses…"
          ) : error ? (
            <span className="text-destructive">{error}</span>
          ) : r12.n === 0 ? (
            "Sin guías de clientes en 12 meses"
          ) : (
            <>
              El 20 % que más guías trae: hace el <span className="font-semibold text-foreground">{textoParte(r12.grupos.top.parteDelTotal)}</span> de las guías (12 meses)
            </>
          )}
          <span className="sr-only">. Abre la lista de esos clientes.</span>
        </span>
      </button>
      {datos && !("error" in datos) && <VentanaPareto abierta={abierta} alCerrar={() => setAbierta(false)} datos={datos} series={series} />}
    </>
  );
}

/** La lista de los clientes por guías, de más a menos: el 20 % que más trae primero y, si se pide, el resto. Con el periodo (3, 6 o 12 meses). */
function VentanaPareto({ abierta, alCerrar, datos, series }: { abierta: boolean; alCerrar: () => void; datos: Exclude<ParetoClientes, { error: string }>; series: Map<string, number[]> }) {
  const [meses, setMeses] = useState(12);
  const [verTodos, setVerTodos] = useState(false);
  const r = useMemo(() => paretoDe(series, meses), [series, meses]);
  const filas = verTodos ? r.filas : r.filas.filter((f) => f.grupo === "top");
  const nombre = (id: string) => datos.clientes[id]?.nombre ?? "Cliente sin ficha";

  return (
    <Ventana abierto={abierta} alCerrar={alCerrar} titulo={`Pareto de clientes · ${datos.nombrePais}`} ancho="lg">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          {PERIODOS.map((m) => (
            <Chip key={m} activo={meses === m} onClick={() => setMeses(m)}>
              {m} meses
            </Chip>
          ))}
        </div>
        {r.n === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Sin guías de clientes en {meses} meses.</p>
        ) : (
          <>
            <p className="m-0 text-base font-semibold">{fraseDelAnalisis(r, "los clientes", "las guías")}</p>
            <Resumen r={r} />
            <p className="m-0 text-[13px] text-muted-foreground">
              {r.cumple8020 ? (
                <span className="font-semibold text-success">El 80/20 se cumple. </span>
              ) : (
                <span className="font-semibold text-warning">
                  No llega al 80/20: para el 80 % de las guías hacen falta {n(r.paraLlegarA80.n)} clientes ({textoParte(r.paraLlegarA80.parte)}).{" "}
                </span>
              )}
              Guías = pedidos de Dropi sin cancelados, de las cuentas vinculadas a cada cliente en el CRM.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  {verTodos ? "Todos los clientes con guías" : "El 20 % de los clientes que más guías trae"}, de más a menos guías, en {meses} meses
                </caption>
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      #
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Cliente
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Guías
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Parte
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Acumulado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.id} className={`border-t border-border ${f.grupo === "resto" ? "text-muted-foreground" : ""}`}>
                      <td className="px-3 py-1.5 text-right tabular-nums">{f.posicion}</td>
                      <td className="px-3 py-1.5">
                        {datos.enlazarCrm && datos.clientes[f.id] ? (
                          <Link href={`/crm-dropshippers?abrir=${f.id}`} className={`rounded font-medium text-foreground hover:underline ${anilloFoco}`}>
                            {nombre(f.id)}
                          </Link>
                        ) : (
                          <span className="font-medium">{nombre(f.id)}</span>
                        )}
                        {datos.clientes[f.id]?.codigo && <span className="ml-1.5 text-xs text-muted-foreground">{datos.clientes[f.id]!.codigo}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{n(f.valor)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{textoParte(f.parte)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{textoParte(f.acumulado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.grupos.resto.n > 0 && (
              <button type="button" onClick={() => setVerTodos((v) => !v)} className={`self-start rounded text-sm font-medium text-primario hover:underline ${anilloFoco}`}>
                {verTodos ? `Ver solo el 20 % (${n(r.grupos.top.n)})` : `Ver también el 80 % restante (${n(r.grupos.resto.n)} clientes)`}
              </button>
            )}
          </>
        )}
      </div>
    </Ventana>
  );
}

/** Los dos grupos: qué parte de las guías hace cada uno y cuántos clientes son. */
function Resumen({ r }: { r: ResultadoPareto }) {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
      {GRUPOS_PARETO.map((g) => (
        <li key={g} className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5">
          <span className="text-sm font-semibold">{LEYENDA[g]}</span>
          <span className="flex items-baseline gap-2">
            <span className="text-[26px] leading-none font-bold tracking-tight tabular-nums">{textoParte(r.grupos[g].parteDelTotal)}</span>
            <span className="text-sm text-muted-foreground">de las guías</span>
          </span>
          <Barra valor={r.grupos[g].parteDelTotal * 100} tono={g === "top" ? "info" : "neutro"} alto="h-2" />
          <span className="text-xs text-muted-foreground">
            {n(r.grupos[g].n)} {r.grupos[g].n === 1 ? "cliente" : "clientes"} · {guias(r.grupos[g].valor)}
          </span>
        </li>
      ))}
    </ul>
  );
}
