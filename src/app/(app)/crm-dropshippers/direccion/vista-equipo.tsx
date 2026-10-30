"use client";

import { duracionCorta, META_RESPUESTA_MIN, tonoRespuesta, type FilaEquipo, type TonoTiempo } from "@/lib/crm/equipo";
import { nPedidos } from "@/lib/crm/salud";
import type { DatosEquipo } from "./datos-equipo";
import { rutaVista } from "./ruta";
import { Barra, ChipEnlace, Cifra, Cifras, SUAVE_TONO, TEXTO_TONO, Tarjeta, type TonoDireccion } from "./piezas-direccion";

const AREA: Record<string, string> = { atencion: "Atención", comercial: "Comercial", direccion: "Dirección" };
const TONO: Record<TonoTiempo, TonoDireccion> = { exito: "exito", aviso: "aviso", peligro: "peligro", neutro: "neutro" };
const porcentaje = (parte: number, total: number) => (total ? `${Math.round((parte / total) * 100)} %` : "—");
const cambio = (a: number, b: number) => (b ? (a / b - 1) * 100 : null);
const TONO_TRAMO: TonoDireccion[] = ["exito", "aviso", "aviso", "peligro", "peligro"];
const iniciales = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

/** La tarjeta de una persona, como en el prototipo: cartera, activos y en riesgo arriba; su primera respuesta frente a la meta; sus pedidos. */
function TarjetaPersona({ p }: { p: FilaEquipo }) {
  const tono = TONO[tonoRespuesta(p.medianaMin)];
  const c = cambio(p.pedidos30, p.pedidos30Antes);
  return (
    <section aria-label={p.nombre} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
          {iniciales(p.nombre)}
        </span>
        <div className="min-w-0">
          <h3 className="m-0 truncate text-base font-semibold">{p.nombre}</h3>
          <p className="m-0 text-[13px] text-muted-foreground">{AREA[p.area]}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Cartera</div>
          <div className="text-xl font-bold tabular-nums">{p.cartera}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Activos</div>
          <div className="text-xl font-bold tabular-nums">{p.carteraActivos}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">En riesgo</div>
          <div className={`text-xl font-bold tabular-nums ${p.carteraEnRiesgo ? "text-warning" : ""}`}>{p.carteraEnRiesgo}</div>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-2 text-[13px]">
          <span>1.ª respuesta (meta {META_RESPUESTA_MIN} min)</span>
          <span className={`font-bold ${TEXTO_TONO[tono]}`}>{duracionCorta(p.medianaMin)}</span>
        </div>
        <Barra valor={p.medianaMin === null ? 0 : Math.round((p.medianaMin / (META_RESPUESTA_MIN * 2)) * 100)} tono={tono} alto="h-2" />
        <span className="text-xs text-muted-foreground">
          {p.respondidas ? `${p.respondidas} consultas · ${porcentaje(p.en15, p.respondidas)} en ${META_RESPUESTA_MIN} min · ${p.enviados} mensajes` : "Sin consultas respondidas en el periodo"}
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2 border-t border-border pt-3 text-sm">
        <span className="text-muted-foreground">Pedidos de su cartera, 30 d</span>
        <span className="font-bold tabular-nums">
          {p.pedidos30.toLocaleString("es")}{" "}
          {c !== null && <span className={`text-[13px] font-semibold ${c >= 0 ? "text-success" : "text-destructive"}`}>{`${c >= 0 ? "+" : "−"}${Math.abs(Math.round(c))} %`}</span>}
        </span>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        <span>
          Chats: {p.asignados} asignados
          {p.esperando > 0 && <span className="font-semibold text-destructive"> · {p.esperando} esperando ({duracionCorta(p.esperaMaxMin)})</span>}
        </span>
        <span>
          Tareas: {p.tareasPendientes} pendientes
          {p.tareasAtrasadas > 0 && <span className="font-semibold text-destructive"> · {p.tareasAtrasadas} atrasadas</span>} · {p.tareasHechas} hechas
        </span>
      </div>
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
  const tono = TONO[tonoRespuesta(datos.medianaMin)];

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Periodo">
        {periodos.map((d) => (
          <ChipEnlace key={d} href={rutaVista("equipo", { dias: d })} activo={d === datos.dias}>
            Últimos {d} días
          </ChipEnlace>
        ))}
      </div>

      <Cifras>
        <Cifra titulo="1.ª respuesta (mediana)" valor={duracionCorta(datos.medianaMin)} nota={`Meta: ${META_RESPUESTA_MIN} min · ${datos.consultas} consultas`} tono={tono} />
        <Cifra titulo={`Respondidas en ${META_RESPUESTA_MIN} min`} valor={porcentaje(datos.en15, datos.consultas)} nota={`${datos.en15} de ${datos.consultas}`} tono="info" />
        <Cifra titulo="Esperando respuesta" valor={esperandoAhora} nota={masDeUnaHora ? `${masDeUnaHora} llevan más de 1 h` : "Ninguno más de 1 h"} tono={masDeUnaHora ? "peligro" : esperandoAhora ? "aviso" : "exito"} />
        <Cifra titulo="Chats sin asignar" valor={datos.sinAsignar.abiertos} nota={`${datos.sinAsignar.esperando} de ellos esperando`} tono={datos.sinAsignar.esperando ? "aviso" : "neutro"} />
        <Cifra titulo="Tareas atrasadas" valor={atrasadas} nota="De todo el equipo" tono={atrasadas ? "peligro" : "exito"} />
      </Cifras>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(19rem,1fr))] gap-4">
        {activos.length === 0 ? <p className="m-0 text-sm text-muted-foreground">Nadie del equipo tuvo actividad en este periodo.</p> : activos.map((p) => <TarjetaPersona key={p.id} p={p} />)}
      </div>

      <Tarjeta id="t-espera" titulo="Chats esperando respuesta ahora">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-3">
          {datos.tramos.map((t, i) => (
            <div key={t.etiqueta} className={`flex flex-col gap-1 rounded-[10px] px-3.5 py-3 ${t.total ? SUAVE_TONO[TONO_TRAMO[i]] : SUAVE_TONO.neutro}`}>
              <span className="text-[13px] font-semibold">{t.etiqueta}</span>
              <span className="text-[28px] leading-none font-bold tabular-nums">{t.total}</span>
              <span className="text-xs">
                {Object.entries(t.porArea)
                  .map(([a, n]) => `${AREA[a] ?? a} ${n}`)
                  .join(" · ") || " "}
              </span>
            </div>
          ))}
        </div>
      </Tarjeta>

      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        {sinActividad.length > 0 && <p className="m-0">Sin respuestas, chats, tareas ni cartera en este periodo: {sinActividad.map((p) => p.nombre).join(", ")}.</p>}
        {datos.otras.length > 0 && (
          <p className="m-0">
            Otras respuestas (no son de una persona del equipo): {datos.otras.map((o) => `${o.persona}: ${o.respondidas} consultas, ${duracionCorta(o.mediana_min)} de mediana`).join(" · ")}.
          </p>
        )}
        <p className="m-0">
          Respuestas, chats y tareas son de todos los países; la cartera es la de {codigoPais} ({nPedidos(activos.reduce((s, p) => s + p.pedidos30, 0))} en 30 días). Quién lleva a cada dropshipper se
          elige en Clientes, en su ficha («Lo lleva»); si no tiene, cuenta quien tiene asignado su chat.
        </p>
      </div>
    </>
  );
}
