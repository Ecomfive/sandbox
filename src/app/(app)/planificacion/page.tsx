import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { claseCeldaAF4, claseNumeroAF4, CLASE_FILA_AF4 } from "@/components/af4/estilos-af4";
import { GraficaLineasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { DesplazableX } from "@/components/ui/desplazable-x";
import { KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { mesCorto, sumarMeses } from "@/lib/af4/fecha";
import { dinero, entero, fraccion, porcentaje } from "@/lib/af4/formato";
import { HORIZONTE_PRONOSTICO, type TiendaBase } from "@/lib/finanzas/cargar-planificacion";
import { ETIQUETA_METODO, sumarPronosticos, type PuntoPronostico } from "@/lib/finanzas/pronostico";
import { AvisosPlan, SinDatosPlan, contextoPlan } from "./comun";

export const metadata = { title: "Planificación" };
export const dynamic = "force-dynamic";

const TITULO = "Planificación";
const HORIZONTES = [3, 6, 12] as const;

const suma = (p: PuntoPronostico[], n: number) => p.slice(0, n).reduce((a, x) => ({ valor: a.valor + x.valor, bajo: a.bajo + x.bajo, alto: a.alto + x.alto }), { valor: 0, bajo: 0, alto: 0 });

/** MAPE de varias tiendas ponderado por sus ventas reales del backtest. */
function mapePonderado(tiendas: TiendaBase[]): number | null {
  let peso = 0;
  let acum = 0;
  for (const t of tiendas)
    for (const b of t.ventas.backtest)
      if (b.error !== null) {
        peso += b.real;
        acum += b.error * b.real;
      }
  return peso > 0 ? acum / peso : null;
}

export default async function PronosticoPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const { base } = await contextoPlan({ balance: false });
  if ("error" in base) return <SinDatosPlan pagina={TITULO} titulo="No se pudo leer la planificación">{base.error}</SinDatosPlan>;
  if (base.sinHistoria) return <SinDatosPlan pagina={TITULO} titulo="Falta la historia de ventas por tienda">{base.sinHistoria}</SinDatosPlan>;
  const sp = await searchParams;
  const pedida = typeof sp.tienda === "string" ? sp.tienda : null;
  const elegida = base.tiendas.find((t) => t.id === pedida) ?? null;
  const metrica = sp.ver === "pedidos" ? "pedidos" : "ventas";
  const grupo = elegida ? [elegida] : base.tiendas.filter((t) => t.ventas.metodo !== "sin_datos");
  const proy = sumarPronosticos(grupo.map((t) => t[metrica].proyeccion));
  const mape = elegida ? elegida[metrica].mape : metrica === "ventas" ? mapePonderado(grupo) : null;
  const fmt = (v: number | null) => (metrica === "ventas" ? dinero(v) : entero(v));

  // Serie de la gráfica: los meses reales (24 como máximo) y los 12 pronosticados.
  const mesesReales = base.mesesHistoria.filter((m) => grupo.some((t) => t.historia.some((h) => h.periodo === m)));
  const real = (m: string) => grupo.reduce((a, t) => a + (t.historia.find((h) => h.periodo === m)?.[metrica] ?? 0), 0);
  const futuros = Array.from({ length: HORIZONTE_PRONOSTICO }, (_, i) => sumarMeses(base.corte, i + 1));
  const datos = [
    ...mesesReales.map((m) => ({ etiqueta: mesCorto(m), real: real(m), pronostico: m === base.corte ? real(m) : null, bajo: null, alto: null })),
    ...futuros.map((m, i) => ({ etiqueta: mesCorto(m), real: null, pronostico: proy[i]?.valor ?? null, bajo: proy[i]?.bajo ?? null, alto: proy[i]?.alto ?? null })),
  ];
  // Con menos de 12 meses reales se compara contra lo real anualizado (si no, 6 meses contra 12 da un +100 % falso).
  const tramoReal = mesesReales.slice(-12);
  const ult12 = tramoReal.length ? (tramoReal.reduce((a, m) => a + real(m), 0) * 12) / tramoReal.length : 0;
  const prox12 = suma(proy, 12).valor;

  const hrefTienda = (id: string | null) => `/planificacion?${new URLSearchParams({ ...(id ? { tienda: id } : {}), ...(metrica === "pedidos" ? { ver: "pedidos" } : {}) })}`;
  const hrefVer = (v: string) => `/planificacion?${new URLSearchParams({ ...(elegida ? { tienda: elegida.id } : {}), ...(v === "pedidos" ? { ver: "pedidos" } : {}) })}`;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        filtros={
          <>
            <SelectorEnlace
              etiqueta="Elegir la tienda"
              opciones={[{ valor: "todas", etiqueta: base.veTodo ? "Todas las tiendas" : "Mis tiendas", href: hrefTienda(null) }, ...base.tiendas.map((t) => ({ valor: t.id, etiqueta: t.nombre, href: hrefTienda(t.id) }))]}
              elegido={elegida?.id ?? "todas"}
            />
            <ControlSegmentado
              etiqueta="Qué se pronostica"
              opciones={[
                { valor: "ventas", etiqueta: "Ventas", href: hrefVer("ventas") },
                { valor: "pedidos", etiqueta: "Pedidos", href: hrefVer("pedidos") },
              ]}
              elegido={metrica}
            />
          </>
        }
        datosHasta={base.corte}
      />
      <AvisosPlan avisos={base.corteDeCierre ? [] : [`Sin un mes cerrado reciente: el pronóstico usa los meses hasta ${mesCorto(base.corte)}.`]} />

      <KpiGroup titulo={`Pronóstico de ${metrica} · ${elegida ? elegida.nombre : base.veTodo ? "todas las tiendas" : "tus tiendas"}`}>
        <FilaKpiAF4>
          {HORIZONTES.map((n) => {
            const s = suma(proy, n);
            return <KpiAF4 key={n} titulo={`Próximos ${n} meses`} valor={fmt(s.valor)} subtexto={`Entre ${fmt(s.bajo)} y ${fmt(s.alto)}`} />;
          })}
          <KpiAF4 titulo="Contra los últimos 12 meses" valor={ult12 > 0 ? porcentaje(((prox12 - ult12) / ult12) * 100, { conSigno: true }) : "—"} subtexto={tramoReal.length < 12 ? `${tramoReal.length} meses reales anualizados: ${fmt(ult12)}` : `Últimos 12: ${fmt(ult12)}`} />
          <KpiAF4
            titulo="Error del backtest (MAPE)"
            valor={fraccion(mape)}
            tono={mape === null ? "neutral" : mape <= 0.1 ? "success" : mape <= 0.25 ? "warning" : "destructive"}
            subtexto={elegida ? ETIQUETA_METODO[elegida[metrica].metodo] : "Ponderado por ventas"}
          />
        </FilaKpiAF4>
      </KpiGroup>

      <GraficaLineasAF4
        id="titulo-grafica-pronostico"
        titulo={`${metrica === "ventas" ? "Ventas" : "Pedidos"} reales y pronóstico`}
        detalle={`Intervalo ≈ 80 % · ${metrica === "ventas" ? "USD" : "pedidos"}`}
        datos={datos}
        formato={metrica === "ventas" ? "dinero" : "entero"}
        series={[
          { clave: "real", nombre: "Real", color: 1, forma: "barra" },
          { clave: "pronostico", nombre: "Pronóstico", color: 2 },
          { clave: "bajo", nombre: "Bajo", color: 5, trazo: "puntos" },
          { clave: "alto", nombre: "Alto", color: 5, trazo: "rayas" },
        ]}
      />

      <MarcoAF4 id="titulo-tiendas-pronostico" titulo="Por tienda" detalle={`${metrica === "ventas" ? "USD" : "Pedidos"} · desde ${mesCorto(sumarMeses(base.corte, 1))}`} sinRelleno>
        <DesplazableX ariaLabel="Pronóstico por tienda" className="rounded-b-xl">
          <table className="tabla-datos w-full text-[13px]">
            <caption className="sr-only">Pronóstico por tienda a 3, 6 y 12 meses, con el intervalo, el método y el error del backtest</caption>
            <thead>
              <tr className={claseFilaEncabezado}>
                {["Tienda", "Método", "Meses", "3 meses", "6 meses", "12 meses", "Bajo · alto (12)", "Crecimiento mensual", "MAPE"].map((c, i) => (
                  <th key={c} scope="col" className={`${claseEncabezadoColumna} ${i < 2 ? "text-left" : "text-right"} whitespace-nowrap`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {base.tiendas.map((t) => {
                const p = t[metrica];
                const s12 = suma(p.proyeccion, 12);
                return (
                  <tr key={t.id} className={CLASE_FILA_AF4.seccion}>
                    <th scope="row" className={`${claseCeldaAF4} text-left font-medium`}>
                      {t.nombre}
                    </th>
                    <td className={`${claseCeldaAF4} text-left text-muted-foreground`}>{ETIQUETA_METODO[p.metodo]}</td>
                    <td className={claseNumeroAF4}>{t.historia.length}</td>
                    {[3, 6].map((n) => (
                      <td key={n} className={claseNumeroAF4}>
                        {fmt(suma(p.proyeccion, n).valor)}
                      </td>
                    ))}
                    <td className={`${claseNumeroAF4} font-semibold`}>{fmt(s12.valor)}</td>
                    <td className={claseNumeroAF4}>
                      {fmt(s12.bajo)} · {fmt(s12.alto)}
                    </td>
                    <td className={claseNumeroAF4}>{porcentaje(p.crecimientoMensual, { conSigno: true })}</td>
                    <td className={claseNumeroAF4}>{fraccion(p.mape)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DesplazableX>
      </MarcoAF4>

      {elegida && (
        <div className="grid gap-6 xl:grid-cols-2">
          <MarcoAF4 id="titulo-metodo" titulo="Método">
            <p className="text-sm">{elegida.explicacion}</p>
          </MarcoAF4>
          <MarcoAF4 id="titulo-backtest" titulo="Backtest" detalle="Cada mes pronosticado solo con los anteriores" sinRelleno>
            <DesplazableX ariaLabel="Backtest" className="rounded-b-xl">
              <table className="tabla-datos w-full text-[13px]">
                <caption className="sr-only">Pronóstico a un mes contra lo real en los últimos meses</caption>
                <thead>
                  <tr className={claseFilaEncabezado}>
                    {["Mes", "Real", "Pronóstico", "Error"].map((c, i) => (
                      <th key={c} scope="col" className={`${claseEncabezadoColumna} ${i ? "text-right" : "text-left"}`}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {elegida[metrica].backtest.map((b) => (
                    <tr key={b.indice} className={CLASE_FILA_AF4.detalle}>
                      <th scope="row" className={`${claseCeldaAF4} text-left font-normal`}>
                        {mesCorto(elegida.historia[b.indice]?.periodo ?? base.corte)}
                      </th>
                      <td className={claseNumeroAF4}>{fmt(b.real)}</td>
                      <td className={claseNumeroAF4}>{fmt(b.pronostico)}</td>
                      <td className={claseNumeroAF4}>{fraccion(b.error)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DesplazableX>
          </MarcoAF4>
        </div>
      )}
    </Pagina>
  );
}
