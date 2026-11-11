import type { ReactNode } from "react";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { PortadaInformeAF4, SeccionInformeAF4 } from "@/components/af4/informe-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { TablaComparacionAF4, type FilaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import type { Tono } from "@/components/ui/kpi-card";
import { diaMes, fechaCorta, fechaHora, mesCorto, mesLargo } from "@/lib/af4/fecha";
import { dias, dinero, dineroKpi, fraccion, porcentaje, veces } from "@/lib/af4/formato";
import { desdeEerr, desdeProyeccion, desdeTablaMensual } from "@/lib/af4/tabla-financiera";
import type { SnapshotPaquete } from "@/lib/finanzas/cargar-paquete-bancario";
import { TRAMOS } from "@/lib/finanzas/cxc-cxp";
import { etiquetaSeccion, type SeccionPaquete } from "@/lib/finanzas/paquete-bancario";
import { TextoManual } from "../../ayuda/manuales/texto-manual";

const tono = (v: number | null): Tono => (v !== null && v < 0 ? "destructive" : "neutral");
const textoVeces = (v: number | null, noSignificativo = false) => (noSignificativo ? "n. s." : veces(v));

/**
 * El paquete bancario a partir de su foto: portada (solo al imprimir), la marca «Cifras de gestión, no auditadas» y una
 * sección numerada por cada parte elegida, cada una en su hoja al imprimir (las de 12 meses, apaisadas). La carta llega
 * como `carta` (editable en la página, de solo lectura en una versión guardada).
 */
export function VistaPaquete({ s, carta }: { s: SnapshotPaquete; carta: ReactNode }) {
  const secciones = s.secciones;
  const numero = (c: SeccionPaquete) => secciones.indexOf(c) + 1;
  const columnasMes = s.meses.map((m) => ({ clave: m, etiqueta: mesCorto(m) }));
  const corte = mesLargo(s.corte);
  const v = s.indicadores?.valores;
  const vacio = (t: string) => <EstadoVacioAF4 compacto titulo={t} />;

  const filasIndicadores: FilaComparacionAF4[] = v
    ? [
        { clave: "ventas", etiqueta: "Ventas netas", celdas: [dinero(v.ventas), "Ingresos − devoluciones, 12 meses"] },
        { clave: "mb", etiqueta: "Margen bruto", celdas: [`${dinero(v.margenBruto)} · ${porcentaje(v.margenBrutoPct)}`, "(Ventas − costo de ventas) ÷ ventas"] },
        { clave: "ebitda", etiqueta: "EBITDA", peso: "subtotal", celdas: [`${dinero(v.ebitda)} · ${porcentaje(v.margenEbitdaPct)}`, "Margen bruto − administración − marketing"] },
        { clave: "crec", etiqueta: "Crecimiento de ventas", celdas: [porcentaje(v.crecimientoPct, { conSigno: true }), "Contra los 12 meses anteriores"] },
        { clave: "dso", etiqueta: "Días de calle (DSO)", celdas: [dias(v.dso), "Cuentas por cobrar ÷ ventas × días"] },
        { clave: "dio", etiqueta: "Días de inventario (DIO)", celdas: [dias(v.dio), "Inventario ÷ costo de ventas × días"] },
        { clave: "dpo", etiqueta: "Días de proveedores (DPO)", celdas: [dias(v.dpo), "Cuentas por pagar ÷ costo de ventas × días"] },
        { clave: "ccc", etiqueta: "Ciclo de caja", peso: "subtotal", celdas: [dias(v.cicloCaja), "DIO + DSO − DPO"] },
        { clave: "deuda", etiqueta: "Deuda financiera", celdas: [dinero(v.deudaFinanciera), "Préstamos y líneas de crédito al corte"] },
        { clave: "deuda-ebitda", etiqueta: "Deuda financiera / EBITDA", celdas: [textoVeces(v.deudaEbitda, v.deudaEbitdaNoSignificativa), "Deuda ÷ EBITDA de 12 meses"] },
        { clave: "deuda-neta", etiqueta: "Deuda neta / EBITDA", celdas: [textoVeces(v.deudaNetaEbitda, v.deudaEbitdaNoSignificativa), "(Deuda − caja) ÷ EBITDA"] },
        { clave: "cobertura", etiqueta: "Cobertura de intereses", celdas: [veces(v.coberturaIntereses), "EBITDA ÷ intereses de 12 meses"] },
        { clave: "liquidez", etiqueta: "Liquidez corriente", celdas: [veces(v.liquidezCorriente, 2), "Activo corriente ÷ pasivo corriente"] },
        { clave: "ct", etiqueta: "Capital de trabajo", peso: "total", celdas: [dinero(v.capitalTrabajo), "Activo corriente − pasivo corriente"] },
      ]
    : [];

  const filaCartera = (titulo: string, r: NonNullable<SnapshotPaquete["cartera"]>["cobrar"]): FilaComparacionAF4[] =>
    r
      ? [
          ...TRAMOS.map((t) => ({ clave: `${titulo}-${t.clave}`, etiqueta: t.etiqueta, celdas: [dinero(r.tramos[t.clave]), r.total > 0 ? fraccion(r.tramos[t.clave] / r.total) : "—"] })),
          { clave: `${titulo}-total`, etiqueta: "Total abierto", peso: "total" as const, celdas: [dinero(r.total), "100 %"] },
          { clave: `${titulo}-vencido`, etiqueta: "De ello, vencido", celdas: [dinero(r.vencido), r.total > 0 ? fraccion(r.vencido / r.total) : "—"] },
        ]
      : [];

  return (
    <>
      <PortadaInformeAF4
        titulo="Paquete de información financiera"
        periodo={`Cierre de ${corte}`}
        comparacion={`${s.empresa.nombre}${s.empresa.ruc ? ` · RUC ${s.empresa.ruc}` : ""} · ${s.alcance} · USD`}
        indice={secciones.map(etiquetaSeccion)}
        preparado={fechaCorta(s.generado.slice(0, 10))}
        datos={[{ etiqueta: "Cifras", valor: "De gestión, no auditadas" }]}
      />

      <p className="m-0 flex items-center gap-2 text-sm font-medium print:hidden">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
        Cifras de gestión, no auditadas · {s.alcance} · USD · generado {fechaHora(s.generado)}
      </p>

      {secciones.includes("resumen") && (
        <div className="paquete-seccion">
          <SeccionInformeAF4 id="paquete-resumen" numero={numero("resumen")} titulo={etiquetaSeccion("resumen")} detalle={`Cierre de ${corte}`}>
            <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-2 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-2">
              {[
                ["Empresa", s.empresa.nombre],
                ["RUC", s.empresa.ruc ?? "—"],
                ["Alcance", s.alcance],
                ["Fecha de corte", corte],
                ...(v
                  ? [
                      ["Ventas de 12 meses", dinero(v.ventas)],
                      ["EBITDA de 12 meses", `${dinero(v.ebitda)} · ${porcentaje(v.margenEbitdaPct)}`],
                    ]
                  : []),
              ].map(([k, val]) => (
                <div key={k} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="m-0 font-medium">{val}</dd>
                </div>
              ))}
            </dl>
            {carta}
          </SeccionInformeAF4>
        </div>
      )}

      {secciones.includes("indicadores") && (
        <div className="paquete-seccion">
          <SeccionInformeAF4 id="paquete-indicadores" numero={numero("indicadores")} titulo={etiquetaSeccion("indicadores")} detalle={`12 meses a ${mesCorto(s.corte)} · USD`}>
            {v ? (
              <>
                <div className="break-inside-avoid">
                  <FilaKpiAF4>
                    <KpiAF4 titulo="Ventas netas" valor={dineroKpi(v.ventas)} subtexto={v.crecimientoPct !== null ? `${porcentaje(v.crecimientoPct, { conSigno: true })} contra los 12 meses anteriores` : undefined} serie={s.indicadores!.serie.map((x) => x.ventas)} />
                    <KpiAF4 titulo="EBITDA" destacado tono={tono(v.ebitda)} valor={dineroKpi(v.ebitda)} subtexto={porcentaje(v.margenEbitdaPct)} serie={s.indicadores!.serie.map((x) => x.ebitda)} />
                    <KpiAF4 titulo="Deuda / EBITDA" tono={v.deudaEbitdaNoSignificativa ? "warning" : "neutral"} valor={textoVeces(v.deudaEbitda, v.deudaEbitdaNoSignificativa)} subtexto={dinero(v.deudaFinanciera)} />
                    <KpiAF4 titulo="Ciclo de caja" valor={dias(v.cicloCaja)} />
                    <KpiAF4 titulo="Liquidez corriente" valor={veces(v.liquidezCorriente, 2)} subtexto={dinero(v.capitalTrabajo)} />
                  </FilaKpiAF4>
                </div>
                <TablaComparacionAF4
                  id="paquete-tabla-indicadores"
                  titulo="Indicadores"
                  detalle={`${s.indicadores!.insumos.mesesConDatos} meses con datos`}
                  ariaLabel="Indicadores clave de 12 meses y cómo se calculan"
                  etiquetaConcepto="Indicador"
                  columnas={[
                    { clave: "valor", etiqueta: "Valor" },
                    { clave: "calculo", etiqueta: "Cálculo", numerica: false, atenuada: true },
                  ]}
                  filas={filasIndicadores}
                />
              </>
            ) : (
              vacio("Sin Estado de resultados para calcular los indicadores")
            )}
          </SeccionInformeAF4>
        </div>
      )}

      {secciones.includes("eerr") && (
        <div className="paquete-seccion paquete-ancho">
          <SeccionInformeAF4 id="paquete-eerr" numero={numero("eerr")} titulo={etiquetaSeccion("eerr")} detalle={`${mesCorto(s.meses[0])} – ${mesCorto(s.corte)} · USD`}>
            {s.eerr ? (
              <>
                <TablaFinanciera id="paquete-tabla-eerr" titulo="Últimos 12 meses" columnas={columnasMes} filas={desdeEerr(s.eerr.filas, s.eerr.meses)} ariaLabel="Estado de resultados de los últimos 12 meses" desplegado="todo" />
                {s.eerr.anual.length > 1 && (
                  <TablaComparacionAF4
                    id="paquete-tabla-anual"
                    titulo="Por año"
                    ariaLabel="Estado de resultados por año calendario"
                    columnas={s.eerr.anual.map((a) => ({ clave: a.anio, etiqueta: a.meses < 12 ? `${a.anio} (${a.meses} m)` : a.anio }))}
                    filas={[
                      { clave: "ing", etiqueta: "Ingresos netos", celdas: s.eerr.anual.map((a) => dinero(a.ingresos)) },
                      { clave: "mb", etiqueta: "Margen bruto", celdas: s.eerr.anual.map((a) => dinero(a.margenBruto)) },
                      { clave: "ebitda", etiqueta: "EBITDA", peso: "subtotal", celdas: s.eerr.anual.map((a) => dinero(a.ebitda)) },
                      { clave: "rn", etiqueta: "Resultado neto", peso: "total", celdas: s.eerr.anual.map((a) => dinero(a.resultadoNeto)) },
                    ]}
                  />
                )}
              </>
            ) : (
              vacio("Sin Estado de resultados")
            )}
          </SeccionInformeAF4>
        </div>
      )}

      {secciones.includes("balance") && (
        <div className="paquete-seccion">
          <SeccionInformeAF4 id="paquete-balance" numero={numero("balance")} titulo={etiquetaSeccion("balance")} detalle={`Cierre de ${mesCorto(s.corte)} y cortes anteriores · USD`}>
            {s.balance ? (
              <TablaFinanciera
                id="paquete-tabla-balance"
                titulo="Balance general"
                columnas={s.balance.cortes.map((c, i) => ({
                  clave: c,
                  etiqueta: mesCorto(c),
                  detalle: "cierre",
                  ...(Math.abs(s.balance!.diferencia[i]) >= 0.005 ? { marca: { tono: "destructive" as const, texto: "No cuadra" } } : {}),
                }))}
                filas={s.balance.filas}
                conTotal={false}
                ariaLabel="Balance general al cierre de cada corte"
                desplegado="todo"
              />
            ) : (
              vacio("Sin balance general")
            )}
          </SeccionInformeAF4>
        </div>
      )}

      {secciones.includes("flujo") && (
        <div className="paquete-seccion paquete-ancho">
          <SeccionInformeAF4 id="paquete-flujo" numero={numero("flujo")} titulo={etiquetaSeccion("flujo")} detalle={`${mesCorto(s.meses[0])} – ${mesCorto(s.corte)} · USD`}>
            {s.flujo ? (
              <TablaFinanciera
                id="paquete-tabla-flujo"
                titulo="Estado de flujo"
                columnas={columnasMes}
                filas={desdeTablaMensual(s.flujo.filas, s.flujo.meses, { saldos: ["caja-inicial"], totalFinal: "caja-final" })}
                ariaLabel="Flujo de caja de los últimos 12 meses"
                desplegado="todo"
              />
            ) : (
              vacio("Sin flujo de caja")
            )}
          </SeccionInformeAF4>
        </div>
      )}

      {secciones.includes("cartera") && (
        <div className="paquete-seccion">
          <SeccionInformeAF4 id="paquete-cartera" numero={numero("cartera")} titulo={etiquetaSeccion("cartera")} detalle={`Al cierre de ${mesCorto(s.corte)} · USD`}>
            {s.cartera && (s.cartera.cobrar || s.cartera.pagar) ? (
              <>
                {(
                  [
                    ["Por cobrar", s.cartera.cobrar, "cobrar"],
                    ["Por pagar", s.cartera.pagar, "pagar"],
                  ] as const
                ).map(([titulo, r, clave]) =>
                  r ? (
                    <div key={clave} className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <TablaComparacionAF4
                        id={`paquete-antiguedad-${clave}`}
                        titulo={`${titulo} · antigüedad`}
                        detalle={`${r.documentosAbiertos} documentos`}
                        ariaLabel={`Cuentas ${titulo.toLowerCase()} por antigüedad`}
                        etiquetaConcepto="Días"
                        columnas={[
                          { clave: "saldo", etiqueta: "Saldo" },
                          { clave: "parte", etiqueta: "%" },
                        ]}
                        filas={filaCartera(clave, r)}
                      />
                      <TablaComparacionAF4
                        id={`paquete-top-${clave}`}
                        titulo={clave === "cobrar" ? "Principales deudores" : "Principales acreedores"}
                        detalle={fraccion(r.parteTop)}
                        ariaLabel={`Concentración de las cuentas ${titulo.toLowerCase()}`}
                        etiquetaConcepto="Contraparte"
                        columnas={[
                          { clave: "saldo", etiqueta: "Saldo" },
                          { clave: "parte", etiqueta: "%" },
                        ]}
                        filas={r.top.map((c) => ({ clave: c.contraparte, etiqueta: c.contraparte, celdas: [dinero(c.saldo), fraccion(c.parte)] }))}
                      />
                    </div>
                  ) : null,
                )}
              </>
            ) : (
              vacio("Sin cuentas por cobrar ni por pagar")
            )}
          </SeccionInformeAF4>
        </div>
      )}

      {secciones.includes("deuda") && (
        <div className="paquete-seccion">
          <SeccionInformeAF4 id="paquete-deuda" numero={numero("deuda")} titulo={etiquetaSeccion("deuda")} detalle={`Al cierre de ${mesCorto(s.corte)} · USD`}>
            {s.deuda ? (
              <>
                <TablaComparacionAF4
                  id="paquete-tabla-prestamos"
                  titulo="Préstamos y financiamiento"
                  detalle={dinero(s.deuda.prestamos.reduce((a, p) => a + p.saldo, 0))}
                  ariaLabel="Préstamos vigentes con su saldo al corte"
                  etiquetaConcepto="Préstamo"
                  columnas={[
                    { clave: "acreedor", etiqueta: "Acreedor", numerica: false },
                    { clave: "clase", etiqueta: "Clase", numerica: false },
                    { clave: "monto", etiqueta: "Original", atenuada: true },
                    { clave: "tasa", etiqueta: "Tasa" },
                    { clave: "cuota", etiqueta: "Cuota" },
                    { clave: "saldo", etiqueta: "Saldo" },
                    { clave: "corriente", etiqueta: "Vence 12 m" },
                  ]}
                  filas={
                    s.deuda.prestamos.length
                      ? s.deuda.prestamos.map((p) => ({
                          clave: p.nombre,
                          etiqueta: p.nombre,
                          celdas: [p.acreedor ?? "—", p.clase, dinero(p.monto), fraccion(p.tasaAnual), `${dinero(p.cuota)} × ${p.plazoMeses}`, dinero(p.saldo), dinero(p.corriente)],
                        }))
                      : [{ clave: "sin", etiqueta: "Sin préstamos registrados", celdas: ["", "", "", "", "", "", ""] }]
                  }
                />
                <TablaComparacionAF4
                  id="paquete-tabla-lineas"
                  titulo="Líneas de crédito"
                  ariaLabel="Líneas de crédito con su uso"
                  etiquetaConcepto="Línea"
                  columnas={[
                    { clave: "banco", etiqueta: "Banco", numerica: false },
                    { clave: "cupo", etiqueta: "Cupo" },
                    { clave: "usado", etiqueta: "Usado" },
                    { clave: "tasa", etiqueta: "Tasa" },
                    { clave: "renovacion", etiqueta: "Renovación" },
                  ]}
                  filas={
                    s.deuda.lineas.length
                      ? s.deuda.lineas.map((l) => ({
                          clave: l.nombre,
                          etiqueta: l.nombre,
                          celdas: [l.banco ?? "—", dinero(l.cupo), dinero(l.usado), fraccion(l.tasaAnual), l.renovacion ? fechaCorta(l.renovacion) : "—"],
                        }))
                      : [{ clave: "sin", etiqueta: "Sin líneas de crédito", celdas: ["", "", "", "", ""] }]
                  }
                />
                <MarcoAF4 id="paquete-giros" titulo="Giros de financiamiento privado">
                  <p className="m-0 flex items-center gap-2 text-sm">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                    {s.deuda.prestamos.some((p) => p.clase === "Financiamiento") ? "Incluidos arriba como «Financiamiento»." : "Sin registro de giros en el portal."}
                  </p>
                </MarcoAF4>
              </>
            ) : (
              vacio("Sin detalle de deuda")
            )}
          </SeccionInformeAF4>
        </div>
      )}

      {secciones.includes("proyeccion") && (
        <div className="paquete-seccion paquete-ancho">
          <SeccionInformeAF4 id="paquete-proyeccion" numero={numero("proyeccion")} titulo={etiquetaSeccion("proyeccion")} detalle={s.proyeccion ? `13 semanas desde ${fechaCorta(s.proyeccion.desde)} · USD` : undefined}>
            {s.proyeccion ? (
              <>
                <TablaComparacionAF4
                  id="paquete-escenarios"
                  titulo="Escenarios"
                  ariaLabel="Caja al final y caja mínima de cada escenario"
                  etiquetaConcepto="Escenario"
                  columnas={[
                    { clave: "final", etiqueta: "Caja al final" },
                    { clave: "minima", etiqueta: "Caja mínima" },
                  ]}
                  filas={s.proyeccion.escenarios.map((e) => ({
                    clave: e.clave,
                    etiqueta: e.etiqueta,
                    celdas: [<span key="f" className={e.cajaFinal < 0 ? "text-destructive" : ""}>{dinero(e.cajaFinal)}</span>, <span key="m" className={e.cajaMinima < 0 ? "text-destructive" : ""}>{dinero(e.cajaMinima)}</span>],
                  }))}
                />
                <TablaFinanciera
                  id="paquete-tabla-proyeccion"
                  titulo="Escenario base"
                  columnas={s.proyeccion.semanas.map((w) => ({ clave: w, etiqueta: diaMes(w) }))}
                  filas={desdeProyeccion(s.proyeccion.filas)}
                  ariaLabel="Proyección de caja semanal, escenario base"
                  desplegado="nada"
                  textoDesplegar="detalle"
                />
                <TablaComparacionAF4
                  id="paquete-supuestos"
                  titulo="Supuestos"
                  ariaLabel="Supuestos de la proyección de caja"
                  etiquetaConcepto="Supuesto"
                  columnas={[{ clave: "valor", etiqueta: "Valor", numerica: false }]}
                  filas={s.proyeccion.supuestos.map((x) => ({ clave: x.etiqueta, etiqueta: x.etiqueta, celdas: [x.valor] }))}
                />
              </>
            ) : (
              vacio("Sin proyección de caja")
            )}
          </SeccionInformeAF4>
        </div>
      )}

      {secciones.includes("concentracion") && (
        <div className="paquete-seccion">
          <SeccionInformeAF4 id="paquete-concentracion" numero={numero("concentracion")} titulo={etiquetaSeccion("concentracion")} detalle={`12 meses a ${mesCorto(s.corte)} · USD`}>
            {s.concentracion && s.concentracion.filas.length ? (
              <TablaComparacionAF4
                id="paquete-tabla-concentracion"
                titulo="Ventas por tienda"
                detalle={`Primera ${fraccion(s.concentracion.primera)} · tres primeras ${fraccion(s.concentracion.tresPrimeras)} · HHI ${s.concentracion.hhi.toLocaleString("es-PA")}`}
                ariaLabel="Ventas de 12 meses por tienda y su participación"
                etiquetaConcepto="Tienda"
                columnas={[
                  { clave: "ventas", etiqueta: "Ventas" },
                  { clave: "parte", etiqueta: "%" },
                ]}
                filas={[
                  ...s.concentracion.filas.map((f) => ({ clave: f.nombre, etiqueta: f.nombre, celdas: [dinero(f.ventas), fraccion(f.parte)] })),
                  { clave: "total", etiqueta: "Total", peso: "total" as const, celdas: [dinero(s.concentracion.total), "100 %"] },
                ]}
              />
            ) : (
              vacio("Sin ventas por tienda")
            )}
          </SeccionInformeAF4>
        </div>
      )}

      {secciones.includes("notas") && (
        <div className="paquete-seccion">
          <SeccionInformeAF4 id="paquete-notas" numero={numero("notas")} titulo={etiquetaSeccion("notas")} detalle={`${mesCorto(s.meses[0])} – ${mesCorto(s.corte)}`}>
            {s.notas.length ? (
              s.notas.map((n) => (
                <MarcoAF4 key={n.periodo} id={`paquete-nota-${n.periodo}`} titulo={mesLargo(n.periodo)} className="break-inside-avoid">
                  <TextoManual texto={n.texto} />
                </MarcoAF4>
              ))
            ) : (
              vacio("Sin notas en estos meses")
            )}
          </SeccionInformeAF4>
        </div>
      )}

      <div className="paquete-seccion">
        <SeccionInformeAF4 id="paquete-limitaciones" numero={numero("limitaciones")} titulo={etiquetaSeccion("limitaciones")} detalle={`${s.limitaciones.length}`}>
          <ol className="m-0 list-none rounded-xl border border-border bg-card p-0">
            {s.limitaciones.map((l) => (
              <li key={l.clave} className="flex items-start gap-3 border-b border-border px-4 py-2.5 text-sm last:border-b-0">
                <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${l.severidad === "alta" ? "bg-destructive" : "bg-warning"}`} />
                <span className="min-w-0 text-pretty">
                  <span className="sr-only">{l.severidad === "alta" ? "Importante: " : "A completar: "}</span>
                  {l.texto}
                </span>
              </li>
            ))}
          </ol>
        </SeccionInformeAF4>
      </div>
    </>
  );
}
