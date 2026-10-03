"use client";

import { useMemo, useState, useTransition } from "react";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { BotonBarra, MarcoTabla, Pastilla, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { formatearFecha } from "@/lib/formato";
import { PUNTAJE_ALTO, type Candidato } from "@/lib/crm/sugerencias";
import { vincularCuenta } from "./actions";

export interface FilaVinculo {
  idExterno: string;
  tienda: string | null;
  pedidos: number;
  ultimoPedido: string | null;
  sugeridos: Candidato[];
}

interface Opcion {
  id: string;
  nombre: string;
  tienda: string | null;
}

const ENCABEZADOS = ["Usuario", "Tienda en la plataforma", "Pedidos", "Último pedido", "Dropshipper", ""];

function Fila({
  fila,
  dropshippers,
  codigoPais,
  plataforma,
  puedeEscribir,
  alVincular,
}: {
  fila: FilaVinculo;
  dropshippers: Opcion[];
  codigoPais: string;
  plataforma: string;
  puedeEscribir: boolean;
  alVincular: (idExterno: string) => void;
}) {
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  const mejor = fila.sugeridos[0];
  const [elegido, setElegido] = useState(mejor?.dropshipperId ?? "");
  const porId = useMemo(() => new Map(dropshippers.map((d) => [d.id, d])), [dropshippers]);
  const idsSugeridos = new Set(fila.sugeridos.map((c) => c.dropshipperId));

  function vincular() {
    const datos = new FormData();
    datos.set("dropshipper_id", elegido);
    datos.set("id_externo", fila.idExterno);
    datos.set("tienda_nombre", fila.tienda ?? "");
    datos.set("pais", codigoPais);
    datos.set("plataforma", plataforma);
    start(async () => {
      const r = await vincularCuenta(datos);
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast(`Vinculado a ${porId.get(elegido)?.nombre ?? "el dropshipper"}`);
        alVincular(fila.idExterno);
      }
    });
  }

  return (
    <tr className="hover:bg-muted">
      <td className={`${claseTd} tabular-nums`}>{fila.idExterno}</td>
      <td className={claseTd}>{fila.tienda ?? <span className="text-muted-foreground">Sin nombre</span>}</td>
      <td className={`${claseTd} tabular-nums`}>{fila.pedidos}</td>
      <td className={claseTd}>{fila.ultimoPedido ? formatearFecha(fila.ultimoPedido) : "—"}</td>
      <td className={claseTd}>
        <div className="flex items-center gap-2">
          <select
            aria-label={`Dropshipper del usuario ${fila.idExterno}`}
            value={elegido}
            disabled={!puedeEscribir || pendiente}
            onChange={(e) => setElegido(e.target.value)}
            className={`${fieldClassSm} min-w-[14rem]`}
          >
            <option value="">Elegir dropshipper…</option>
            {fila.sugeridos.length > 0 && (
              <optgroup label="Sugeridos">
                {fila.sugeridos.map((c) => (
                  <option key={c.dropshipperId} value={c.dropshipperId}>
                    {porId.get(c.dropshipperId)?.nombre ?? "—"}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Todos">
              {dropshippers
                .filter((d) => !idsSugeridos.has(d.id))
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                    {d.tienda ? ` · ${d.tienda}` : ""}
                  </option>
                ))}
            </optgroup>
          </select>
          {mejor && elegido === mejor.dropshipperId && <Pastilla tono={mejor.puntaje >= PUNTAJE_ALTO ? "exito" : "aviso"}>{mejor.puntaje >= PUNTAJE_ALTO ? "Alta" : "Media"}</Pastilla>}
        </div>
      </td>
      <td className={`${claseTd} text-right`}>
        {puedeEscribir && (
          <button
            type="button"
            disabled={!elegido || pendiente}
            onClick={vincular}
            className={`rounded-md border border-foreground bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-foreground/85 disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`}
          >
            {pendiente ? "Vinculando…" : "Vincular"}
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * Usuarios de la plataforma (Dropi) con pedidos que aún no son de ningún dropshipper, de más a menos pedidos. Donde el
 * nombre de la tienda se parece al de un dropshipper, ya viene elegido: se confirma con un clic. Se vinculan de a uno.
 */
export function TablaVinculos({
  filas,
  dropshippers,
  vinculados,
  codigoPais,
  plataforma,
  puedeEscribir,
}: {
  filas: FilaVinculo[];
  dropshippers: Opcion[];
  vinculados: number;
  codigoPais: string;
  plataforma: string;
  puedeEscribir: boolean;
}) {
  const [soloSugeridos, setSoloSugeridos] = useState(false);
  const [hechos, setHechos] = useState<Set<string>>(new Set());

  const visibles = useMemo(
    () => filas.filter((f) => !hechos.has(f.idExterno) && (!soloSugeridos || f.sugeridos.length > 0)),
    [filas, hechos, soloSugeridos],
  );
  const pendientes = filas.length - hechos.size;

  return (
    <div className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <BotonBarra activo={soloSugeridos} onClick={() => setSoloSugeridos((v) => !v)}>
          Con sugerencia
        </BotonBarra>
        <span className="flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums" role="status">
          {plataforma}: {pendientes} sin vincular · {vinculados + hechos.size} vinculados
        </span>
      </div>

      <MarcoTabla ariaLabel={`Usuarios de ${plataforma} sin vincular`}>
        <table className="w-full min-w-[60rem] border-collapse">
          <thead>
            <tr>
              {ENCABEZADOS.map((t, i) => (
                <th key={`${t}-${i}`} scope="col" className={claseTh}>
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr>
                <td colSpan={ENCABEZADOS.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                  {pendientes === 0 ? "Todos los usuarios con pedidos están vinculados." : "Ningún usuario tiene sugerencia."}
                </td>
              </tr>
            ) : (
              visibles.map((f) => (
                <Fila
                  key={f.idExterno}
                  fila={f}
                  dropshippers={dropshippers}
                  codigoPais={codigoPais}
                  plataforma={plataforma}
                  puedeEscribir={puedeEscribir}
                  alVincular={(id) => setHechos((h) => new Set(h).add(id))}
                />
              ))
            )}
          </tbody>
        </table>
      </MarcoTabla>
    </div>
  );
}
