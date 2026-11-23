import Link from "next/link";
import { horaDeMeta } from "@/lib/meta-ads/hora";
import { CATEGORIAS_EVENTO, NOMBRES_DIA_SEMANA, RANGOS_ACTIVIDAD, textoDeCambios, textoDias, VENTANA_PROMEDIO_DIAS, type ConteoDe, type FilaPersona, type ResumenActividad } from "@/lib/meta-ads/actividad-equipo";
import type { CuentaVista } from "@/lib/meta-ads/datos";
import { BarraApilada, BarraProgreso, Columnas, colorDeSerie, Iniciales, Leyenda, partesConColor, TarjetaMeta } from "./graficas";

const decimal = (n: number | null, d = 1) => (n === null ? "—" : n.toLocaleString("es-PA", { maximumFractionDigits: d }));
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1] ?? mes;

/** Una cifra del equipo: nombre arriba, número grande y una línea de apoyo. */
function Medida({ titulo, valor, apoyo, grande = false }: { titulo: string; valor: React.ReactNode; apoyo?: React.ReactNode; grande?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="m-0 text-xs font-medium text-muted-foreground">{titulo}</p>
      <p className={`m-0 font-semibold tabular-nums ${grande ? "text-3xl leading-tight" : "text-xl"}`}>{valor}</p>
      {apoyo && <p className="m-0 text-xs text-muted-foreground">{apoyo}</p>}
    </div>
  );
}

/** Cada rango de tiempo con cuántas campañas se montaron (todas las cuentas juntas). */
function RangosDeTiempo({ r, conPromedio = true }: { r: ResumenActividad; conPromedio?: boolean }) {
  const max = Math.max(1, ...RANGOS_ACTIVIDAD.map((x) => r.porRango[x.clave]));
  return (
    <ul role="list" className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-2 p-0">
      {RANGOS_ACTIVIDAD.map((x) => {
        const n = r.porRango[x.clave];
        return (
          <li key={x.clave} className="flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5">
            <span className="text-xs font-medium text-muted-foreground">{x.etiqueta}</span>
            <span className="text-2xl font-semibold leading-none tabular-nums">{n}</span>
            <BarraProgreso valor={n} maximo={max} color="var(--meta-1)" alto={4} />
            {conPromedio && x.dias > 1 && <span className="text-[11px] tabular-nums text-muted-foreground">{decimal(n / x.dias, 2)} por día</span>}
          </li>
        );
      })}
    </ul>
  );
}

function ListaDeConteos({ titulo, items, vacio = "Sin datos" }: { titulo: string; items: ConteoDe[]; vacio?: string }) {
  const partes = partesConColor(items.map((i) => ({ nombre: i.nombre, valor: i.n })));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="m-0 text-xs font-medium text-muted-foreground">{titulo}</p>
      {items.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <>
          <BarraApilada partes={partes} alto={12} conPorcentaje etiqueta={`${titulo}: ${items.map((i) => `${i.nombre} ${i.pct} %`).join(", ")}`} />
          <Leyenda partes={partes.map((p) => ({ nombre: p.nombre, color: p.color, texto: `${Math.round((p.valor / partes.reduce((s, x) => s + x.valor, 0)) * 100)} %` }))} />
        </>
      )}
    </div>
  );
}

/**
 * Arriba de Equipo: todo el grupo junto, con todas las cuentas publicitarias del país sumadas (o solo la elegida): cuántas campañas se montaron en cada rango, cada cuánto se sube una, cuánto lleva sin subir,
 * cómo se reparte por mes y por día de la semana y qué tipo de campaña es el que más sube.
 */
export function ResumenDelEquipo({ r, cuentas, cuentaId, porCuenta, desde }: { r: ResumenActividad & { personas: number }; cuentas: CuentaVista[]; cuentaId: string | null; porCuenta: { cuenta: string; total: number; ultimos30: number; ultima: string | null }[]; desde: string | null }) {
  const activas = cuentas.filter((c) => c.activa);
  const cuentaElegida = cuentas.find((c) => c.id === cuentaId);
  const href = (id: string | null) => (id ? `/anuncios-meta/equipo?cuenta=${id}` : "/anuncios-meta/equipo");
  const mejorDia = r.porDiaSemana.indexOf(Math.max(...r.porDiaSemana));
  const hayDatos = r.total > 0;
  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Cuentas publicitarias" className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Cuentas:</span>
        <Link href={href(null)} aria-current={cuentaId === null ? "true" : undefined} className={`min-h-9 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${cuentaId === null ? "border-foreground bg-foreground text-background" : "border-border-control bg-card text-muted-foreground hover:bg-muted"}`}>
          Todas juntas ({activas.length})
        </Link>
        {activas.map((c) => {
          const n = porCuenta.find((x) => x.cuenta === c.nombre);
          return (
            <Link key={c.id} href={href(c.id)} aria-current={cuentaId === c.id ? "true" : undefined} className={`min-h-9 rounded-full border px-3.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground ${cuentaId === c.id ? "border-foreground bg-foreground text-background" : "border-border-control bg-card text-muted-foreground hover:bg-muted"}`}>
              {c.nombre}
              {cuentaId === null && n ? <span className="ml-1.5 tabular-nums opacity-70">{n.ultimos30}</span> : null}
            </Link>
          );
        })}
        <span className="text-xs text-muted-foreground">
          {cuentaElegida ? `Solo ${cuentaElegida.nombre}` : activas.length > 1 ? "Las campañas de todas las cuentas se suman: 3 en una y 3 en otra el mismo día son 6 ese día." : ""}
        </span>
      </section>

      <TarjetaMeta titulo={cuentaElegida ? `Campañas montadas · ${cuentaElegida.nombre}` : "Campañas montadas por todo el equipo"} derecha={desde ? `Con lo leído desde el ${desde.split("-").reverse().join("/")}` : undefined} id="rangos">
        {!hayDatos ? (
          <p className="m-0 text-sm text-muted-foreground">Todavía no hay campañas leídas con fecha de creación. Pulsa «Leer ahora»; para ver más atrás, trae el historial en Cuentas.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <RangosDeTiempo r={r} />
            <div className="grid grid-cols-[repeat(auto-fit,minmax(11rem,1fr))] gap-x-6 gap-y-4 border-t border-border pt-4">
              <Medida titulo="Sube campañas cada" valor={r.intervaloPromedioDias === null ? "—" : `${decimal(r.intervaloPromedioDias)} días`} apoyo={r.intervaloMedianoDias === null ? "Con menos de dos días con campañas no hay promedio" : `Típico: ${decimal(r.intervaloMedianoDias)} días · hueco más largo ${r.huecoMaximoDias} días`} grande />
              <Medida titulo="Última campaña" valor={textoDias(r.diasDesdeUltima)} apoyo={r.ultima ? `El ${r.ultima.split("-").reverse().join("/")}` : undefined} grande />
              <Medida titulo="Por semana" valor={decimal(r.porSemana)} apoyo={`Promedio de los últimos ${VENTANA_PROMEDIO_DIAS} días`} grande />
              <Medida titulo="Por mes" valor={decimal(r.porMes)} apoyo={`${r.diasActivos} ${r.diasActivos === 1 ? "día con campañas" : "días con campañas"} · ${decimal(r.campanasPorDiaActivo)} por día activo`} grande />
              <Medida titulo="Mejor día" valor={r.mejorDia ? `${r.mejorDia.n} campañas` : "—"} apoyo={r.mejorDia ? `El ${r.mejorDia.fecha.split("-").reverse().join("/")}` : undefined} grande />
              <Medida titulo="Personas montando" valor={r.personas} apoyo={r.cuentas.length > 1 ? `En ${r.cuentas.length} cuentas` : undefined} grande />
            </div>
          </div>
        )}
      </TarjetaMeta>

      {hayDatos && (
        <div className="grid min-w-0 gap-6 lg:grid-cols-2">
          <TarjetaMeta titulo="Campañas por mes" derecha="Últimos 6 meses" id="por-mes">
            <Columnas datos={r.meses.map((m) => ({ etiqueta: mesCorto(m.mes), valor: m.n }))} color="var(--meta-1)" etiquetaGrafica="Campañas montadas por mes" alto={150} />
          </TarjetaMeta>
          <TarjetaMeta titulo="Qué días de la semana monta más" derecha={`Últimos ${VENTANA_PROMEDIO_DIAS} días · más fuerte: ${r.porDiaSemana.some((n) => n > 0) ? NOMBRES_DIA_SEMANA[mejorDia] : "—"}`} id="por-dia-semana">
            <Columnas datos={NOMBRES_DIA_SEMANA.map((d, i) => ({ etiqueta: d.slice(0, 3), valor: r.porDiaSemana[i] }))} color="var(--meta-3)" etiquetaGrafica="Campañas montadas por día de la semana" alto={150} marcarUltima={false} />
          </TarjetaMeta>
        </div>
      )}

      {hayDatos && (
        <TarjetaMeta titulo="Qué tipo de campaña sube más" derecha={`Últimos ${VENTANA_PROMEDIO_DIAS} días`} id="tipos">
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-4">
            <ListaDeConteos titulo="Etapa" items={r.tipos.etapa} vacio="Sin etapa en el nombre" />
            <ListaDeConteos titulo="CBO o ABO" items={r.tipos.estructura} />
            <ListaDeConteos titulo="Puja" items={r.tipos.puja} />
            <ListaDeConteos titulo="Producto" items={r.tipos.producto} />
          </div>
        </TarjetaMeta>
      )}
    </div>
  );
}

/** Una persona: su cuenta de campañas por rango, cada cuánto sube una, qué tipo y dónde, y lo que cambia en Meta además de montar. */
export function TarjetaPersona({ p, indice }: { p: FilaPersona; indice: number }) {
  const cambios = CATEGORIAS_EVENTO.filter((c) => c !== "campañas" && p.cambios[c] > 0);
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <header className="flex items-center gap-3">
        <Iniciales nombre={p.persona} indice={indice} tamano={42} />
        <div className="min-w-0 flex-1">
          <h3 className="m-0 truncate text-base font-semibold">{p.persona}</h3>
          <p className="m-0 text-xs text-muted-foreground">
            {p.ultimaActividad ? `Última actividad: ${horaDeMeta(p.ultimaActividad)}` : "Sin actividad leída"}
          </p>
        </div>
        <div className="text-right">
          <p className="m-0 text-2xl font-semibold leading-none tabular-nums">{p.porRango["30"]}</p>
          <p className="m-0 text-xs text-muted-foreground">en 30 días</p>
        </div>
      </header>

      <dl className="m-0 grid grid-cols-3 gap-x-3 gap-y-3 text-sm sm:grid-cols-6">
        {RANGOS_ACTIVIDAD.map((x) => (
          <div key={x.clave} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{x.etiqueta}</dt>
            <dd className="m-0 font-semibold tabular-nums">{p.porRango[x.clave]}</dd>
          </div>
        ))}
      </dl>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3 text-sm sm:grid-cols-4">
        <Medida titulo="Sube cada" valor={p.intervaloPromedioDias === null ? "—" : `${decimal(p.intervaloPromedioDias)} d`} apoyo={p.huecoMaximoDias !== null ? `Hueco máx. ${p.huecoMaximoDias} d` : undefined} />
        <Medida titulo="Última campaña" valor={textoDias(p.diasDesdeUltima)} />
        <Medida titulo="Por semana" valor={decimal(p.porSemana)} apoyo={`${decimal(p.porMes)} por mes`} />
        <Medida titulo="Por día activo" valor={decimal(p.campanasPorDiaActivo)} apoyo={`${p.diasActivos} días con campañas`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">Por mes</p>
          <Columnas datos={p.meses.map((m) => ({ etiqueta: mesCorto(m.mes), valor: m.n }))} alto={84} color={colorDeSerie(indice)} etiquetaGrafica={`Campañas por mes de ${p.persona}`} />
        </div>
        <ListaDeConteos titulo="Qué tipo sube más" items={p.tipos.etapa} vacio="Sin etapa en el nombre" />
      </div>

      {(p.tipos.estructura.length > 0 || p.tipos.puja.length > 0 || p.cuentas.length > 1) && (
        <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {p.tipos.estructura[0] && (
            <span>
              Más usa: <span className="font-medium text-foreground">{p.tipos.estructura[0].nombre}</span> ({p.tipos.estructura[0].pct} %)
            </span>
          )}
          {p.tipos.puja[0] && (
            <span>
              Puja: <span className="font-medium text-foreground">{p.tipos.puja[0].nombre}</span> ({p.tipos.puja[0].pct} %)
            </span>
          )}
          {p.tipos.producto[0] && (
            <span>
              Producto: <span className="font-medium text-foreground">{p.tipos.producto[0].nombre}</span> ({p.tipos.producto[0].pct} %)
            </span>
          )}
          {p.cuentas.length > 1 && (
            <span>
              En {p.cuentas.length} cuentas: {p.cuentas.map((c) => `${c.nombre} ${c.pct} %`).join(" · ")}
            </span>
          )}
        </p>
      )}

      <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground tabular-nums">{p.cambios30} cambios en 30 días</span>
        {cambios.length === 0 ? <span>Sin otros cambios en Meta</span> : cambios.map((c) => <span key={c} className="tabular-nums">{textoDeCambios(c, p.cambios[c])}</span>)}
      </p>
    </article>
  );
}

/** Todas las personas en una sola tabla para compararlas de un vistazo. */
export function TablaComparativa({ personas }: { personas: FilaPersona[] }) {
  const max30 = Math.max(1, ...personas.map((p) => p.porRango["30"]));
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="tabla-datos w-full min-w-[56rem] border-collapse text-sm">
          <caption className="sr-only">Campañas montadas por persona en cada rango de tiempo</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="px-4 py-2 font-medium">Persona</th>
              {RANGOS_ACTIVIDAD.map((x) => (
                <th key={x.clave} scope="col" className="px-3 py-2 text-right font-medium">{x.etiqueta}</th>
              ))}
              <th scope="col" className="px-3 py-2 text-right font-medium">Sube cada</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Por semana</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Última campaña</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Cambios (30 d)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {personas.map((p, i) => (
              <tr key={p.persona}>
                <th scope="row" className="px-4 py-2.5 text-left font-medium">
                  <span className="flex items-center gap-2">
                    <Iniciales nombre={p.persona} indice={i} tamano={24} />
                    <span className="min-w-0">
                      <span className="block truncate">{p.persona}</span>
                      <span className="block w-28 max-w-full">
                        <BarraProgreso valor={p.porRango["30"]} maximo={max30} color={colorDeSerie(i)} alto={4} />
                      </span>
                    </span>
                  </span>
                </th>
                {RANGOS_ACTIVIDAD.map((x) => (
                  <td key={x.clave} className="px-3 py-2.5 text-right tabular-nums">{p.porRango[x.clave]}</td>
                ))}
                <td className="px-3 py-2.5 text-right tabular-nums">{p.intervaloPromedioDias === null ? "—" : `${decimal(p.intervaloPromedioDias)} d`}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{decimal(p.porSemana)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{textoDias(p.diasDesdeUltima)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{p.cambios30}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
