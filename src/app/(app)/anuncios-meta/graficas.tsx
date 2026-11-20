import type { ReactNode } from "react";
import type { Certeza } from "@/lib/meta-ads/metricas";
import { NOMBRE_CERTEZA } from "@/lib/meta-ads/metricas";

/**
 * Las piezas visuales de Anuncios Meta (20 nov 2026): anillos, barras apiladas, columnas, tendencias y medidores. Todo es HTML y SVG sin estado (sirve igual en servidor y en cliente), con los colores
 * del sistema (`--meta-1…6`, validados en claro y oscuro, y los tokens de éxito, aviso y error). Cada gráfica trae su alternativa de texto y el número siempre va escrito: el color solo acompaña.
 */

/** El color de una serie por su puesto: los primeros seis tienen su color y el resto se junta en «Otros» (gris), nunca se repiten colores. */
export const colorDeSerie = (i: number): string => (i < 6 ? `var(--meta-${i + 1})` : "var(--grafica-5)");

export interface ParteGrafica {
  nombre: string;
  valor: number;
  color: string;
}

/** Las partes de una lista con color por puesto; lo que pasa de seis se suma en «Otros». */
export function partesConColor(items: { nombre: string; valor: number }[], maximo = 6): ParteGrafica[] {
  const ordenadas = [...items].filter((i) => i.valor > 0).sort((a, b) => b.valor - a.valor);
  const principales = ordenadas.slice(0, maximo);
  const resto = ordenadas.slice(maximo).reduce((s, i) => s + i.valor, 0);
  const partes = principales.map((p, i) => ({ ...p, color: colorDeSerie(i) }));
  if (resto > 0) partes.push({ nombre: "Otros", valor: resto, color: "var(--grafica-5)" });
  return partes;
}

/** La tarjeta de siempre del módulo: franja de título gris y el contenido en blanco. */
export function TarjetaMeta({ titulo, derecha, className = "", children, id }: { titulo: string; derecha?: ReactNode; className?: string; children: ReactNode; id?: string }) {
  return (
    <section aria-labelledby={id} className={`min-w-0 overflow-hidden rounded-xl border border-border bg-card ${className}`}>
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 border-b border-border bg-muted px-4 py-1.5">
        <h2 id={id} className="m-0 text-xs font-semibold text-foreground">
          {titulo}
        </h2>
        {derecha && <div className="text-xs text-muted-foreground">{derecha}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Leyenda({ partes, formato }: { partes: { nombre: string; color: string; texto?: string }[]; formato?: (n: string) => string }) {
  return (
    <ul role="list" className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-xs text-muted-foreground">
      {partes.map((p) => (
        <li key={p.nombre} className="inline-flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: p.color }} />
          <span className="truncate text-foreground">{formato ? formato(p.nombre) : p.nombre}</span>
          {p.texto && <span className="tabular-nums">{p.texto}</span>}
        </li>
      ))}
    </ul>
  );
}

/** El color de cada ángulo, igual en todo el módulo: los seis con más videos (sumados en todas las campañas) tienen su color y el resto va en gris. */
export function coloresDeAngulos(campanas: { angulos: { angulo: string; videos: number }[] }[]): Map<string, string> {
  const m = new Map<string, number>();
  for (const c of campanas) for (const a of c.angulos) m.set(a.angulo, (m.get(a.angulo) ?? 0) + a.videos);
  const orden = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es")).map(([n]) => n);
  return new Map(orden.map((n, i) => [n, colorDeSerie(i)]));
}

/** Un anillo con sus partes (separadas por 2 px) y, al centro, lo que se quiera destacar. Para pocas partes que suman un todo. */
export function Anillo({ partes, tamano = 132, grosor = 15, centro, etiqueta }: { partes: ParteGrafica[]; tamano?: number; grosor?: number; centro?: ReactNode; etiqueta: string }) {
  const r = (tamano - grosor) / 2;
  const c = 2 * Math.PI * r;
  const total = partes.reduce((s, p) => s + p.valor, 0);
  let acumulado = 0;
  return (
    <div className="relative shrink-0" style={{ width: tamano, height: tamano }}>
      <svg width={tamano} height={tamano} viewBox={`0 0 ${tamano} ${tamano}`} role="img" aria-label={etiqueta} className="-rotate-90">
        <circle cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke="var(--muted)" strokeWidth={grosor} />
        {total > 0 &&
          partes.map((p) => {
            const largo = (p.valor / total) * c;
            const visible = Math.max(0, largo - (partes.length > 1 ? 2 : 0));
            const desfase = -acumulado;
            acumulado += largo;
            return (
              <circle key={p.nombre} cx={tamano / 2} cy={tamano / 2} r={r} fill="none" stroke={p.color} strokeWidth={grosor} strokeDasharray={`${visible} ${c - visible}`} strokeDashoffset={desfase}>
                <title>
                  {p.nombre}: {p.valor} ({Math.round((p.valor / total) * 100)} %)
                </title>
              </circle>
            );
          })}
      </svg>
      {centro && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{centro}</div>}
    </div>
  );
}

/** Una barra horizontal al 100 % dividida en partes (la mezcla de ángulos de una campaña, el tipo de campañas que sube una persona…). El porcentaje va dentro cuando cabe. */
export function BarraApilada({ partes, alto = 10, conPorcentaje = false, etiqueta }: { partes: ParteGrafica[]; alto?: number; conPorcentaje?: boolean; etiqueta: string }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div role="img" aria-label={etiqueta} className="flex w-full min-w-0 gap-0.5 overflow-hidden rounded-full bg-muted" style={{ height: alto }}>
      {total > 0 &&
        partes.map((p) => {
          const pct = (p.valor / total) * 100;
          return (
            <span key={p.nombre} className="flex min-w-[3px] items-center justify-center overflow-hidden text-[11px] font-semibold leading-none text-white first:rounded-l-full last:rounded-r-full" style={{ width: `${pct}%`, background: p.color }}>
              <title>
                {p.nombre}: {Math.round(pct)} %
              </title>
              {conPorcentaje && pct >= 14 ? `${Math.round(pct)} %` : null}
            </span>
          );
        })}
    </div>
  );
}

/** Columnas verticales con valores. Con pocas columnas se escribe el valor sobre cada una; con muchas, solo en la más alta y la última. */
export function Columnas({ datos, alto = 120, formato = (n: number) => String(n), color = "var(--meta-1)", etiquetaGrafica, marcarUltima = true }: { datos: { etiqueta: string; valor: number }[]; alto?: number; formato?: (n: number) => string; color?: string; etiquetaGrafica: string; marcarUltima?: boolean }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  const conTodos = datos.length <= 8;
  const iMax = datos.reduce((m, d, i) => (d.valor > datos[m].valor ? i : m), 0);
  const cada = Math.max(1, Math.ceil(datos.length / 7));
  return (
    <figure className="m-0 min-w-0" aria-label={etiquetaGrafica}>
      <div className="flex items-end gap-1 border-b border-border" style={{ height: alto }}>
        {datos.map((d, i) => {
          const h = d.valor > 0 ? Math.max(3, (d.valor / max) * (alto - 18)) : 0;
          const mostrar = conTodos ? d.valor > 0 : d.valor > 0 && (i === iMax || (marcarUltima && i === datos.length - 1));
          return (
            <div key={`${d.etiqueta}-${i}`} className="group flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
              {mostrar && <span className="mb-0.5 text-[11px] font-medium tabular-nums text-foreground">{formato(d.valor)}</span>}
              <span className="w-full rounded-t-[3px] transition-opacity group-hover:opacity-80" style={{ height: h, background: color, opacity: d.valor > 0 ? 1 : 0.2 }}>
                <span className="sr-only">
                  {d.etiqueta}: {formato(d.valor)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-1 flex gap-1 text-[11px] text-muted-foreground">
        {datos.map((d, i) => (
          <span key={`${d.etiqueta}-${i}`} className="relative h-4 min-w-0 flex-1">
            {i % cada === 0 || i === datos.length - 1 ? <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap tabular-nums">{d.etiqueta}</span> : null}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Columnas apiladas (una serie por color) para ver cómo se reparte cada día o mes. */
export function ColumnasApiladas({ datos, series, alto = 130, etiquetaGrafica }: { datos: { etiqueta: string; valores: number[] }[]; series: { nombre: string; color: string }[]; alto?: number; etiquetaGrafica: string }) {
  const totales = datos.map((d) => d.valores.reduce((s, n) => s + n, 0));
  const max = Math.max(1, ...totales);
  const cada = Math.max(1, Math.ceil(datos.length / 7));
  return (
    <figure className="m-0 min-w-0" aria-label={etiquetaGrafica}>
      <div className="flex items-end gap-1 border-b border-border" style={{ height: alto }}>
        {datos.map((d, i) => {
          const total = totales[i];
          const h = total > 0 ? Math.max(4, (total / max) * (alto - 18)) : 0;
          return (
            <div key={`${d.etiqueta}-${i}`} className="group flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
              {total > 0 && <span className="mb-0.5 text-[11px] font-medium tabular-nums">{total}</span>}
              <span className="flex w-full flex-col-reverse gap-px overflow-hidden rounded-t-[3px]" style={{ height: h }}>
                {d.valores.map((n, k) => (n > 0 ? <span key={k} style={{ height: `${(n / total) * 100}%`, background: series[k]?.color }} /> : null))}
              </span>
              <span className="sr-only">
                {d.etiqueta}: {d.valores.map((n, k) => `${n} ${series[k]?.nombre}`).join(", ")}
              </span>
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-1 flex gap-1 text-[11px] text-muted-foreground">
        {datos.map((d, i) => (
          <span key={`${d.etiqueta}-${i}`} className="relative h-4 min-w-0 flex-1">
            {i % cada === 0 || i === datos.length - 1 ? <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap tabular-nums">{d.etiqueta}</span> : null}
          </span>
        ))}
      </div>
    </figure>
  );
}

/** Una tendencia mínima (sin ejes): la línea y su último punto. */
export function Tendencia({ valores, ancho = 96, alto = 28, color = "var(--meta-1)", etiqueta }: { valores: number[]; ancho?: number; alto?: number; color?: string; etiqueta: string }) {
  if (valores.length < 2) return null;
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const rango = max - min || 1;
  const paso = ancho / (valores.length - 1);
  const puntos = valores.map((v, i) => [i * paso, alto - 3 - ((v - min) / rango) * (alto - 6)] as const);
  const ultimo = puntos[puntos.length - 1];
  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={etiqueta} className="shrink-0 overflow-visible">
      <polyline points={puntos.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ultimo[0]} cy={ultimo[1]} r="3" fill={color} stroke="var(--card)" strokeWidth="2" />
    </svg>
  );
}

/** Frente a un periodo anterior: flecha, porcentaje y color según si subir es bueno, malo o solo un dato. */
export function Variacion({ actual, anterior, sentido = "neutral" }: { actual: number; anterior: number; sentido?: "arriba-bueno" | "arriba-malo" | "neutral" }) {
  if (anterior <= 0) return null;
  const pct = ((actual - anterior) / anterior) * 100;
  if (Math.abs(pct) < 0.5) return <span className="text-xs text-muted-foreground">Igual que antes</span>;
  const sube = pct > 0;
  const bueno = sentido === "neutral" ? null : sentido === "arriba-bueno" ? sube : !sube;
  const clase = bueno === null ? "bg-muted text-muted-foreground" : bueno ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${clase}`}>
      <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" className={sube ? "" : "rotate-180"}>
        <path d="M5 1.5 9 8H1z" fill="currentColor" />
      </svg>
      {Math.abs(pct).toFixed(0)} %<span className="sr-only"> {sube ? "más" : "menos"} que el periodo anterior</span>
    </span>
  );
}

/** Tres puntos que dicen qué tan seguro es un resultado, con el nombre al lado (nunca solo color). */
export function InsigniaCerteza({ certeza }: { certeza: Certeza }) {
  const llenos = certeza === "firme" ? 3 : certeza === "probable" ? 2 : 1;
  const clase = certeza === "firme" ? "text-success" : certeza === "probable" ? "text-warning" : "text-muted-foreground";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${clase}`}>
      <span aria-hidden="true" className="inline-flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: i < llenos ? "currentColor" : "var(--border-control)" }} />
        ))}
      </span>
      {NOMBRE_CERTEZA[certeza]}
    </span>
  );
}

/** Un círculo con las iniciales de la persona y el color de su puesto en la lista. */
export function Iniciales({ nombre, indice, tamano = 36 }: { nombre: string; indice: number; tamano?: number }) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const texto = (partes.length > 1 ? partes[0][0] + partes[1][0] : (partes[0] ?? "?").slice(0, 2)).toUpperCase();
  return (
    <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: tamano, height: tamano, fontSize: tamano * 0.36, background: colorDeSerie(indice) }}>
      {texto}
    </span>
  );
}

/** Una barra delgada de progreso con su color. */
export function BarraProgreso({ valor, maximo, color = "var(--meta-1)", alto = 6 }: { valor: number; maximo: number; color?: string; alto?: number }) {
  const ancho = maximo > 0 ? Math.max(valor > 0 ? 2 : 0, Math.min(100, (valor / maximo) * 100)) : 0;
  return (
    <span aria-hidden="true" className="block w-full overflow-hidden rounded-full bg-muted" style={{ height: alto }}>
      <span className="block h-full rounded-full" style={{ width: `${ancho}%`, background: color }} />
    </span>
  );
}
