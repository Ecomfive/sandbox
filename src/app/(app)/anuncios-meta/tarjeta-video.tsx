"use client";

/* eslint-disable @next/next/no-img-element -- miniatura del video, directo de Meta */
import { confiable, cpa, ctr, dolares, holdRate, hookRate, nivelDeCpa, nivelDeCtr, nivelDeHook } from "@/lib/meta-ads/metricas";
import { formatoDuracion } from "@/lib/meta-ads/duracion";
import type { VideoVista } from "@/lib/meta-ads/vistas";
import { anguloDeVideo } from "./def-videos";
import { Nivel, porcentaje, valorCpa } from "./piezas";
import { BotonPlay } from "./reproductor-video";

const urlSegura = (u: string | null) => (u && /^https:\/\//i.test(u) ? u : null);

function Cifra({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{titulo}</span>
      <span className="text-sm tabular-nums">{children}</span>
    </span>
  );
}

/**
 * Un video como tarjeta: la miniatura vertical con su botón de reproducir (abre la ficha y arranca el video), su puesto en el orden elegido, lo que dura, el nombre con sus insignias y las cuatro cifras que
 * más se miran (Hook, Hold, CTR y CPA). Tocar el cuerpo de la tarjeta abre la ficha sin reproducir.
 */
export function TarjetaVideo({ x, posicion, alAbrir, alReproducir }: { x: VideoVista; posicion: number; alAbrir: () => void; alReproducir: () => void }) {
  const mini = urlSegura(x.miniatura);
  const ok = confiable(x.r);
  const angulo = anguloDeVideo(x);
  const largo = formatoDuracion(x.analisis?.duracionS);
  const titulo = `${x.numero ? `${x.numero} · ` : ""}${x.nombre}`;
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={alReproducir}
        aria-label={`Reproducir ${titulo}`}
        className="group relative block aspect-[9/16] w-full cursor-pointer overflow-hidden bg-gradient-to-br from-zinc-700 to-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
      >
        {mini && <img src={mini} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />}
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/10" />
        <span className="absolute left-2 top-2 rounded-md bg-black/65 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">#{posicion}</span>
        <span className="absolute inset-0 flex items-center justify-center">
          <BotonPlay />
        </span>
        {largo && <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">{largo}</span>}
      </button>
      <button
        type="button"
        onClick={alAbrir}
        className="flex flex-1 cursor-pointer flex-col gap-2.5 px-3.5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground"
      >
        <span className="line-clamp-2 text-sm font-semibold text-foreground">{x.nombre}</span>
        <span className="flex flex-wrap gap-1.5">
          {x.numero && <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium">{x.numero}</span>}
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{angulo ? `${angulo}${x.analisis?.estado === "sin_archivo" ? " (provisional)" : ""}` : "Sin analizar"}</span>
          {x.producto && <span className="max-w-full truncate rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">{x.producto}</span>}
        </span>
        <span className="grid grid-cols-4 gap-2">
          <Cifra titulo="Hook">{hookRate(x.r) === null ? "—" : ok ? <Nivel nivel={nivelDeHook(hookRate(x.r))}>{porcentaje(hookRate(x.r), 0)}</Nivel> : porcentaje(hookRate(x.r), 0)}</Cifra>
          <Cifra titulo="Hold">{porcentaje(holdRate(x.r), 0)}</Cifra>
          <Cifra titulo="CTR">{ok ? <Nivel nivel={nivelDeCtr(ctr(x.r))}>{porcentaje(ctr(x.r), 1)}</Nivel> : porcentaje(ctr(x.r), 1)}</Cifra>
          <Cifra titulo="CPA">{ok && x.r.compras > 0 ? <Nivel nivel={nivelDeCpa(cpa(x.r), x.tope)}>{valorCpa(x.r)}</Nivel> : valorCpa(x.r)}</Cifra>
        </span>
        <span className="mt-auto text-xs text-muted-foreground">
          {dolares(x.r.gasto)} gastados · usado en {x.campanas} {x.campanas === 1 ? "campaña" : "campañas"}
          {ok ? "" : " · poca data"}
        </span>
      </button>
    </article>
  );
}
