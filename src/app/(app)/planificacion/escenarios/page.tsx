import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { claseCeldaAF4, claseNumeroAF4, CLASE_FILA_AF4 } from "@/components/af4/estilos-af4";
import { GraficaEscenariosAF4, type EscenarioAF4 } from "@/components/af4/graficas-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { DesplazableX } from "@/components/ui/desplazable-x";
import { Pagina } from "@/components/ui/pagina";
import { mesCorto, sumarMeses } from "@/lib/af4/fecha";
import { dinero, entero, porcentaje } from "@/lib/af4/formato";
import { cargarEscenarios, entradaDesdeBase } from "@/lib/finanzas/cargar-planificacion";
import { MESES_CONTINUO, escenarioDe, motoresPromedio, proyectarPlan, resumirPlan, type ParametrosEscenario, type ResumenPlan, type TipoEscenario } from "@/lib/finanzas/planificacion";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisosPlan, SinDatosPlan, contextoPlan } from "../comun";
import { BotonEliminarEscenario, CrearEscenario } from "../formularios";

export const metadata = { title: "Escenarios · Planificación" };
export const dynamic = "force-dynamic";

const TITULO = "Escenarios";
const MESES_RESUMEN = 12;

function describir(tipo: TipoEscenario, p: ParametrosEscenario, nombres: Record<string, string>): string {
  const donde = p.unidadId ? (nombres[p.unidadId] ?? "una tienda") : "todas las tiendas";
  const desde = `desde ${mesCorto(p.desde)}`;
  if (tipo === "pauta") return `Pauta ${p.cambio > 0 ? "+" : ""}${p.cambio} pts en ${donde}${p.respuesta ? `, pedidos ${porcentaje(p.cambio * p.respuesta, { conSigno: true })}` : ""} · ${desde}`;
  if (tipo === "precio") return `Precio ${porcentaje(p.cambio, { conSigno: true })} en ${donde}${p.respuesta ? `, elasticidad ${p.respuesta}` : ""} · ${desde}`;
  if (tipo === "entrega") return `Tasa de entrega ${p.cambio > 0 ? "+" : ""}${p.cambio} pts en ${donde} · ${desde}`;
  return `${p.nombre || "Nueva"}: ${entero(p.pedidos)} pedidos, ${porcentaje(p.crecimiento, { conSigno: true })} por mes, fijos ${dinero(p.fijos)}, inversión ${dinero(p.inversion)} · ${desde}`;
}

export default async function EscenariosPage() {
  const { base, puedeEscribir } = await contextoPlan();
  if ("error" in base) return <SinDatosPlan pagina={TITULO} titulo="No se pudo leer la planificación">{base.error}</SinDatosPlan>;
  if (!base.veTodo) return <SinDatosPlan pagina={TITULO} titulo="Los escenarios son de toda la empresa" />;
  if (base.sinHistoria) return <SinDatosPlan pagina={TITULO} titulo="Falta la historia de ventas por tienda">{base.sinHistoria}</SinDatosPlan>;
  const entrada = entradaDesdeBase(base, MESES_CONTINUO);
  if (!entrada) return <SinDatosPlan pagina={TITULO} titulo="Sin balance de apertura">{base.avisos.join(" ")}</SinDatosPlan>;
  const escenarios = await cargarEscenarios(createServiceClient());
  const referencia = motoresPromedio(base.tiendas.map((t) => t.motores));
  const nombres = Object.fromEntries(base.tiendas.map((t) => [t.id, t.nombre]));
  const planBase = proyectarPlan(entrada);
  const lista = [
    { id: "base", nombre: "Base", texto: "Los motores vigentes", plan: planBase },
    ...(escenarios ?? []).map((e) => ({ id: e.id, nombre: e.nombre, texto: describir(e.tipo, e.parametros, nombres), plan: proyectarPlan(entrada, escenarioDe(e.tipo, e.parametros, referencia)) })),
  ];
  const resumenes = lista.map((x) => ({ ...x, r: resumirPlan(x.plan.consolidado, base.multiplo, MESES_RESUMEN) }));
  const rb = resumenes[0].r;
  const meses = entrada.meses;

  const filas: { etiqueta: string; v: (r: ResumenPlan) => string; d?: (r: ResumenPlan) => number }[] = [
    { etiqueta: "Ventas (12 meses)", v: (r) => dinero(r.ventas), d: (r) => r.ventas - rb.ventas },
    { etiqueta: "Ingresos netos (12 meses)", v: (r) => dinero(r.ingresos), d: (r) => r.ingresos - rb.ingresos },
    { etiqueta: "EBITDA (12 meses)", v: (r) => dinero(r.ebitda), d: (r) => r.ebitda - rb.ebitda },
    { etiqueta: "Utilidad neta (12 meses)", v: (r) => dinero(r.utilidad), d: (r) => r.utilidad - rb.utilidad },
    { etiqueta: "Caja mínima", v: (r) => `${dinero(r.cajaMinima)}${r.mesCajaMinima ? ` · ${mesCorto(r.mesCajaMinima)}` : ""}`, d: (r) => r.cajaMinima - rb.cajaMinima },
    { etiqueta: "Caja al mes 12", v: (r) => dinero(r.cajaFinal), d: (r) => r.cajaFinal - rb.cajaFinal },
    { etiqueta: "Deuda máxima", v: (r) => dinero(r.deudaMaxima), d: (r) => -(r.deudaMaxima - rb.deudaMaxima) },
    { etiqueta: "De ella, deuda de cobertura", v: (r) => dinero(r.deudaCoberturaMaxima), d: (r) => -(r.deudaCoberturaMaxima - rb.deudaCoberturaMaxima) },
    { etiqueta: `Valor de empresa (${base.multiplo}× EBITDA)`, v: (r) => dinero(r.valorEmpresa), d: (r) => r.valorEmpresa - rb.valorEmpresa },
  ];
  const curvas: EscenarioAF4[] = resumenes.slice(0, 5).map((x, i) => ({ clave: x.id, nombre: x.nombre, valores: x.plan.consolidado.map((m) => m.caja), color: ((i % 5) + 1) as EscenarioAF4["color"], trazo: i === 0 ? "continuo" : i % 2 ? "rayas" : "puntos" }));
  const opcionesMes = meses.map((m) => ({ valor: m.slice(0, 7), etiqueta: mesCorto(m) }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        datosHasta={base.corte}
        acciones={puedeEscribir && escenarios !== null ? <CrearEscenario tiendas={base.tiendas.map((t) => ({ id: t.id, nombre: t.nombre }))} meses={opcionesMes} referencia={{ ticket: referencia.ticket }} /> : undefined}
        imprimir
      />
      <AvisosPlan avisos={[...base.avisos, ...(escenarios === null ? ["Falta correr la migración 0944 (planificación): los escenarios no se pueden guardar."] : [])]} />

      <MarcoAF4 id="titulo-comparacion" titulo="Lado a lado contra la base" detalle={`${mesCorto(meses[0])} – ${mesCorto(sumarMeses(meses[0], MESES_RESUMEN - 1))} · USD`} sinRelleno>
        <DesplazableX ariaLabel="Comparación de escenarios" className="rounded-b-xl">
          <table className="tabla-datos w-full text-[13px]">
            <caption className="sr-only">Cada escenario contra la base: EBITDA, caja mínima, deuda y valor de empresa, con la diferencia</caption>
            <thead>
              <tr className={claseFilaEncabezado}>
                <th scope="col" className={`${claseEncabezadoColumna} text-left`}>
                  Indicador
                </th>
                {resumenes.map((x) => (
                  <th key={x.id} scope="col" className={`${claseEncabezadoColumna} min-w-40 text-right`}>
                    {x.nombre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={f.etiqueta} className={CLASE_FILA_AF4.seccion}>
                  <th scope="row" className={`${claseCeldaAF4} text-left font-medium`}>
                    {f.etiqueta}
                  </th>
                  {resumenes.map((x, i) => {
                    const d = f.d && i > 0 ? f.d(x.r) : null;
                    return (
                      <td key={x.id} className={claseNumeroAF4}>
                        <span className="font-medium">{f.v(x.r)}</span>
                        {d !== null && Math.abs(d) >= 0.5 && (
                          <span className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${d > 0 ? "bg-success" : "bg-destructive"}`} />
                            {dinero(Math.abs(d), "USD")} {d > 0 ? "mejor" : "peor"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </DesplazableX>
      </MarcoAF4>

      <GraficaEscenariosAF4
        id="titulo-caja-escenarios"
        titulo="Caja por escenario"
        detalle={`${MESES_CONTINUO} meses · USD`}
        etiquetas={meses.map(mesCorto)}
        escenarios={curvas}
        activo="base"
        minimo={base.supuestos.cajaMinima}
        referencias={base.supuestos.cajaMinima > 0 ? [{ valor: base.supuestos.cajaMinima, etiqueta: "Caja mínima", tipo: "limite" }] : []}
        etiquetaEje="Mes"
      />

      <MarcoAF4 id="titulo-lista-escenarios" titulo="Escenarios guardados" detalle={`${(escenarios ?? []).length}`} sinRelleno>
        {!escenarios?.length ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Sin escenarios guardados.</p>
        ) : (
          <ul className="divide-y divide-border">
            {resumenes.slice(1).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{x.nombre}</span>
                  <span className="block text-muted-foreground">{x.texto}</span>
                </span>
                {puedeEscribir && <BotonEliminarEscenario id={x.id} />}
              </li>
            ))}
          </ul>
        )}
      </MarcoAF4>
    </Pagina>
  );
}
