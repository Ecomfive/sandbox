"use client";

import Link from "next/link";
import { CabeceraTarjeta, Pastilla } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { KpiCard, KpiGrid, type Tono } from "@/components/ui/kpi-card";
import { duracionCorta, META_RESPUESTA_MIN, tonoRespuesta, type FilaEquipo, type TonoTiempo } from "@/lib/crm/equipo";
import { nPedidos } from "@/lib/crm/salud";
import type { DatosEquipo } from "./datos-equipo";
import { rutaVista } from "./ruta";

const AREA: Record<string, string> = { atencion: "Atención", comercial: "Comercial", direccion: "Dirección" };
const KPI_TONO: Record<TonoTiempo, Tono> = { exito: "success", aviso: "warning", peligro: "destructive", neutro: "neutral" };
const TEXTO_TONO: Record<TonoTiempo, string> = { exito: "text-success", aviso: "text-warning", peligro: "text-destructive", neutro: "text-muted-foreground" };
const porcentaje = (parte: number, total: number) => (total ? `${Math.round((parte / total) * 100)} %` : "—");
const cambio = (a: number, b: number) => (b ? `${a >= b ? "+" : "−"}${Math.abs(Math.round((a / b - 1) * 100))} %` : null);

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 text-[13px]">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

function TarjetaPersona({ p }: { p: FilaEquipo }) {
  const tono = tonoRespuesta(p.medianaMin);
  const c = cambio(p.pedidos30, p.pedidos30Antes);
  return (
    <section aria-label={p.nombre} className="flex flex-col gap-3 rounded-[10px] border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="m-0 truncate text-sm font-semibold">{p.nombre}</h3>
        <Pastilla>{AREA[p.area]}</Pastilla>
      </div>
      <dl className="m-0 flex flex-col gap-1.5">
        <Dato etiqueta="Respuestas">
          {p.respondidas ? (
            <>
              {p.respondidas} consultas · <span className={`font-semibold ${TEXTO_TONO[tono]}`}>{duracionCorta(p.medianaMin)}</span> de mediana · {porcentaje(p.en15, p.respondidas)} en 15 min
            </>
          ) : (
            <span className="text-muted-foreground">Sin consultas respondidas</span>
          )}
          {p.enviados > 0 && <span className="block text-xs text-muted-foreground">{p.enviados} mensajes enviados</span>}
        </Dato>
        <Dato etiqueta="Chats ahora">
          {p.asignados} asignados
          {p.esperando > 0 && (
            <span className="font-semibold text-destructive">
              {" "}
              · {p.esperando} esperando (la más larga, {duracionCorta(p.esperaMaxMin)})
            </span>
          )}
        </Dato>
        <Dato etiqueta="Tareas">
          {p.tareasPendientes} pendientes
          {p.tareasAtrasadas > 0 && <span className="font-semibold text-destructive"> · {p.tareasAtrasadas} atrasadas</span>} · {p.tareasHechas} hechas
        </Dato>
        <Dato etiqueta="Cartera">
          {p.cartera ? (
            <>
              {p.cartera} dropshippers · {p.carteraActivos} activos
              {p.carteraEnRiesgo > 0 && <span className="text-warning"> · {p.carteraEnRiesgo} en riesgo o dormidos</span>}
              <span className="block text-xs text-muted-foreground">
                {nPedidos(p.pedidos30)} en 30 días{c ? ` (${c})` : ""}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">No lleva dropshippers</span>
          )}
        </Dato>
      </dl>
    </section>
  );
}

/** Dirección › Equipo: cómo responde cada persona, qué tiene esperando, sus tareas y su cartera. Solo mide: no cambia los chats. */
export function VistaEquipo({ datos, periodos, codigoPais }: { datos: DatosEquipo; periodos: number[]; codigoPais: string }) {
  const esperandoAhora = datos.tramos.reduce((s, t) => s + t.total, 0);
  const masDeUnaHora = datos.tramos.slice(3).reduce((s, t) => s + t.total, 0);
  const atrasadas = datos.filas.reduce((s, f) => s + f.tareasAtrasadas, 0);
  const activos = datos.filas.filter((f) => f.conActividad);
  const sinActividad = datos.filas.filter((f) => !f.conActividad);
  const tono = tonoRespuesta(datos.medianaMin);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Periodo">
        {periodos.map((d) => (
          <Link
            key={d}
            href={rutaVista("equipo", { dias: d })}
            aria-current={d === datos.dias ? "page" : undefined}
            className={`inline-flex h-[34px] items-center rounded-lg border px-3 text-[13px] ${d === datos.dias ? "border-accent bg-accent" : "border-border bg-card hover:bg-muted"} ${anilloFoco}`}
          >
            Últimos {d} días
          </Link>
        ))}
      </div>

      <KpiGrid>
        <KpiCard titulo="Primera respuesta (mediana)" valor={duracionCorta(datos.medianaMin)} subtexto={`Meta: ${META_RESPUESTA_MIN} min · ${datos.consultas} consultas`} tono={KPI_TONO[tono]} />
        <KpiCard titulo={`Respondidas en ${META_RESPUESTA_MIN} min`} valor={porcentaje(datos.en15, datos.consultas)} subtexto={`${datos.en15} de ${datos.consultas}`} tono="info" />
        <KpiCard titulo="Esperando respuesta ahora" valor={esperandoAhora} subtexto={masDeUnaHora ? `${masDeUnaHora} llevan más de 1 h` : "Ninguno más de 1 h"} tono={masDeUnaHora ? "destructive" : esperandoAhora ? "warning" : "success"} />
        <KpiCard titulo="Chats sin asignar" valor={datos.sinAsignar.abiertos} subtexto={`${datos.sinAsignar.esperando} de ellos esperando`} tono={datos.sinAsignar.esperando ? "warning" : "neutral"} />
        <KpiCard titulo="Tareas atrasadas" valor={atrasadas} subtexto="De todo el equipo" tono={atrasadas ? "destructive" : "success"} />
      </KpiGrid>

      <section aria-labelledby="t-espera" className="rounded-[10px] border border-border bg-card">
        <CabeceraTarjeta id="t-espera" titulo="Chats esperando respuesta ahora" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3 p-3.5">
          {datos.tramos.map((t, i) => (
            <div key={t.etiqueta} className={`flex flex-col gap-0.5 rounded-lg px-3 py-2.5 ${!t.total ? "bg-muted" : i >= 3 ? "bg-destructive-soft text-destructive" : i >= 1 ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}>
              <span className="text-xs font-medium">{t.etiqueta}</span>
              <span className="text-xl font-semibold tabular-nums">{t.total}</span>
              <span className="text-[11px]">
                {Object.entries(t.porArea)
                  .map(([a, n]) => `${AREA[a] ?? a} ${n}`)
                  .join(" · ") || " "}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="t-personas" className="flex flex-col gap-3">
        <h2 id="t-personas" className="m-0 text-base font-semibold">
          Por persona
        </h2>
        {activos.length === 0 ? (
          <p className="m-0 text-sm text-muted-foreground">Nadie del equipo tuvo actividad en este periodo.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-3">
            {activos.map((p) => (
              <TarjetaPersona key={p.id} p={p} />
            ))}
          </div>
        )}
        {sinActividad.length > 0 && (
          <p className="m-0 text-xs text-muted-foreground">
            Sin respuestas, chats, tareas ni cartera en este periodo: {sinActividad.map((p) => p.nombre).join(", ")}.
          </p>
        )}
        {datos.otras.length > 0 && (
          <p className="m-0 text-xs text-muted-foreground">
            Otras respuestas (no son de una persona del equipo):{" "}
            {datos.otras.map((o) => `${o.persona}: ${o.respondidas} consultas, ${duracionCorta(o.mediana_min)} de mediana`).join(" · ")}.
          </p>
        )}
        <p className="m-0 text-xs text-muted-foreground">
          Respuestas, chats y tareas son de todos los países; la cartera es la de {codigoPais}. Quién lleva a cada dropshipper se elige en la vista Clientes, al abrir su fila («Lo lleva»); si no tiene, cuenta quien tiene asignado su chat.
        </p>
      </section>
    </>
  );
}
