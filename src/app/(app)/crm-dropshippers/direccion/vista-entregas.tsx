"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MarcoTabla, claseTd, claseTh } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { entregasPor, MIN_CERRADOS, sumarEntregas, TASA_BUENA, TASA_REGULAR, tonoEntrega, type Entregas, type FilaEntregas, type TonoEntrega } from "@/lib/crm/automatizar";
import { ETIQUETA_SEGMENTO, nPedidos } from "@/lib/crm/salud";
import type { FilaDireccion } from "./datos-direccion";
import { Chip, ChipEnlace, Cifra, Cifras, Insignia, type TonoDireccion } from "./piezas-direccion";

const KPI: Record<TonoEntrega, TonoDireccion> = { exito: "exito", aviso: "aviso", peligro: "peligro", neutro: "neutro" };
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const parte = (a: number, b: number) => (b ? a / b : null);

function Tasa({ e }: { e: Entregas }) {
  const tono = tonoEntrega(e);
  return tono === "neutro" ? <span className="text-muted-foreground">{pct(e.tasa)}</span> : <Insignia tono={tono}>{pct(e.tasa)}</Insignia>;
}

/**
 * Dirección › Entregas (fase 4): qué parte de los pedidos se entrega, por transportadora y por dropshipper, de los últimos 30, 60 o 90 días.
 * La tasa es entregados ÷ (entregados + devueltos); con menos de 10 cerrados no se colorea. Primero los que peor entregan.
 */
export function VistaEntregas({ filas, clientes, dias, periodos, codigoPais }: { filas: FilaEntregas[]; clientes: FilaDireccion[]; dias: number; periodos: number[]; codigoPais: string }) {
  const [verTodos, setVerTodos] = useState(false);
  const total = sumarEntregas(filas);
  const porT = [...entregasPor(filas, (f) => f.transportadora).entries()].sort((a, b) => b[1].pedidos - a[1].pedidos);
  const porId = useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const porDs = useMemo(
    () =>
      [...entregasPor(filas, (f) => f.dropshipperId).entries()]
        .filter(([, e]) => verTodos || e.entregados + e.devueltos >= MIN_CERRADOS)
        .sort((a, b) => (a[1].tasa ?? 2) - (b[1].tasa ?? 2) || b[1].pedidos - a[1].pedidos),
    [filas, verTodos],
  );
  const malos = porDs.filter(([, e]) => tonoEntrega(e) === "peligro").length;
  const sinVincular = filas.filter((f) => !f.dropshipperId).reduce((s, f) => s + f.pedidos, 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Periodo">
        {periodos.map((d) => (
          <ChipEnlace key={d} href={`/crm-dropshippers/direccion?vista=entregas&dias=${d}`} activo={d === dias}>
            Últimos {d} días
          </ChipEnlace>
        ))}
      </div>

      <Cifras>
        <Cifra titulo="Entregados (de los cerrados)" valor={pct(total.tasa)} nota={`${total.entregados.toLocaleString("es")} de ${(total.entregados + total.devueltos).toLocaleString("es")} · meta ${Math.round(TASA_BUENA * 100)} %`} tono={KPI[tonoEntrega(total)]} />
        <Cifra titulo="Devueltos" valor={total.devueltos.toLocaleString("es")} nota={`${pct(parte(total.devueltos, total.entregados + total.devueltos))} de los cerrados`} tono="aviso" />
        <Cifra titulo="Cancelados" valor={total.cancelados.toLocaleString("es")} nota={`${pct(parte(total.cancelados, total.pedidos))} de ${nPedidos(total.pedidos)}`} />
        <Cifra titulo="Con novedad" valor={total.novedades.toLocaleString("es")} nota={`${total.enCamino.toLocaleString("es")} todavía en camino`} tono={total.novedades ? "aviso" : "neutro"} />
        <Cifra titulo="Entregan mal" valor={malos} nota={`Menos de ${Math.round(TASA_REGULAR * 100)} % entregado (10+ cerrados)`} tono={malos ? "peligro" : "exito"} />
      </Cifras>

      <section aria-labelledby="t-transp" className="flex flex-col gap-2">
        <h2 id="t-transp" className="m-0 text-lg font-semibold">
          Por transportadora
        </h2>
        <MarcoTabla ariaLabel="Entregas por transportadora">
          <table className="w-full min-w-[44rem] border-collapse">
            <thead>
              <tr>
                {["Transportadora", "Pedidos", "Entregados", "Devueltos", "Entregado", "Cancelados", "Con novedad", "En camino"].map((t) => (
                  <th key={t} scope="col" className={claseTh}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porT.map(([t, e]) => (
                <tr key={t} className="hover:bg-muted">
                  <td className={`${claseTd} font-medium`}>{t}</td>
                  <td className={`${claseTd} tabular-nums`}>{e.pedidos.toLocaleString("es")}</td>
                  <td className={`${claseTd} tabular-nums`}>{e.entregados.toLocaleString("es")}</td>
                  <td className={`${claseTd} tabular-nums`}>{e.devueltos.toLocaleString("es")}</td>
                  <td className={claseTd}>
                    <Tasa e={e} />
                  </td>
                  <td className={`${claseTd} tabular-nums`}>{e.cancelados.toLocaleString("es")}</td>
                  <td className={`${claseTd} tabular-nums`}>{e.novedades.toLocaleString("es")}</td>
                  <td className={`${claseTd} tabular-nums`}>{e.enCamino.toLocaleString("es")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </MarcoTabla>
      </section>

      <section aria-labelledby="t-ds-entregas" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="t-ds-entregas" className="m-0 text-lg font-semibold">
            Por dropshipper <span className="font-normal text-muted-foreground">· los que peor entregan primero</span>
          </h2>
          <Chip activo={verTodos} onClick={() => setVerTodos((v) => !v)}>
            {verTodos ? `Solo con ${MIN_CERRADOS} cerrados o más` : "Ver también los de pocos pedidos"}
          </Chip>
        </div>
        <MarcoTabla ariaLabel="Entregas por dropshipper">
          <table className="w-full min-w-[56rem] border-collapse">
            <thead>
              <tr>
                {["Dropshipper", "Estado", "Pedidos", "Entregados", "Devueltos", "Entregado", "Cancelados", "Con novedad", "Transportadora"].map((t) => (
                  <th key={t} scope="col" className={claseTh}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {porDs.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    Ningún dropshipper con {MIN_CERRADOS} pedidos cerrados o más en este periodo.
                  </td>
                </tr>
              ) : (
                porDs.slice(0, 150).map(([id, e]) => {
                  const f = porId.get(id);
                  return (
                    <tr key={id} className="hover:bg-muted">
                      <td className={claseTd}>
                        <Link href={`/crm-dropshippers?abrir=${id}`} className={`flex flex-col hover:underline ${anilloFoco}`}>
                          <span className="font-medium">{f?.nombre ?? "Dropshipper"}</span>
                          <span className="text-xs text-muted-foreground">{f?.codigo}</span>
                        </Link>
                      </td>
                      <td className={claseTd}>{f ? ETIQUETA_SEGMENTO[f.segmento] : "—"}</td>
                      <td className={`${claseTd} tabular-nums`}>{e.pedidos}</td>
                      <td className={`${claseTd} tabular-nums`}>{e.entregados}</td>
                      <td className={`${claseTd} tabular-nums`}>{e.devueltos}</td>
                      <td className={claseTd}>
                        <Tasa e={e} />
                      </td>
                      <td className={`${claseTd} tabular-nums`}>{e.cancelados}</td>
                      <td className={`${claseTd} tabular-nums`}>{e.novedades}</td>
                      <td className={claseTd}>{e.principal}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </MarcoTabla>
        <p className="m-0 text-xs text-muted-foreground">
          Pedidos de Dropi de {codigoPais} con fecha en el periodo. «Entregado» = entregados ÷ (entregados + devueltos): los que siguen en camino no cuentan.
          {sinVincular > 0 && ` ${nPedidos(sinVincular)} son de cuentas que no están vinculadas a ningún dropshipper: cuentan en las transportadoras pero no en esta lista.`}
        </p>
      </section>
    </>
  );
}
