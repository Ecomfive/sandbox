import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { claseCeldaAF4, claseNumeroAF4, CLASE_FILA_AF4 } from "@/components/af4/estilos-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { DesplazableX } from "@/components/ui/desplazable-x";
import { KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, mesCorto, sumarMeses } from "@/lib/af4/fecha";
import { dinero, entero, porcentaje } from "@/lib/af4/formato";
import { CAMPOS_MOTORES, proyectarTienda, type DefMotor } from "@/lib/finanzas/planificacion";
import { AvisosPlan, SinDatosPlan, contextoPlan } from "../comun";
import { EditarMotores, FormularioSupuestos } from "../formularios";

export const metadata = { title: "Motores · Planificación" };
export const dynamic = "force-dynamic";

const TITULO = "Motores";

const formatear = (d: DefMotor, v: number) => (d.unidad === "pedidos" ? entero(v) : d.unidad === "%" ? porcentaje(v) : dinero(v, "USD", { decimales: d.clave === "fijos" || d.clave === "ajusteLibro" ? 0 : 2 }));

export default async function MotoresPage() {
  const { base, puedeEscribir } = await contextoPlan();
  if ("error" in base) return <SinDatosPlan pagina={TITULO} titulo="No se pudo leer la planificación">{base.error}</SinDatosPlan>;
  if (base.sinHistoria) return <SinDatosPlan pagina={TITULO} titulo="Falta la historia de ventas por tienda">{base.sinHistoria}</SinDatosPlan>;
  const primero = sumarMeses(base.corte, 1);
  const filas = base.tiendas.map((t) => ({ t, mes: proyectarTienda(t.id, t.motores, [primero])[0] }));
  const total = filas.reduce((a, f) => ({ ventas: a.ventas + f.mes.ventas, ingresos: a.ingresos + f.mes.ingresos, contribucion: a.contribucion + f.mes.contribucion, ebitda: a.ebitda + f.mes.ebitda }), { ventas: 0, ingresos: 0, contribucion: 0, ebitda: 0 });
  const editadas = base.tiendas.filter((t) => Object.keys(t.editados).length).length;
  // El EBITDA real de las tiendas (EERR, promedio de los últimos 3 meses): de donde parte el primer mes proyectado.
  const ult3 = base.mesesHistoria.slice(-3);
  const realTiendas = base.tiendas.reduce((a, t) => a + ult3.reduce((b, m) => b + (base.ebitdaTienda[t.id]?.[m] ?? 0), 0) / 3, 0);
  const otrosLibro = base.tiendas.reduce((a, t) => a + t.motores.ajusteLibro, 0);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo={TITULO} datosHasta={base.corte} imprimir={false} />
      <AvisosPlan avisos={base.sinTablas ? ["Falta correr la migración 0944 (planificación): los motores no se pueden guardar."] : []} />

      <KpiGroup titulo={`Primer mes proyectado · ${mesCorto(primero)}`}>
        <FilaKpiAF4>
          <KpiAF4 titulo="Ventas" valor={dinero(total.ventas)} />
          <KpiAF4 titulo="Ingresos netos" valor={dinero(total.ingresos)} />
          <KpiAF4 titulo="Contribución de las tiendas" valor={dinero(total.contribucion)} subtexto={total.ingresos > 0 ? `${porcentaje((total.contribucion / total.ingresos) * 100)} de los ingresos` : undefined} />
          <KpiAF4 titulo="EBITDA de las tiendas" valor={dinero(total.ebitda)} tono={total.ebitda < 0 ? "destructive" : "neutral"} subtexto={`Real (EERR, promedio 3 meses) ${dinero(realTiendas)}`} />
          <KpiAF4 titulo="Otros del libro" valor={dinero(otrosLibro, "USD", { conSigno: true })} subtexto="EERR − órdenes, promedio 3 meses" />
          <KpiAF4 titulo="Tiendas con motores editados" valor={`${editadas} de ${base.tiendas.length}`} tono={editadas ? "warning" : "neutral"} />
        </FilaKpiAF4>
      </KpiGroup>

      <MarcoAF4 id="titulo-motores" titulo="Motores por tienda" detalle={`Últimos 3 meses hasta ${mesCorto(base.corte)} · el punto ámbar es un valor editado`} sinRelleno>
        <DesplazableX ariaLabel="Motores por tienda" className="rounded-b-xl">
          <table className="tabla-datos w-full text-[13px]">
            <caption className="sr-only">Los motores de cada tienda: el valor vigente y, si se editó, el que dice la historia</caption>
            <thead>
              <tr className={claseFilaEncabezado}>
                <th scope="col" className={`${claseEncabezadoColumna} text-left`}>
                  Tienda
                </th>
                {CAMPOS_MOTORES.map((d) => (
                  <th key={d.clave} scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                    {d.etiqueta}
                  </th>
                ))}
                <th scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                  EBITDA {mesCorto(primero)}
                </th>
                {puedeEscribir && !base.sinTablas && (
                  <th scope="col" className={`${claseEncabezadoColumna} text-right`}>
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filas.map(({ t, mes }) => (
                <tr key={t.id} className={CLASE_FILA_AF4.seccion}>
                  <th scope="row" className={`${claseCeldaAF4} text-left font-medium`}>
                    {t.nombre}
                    {t.editadoEn && <span className="block text-xs font-normal text-muted-foreground">Editado el {fechaCorta(t.editadoEn.slice(0, 10))}</span>}
                  </th>
                  {CAMPOS_MOTORES.map((d) => {
                    const editado = t.editados[d.clave] !== undefined;
                    return (
                      <td key={d.clave} className={claseNumeroAF4}>
                        <span className="flex items-center justify-end gap-1.5">
                          {editado && (
                            <>
                              <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                              <span className="sr-only">Editado.</span>
                            </>
                          )}
                          {formatear(d, t.motores[d.clave])}
                        </span>
                        {editado && <span className="block text-xs text-muted-foreground">Historia {formatear(d, t.motoresHistoria[d.clave])}</span>}
                      </td>
                    );
                  })}
                  <td className={`${claseNumeroAF4} font-semibold ${mes.ebitda < 0 ? "text-destructive" : ""}`}>{dinero(mes.ebitda)}</td>
                  {puedeEscribir && !base.sinTablas && (
                    <td className={`${claseCeldaAF4} text-right`}>
                      <EditarMotores unidadId={t.id} nombre={t.nombre} historia={t.motoresHistoria} editados={t.editados} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </DesplazableX>
      </MarcoAF4>

      {base.veTodo && (
        <MarcoAF4 id="titulo-supuestos" titulo="Supuestos del plan" detalle={base.supuestosEn ? `Guardados el ${fechaCorta(base.supuestosEn.slice(0, 10))}` : "Los de los datos"}>
          {puedeEscribir ? (
            <FormularioSupuestos datos={base.supuestosDatos} editados={base.supuestosEditados} />
          ) : (
            <p className="text-sm text-muted-foreground">Solo lectura.</p>
          )}
        </MarcoAF4>
      )}
    </Pagina>
  );
}
