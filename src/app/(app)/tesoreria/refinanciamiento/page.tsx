import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { Pagina } from "@/components/ui/pagina";
import { diaMes, fechaCorta, hoyPanama, mesCorto } from "@/lib/af4/fecha";
import { dinero, dineroKpi, porcentaje, veces } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarBaseCovenants, cargarBaseDeuda, cargarCajaDisponible, cargarCovenants, cargarOfertas, SIN_MIGRACION_0946 } from "@/lib/finanzas/cargar-deuda-avanzada";
import { SIN_MIGRACION_DEUDA } from "@/lib/finanzas/cargar-tesoreria";
import { defIndicador, ETIQUETA_ESTADO, TONO_ESTADO, valorIndicador } from "@/lib/finanzas/covenants";
import { evaluarCovenants, extraDeOferta, serieEscenario } from "@/lib/finanzas/escenarios-deuda";
import { efectoAcumuladoAl, ETIQUETA_ORIGEN, simularOferta } from "@/lib/finanzas/optimizar-deuda";
import { sumarDias } from "@/lib/finanzas/proyeccion-caja";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";
import { Punto, TablaSimple } from "../piezas-deuda";
import { TablaOfertas, type FilaOferta, type OpcionDeuda } from "./vista-ofertas";

export const metadata = { title: "Refinanciamiento" };

export const dynamic = "force-dynamic";

const d2 = (v: number) => dinero(v, "USD", { decimales: 2 });
const tasa = (t: number | null) => (t === null ? "—" : porcentaje(t * 100, { decimales: 1 }));
const fmt = (v: number | null, f: "veces" | "dinero") => (v === null ? "—" : f === "veces" ? veces(v, 2) : dinero(v));

export default async function RefinanciamientoPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const params = await searchParams;
  const hoy = hoyPanama();
  const supabase = createServiceClient();
  const [base, ofertasR, covenantsR, baseCov, caja] = await Promise.all([
    cargarBaseDeuda(supabase, hoy),
    cargarOfertas(supabase),
    cargarCovenants(supabase),
    cargarBaseCovenants(supabase, hoy),
    cargarCajaDisponible(supabase, hoy),
  ]);
  if (!base) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Refinanciamiento" imprimir={false} />
        <AvisoTesoreria>{SIN_MIGRACION_DEUDA}</AvisoTesoreria>
      </Pagina>
    );
  }
  const { instrumentos } = base;
  const puedeEscribir = !usuario.modulosSoloLectura.includes("tesoreria");
  const ofertas = ofertasR.ofertas;
  const elegida = ofertas.find((o) => o.id === params.oferta) ?? ofertas[0] ?? null;
  const sims = new Map(ofertas.map((o) => [o.id, simularOferta(o, instrumentos, hoy)]));
  const deudas: OpcionDeuda[] = instrumentos.map((i) => ({ ref: i.ref, nombre: i.nombre, tipo: ETIQUETA_ORIGEN[i.origen], saldo: i.saldo, tasaEfectivaAnual: i.tasaEfectivaAnual }));
  const filas: FilaOferta[] = ofertas.map((o) => ({ ...o, cuota: sims.get(o.id)!.cuota, ahorroAnual: sims.get(o.id)!.ahorroAnual, elegida: o.id === elegida?.id }));
  const sim = elegida ? sims.get(elegida.id)! : null;

  // Caja mínima de la proyección de 13 semanas con y sin la oferta.
  let cajaMinCon: number | null = null;
  if (sim && elegida && !("error" in caja)) {
    cajaMinCon = Math.min(...caja.semanas.map((s, k) => caja.cajaFinal[k] + efectoAcumuladoAl(instrumentos, sim.escenario, hoy, sumarDias(s, 6), { fecha: elegida.fechaDesembolso, monto: sim.excedente })));
  }

  // EBITDA e intereses (12 meses) y covenants con la oferta.
  const meses = "error" in baseCov ? [] : baseCov.meses;
  const ultimo = meses.at(-1) ?? null;
  const ebitda = ultimo?.insumos.ebitda ?? null;
  const serieCon = sim && elegida && meses.length ? serieEscenario(meses, instrumentos, sim.escenario, hoy, extraDeOferta(instrumentos, sim, elegida, hoy)) : [];
  const covenantsOferta = elegida ? covenantsR.covenants.filter((c) => c.ambito === "general" || (c.ambito === "oferta" && c.refId === elegida.id)) : [];
  // Los generales también se evalúan con la deuda de la oferta.
  const evaluados = elegida ? evaluarCovenants(covenantsOferta.map((c) => ({ ...c, ambito: "oferta" as const, refId: elegida.id })), meses, instrumentos, ofertas, hoy) : [];

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Refinanciamiento" />
      {ofertasR.sinMigracion && <AvisoTesoreria>{SIN_MIGRACION_0946}</AvisoTesoreria>}
      <TablaOfertas filas={filas} deudas={deudas} hoy={hoy} puedeEscribir={puedeEscribir && !ofertasR.sinMigracion} />
      {!elegida || !sim ? (
        <EstadoVacioAF4 titulo="Sin ofertas para simular" />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4
              titulo="Cuota mensual"
              destacado
              valor={dineroKpi(sim.cuota)}
              subtexto={sim.cuotaGracia !== null ? `${dinero(sim.cuotaGracia)} los ${elegida.graciaMeses} meses de gracia` : `${elegida.plazoMeses} meses`}
            />
            <KpiAF4 titulo="Ahorro anual de intereses" tono={sim.ahorroAnual > 0 ? "success" : "destructive"} valor={dineroKpi(sim.ahorroAnual)} subtexto={`Primer año ${dinero(sim.ahorroPrimerAnio)} (costos únicos ${dinero(sim.costoUnico)})`} />
            <KpiAF4 titulo="Costo efectivo anual" valor={tasa(sim.costoEfectivoAnual)} subtexto={`Hoy paga ${tasa(sim.tasaSustituida)} en lo que sustituye`} />
            <KpiAF4
              titulo="Caja mínima 13 semanas"
              tono={cajaMinCon !== null && !("error" in caja) && cajaMinCon < caja.cajaMinima ? "warning" : "neutral"}
              valor={cajaMinCon === null ? "—" : dineroKpi(cajaMinCon)}
              subtexto={"error" in caja ? undefined : `Sin la oferta ${dinero(caja.minimo)}`}
            />
          </FilaKpiAF4>

          <TablaSimple
            id="tabla-sustituye"
            titulo="Qué deudas sustituye"
            detalle={`${elegida.banco} · desembolso ${fechaCorta(elegida.fechaDesembolso)}${elegida.garantias ? ` · garantías: ${elegida.garantias}` : ""}`}
            columnas={[{ etiqueta: "Deuda" }, { etiqueta: "Tipo" }, { etiqueta: "Saldo", numero: true }, { etiqueta: "Tasa efectiva anual", numero: true }, { etiqueta: "Pagado con la oferta", numero: true }, { etiqueta: "Costo de prepago", numero: true }]}
            filas={sim.cubiertas.map((c) => ({
              clave: c.ref,
              celdas: [
                <Punto key="n" tono={c.cubierto >= c.saldo - 0.005 ? "success" : c.cubierto > 0 ? "warning" : "destructive"}>
                  {c.nombre}
                </Punto>,
                ETIQUETA_ORIGEN[c.origen],
                d2(c.saldo),
                tasa(c.tasaEfectivaAnual),
                d2(c.cubierto),
                d2(c.costoPrepago),
              ],
            }))}
            pie={[
              `Comisión de apertura ${d2(sim.comisionApertura)} · ${sim.excedente > 0 ? `a caja ${d2(sim.excedente)}` : sim.sinCubrir > 0 ? `sin cubrir ${d2(sim.sinCubrir)}` : "cubre todo"}`,
              "",
              d2(sim.cubiertas.reduce((a, c) => a + c.saldo, 0)),
              "",
              d2(sim.cubiertas.reduce((a, c) => a + c.cubierto, 0)),
              d2(sim.cubiertas.reduce((a, c) => a + c.costoPrepago, 0)),
            ]}
          />

          <TablaFinanciera
            id="efecto-caja-oferta"
            titulo="Efecto en caja mes a mes"
            columnas={sim.mensual.map((m) => ({ clave: m.mes, etiqueta: mesCorto(m.mes) }))}
            ariaLabel="Servicio de la deuda con y sin la oferta"
            filas={[
              { clave: "antes", etiqueta: "Servicio de la deuda hoy", tipo: "seccion", valores: sim.mensual.map((m) => m.antes) },
              { clave: "despues", etiqueta: "Servicio con la oferta", tipo: "seccion", valores: sim.mensual.map((m) => m.despues) },
              { clave: "unico", etiqueta: "Excedente del desembolso", tipo: "seccion", valores: sim.mensual.map((m) => -m.unico) },
              { clave: "efecto", etiqueta: "Efecto en caja", tipo: "subtotal", valores: sim.mensual.map((m) => m.efecto) },
              { clave: "acumulado", etiqueta: "Efecto acumulado", tipo: "saldo", valores: sim.mensual.map((m) => m.acumulado), total: null },
            ]}
          />

          <TablaSimple
            id="tabla-ebitda-oferta"
            titulo="EBITDA e intereses"
            detalle={ultimo ? `EBITDA de los 12 meses a ${mesCorto(ultimo.corte)}` : undefined}
            columnas={[{ etiqueta: "Concepto" }, { etiqueta: "Hoy", numero: true }, { etiqueta: "Con la oferta", numero: true }, { etiqueta: "Diferencia", numero: true }]}
            filas={[
              { clave: "ebitda", celdas: ["EBITDA 12 meses", dinero(ebitda), dinero(ebitda), dinero(0)] },
              { clave: "intereses", celdas: ["Intereses programados 12 meses", dinero(sim.interesesAntes12), dinero(sim.interesesDespues12), dinero(sim.interesesDespues12 - sim.interesesAntes12)] },
              {
                clave: "cobertura",
                celdas: [
                  "Cobertura de intereses",
                  ebitda !== null && sim.interesesAntes12 > 0 ? veces(ebitda / sim.interesesAntes12, 2) : "—",
                  ebitda !== null && sim.interesesDespues12 > 0 ? veces(ebitda / sim.interesesDespues12, 2) : "—",
                  "",
                ],
              },
              {
                clave: "despues-intereses",
                resaltar: true,
                celdas: ["EBITDA − intereses", dinero(ebitda === null ? null : ebitda - sim.interesesAntes12), dinero(ebitda === null ? null : ebitda - sim.interesesDespues12), dinero(sim.ahorroAnual)],
              },
            ]}
          />

          {"error" in baseCov ? (
            <AvisoTesoreria>Covenants sin calcular: {baseCov.error}</AvisoTesoreria>
          ) : (
            <TablaSimple
              id="tabla-covenants-oferta"
              titulo="Covenants con la oferta"
              detalle={serieCon.length ? `${mesCorto(serieCon[0].fecha)} – ${mesCorto(serieCon.at(-1)!.fecha)}` : undefined}
              columnas={[
                { etiqueta: "Covenant" },
                { etiqueta: "Último cierre", numero: true },
                ...serieCon.map((m) => ({ etiqueta: diaMes(m.fecha), numero: true })),
                { etiqueta: "Estado" },
              ]}
              filas={
                evaluados.length
                  ? evaluados.map((e) => {
                      const d = defIndicador(e.covenant.indicador);
                      return {
                        clave: e.covenant.id,
                        celdas: [
                          `${d.corto} ${d.sentido === "max" ? "≤" : "≥"} ${fmt(e.covenant.umbral, d.formato)}`,
                          fmt(ultimo ? valorIndicador(e.covenant.indicador, ultimo.valores) : null, d.formato),
                          ...e.serie.map((m) => fmt(m.valor, d.formato)),
                          <Punto key="e" tono={TONO_ESTADO[e.peor]}>
                            {ETIQUETA_ESTADO[e.peor]}
                          </Punto>,
                        ],
                      };
                    })
                  : [{ clave: "vacio", celdas: [<span key="v" className="text-muted-foreground">Sin covenants para esta oferta.</span>] }]
              }
            />
          )}
        </>
      )}
    </Pagina>
  );
}
