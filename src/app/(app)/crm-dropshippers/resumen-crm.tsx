"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { etiquetaAntiguedad, etiquetaCanal, montoCorto, type FilaCaso, type FilaDropshipper, type ResumenCrm } from "./def-crm";
import { FichaLateral } from "./ficha-lateral";
import { CabeceraTarjeta, Punto, Segmentado, claseConFicha } from "./piezas-crm";

type Orden = "ventas" | "pedidos";
const LIMITE_RANKING = 8;
const LIMITE_CASOS = 5;

/** «+12,4 %»; sin dato del mes anterior no se dibuja nada. `inverso`: bajar es mejorar (tiempos). */
function Delta({ valor, sufijo, inverso = false }: { valor: number | null; sufijo: string; inverso?: boolean }) {
  if (valor === null) return null;
  const mejora = inverso ? valor < 0 : valor > 0;
  const texto = `${valor > 0 ? "+" : valor < 0 ? "−" : ""}${Math.abs(valor).toLocaleString("es-CR", { maximumFractionDigits: 1 })}${sufijo}`;
  return <b className={`font-medium ${mejora ? "text-success" : valor === 0 ? "" : "text-destructive"}`}>{texto}</b>;
}

/** Una celda de la barra de indicadores; con `href` es un enlace a la página que lista lo que cuenta. */
function Indicador({ titulo, punto, valor, detalle, href }: { titulo: string; punto?: "aviso" | "peligro"; valor: string; detalle: ReactNode; href?: string }) {
  const contenido = (
    <>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {punto && <Punto tono={punto} />}
        {titulo}
      </span>
      <span className="mt-0.5 block text-[22px] leading-tight font-semibold tracking-tight tabular-nums">{valor}</span>
      <span className="block text-xs text-muted-foreground">{detalle}</span>
    </>
  );
  const clase = `-mr-px -mb-px block min-w-0 flex-[1_1_10.5rem] border-r border-b border-border px-3.5 py-3 text-left`;
  return href ? (
    <Link href={href} className={`${clase} hover:bg-muted ${anilloFoco}`}>
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

/**
 * Resumen del CRM: barra de indicadores, ranking de quién vende más y los casos que piden atención, con la ficha del
 * dropshipper elegido fija a la derecha. Elegir a alguien del ranking cambia la ficha.
 */
export function ResumenCrm({
  resumen,
  dropshippers,
  casos,
  codigoPais,
  hoy,
  demo,
}: {
  resumen: ResumenCrm;
  dropshippers: FilaDropshipper[];
  casos: FilaCaso[];
  codigoPais: string;
  hoy: string;
  demo: boolean;
}) {
  const [orden, setOrden] = useState<Orden>("ventas");
  const [elegido, setElegido] = useState<string | null>(null);

  const ranking = useMemo(
    () =>
      dropshippers
        .filter((d) => d.estado === "activo")
        .sort((a, b) => (orden === "ventas" ? b.ventasMes - a.ventasMes : b.pedidosMes - a.pedidosMes))
        .slice(0, LIMITE_RANKING),
    [dropshippers, orden],
  );
  const maximo = ranking.length ? Math.max(1, orden === "ventas" ? ranking[0].ventasMes : ranking[0].pedidosMes) : 1;
  const casosAtencion = useMemo(
    () =>
      casos
        .filter((c) => c.estado !== "resuelto")
        .sort((a, b) => Number(b.prioridad === "alta") - Number(a.prioridad === "alta") || b.horasAbierto - a.horasAbierto)
        .slice(0, LIMITE_CASOS),
    [casos],
  );

  const idFicha = elegido ?? ranking[0]?.id ?? dropshippers[0]?.id ?? null;

  return (
    <div className={claseConFicha}>
      <div className="flex min-w-0 flex-col gap-6">
        <section aria-label="Indicadores" className="overflow-hidden rounded-[10px] border border-border bg-card">
          <div className="flex justify-between gap-2 border-b border-border bg-muted px-3.5 py-2 text-xs">
            <span className="font-semibold tracking-[0.04em] text-muted-foreground uppercase">Dashboard · {resumen.mes}</span>
            <span className="text-muted-foreground">{demo ? "Datos de ejemplo" : "Actualizado ahora"}</span>
          </div>
          <div className="flex flex-wrap">
            <Indicador
              titulo="Dropshippers activos"
              valor={resumen.activos.toLocaleString("es-CR")}
              href="/crm-dropshippers/directorio"
              detalle={
                <>
                  <Delta valor={resumen.activosDeltaMes} sufijo="" /> {resumen.activosDeltaMes !== null && "vs mes anterior · "}de {resumen.totalDropshippers}
                </>
              }
            />
            <Indicador
              titulo="Pedidos del mes"
              valor={resumen.pedidosMes.toLocaleString("es-CR")}
              detalle={resumen.pedidosDeltaPct !== null ? <><Delta valor={resumen.pedidosDeltaPct} sufijo=" %" /> vs mes anterior</> : "Pedidos registrados"}
            />
            <Indicador
              titulo="Ventas del mes"
              valor={montoCorto(resumen.ventasMes, codigoPais)}
              detalle={resumen.ventasDeltaPct !== null ? <><Delta valor={resumen.ventasDeltaPct} sufijo=" %" /> vs mes anterior</> : "Suma de los pedidos"}
            />
            <Indicador
              titulo="Casos abiertos"
              punto={resumen.casosSinResponder > 0 ? "aviso" : undefined}
              valor={resumen.casosAbiertos.toLocaleString("es-CR")}
              href="/crm-dropshippers/casos"
              detalle={resumen.casosSinResponder > 0 ? <><b className="font-medium text-destructive">{resumen.casosSinResponder} sin responder</b> más de 24 h</> : "Todos con respuesta"}
            />
            <Indicador
              titulo="Primera respuesta"
              valor={resumen.primeraRespuestaMin === null ? "—" : `${resumen.primeraRespuestaMin} min`}
              detalle={resumen.primeraRespuestaDeltaMin !== null ? <><Delta valor={resumen.primeraRespuestaDeltaMin} sufijo=" min" inverso /> vs mes anterior</> : "Promedio de los casos"}
            />
            <Indicador
              titulo="Sin pedir en 30 días"
              punto="peligro"
              valor={resumen.sinPedir30.toLocaleString("es-CR")}
              href="/crm-dropshippers/directorio"
              detalle="en riesgo de inactivarse"
            />
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 min-[900px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-labelledby="titulo-ranking" className="min-w-0 rounded-[10px] border border-border bg-card">
            <CabeceraTarjeta id="titulo-ranking" titulo="Quién vende más">
              <Segmentado
                etiqueta="Ordenar el ranking"
                valor={orden}
                alCambiar={setOrden}
                opciones={[
                  { valor: "ventas", etiqueta: "Ventas" },
                  { valor: "pedidos", etiqueta: "Pedidos" },
                ]}
              />
            </CabeceraTarjeta>
            {ranking.length === 0 ? (
              <p className="m-0 px-4 py-8 text-center text-sm text-muted-foreground">Todavía no hay pedidos este mes para armar el ranking.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col p-1.5">
                {ranking.map((d, i) => {
                  const valor = orden === "ventas" ? d.ventasMes : d.pedidosMes;
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        aria-current={d.id === idFicha ? "true" : undefined}
                        onClick={() => setElegido(d.id)}
                        className={`grid w-full grid-cols-[1.4rem_minmax(0,1fr)_auto] items-center gap-2.5 rounded-[7px] px-2 py-[7px] text-left hover:bg-muted aria-[current=true]:bg-muted ${anilloFoco}`}
                      >
                        <span className="text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                        <span className="min-w-0">
                          <span className="flex justify-between gap-2 text-[13px]">
                            <span className="truncate">{d.nombre}</span>
                            <span className="truncate text-xs text-muted-foreground">{d.tienda}</span>
                          </span>
                          <span aria-hidden="true" className="mt-[5px] block h-1.5 overflow-hidden rounded-[3px] bg-accent">
                            <span className="block h-full rounded-[3px] bg-foreground-soft" style={{ width: `${(valor / maximo) * 100}%` }} />
                          </span>
                        </span>
                        <span className="min-w-[5.25rem] text-right text-[13px] font-medium tabular-nums">
                          {orden === "ventas" ? montoCorto(d.ventasMes, codigoPais) : `${d.pedidosMes} pedidos`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section aria-labelledby="titulo-atencion" className="min-w-0 rounded-[10px] border border-border bg-card">
            <CabeceraTarjeta id="titulo-atencion" titulo="Casos que piden atención">
              <Link href="/crm-dropshippers/casos" className={`rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ${anilloFoco}`}>
                {resumen.casosAbiertos} abiertos
              </Link>
            </CabeceraTarjeta>
            {casosAtencion.length === 0 ? (
              <p className="m-0 px-4 py-8 text-center text-sm text-muted-foreground">No hay casos abiertos.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {casosAtencion.map((c) => (
                  <li key={c.id} className="flex items-start gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0">
                    <Punto tono={c.prioridad === "alta" ? "peligro" : "aviso"} className="mt-1.5" />
                    <div className="min-w-0 flex-1">
                      <p className="m-0 text-[13px] font-medium">
                        {c.titulo}
                        {c.prioridad === "alta" && <span className="sr-only"> (prioridad alta)</span>}
                      </p>
                      <p className="m-0 truncate text-xs text-muted-foreground">
                        {c.dropshipper} · {etiquetaCanal(c.canal)} · {c.responsable ?? "sin responsable"}
                      </p>
                    </div>
                    <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground tabular-nums">{etiquetaAntiguedad(c.horasAbierto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      <FichaLateral
        dropshipper={dropshippers.find((d) => d.id === idFicha) ?? null}
        casos={casos}
        orden={ranking.map((d) => d.id)}
        alIr={setElegido}
        codigoPais={codigoPais}
        hoy={hoy}
        demo={demo}
      />
    </div>
  );
}
