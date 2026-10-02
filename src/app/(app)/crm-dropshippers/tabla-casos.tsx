"use client";

import { Fragment, useMemo, useState } from "react";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { useToast } from "@/components/ui/toast";
import {
  DEF_CASOS,
  ESTADOS_CASO,
  etiquetaAntiguedad,
  etiquetaCanal,
  etiquetaEstadoCaso,
  etiquetaPrioridad,
  etiquetaTipoCaso,
  type FilaCaso,
} from "./def-crm";
import { BotonBarra, BotonDescargar, MarcoTabla, Pastilla, Punto, claseTd, claseTh } from "@/components/panel/piezas-panel";

const ENCABEZADOS = ["Caso", "Dropshipper", "Tipo", "Prioridad", "Estado", "Pedido", "Responsable", "Canal", "Abierto hace"];
const TONO_PRIORIDAD = { alta: "peligro", normal: "aviso", baja: "neutro" } as const;
const PUNTO_ESTADO = { abierto: "aviso", en_curso: "aviso", resuelto: "exito" } as const;

/** Casos de soporte: abiertos por defecto, con filtros de un toque, agrupados por estado y con su descarga. */
export function TablaCasos({ casos, miNombre }: { casos: FilaCaso[]; miNombre: string | null }) {
  const { mostrarToast } = useToast();
  const [verResueltos, setVerResueltos] = useState(false);
  const [soloMios, setSoloMios] = useState(false);
  const [sinResponder, setSinResponder] = useState(false);

  const filas = useMemo(
    () =>
      casos.filter(
        (c) =>
          (verResueltos || c.estado !== "resuelto") &&
          (!soloMios || (miNombre !== null && c.responsable === miNombre)) &&
          (!sinResponder || c.responsable === null),
      ),
    [casos, verResueltos, soloMios, sinResponder, miNombre],
  );
  const grupos = ESTADOS_CASO.map((e) => ({ ...e, filas: filas.filter((c) => c.estado === e.valor) })).filter((g) => g.filas.length > 0);

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <BotonBarra activo={!verResueltos} onClick={() => setVerResueltos((v) => !v)}>
          {verResueltos ? "Todos" : "Abiertos"}
        </BotonBarra>
        <BotonBarra activo={soloMios} onClick={() => setSoloMios((v) => !v)} disabled={miNombre === null}>
          Mis casos
        </BotonBarra>
        <BotonBarra activo={sinResponder} onClick={() => setSinResponder((v) => !v)}>
          Sin responsable
        </BotonBarra>
        <span className="flex-1" />
        <BotonDescargar def={DEF_CASOS} filas={filas} />
        <BotonAgregar etiqueta="Agregar caso" onClick={() => mostrarToast("Crear casos se activa en la siguiente versión del CRM.", "info")} />
      </div>

      <MarcoTabla ariaLabel="Casos de soporte">
        <table className="w-full min-w-[60rem] border-collapse">
          <thead>
            <tr>
              {ENCABEZADOS.map((t, i) => (
                <th key={t} scope="col" className={`${claseTh} ${i === 8 ? "text-right" : ""}`}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={ENCABEZADOS.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {casos.length === 0 ? "Todavía no hay casos de soporte." : "Ningún caso coincide con los filtros."}
                </td>
              </tr>
            ) : (
              grupos.map((g) => (
                <Fragment key={g.valor}>
                  <tr>
                    <td colSpan={ENCABEZADOS.length} className="border-b border-border bg-muted px-3 py-2 text-xs font-semibold text-foreground-soft">
                      <Punto tono={PUNTO_ESTADO[g.valor]} className="mr-2" />
                      {g.etiqueta} · {g.filas.length}
                    </td>
                  </tr>
                  {g.filas.map((c) => (
                    <tr key={c.id} className="hover:bg-muted">
                      <td className={claseTd}>
                        <span className="block font-medium">{c.titulo}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">{c.codigo}</span>
                      </td>
                      <td className={claseTd}>{c.dropshipper}</td>
                      <td className={claseTd}>{etiquetaTipoCaso(c.tipo)}</td>
                      <td className={claseTd}>
                        <Pastilla tono={TONO_PRIORIDAD[c.prioridad as keyof typeof TONO_PRIORIDAD] ?? "neutro"}>{etiquetaPrioridad(c.prioridad)}</Pastilla>
                      </td>
                      <td className={claseTd}>
                        <Pastilla tono={c.estado === "resuelto" ? "exito" : c.estado === "abierto" ? "aviso" : "neutro"}>{etiquetaEstadoCaso(c.estado)}</Pastilla>
                      </td>
                      <td className={`${claseTd} tabular-nums`}>{c.numeroPedido ?? "—"}</td>
                      <td className={claseTd}>{c.responsable ?? <span className="text-muted-foreground">Sin asignar</span>}</td>
                      <td className={claseTd}>{etiquetaCanal(c.canal)}</td>
                      <td className={`${claseTd} text-right tabular-nums`}>{etiquetaAntiguedad(c.horasAbierto)}</td>
                    </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </MarcoTabla>
      <p className="px-0.5 py-2 text-xs text-muted-foreground" role="status">
        Mostrando {filas.length} de {casos.length}
        {!verResueltos && casos.some((c) => c.estado === "resuelto") ? " · los resueltos están ocultos (botón «Abiertos»)" : ""}
      </p>
    </div>
  );
}
