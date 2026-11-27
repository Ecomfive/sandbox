import Link from "next/link";
import type { Quienes, QuienHallazgo } from "@/lib/meta-ads/historico";
import { dolares } from "@/lib/meta-ads/metricas";

const valor = (n: number | null) => (n === null ? "sin ventas" : dolares(n));
const enlace = "min-w-0 break-words font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground";

function Lista({ titulo, total, items, base }: { titulo: string; total: number; items: QuienHallazgo[]; base: string }) {
  if (items.length === 0) return null;
  const resto = total - items.length;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <h4 className="m-0 text-xs font-semibold">
        {titulo} ({total})
      </h4>
      <ul role="list" className="m-0 flex list-none flex-col divide-y divide-border rounded-md border border-border p-0">
        {items.map((x) => (
          <li key={x.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-2.5 py-1.5 text-xs">
            <span className="min-w-0 flex-1 basis-48">
              <Link href={`${base}${encodeURIComponent(x.id)}`} className={enlace}>
                {x.nombre}
              </Link>
              {x.detalle && <span className="block text-muted-foreground">{x.detalle}</span>}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              CPA {x.antes !== undefined && <>{valor(x.antes)} → </>}
              <span className="font-semibold text-foreground">{valor(x.ahora)}</span> · {dolares(x.gasto)} · {x.compras} {x.compras === 1 ? "compra" : "compras"}
            </span>
          </li>
        ))}
      </ul>
      {resto > 0 && <p className="m-0 text-xs text-muted-foreground">Y {resto} más con menos gasto.</p>}
    </div>
  );
}

/** Cuáles son los de un hallazgo o una tendencia (25 nov 2026): lo que tienen en común y los videos y campañas, cada uno con su CPA (antes → ahora en una tendencia) y un enlace a su ficha. */
export function Cuales({ quienes }: { quienes: Quienes }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {quienes.enComun.length > 0 && (
        <div className="flex flex-col gap-1 rounded-md bg-muted px-2.5 py-2">
          <h4 className="m-0 text-xs font-semibold">Lo que tienen en común</h4>
          <dl className="m-0 flex flex-col gap-0.5 text-xs">
            {quienes.enComun.map((r) => (
              <div key={r.titulo} className="flex flex-wrap gap-x-1.5">
                <dt className="font-medium">{r.titulo}:</dt>
                <dd className="m-0 min-w-0">{r.texto}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <Lista titulo="Videos" total={quienes.totalVideos} items={quienes.videos} base="/anuncios-meta/videos?abrir=" />
      <Lista titulo="Campañas" total={quienes.totalCampanas} items={quienes.campanas} base="/anuncios-meta/campanas?abrir=" />
    </div>
  );
}

/** Debajo de una gráfica o una leyenda: de qué es cada táctica general que aparece en ella. */
export function TemasDeTacticas({ temas }: { temas: { nombre: string; texto: string }[] }) {
  if (temas.length === 0) return null;
  return (
    <ul role="list" aria-label="De qué son las tácticas generales" className="m-0 flex list-none flex-col gap-1 border-t border-border p-0 pt-2 text-xs">
      {temas.map((t) => (
        <li key={t.nombre} className="min-w-0 break-words">
          <span className="font-medium">{t.nombre}:</span> <span className="text-muted-foreground">{t.texto}</span>
        </li>
      ))}
    </ul>
  );
}
