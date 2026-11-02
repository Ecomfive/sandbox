import type { ReactNode } from "react";
import { type AtencionWhatsapp, type DiaAtencion, type NumeroAtencion, parteDe, porcentaje, posicionEnMeta } from "@/lib/crm/atencion";
import { duracionCorta, META_RESPUESTA_MIN, tonoRespuesta } from "@/lib/crm/equipo";
import { Barra, FONDO_TONO, Insignia, TEXTO_TONO, Tarjeta, type TonoDireccion } from "./piezas-direccion";

const AREA: Record<string, string> = { atencion: "Atención", comercial: "Comercial", direccion: "Dirección" };
const dia = (iso: string, largo = false) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("es", largo ? { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });

/** El tono de «respondidas en 15 minutos»: 80 % o más bien, de 50 a 79 % atención, menos mal; sin consultas, neutro. */
const tonoPorcentaje = (parte: number, total: number): TonoDireccion => (!total ? "neutro" : parte / total >= 0.8 ? "exito" : parte / total >= 0.5 ? "aviso" : "peligro");

/** Un anillo de 0 a 100 con el número en el centro; el color es del tono y el número y la nota lo dicen también con texto. */
function Anillo({ valor, tono, etiqueta, children }: { valor: number; tono: TonoDireccion; etiqueta: string; children: ReactNode }) {
  const r = 42;
  const largo = 2 * Math.PI * r;
  return (
    <div role="img" aria-label={etiqueta} className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" stroke="currentColor" className="text-muted" />
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="10" strokeLinecap="round" stroke="currentColor" className={TEXTO_TONO[tono]} strokeDasharray={`${(largo * valor) / 100} ${largo}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold tabular-nums">{children}</span>
    </div>
  );
}

/** Una barra con la meta: verde hasta la meta, ámbar hasta el doble y rojo hasta el triple; una marca dice dónde cae el tiempo. */
function BarraMeta({ minutos }: { minutos: number | null }) {
  const pos = posicionEnMeta(minutos, META_RESPUESTA_MIN);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-3 w-full overflow-hidden rounded-full">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1/3 bg-success-soft" />
        <span aria-hidden="true" className="absolute inset-y-0 left-1/3 w-1/3 bg-warning-soft" />
        <span aria-hidden="true" className="absolute inset-y-0 left-2/3 w-1/3 bg-destructive-soft" />
        {pos !== null && <span aria-hidden="true" className="absolute inset-y-0 w-1 -translate-x-1/2 rounded-full bg-foreground" style={{ left: `${pos}%` }} />}
      </div>
      <div aria-hidden="true" className="relative h-4 text-xs text-muted-foreground">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: "33.3%" }}>
          Meta {META_RESPUESTA_MIN} min
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: "66.6%" }}>
          {META_RESPUESTA_MIN * 2} min
        </span>
        <span className="absolute right-0">{META_RESPUESTA_MIN * 3}+</span>
      </div>
    </div>
  );
}

/** Las consultas de cada día: la barra entera son las consultas y lo rojo de abajo, las que siguen sin respuesta. Pasar el cursor o enfocar una barra dice su día. */
function ConsultasPorDia({ dias }: { dias: DiaAtencion[] }) {
  const max = Math.max(1, ...dias.map((d) => d.consultas));
  const medio = dias[Math.floor(dias.length / 2)];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold">Consultas por día</h3>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-primario" /> Con respuesta
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm bg-destructive" /> Sin responder
          </span>
        </span>
      </div>
      <div className="flex h-44 items-end gap-[3px] border-b border-border pt-6" role="group" aria-label="Consultas por día">
        {dias.map((d) => {
          const alto = (d.consultas / max) * 100;
          const sin = d.consultas ? (d.sinResponder / d.consultas) * 100 : 0;
          const detalle = `${dia(d.dia, true)}: ${d.consultas} ${d.consultas === 1 ? "consulta" : "consultas"}, ${d.sinResponder} sin responder, primera respuesta ${duracionCorta(d.medianaMin)}`;
          return (
            <div key={d.dia} tabIndex={0} aria-label={detalle} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-t outline-none focus-visible:ring-2 focus-visible:ring-primario">
              <span className="flex w-full flex-col justify-end overflow-hidden rounded-t-[3px] bg-primario group-hover:opacity-80 group-focus-visible:opacity-80" style={{ height: `${alto}%`, minHeight: d.consultas ? 3 : 0 }}>
                <span className="block w-full bg-destructive" style={{ height: `${sin}%` }} />
              </span>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md bg-foreground px-2 py-1 text-xs whitespace-nowrap text-background group-hover:block group-focus-visible:block"
              >
                {dia(d.dia)} · {d.consultas} {d.consultas === 1 ? "consulta" : "consultas"}
                {d.sinResponder ? ` · ${d.sinResponder} sin responder` : ""}
              </span>
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="flex justify-between text-xs text-muted-foreground">
        <span>{dias[0] ? dia(dias[0].dia) : ""}</span>
        <span>{medio && dias.length > 6 ? dia(medio.dia) : ""}</span>
        <span>{dias.length > 1 ? dia(dias[dias.length - 1].dia) : ""}</span>
      </div>
    </div>
  );
}

/** Lo que cuenta de un grupo de consultas (un área o un número): cuántas, cuántas en 15 minutos, sin responder y la mediana. */
function Resumen({ consultas, sinResponder, en15, medianaMin }: { consultas: number; sinResponder: number; en15: number; medianaMin: number | null }) {
  const tono = tonoPorcentaje(en15, consultas);
  const tonoMediana = tonoRespuesta(medianaMin);
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-[13px]">
          <span>En {META_RESPUESTA_MIN} min</span>
          <span className={`font-bold tabular-nums ${TEXTO_TONO[tono]}`}>{porcentaje(en15, consultas)}</span>
        </div>
        <Barra valor={parteDe(en15, consultas)} tono={tono} alto="h-2" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <div className="text-xs text-muted-foreground">Consultas</div>
          <div className="text-lg font-bold tabular-nums">{consultas}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Sin responder</div>
          <div className={`text-lg font-bold tabular-nums ${sinResponder ? "text-destructive" : ""}`}>{sinResponder}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">1.ª respuesta</div>
          <div className={`text-lg font-bold tabular-nums ${TEXTO_TONO[tonoMediana]}`}>{duracionCorta(medianaMin)}</div>
        </div>
      </div>
    </>
  );
}

/** Un número de WhatsApp de la empresa: su área, lo que recibió y envió, y cómo respondió. */
function TarjetaNumero({ n }: { n: NumeroAtencion }) {
  const total = n.recibidos + n.enviados;
  return (
    <section aria-label={n.nombre} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="m-0 truncate text-sm font-semibold">{n.nombre}</h4>
          <p className="m-0 text-xs text-muted-foreground tabular-nums">{n.numero}</p>
        </div>
        <Insignia tono="neutro">{AREA[n.area] ?? n.area}</Insignia>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Recibidos <b className="font-bold text-foreground tabular-nums">{n.recibidos.toLocaleString("es")}</b>
          </span>
          <span>
            Enviados <b className="font-bold text-foreground tabular-nums">{n.enviados.toLocaleString("es")}</b>
          </span>
        </div>
        <span aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
          <span className="block h-full bg-primario" style={{ width: `${parteDe(n.recibidos, total)}%` }} />
          <span className="block h-full bg-foreground/70" style={{ width: `${total ? 100 - parteDe(n.recibidos, total) : 0}%` }} />
        </span>
        <span className="text-xs text-muted-foreground">{n.conversaciones} conversaciones</span>
      </div>
      <Resumen consultas={n.consultas} sinResponder={n.sinResponder} en15={n.en15} medianaMin={n.medianaMin} />
      <p className="m-0 text-xs text-muted-foreground">Promedio: {duracionCorta(n.promedioMin)}</p>
    </section>
  );
}

/**
 * La atención por WhatsApp de la vista Equipo (3 nov 2026, pedido de Hernán: antes eran las tablas de «KPIs de atención»): el porcentaje respondido a tiempo, la primera
 * respuesta frente a la meta, lo que sigue sin responder, las consultas por día y el desglose por área y por número.
 */
export function AtencionWhatsappVista({ a, dias }: { a: AtencionWhatsapp; dias: number }) {
  const tonoA = tonoPorcentaje(a.en15, a.consultas);
  const tonoM = tonoRespuesta(a.medianaMin);
  const sinTono: TonoDireccion = a.sinResponder ? "peligro" : "exito";
  const sinDatos = a.consultas === 0 && a.numeros.length === 0;
  return (
    <Tarjeta id="t-atencion" titulo="Atención por WhatsApp" extra={`Últimos ${dias} días`}>
      {sinDatos ? (
        <p className="m-0 text-sm text-muted-foreground">Todavía no hay números de WhatsApp conectados ni consultas en este periodo.</p>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-4">
            <div className="flex items-center gap-4 rounded-xl bg-muted/50 p-4">
              <Anillo valor={parteDe(a.en15, a.consultas)} tono={tonoA} etiqueta={`Respondidas en ${META_RESPUESTA_MIN} minutos: ${porcentaje(a.en15, a.consultas)}`}>
                <span className={TEXTO_TONO[tonoA]}>{porcentaje(a.en15, a.consultas)}</span>
              </Anillo>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[13px] font-medium text-muted-foreground">Respondidas en {META_RESPUESTA_MIN} min</span>
                <span className="text-sm">
                  {a.en15} de {a.consultas} consultas
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-xl bg-muted/50 p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-medium text-muted-foreground">1.ª respuesta (mediana)</span>
                <Insignia tono={tonoM}>{tonoM === "exito" ? "Dentro de la meta" : tonoM === "aviso" ? "Por encima de la meta" : tonoM === "peligro" ? "Muy lento" : "Sin dato"}</Insignia>
              </div>
              <span className={`text-4xl leading-none font-bold tabular-nums ${TEXTO_TONO[tonoM]}`}>{duracionCorta(a.medianaMin)}</span>
              <BarraMeta minutos={a.medianaMin} />
            </div>

            <div className="flex flex-col justify-between gap-3 rounded-xl bg-muted/50 p-4">
              <span className="text-[13px] font-medium text-muted-foreground">Sin responder</span>
              <span className={`text-4xl leading-none font-bold tabular-nums ${TEXTO_TONO[sinTono]}`}>{a.sinResponder}</span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <span aria-hidden="true" className={`h-2 w-2 rounded-full ${FONDO_TONO[sinTono]}`} />
                {a.consultas} consultas en {a.conversaciones} conversaciones
              </span>
            </div>
          </div>

          {a.dias.length > 0 && <ConsultasPorDia dias={a.dias} />}

          {a.areas.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="m-0 text-sm font-semibold">Por área</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
                {a.areas.map((x) => (
                  <section key={x.area} aria-label={AREA[x.area] ?? x.area} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="m-0 text-sm font-semibold">{AREA[x.area] ?? x.area}</h4>
                      <span className="text-xs text-muted-foreground">{x.conversaciones} conversaciones</span>
                    </div>
                    <Resumen consultas={x.consultas} sinResponder={x.sinResponder} en15={x.en15} medianaMin={x.medianaMin} />
                  </section>
                ))}
              </div>
            </div>
          )}

          {a.numeros.length > 0 && (
            <div className="flex flex-col gap-3">
              <h3 className="m-0 text-sm font-semibold">Por número de WhatsApp</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] gap-3">
                {a.numeros.map((n) => (
                  <TarjetaNumero key={n.id} n={n} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </Tarjeta>
  );
}
