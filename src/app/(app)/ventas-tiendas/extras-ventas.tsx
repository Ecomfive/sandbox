import Link from "next/link";
import type { ReactNode } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco } from "@/components/ui/field";
import { diaMes, mesCorto } from "@/lib/af4/fecha";
import { dinero, entero, fraccion } from "@/lib/af4/formato";
import type { DelVendidoAlBanco, PatronSemana, Proyeccion, ResumenDropi } from "@/lib/ventas/patrones";

/** Una cifra con su nombre, en una rejilla que envuelve. */
function Dato({ nombre, valor, nota, fuerte = false }: { nombre: string; valor: ReactNode; nota?: ReactNode; fuerte?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{nombre}</dt>
      <dd className={`${claseCifra} ${fuerte ? "text-lg font-semibold" : "text-base font-medium"}`}>{valor}</dd>
      {nota && <dd className="text-xs text-muted-foreground">{nota}</dd>}
    </div>
  );
}

const rejilla = "grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5";

/** Mejora 48: el mes en curso al ritmo de los días completos, contra el mismo mes del año anterior si lo hay. */
export function BloqueProyeccion({ p, mes, anioAnterior }: { p: Proyeccion; mes: string; anioAnterior: number | null }) {
  return (
    <MarcoAF4 id="titulo-proyeccion" titulo="Proyección del mes" detalle={`${mesCorto(mes)} · al ritmo de ${p.dias} de ${p.diasMes} días`}>
      <dl className={rejilla}>
        <Dato nombre="Vendido hasta ayer" valor={dinero(p.ventasHasta)} nota={`${entero(p.ordenesHasta)} órdenes sin canceladas`} />
        <Dato nombre="Vendido al cierre" fuerte valor={dinero(p.ventasProyectadas)} nota={`${entero(p.ordenesProyectadas)} órdenes`} />
        <Dato
          nombre="Entregado esperado"
          valor={p.entregadasProyectadas === null ? "—" : dinero(p.entregadasProyectadas)}
          nota={p.parteEntregada === null ? "Sin meses cerrados para estimarlo" : `${fraccion(p.parteEntregada)} de lo vendido termina entregado`}
        />
        {anioAnterior !== null && (
          <Dato
            nombre={`Entregado en ${mesCorto(`${Number(mes.slice(0, 4)) - 1}${mes.slice(4)}`)}`}
            valor={dinero(anioAnterior)}
            nota={
              p.entregadasProyectadas === null || !anioAnterior
                ? undefined
                : `${p.entregadasProyectadas >= anioAnterior ? "+" : "−"}${fraccion(Math.abs(p.entregadasProyectadas / anioAnterior - 1))} esperado contra el año anterior`
            }
          />
        )}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">Hoy no cuenta: está a medias. Lo entregado depende de cómo cierren las entregas.</p>
    </MarcoAF4>
  );
}

/** Mejora 47: qué días y franjas venden más, en promedio por día (las últimas 13 semanas). */
export function BloquePatron({ patron, desde, hasta, contexto }: { patron: PatronSemana; desde: string; hasta: string; contexto: string }) {
  if (!patron.ordenes) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <GraficaBarrasAF4
        id="grafica-semana"
        titulo="Ventas promedio por día de la semana"
        detalle={`${contexto} · ${diaMes(desde)} – ${diaMes(hasta)}`}
        etiquetaEje="Día"
        datos={patron.dias.map((d) => ({ etiqueta: d.dia.slice(0, 3), ventas: d.ventasPorDia }))}
        notas={Object.fromEntries(patron.dias.map((d) => [d.dia.slice(0, 3), `${d.dia}: ${d.ordenesPorDia.toFixed(1)} órdenes por día`]))}
        series={[{ clave: "ventas", nombre: "Vendido por día (sin canceladas)", color: 1 }]}
        alto={220}
      />
      <MarcoAF4 id="titulo-franjas" titulo="A qué hora compran" detalle={patron.conHora ? `${fraccion(patron.conHora)} de las órdenes con hora` : undefined}>
        {patron.conHora ? (
          <dl className="flex flex-col gap-2.5">
            {patron.franjas.map((f) => (
              <div key={f.franja} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <dt>{f.franja}</dt>
                  <dd className={`${claseCifra} text-muted-foreground`}>
                    {fraccion(f.parte)} · {entero(f.ordenes)}
                  </dd>
                </div>
                <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-[var(--grafica-1)]" style={{ width: `${Math.round((f.parte ?? 0) * 100)}%` }} />
                </div>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Las órdenes de este período no traen hora (vienen de la Matriz).</p>
        )}
        {patron.mejorDia && (
          <p className="mt-3 text-xs text-muted-foreground">
            El día que más vende es el {patron.mejorDia.toLowerCase()}
            {patron.mejorFranja ? `; la franja con más órdenes, ${patron.mejorFranja.split(" (")[0].toLowerCase()}` : ""}.
          </p>
        )}
      </MarcoAF4>
    </div>
  );
}

/** Mejora 43: del vendido entregado a lo que ya está en el banco (efectivo contra entrega). */
export function BloqueDeposito({ d, mes }: { d: DelVendidoAlBanco; mes: string }) {
  if (!d.vendido && !d.contraEntrega) return null;
  return (
    <MarcoAF4
      id="titulo-deposito"
      titulo="Del vendido a lo depositado"
      detalle={`${mesCorto(mes)} · efectivo contra entrega`}
    >
      <dl className={rejilla}>
        <Dato nombre="Vendido entregado" valor={dinero(d.vendido)} />
        <Dato nombre="Contra entrega" valor={dinero(d.contraEntrega)} nota={d.vendido ? `${fraccion(d.contraEntrega / d.vendido)} de lo vendido` : undefined} />
        <Dato nombre="Cobrado por mensajeros" valor={dinero(d.cobrado)} nota={d.sinCobroAnotado ? `${dinero(d.sinCobroAnotado)} sin cobro anotado` : undefined} />
        <Dato nombre="Remesado" fuerte valor={dinero(d.remesado)} nota={d.parteRemesada === null ? undefined : `${fraccion(d.parteRemesada)} del contra entrega`} />
        <Dato
          nombre="En la calle"
          valor={
            <span className="inline-flex items-center gap-1.5">
              {d.enLaCalle > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />}
              {dinero(d.enLaCalle)}
            </span>
          }
          nota="Cobrado y sin remesar"
        />
      </dl>
    </MarcoAF4>
  );
}

/** Mejora 41: la proveeduría (Dropi) del mes junto a las tiendas. Solo dólares. */
export function BloqueDropi({ r, mes, ventasTiendas }: { r: ResumenDropi; mes: string; ventasTiendas: number }) {
  return (
    <MarcoAF4
      id="titulo-dropi"
      titulo="Proveeduría (Dropi)"
      detalle={`${mesCorto(mes)} · USD (Costa Rica va aparte, en colones)`}
      accion={
        <Link href="/panel-financiero/canales" className={`text-xs font-medium underline-offset-2 hover:underline ${anilloFoco} rounded`}>
          Tiendas y proveeduría
        </Link>
      }
    >
      <dl className={rejilla}>
        <Dato nombre="Pedidos" valor={entero(r.pedidos)} nota={`${entero(r.entregados)} entregados · ${fraccion(r.tasaEntrega)}`} />
        <Dato nombre="Vendido al cliente final" valor={dinero(r.vendidoCliente)} />
        <Dato nombre="Ganancia acreditada" fuerte valor={dinero(r.ganancias)} nota="Nuestro ingreso de Dropi" />
        <Dato nombre="Tiendas · entregado" valor={dinero(ventasTiendas)} />
        <Dato
          nombre="Ingreso de los dos canales"
          valor={dinero(r.ganancias + ventasTiendas)}
          nota={r.ganancias + ventasTiendas > 0 ? `${fraccion(ventasTiendas / (r.ganancias + ventasTiendas))} de las tiendas` : undefined}
        />
      </dl>
    </MarcoAF4>
  );
}
