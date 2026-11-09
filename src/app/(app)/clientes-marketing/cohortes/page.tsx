import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { ContenedorTabla } from "@/components/tabla/contenedor-tabla";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, inicioDeMes, mesCorto } from "@/lib/af4/fecha";
import { dinero2, entero, fraccion, numero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { DIAS_LTV, DIAS_RECOMPRA, div, finDeMes, frecuencia, ltv, recompra, sumarCohortes, type Cohorte } from "@/lib/clientes/metricas";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosPagina, hrefClientes } from "../datos";
import { Selectores } from "../selectores";
import { CeldaCalor, LeyendaCalor } from "./mapa-calor";

export const metadata = { title: "Cohortes de clientes" };

export const dynamic = "force-dynamic";

const num = `${claseCeldaColumna} text-right tabular-nums whitespace-nowrap`;
const enc = `${claseEncabezadoColumna} text-right`;
const uno = (v: number | null, d = 1) => numero(v, d);

function FilaCohorte({ c, etiqueta, maximo, total }: { c: Cohorte; etiqueta: string; maximo: number; total?: boolean }) {
  return (
    <tr className={total ? "border-t border-border-control border-b-[3px] border-b-border-control border-double font-semibold" : "border-b border-border/60"}>
      <th scope="row" className={`${claseCeldaColumna} whitespace-nowrap text-left font-medium`}>
        {etiqueta}
      </th>
      <td className={num}>{entero(c.clientes)}</td>
      {DIAS_RECOMPRA.map((d) => (
        <CeldaCalor key={d} valor={recompra(c, d)} maximo={maximo} />
      ))}
      {DIAS_LTV.map((d) => (
        <td key={d} className={num}>
          {dinero2(ltv(c, d))}
        </td>
      ))}
      <td className={num}>{uno(div(c.entregadas, c.clientes), 2)}</td>
      <td className={num}>{uno(div(c.dias_segunda, c.con_segunda), 0)}</td>
    </tr>
  );
}

export default async function CohortesPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  await requireModulo("clientes-marketing");
  const datos = await cargarDatosPagina(createServiceClient(), await searchParams);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Cohortes" imprimir={false} />
        <EstadoVacioAF4 titulo="Faltan las tablas de clientes">Correr la migración 0920 (clientes y marketing) en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }

  const { ambito, tienda, corte } = datos;
  const cohortes = datos.cohortes.filter((c) => c.ambito === ambito).sort((a, b) => a.cohorte.localeCompare(b.cohorte));
  const total = sumarCohortes(cohortes, ambito);
  const f = frecuencia(datos.frecuencia.filter((x) => x.ambito === ambito));
  const maximo = Math.max(0, ...cohortes.flatMap((c) => DIAS_RECOMPRA.map((d) => recompra(c, d) ?? 0)));

  // Clientes que volvieron a recibir en cada mes de vida (solo meses ya terminados al corte).
  const curva = datos.curva.filter((p) => p.ambito === ambito);
  const activos = new Map(curva.map((p) => [`${p.cohorte}|${p.mes}`, p.activos]));
  const ultimoMes = corte ? Math.max(0, ...cohortes.map((c) => [...Array(13).keys()].filter((m) => finDeMes(c.cohorte, m) <= corte).pop() ?? -1)) : 0;
  const mesesVida = [...Array(Math.min(ultimoMes, 12)).keys()].map((m) => m + 1);
  const tasaActiva = (c: Cohorte, m: number) => (corte && finDeMes(c.cohorte, m) <= corte ? div(activos.get(`${c.cohorte}|${m}`) ?? 0, c.clientes) : null);
  const contexto = tienda?.nombre ?? "Todas las tiendas";
  const maximoActivos = Math.max(0, ...cohortes.flatMap((c) => mesesVida.map((m) => tasaActiva(c, m) ?? 0)));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Cohortes"
        filtros={<Selectores datos={datos} ruta="/clientes-marketing/cohortes" conPeriodo={false} />}
        datosHasta={corte ? inicioDeMes(corte) : null}
        descarga={{ href: hrefClientes("/clientes-marketing/exportar", { periodo: datos.periodo.clave, tienda: tienda?.id }) }}
      />

      {!cohortes.length ? (
        <EstadoVacioAF4 titulo="Todavía no hay clientes con una entrega" />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4 titulo="Clientes con entrega" destacado valor={entero(f.clientes)} subtexto={`Desde ${mesCorto(cohortes[0].cohorte)}${corte ? ` · corte ${fechaCorta(corte)}` : ""}`} />
            <KpiAF4 titulo="Compraron más de una vez" valor={fraccion(f.conRecompra)} subtexto={`${entero(f.clientes - f.porEntregas[0])} clientes`} />
            <KpiAF4 titulo="Días entre compras" valor={uno(f.diasEntreCompras, 0)} />
            <KpiAF4 titulo="Entregas por cliente" valor={uno(div(total.entregadas, total.clientes), 2)} />
            <KpiAF4 titulo="LTV 90 días" valor={dinero2(ltv(total, 90))} subtexto={`${entero(total.maduros_90)} clientes maduros`} />
            <KpiAF4 titulo="LTV 180 días" valor={dinero2(ltv(total, 180))} subtexto={`${entero(total.maduros_180)} clientes maduros`} />
          </FilaKpiAF4>

          <MarcoAF4 id="titulo-cohortes" titulo="Recompra y LTV por mes de la primera entrega" detalle={contexto} sinRelleno>
            <ContenedorTabla ariaLabel="Cohortes de clientes">
              <table className="tabla-datos w-full min-w-[60rem] border-collapse text-sm">
                <thead>
                  <tr className={claseFilaEncabezado}>
                    <th scope="col" className={claseEncabezadoColumna}>
                      Cohorte
                    </th>
                    <th scope="col" className={enc}>
                      Clientes
                    </th>
                    {DIAS_RECOMPRA.map((d) => (
                      <th key={d} scope="col" className={enc}>
                        Recompra {d} d
                      </th>
                    ))}
                    {DIAS_LTV.map((d) => (
                      <th key={d} scope="col" className={enc}>
                        LTV {d} d
                      </th>
                    ))}
                    <th scope="col" className={enc}>
                      Entregas por cliente
                    </th>
                    <th scope="col" className={enc}>
                      Días hasta la 2.ª
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cohortes.map((c) => (
                    <FilaCohorte key={c.cohorte} c={c} etiqueta={mesCorto(c.cohorte)} maximo={maximo} />
                  ))}
                  <FilaCohorte c={total} etiqueta="Total" maximo={maximo} total />
                </tbody>
              </table>
            </ContenedorTabla>
            <LeyendaCalor maximo={maximo} />
          </MarcoAF4>

          {mesesVida.length > 0 && (
            <MarcoAF4 id="titulo-activos" titulo="Clientes que vuelven a recibir, por mes desde la primera entrega" detalle={contexto} sinRelleno>
              <ContenedorTabla ariaLabel="Clientes activos por mes de vida">
                <table className="tabla-datos w-full border-collapse text-sm">
                  <thead>
                    <tr className={claseFilaEncabezado}>
                      <th scope="col" className={claseEncabezadoColumna}>
                        Cohorte
                      </th>
                      <th scope="col" className={enc}>
                        Clientes
                      </th>
                      {mesesVida.map((m) => (
                        <th key={m} scope="col" className={enc}>
                          Mes {m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohortes.map((c) => (
                      <tr key={c.cohorte} className="border-b border-border/60">
                        <th scope="row" className={`${claseCeldaColumna} whitespace-nowrap text-left font-medium`}>
                          {mesCorto(c.cohorte)}
                        </th>
                        <td className={num}>{entero(c.clientes)}</td>
                        {mesesVida.map((m) => (
                          <CeldaCalor key={m} valor={tasaActiva(c, m)} maximo={maximoActivos} />
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ContenedorTabla>
              <LeyendaCalor maximo={maximoActivos} />
            </MarcoAF4>
          )}

          <MarcoAF4 id="titulo-frecuencia" titulo="Clientes por cantidad de entregas" className="max-w-xl" sinRelleno>
            <ContenedorTabla ariaLabel="Clientes por cantidad de entregas">
              <table className="tabla-datos w-full border-collapse text-sm">
                <thead>
                  <tr className={claseFilaEncabezado}>
                    <th scope="col" className={claseEncabezadoColumna}>
                      Entregas
                    </th>
                    <th scope="col" className={enc}>
                      Clientes
                    </th>
                    <th scope="col" className={enc}>
                      %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {f.porEntregas.map((n, k) => (
                    <tr key={k} className="border-b border-border/60">
                      <th scope="row" className={`${claseCeldaColumna} text-left font-medium`}>
                        {k === 4 ? "5 o más" : k + 1}
                      </th>
                      <td className={num}>{entero(n)}</td>
                      <CeldaCalor valor={div(n, f.clientes)} maximo={1} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </ContenedorTabla>
          </MarcoAF4>
        </>
      )}
    </Pagina>
  );
}
