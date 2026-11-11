import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { claseCeldaAF4, CLASE_FILA_AF4 } from "@/components/af4/estilos-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { DesplazableX } from "@/components/ui/desplazable-x";
import { KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora, mesCorto } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import type { ColumnaAF4, FilaAF4 } from "@/lib/af4/tabla-financiera";
import { nombresDePersonas } from "@/lib/finanzas/cargar-cierre";
import { cargarPlanAprobado, cargarVersiones, entradaDesdeBase, mesesHasta } from "@/lib/finanzas/cargar-planificacion";
import { diferenciaApertura, proyectarPlan, type MesPlan } from "@/lib/finanzas/planificacion";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisosPlan, SinDatosPlan, contextoPlan } from "../comun";
import { BotonVersion, GuardarVersion } from "../formularios";

export const metadata = { title: "Plan anual · Planificación" };
export const dynamic = "force-dynamic";

const TITULO = "Plan anual";
const ESTADO: Record<string, string> = { borrador: "Borrador", aprobado: "Aprobado", reemplazado: "Reemplazado" };

export default async function PlanAnualPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const { base, puedeEscribir } = await contextoPlan();
  if ("error" in base) return <SinDatosPlan pagina={TITULO} titulo="No se pudo leer la planificación">{base.error}</SinDatosPlan>;
  if (!base.veTodo) return <SinDatosPlan pagina={TITULO} titulo="El plan anual es de toda la empresa" />;
  if (base.sinHistoria) return <SinDatosPlan pagina={TITULO} titulo="Falta la historia de ventas por tienda">{base.sinHistoria}</SinDatosPlan>;
  const anioCorte = Number(base.corte.slice(0, 4));
  const opciones = base.corte.slice(5, 7) === "12" ? [anioCorte + 1] : [anioCorte, anioCorte + 1];
  const pedido = Number((await searchParams).anio);
  const anio = opciones.includes(pedido) ? pedido : Number(base.corte.slice(5, 7)) >= 9 ? anioCorte + 1 : anioCorte;
  const entrada = entradaDesdeBase(base, mesesHasta(base.corte, anio));
  if (!entrada) return <SinDatosPlan pagina={TITULO} titulo="Sin balance de apertura">{base.avisos.join(" ")}</SinDatosPlan>;
  const supabase = createServiceClient();
  const [r, versiones, aprobado] = await Promise.all([Promise.resolve(proyectarPlan(entrada)), cargarVersiones(supabase, anio), cargarPlanAprobado(supabase, anio)]);
  const meses = r.consolidado.filter((m) => m.periodo.startsWith(String(anio)));
  const listaVersiones = "error" in versiones ? [] : versiones;
  const personas = await nombresDePersonas(supabase, listaVersiones.flatMap((v) => [v.creadoPor, v.aprobadoPor]));

  const columnas: ColumnaAF4[] = meses.map((m) => ({ clave: m.periodo, etiqueta: mesCorto(m.periodo) }));
  const col = (f: (m: MesPlan) => number) => meses.map(f);
  const ingresos = col((m) => m.ingresos);
  const eerr: FilaAF4[] = [
    { clave: "ventas", etiqueta: "Ventas (pedidos × ticket)", tipo: "detalle", valores: col((m) => m.ventas) },
    { clave: "ingresos", etiqueta: "Ingresos netos", tipo: "seccion", valores: ingresos },
    { clave: "costo", etiqueta: "Costo de ventas", tipo: "seccion", valores: col((m) => -m.costoVentas), base: ingresos },
    { clave: "margen", etiqueta: "Margen bruto", tipo: "subtotal", valores: col((m) => m.ingresos - m.costoVentas), base: ingresos },
    { clave: "marketing", etiqueta: "Marketing", tipo: "seccion", valores: col((m) => -m.marketing), base: ingresos },
    { clave: "administracion", etiqueta: "Administración", tipo: "seccion", valores: col((m) => -m.administracion), base: ingresos },
    { clave: "otros-libro", etiqueta: "Otros del libro (no explicados por las órdenes)", tipo: "seccion", valores: col((m) => m.otrosLibro), base: ingresos },
    { clave: "ebitda", etiqueta: "EBITDA", tipo: "subtotal", valores: col((m) => m.ebitda), base: ingresos },
    { clave: "depreciacion", etiqueta: "Depreciación", tipo: "seccion", valores: col((m) => -m.depreciacion) },
    { clave: "financieros", etiqueta: "Gastos financieros", tipo: "seccion", valores: col((m) => -m.financieros) },
    { clave: "impuesto", etiqueta: "Impuesto sobre la renta", tipo: "seccion", valores: col((m) => -m.impuesto) },
    { clave: "utilidad", etiqueta: "Utilidad neta", tipo: "total", valores: col((m) => m.utilidad), base: ingresos },
  ];
  if (aprobado?.foto) {
    const deFoto = (p: string) => aprobado.foto!.consolidado.find((x) => x.periodo === p);
    eerr.push({ clave: "plan-ebitda", etiqueta: `EBITDA del plan aprobado`, tipo: "detalle", valores: meses.map((m) => deFoto(m.periodo)?.ebitda ?? null) });
  }
  const primeraCaja = r.consolidado.findIndex((m) => m.periodo === meses[0]?.periodo);
  const cajaInicial = meses.map((_, k) => (k > 0 ? meses[k - 1].caja : primeraCaja > 0 ? r.consolidado[primeraCaja - 1].caja : entrada.apertura.caja));
  const flujo: FilaAF4[] = [
    { clave: "caja-inicial", etiqueta: "Caja inicial", tipo: "saldo", valores: cajaInicial },
    { clave: "operativo", etiqueta: "Flujo operativo", tipo: "seccion", valores: col((m) => m.operativo) },
    { clave: "inversion", etiqueta: "Flujo de inversión", tipo: "seccion", valores: col((m) => m.inversion) },
    { clave: "financiamiento", etiqueta: "Flujo de financiamiento", tipo: "seccion", valores: col((m) => m.financiamiento) },
    { clave: "neto", etiqueta: "Flujo neto", tipo: "subtotal", valores: col((m) => m.flujoNeto) },
    { clave: "caja-final", etiqueta: "Caja final", tipo: "saldo", valores: col((m) => m.caja) },
  ];
  const balance: FilaAF4[] = [
    { clave: "g-activo", etiqueta: "Activo", tipo: "grupo", valores: meses.map(() => null), total: null },
    { clave: "caja", etiqueta: "Caja y bancos", tipo: "saldo", valores: col((m) => m.caja) },
    { clave: "cxc", etiqueta: "Cuentas por cobrar", tipo: "saldo", valores: col((m) => m.cxc) },
    { clave: "inventario", etiqueta: "Inventario", tipo: "saldo", valores: col((m) => m.inventario) },
    { clave: "fijo", etiqueta: "Bienes de uso netos", tipo: "saldo", valores: col((m) => m.activoFijo) },
    { clave: "otros-activos", etiqueta: "Otros activos", tipo: "saldo", valores: col((m) => m.otrosActivos) },
    { clave: "total-activo", etiqueta: "Total activo", tipo: "subtotal", valores: col((m) => m.totalActivo), total: null },
    { clave: "g-pasivo", etiqueta: "Pasivo", tipo: "grupo", valores: meses.map(() => null), total: null },
    { clave: "cxp", etiqueta: "Cuentas por pagar", tipo: "saldo", valores: col((m) => m.cxp) },
    { clave: "deuda", etiqueta: "Deuda actual", tipo: "saldo", valores: col((m) => m.deudaProgramada) },
    { clave: "cobertura", etiqueta: "Deuda de cobertura", tipo: "saldo", valores: col((m) => m.deudaCobertura) },
    { clave: "otros-pasivos", etiqueta: "Otros pasivos", tipo: "saldo", valores: col((m) => m.otrosPasivos) },
    { clave: "total-pasivo", etiqueta: "Total pasivo", tipo: "subtotal", valores: col((m) => m.totalPasivo), total: null },
    { clave: "patrimonio", etiqueta: "Patrimonio", tipo: "subtotal", valores: col((m) => m.patrimonio), total: null },
    { clave: "diferencia", etiqueta: "Diferencia por cuadrar", tipo: "total", valores: col((m) => m.diferencia), total: null },
  ];
  const suma = (f: (m: MesPlan) => number) => meses.reduce((a, m) => a + f(m), 0);
  const ebitda = suma((m) => m.ebitda);
  const ebitdaPlan = aprobado?.foto ? aprobado.foto.consolidado.reduce((a, m) => a + m.ebitda, 0) : null;
  const cajaMin = meses.length ? Math.min(...meses.map((m) => m.caja)) : 0;
  const deudaMax = meses.length ? Math.max(...meses.map((m) => m.deudaCobertura)) : 0;
  const dif = diferenciaApertura(entrada.apertura);
  const detalleMeses = meses.length ? `${mesCorto(meses[0].periodo)} – ${mesCorto(meses[meses.length - 1].periodo)} · USD` : "";

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        filtros={<ControlSegmentado etiqueta="Elegir el año" opciones={opciones.map((a) => ({ valor: String(a), etiqueta: String(a), href: `/planificacion/plan-anual?anio=${a}` }))} elegido={String(anio)} />}
        datosHasta={base.corte}
        acciones={puedeEscribir && !base.sinTablas ? <GuardarVersion anio={anio} /> : undefined}
      />
      <AvisosPlan avisos={[...base.avisos, ...(meses[0] && meses[0].periodo !== `${anio}-01-01` ? [`Los meses de ${anio} hasta ${mesCorto(base.corte)} ya son reales (Estado de resultados): el plan proyecta desde ${mesCorto(meses[0].periodo)}.`] : []), ...(Math.abs(dif) >= 1 ? [`El balance de apertura tiene una diferencia por cuadrar de ${dinero(dif)}: se arrastra igual todos los meses.`] : [])]} />

      <KpiGroup titulo={`Plan ${anio} · proyección desde los motores`}>
        <FilaKpiAF4>
          <KpiAF4 titulo="Ingresos netos" valor={dinero(suma((m) => m.ingresos))} />
          <KpiAF4
            titulo="EBITDA"
            valor={dinero(ebitda)}
            tono={ebitda < 0 ? "destructive" : "neutral"}
            subtexto={ebitdaPlan !== null ? `Plan aprobado ${dinero(ebitdaPlan)}` : "Sin plan aprobado"}
          />
          <KpiAF4 titulo="Utilidad neta" valor={dinero(suma((m) => m.utilidad))} />
          <KpiAF4 titulo="Caja mínima" valor={dinero(cajaMin)} tono={cajaMin <= base.supuestos.cajaMinima + 0.5 && base.supuestos.cajaMinima > 0 ? "warning" : "neutral"} subtexto={`Mínimo ${dinero(base.supuestos.cajaMinima)}`} />
          <KpiAF4 titulo="Deuda de cobertura máxima" valor={dinero(deudaMax)} tono={deudaMax > 0 ? "warning" : "success"} />
        </FilaKpiAF4>
      </KpiGroup>

      <TablaFinanciera id="titulo-plan-eerr" titulo="Estado de resultados proyectado" detalle={detalleMeses} columnas={columnas} filas={eerr} ariaLabel="Estado de resultados proyectado" ventas={ingresos} />
      <TablaFinanciera id="titulo-plan-flujo" titulo="Flujo de caja proyectado" detalle={detalleMeses} columnas={columnas} filas={flujo} ariaLabel="Flujo de caja proyectado" />
      <TablaFinanciera id="titulo-plan-balance" titulo="Balance proyectado" detalle={`Al cierre de cada mes · ${detalleMeses}`} columnas={columnas} filas={balance} ariaLabel="Balance proyectado" conTotal={false} />

      <MarcoAF4 id="titulo-versiones" titulo="Versiones" detalle={`${listaVersiones.length} del ${anio}`} sinRelleno>
        {"error" in versiones ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{versiones.error}</p>
        ) : !listaVersiones.length ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Sin versiones guardadas.</p>
        ) : (
          <DesplazableX ariaLabel="Versiones del plan" className="rounded-b-xl">
            <table className="tabla-datos w-full text-[13px]">
              <caption className="sr-only">Versiones guardadas del plan anual, quién las creó y quién las aprobó</caption>
              <thead>
                <tr className={claseFilaEncabezado}>
                  {["Versión", "Estado", "Datos hasta", "Creada", "Aprobada", ""].map((c, i) => (
                    <th key={i} scope="col" className={`${claseEncabezadoColumna} text-left whitespace-nowrap`}>
                      {c || <span className="sr-only">Acciones</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listaVersiones.map((v) => (
                  <tr key={v.id} className={CLASE_FILA_AF4.seccion}>
                    <th scope="row" className={`${claseCeldaAF4} text-left font-medium`}>
                      {v.nombre}
                    </th>
                    <td className={`${claseCeldaAF4} text-left`}>
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${v.estado === "aprobado" ? "bg-success" : v.estado === "borrador" ? "bg-warning" : "bg-muted-foreground"}`} />
                        {ESTADO[v.estado]}
                      </span>
                    </td>
                    <td className={`${claseCeldaAF4} text-left`}>{mesCorto(v.corte)}</td>
                    <td className={`${claseCeldaAF4} text-left`}>
                      {fechaHora(v.creadoEn)}
                      {v.creadoPor && personas.get(v.creadoPor) ? ` · ${personas.get(v.creadoPor)}` : ""}
                    </td>
                    <td className={`${claseCeldaAF4} text-left`}>
                      {v.aprobadoEn ? `${fechaHora(v.aprobadoEn)}${v.aprobadoPor && personas.get(v.aprobadoPor) ? ` · ${personas.get(v.aprobadoPor)}` : ""}` : "—"}
                    </td>
                    <td className={`${claseCeldaAF4} text-right`}>
                      {puedeEscribir && v.estado === "borrador" && (
                        <span className="flex flex-wrap justify-end gap-2">
                          <BotonVersion id={v.id} accion="aprobar" />
                          <BotonVersion id={v.id} accion="eliminar" />
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesplazableX>
        )}
      </MarcoAF4>
    </Pagina>
  );
}
