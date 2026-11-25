"use client";

import Link from "next/link";
import { useState } from "react";
import { UMBRALES_ANUNCIO } from "@/lib/meta-ads/decision-anuncio";
import { PRIORIDADES, UMBRALES, type Prioridad, type Sugerencia } from "@/lib/meta-ads/sugerencias";
import { ChevronRightIcon } from "@/lib/nav-icons";
import { GuiaEnLinea } from "./aviso-tope";
import { BotonesDecidir } from "./decidir";
import { CifrasEnLinea } from "./piezas";

const TEXTO_SEVERIDAD = { alta: "Urgente", media: "Importante", info: "Para mirar" } as const;

/** Los grupos de «Para decidir hoy», en el orden en que piden atención. Los dos primeros arrancan abiertos. */
const GRUPOS: Record<Prioridad, { titulo: string; explicacion: string; punto: string; abierto: boolean }> = {
  apagar: { titulo: "Apagar", explicacion: "Campañas que ya no son rentables", punto: "bg-destructive", abierto: true },
  actuar: { titulo: "Actuar hoy", explicacion: "Sobre el tope o cerca, anuncios y landings por corregir", punto: "bg-warning", abierto: true },
  oportunidad: { titulo: "Oportunidades", explicacion: "Lo que va bien y puede dar más", punto: "bg-success", abierto: false },
  observar: { titulo: "En observación", explicacion: "Algo cambió, pero todavía no pide decidir", punto: "bg-azul", abierto: false },
  historial: { titulo: "Del historial", explicacion: "Lo que dicen los datos de lo que está en marcha", punto: "bg-muted-foreground", abierto: false },
};
const MAX_POR_GRUPO = 5;

const GRUPOS_DE_ANUNCIOS = [
  { grupo: "apagar", titulo: "Anuncios para apagar", color: "bg-destructive-soft text-destructive" },
  { grupo: "vigilar", titulo: "Caros, pero con poco gasto todavía", color: "bg-warning-soft text-warning" },
] as const;
const MAX_ANUNCIOS = 8;

/** Cuáles anuncios de la campaña pasaron del límite, con su cifra (de los últimos 30 días). */
function AnunciosPasados({ anuncios }: { anuncios: NonNullable<Sugerencia["anuncios"]> }) {
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {GRUPOS_DE_ANUNCIOS.map((g) => {
        const lista = anuncios.filter((a) => a.grupo === g.grupo);
        if (!lista.length) return null;
        return (
          <div key={g.grupo} className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-medium">
              {g.titulo} ({lista.length}):
            </span>
            <ul role="list" aria-label={`${g.titulo}, con lo de los últimos 30 días`} className="m-0 contents list-none p-0">
              {lista.slice(0, MAX_ANUNCIOS).map((a) => (
                <li key={a.id} className={`max-w-full break-words rounded-md px-2 py-0.5 tabular-nums ${g.color}`}>
                  <span className="font-semibold">{a.nombre}</span> · {a.cifra}
                </li>
              ))}
            </ul>
            {lista.length > MAX_ANUNCIOS && <span className="text-muted-foreground">y {lista.length - MAX_ANUNCIOS} más</span>}
          </div>
        );
      })}
    </div>
  );
}

function Tarjeta({ s }: { s: Sugerencia }) {
  const punto = s.positiva ? "bg-success" : s.severidad === "alta" ? "bg-destructive" : s.severidad === "media" ? "bg-warning" : "bg-muted-foreground";
  // «Campañas sin etiquetas» abre la lista de campañas ya recortada a las que faltan; una campaña o un video abre su ficha.
  const enlace = s.tipo === "hallazgo" ? "/anuncios-meta/hallazgos" : s.tipo === "etiquetas_faltan" ? "/anuncios-meta/campanas?faltan=1" : s.objeto.tipo === "campana" ? `/anuncios-meta/campanas?abrir=${s.objeto.id}` : s.objeto.tipo === "video" ? `/anuncios-meta/videos?abrir=${encodeURIComponent(s.objeto.id)}` : null;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-start gap-2 @3xl:flex-nowrap">
        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${punto}`} />
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-medium">
            <span className="sr-only">{s.positiva ? "Buena noticia" : TEXTO_SEVERIDAD[s.severidad]}: </span>
            {enlace ? (
              <Link href={enlace} className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
                {s.titulo}
              </Link>
            ) : (
              s.titulo
            )}
          </p>
          {s.cifras && s.cifras.length > 0 && (
            <div className="mt-1.5">
              <CifrasEnLinea cifras={s.cifras} />
            </div>
          )}
          <p className="m-0 mt-1 text-xs text-muted-foreground">{s.detalle}</p>
          <p className="m-0 mt-1 text-xs">
            <span className="font-medium">Qué hacer: </span>
            {s.accion}
          </p>
          {s.guia && <GuiaEnLinea guia={s.guia} className="mt-1.5" />}
          {s.anuncios && s.anuncios.length > 0 && <AnunciosPasados anuncios={s.anuncios} />}
        </div>
        <BotonesDecidir clave={s.clave} titulo={s.titulo} className="w-full shrink-0 pl-4 @3xl:w-auto @3xl:max-w-[26rem] @3xl:justify-end @3xl:pl-0" />
      </div>
    </li>
  );
}

/** Un grupo de la lista: su título con cuántas hay, que se pliega y se despliega. */
function Grupo({ prioridad, sugerencias, abierto, alAlternar }: { prioridad: Prioridad; sugerencias: Sugerencia[]; abierto: boolean; alAlternar: () => void }) {
  const [todas, setTodas] = useState(false);
  const g = GRUPOS[prioridad];
  const visibles = todas ? sugerencias : sugerencias.slice(0, MAX_POR_GRUPO);
  const id = `decidir-${prioridad}`;
  return (
    <div className="border-b border-border last:border-b-0">
      <h3 className="m-0">
        <button type="button" aria-expanded={abierto} aria-controls={id} onClick={alAlternar} className="flex min-h-11 w-full cursor-pointer items-center gap-2 px-4 py-2 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground">
          <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${g.punto}`} />
          <span className="shrink-0 text-sm font-semibold">{g.titulo}</span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums">{sugerencias.length}</span>
          <span className="min-w-0 flex-1 truncate text-xs font-normal text-muted-foreground">{g.explicacion}</span>
          <ChevronRightIcon aria-hidden="true" className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${abierto ? "rotate-90" : ""}`} />
        </button>
      </h3>
      {abierto && (
        <div id={id} className="border-t border-border">
          <ul role="list" aria-label={g.titulo} className="m-0 flex list-none flex-col divide-y divide-border p-0">
            {visibles.map((s) => (
              <Tarjeta key={s.clave} s={s} />
            ))}
          </ul>
          {sugerencias.length > MAX_POR_GRUPO && (
            <button type="button" aria-expanded={todas} onClick={() => setTodas((v) => !v)} className="mx-4 mb-3 mt-1 min-h-9 rounded-md border border-border-control bg-card px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
              {todas ? "Ver menos" : `Ver las ${sugerencias.length - MAX_POR_GRUPO} restantes`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** «Para decidir hoy»: lo que el sistema ve en los números y propone hacer, agrupado por prioridad. Aceptar, dejar para después o rechazar (con porqué) se recuerda hasta que vence. No cambia nada en Meta. */
export function ListaSugerencias({ sugerencias, decididas }: { sugerencias: Sugerencia[]; decididas: number }) {
  const grupos = PRIORIDADES.map((p) => ({ prioridad: p, lista: sugerencias.filter((s) => s.prioridad === p) })).filter((g) => g.lista.length > 0);
  // Lo urgente abierto; si no hay nada urgente, el primer grupo que tenga algo.
  const [abiertos, setAbiertos] = useState<Set<Prioridad>>(() => {
    const iniciales = grupos.filter((g) => GRUPOS[g.prioridad].abierto).map((g) => g.prioridad);
    return new Set(iniciales.length ? iniciales : grupos.slice(0, 1).map((g) => g.prioridad));
  });
  const alternar = (p: Prioridad) =>
    setAbiertos((previos) => {
      const nuevos = new Set(previos);
      if (!nuevos.delete(p)) nuevos.add(p);
      return nuevos;
    });
  return (
    <section aria-labelledby="para-decidir" className="@container min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 border-b border-border bg-muted px-4 py-1 text-xs font-medium text-muted-foreground">
        <h2 id="para-decidir" className="m-0 text-xs font-medium">
          Para decidir hoy, por prioridad
        </h2>
        <span>{sugerencias.length === 0 ? "Nada pendiente" : `${sugerencias.length} ${sugerencias.length === 1 ? "sugerencia" : "sugerencias"}`}</span>
      </div>
      {sugerencias.length === 0 ? (
        <p className="m-0 px-4 py-6 text-sm text-muted-foreground">
          No hay nada que decidir con los números de los últimos 7 días.{decididas > 0 ? ` Hay ${decididas} ya decididas que no se repiten hasta que venzan.` : ""}
        </p>
      ) : (
        grupos.map((g) => <Grupo key={g.prioridad} prioridad={g.prioridad} sugerencias={g.lista} abierto={abiertos.has(g.prioridad)} alAlternar={() => alternar(g.prioridad)} />)
      )}
      <details className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <summary className="min-h-8 cursor-pointer content-center font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">Cómo se decide</summary>
        <ul className="m-0 flex flex-col gap-1 pb-1 pl-4">
          <li>Solo avisan: no cambian nada en Meta. Miran las campañas activas con los últimos 7 días.</li>
          <li>
            Apagar: sin compras tras {UMBRALES.sinComprasVeces} veces el CPA tope; CPA sobre ${UMBRALES_ANUNCIO.cpaRojo} (o el tope, si es más alto) que los últimos {UMBRALES.recuperandoDias} días no bajan; o sobre el tope sin ningún anuncio que venda por debajo del {Math.round(UMBRALES.cercaDelTope * 100)} % del tope.
          </li>
          <li>Actuar hoy: sobre el tope pero con un anuncio que la sostiene, o desde el {Math.round(UMBRALES.cercaDelTope * 100)} % del tope si los últimos {UMBRALES.recuperandoDias} días no bajan (agregar videos antes de pasar).</li>
          <li>En observación: va dentro del tope aunque haya subido, o ya se está acomodando sola. Dentro del tope no se agregan videos ni se cambia el presupuesto de golpe: eso reinicia el aprendizaje de Meta.</li>
          <li>El CPA tope general baja en los productos que envían o entregan peor que la tienda (se ve en la ficha de cada uno y en Cuentas).</li>
          <li>Del historial: solo productos y campañas con campañas activas.</li>
        </ul>
      </details>
    </section>
  );
}
