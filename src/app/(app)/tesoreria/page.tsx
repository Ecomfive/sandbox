import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import Link from "next/link";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { GraficaLineasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { AlertasTesoreriaAF4, PosicionCajaAF4 } from "@/components/finanzas/posicion-caja";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { diaMes, fechaCorta, hoyPanama } from "@/lib/af4/fecha";
import { dinero, dineroKpi } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarAlertasTesoreria, cargarPosicion, SIN_MIGRACION_TESORERIA } from "@/lib/finanzas/cargar-tesoreria";
import { saldoAl } from "@/lib/finanzas/deuda";
import { dias, serieDiaria, sumarDias } from "@/lib/finanzas/tesoreria";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "./aviso";

export const metadata = { title: "Tesorería" };

export const dynamic = "force-dynamic";

export default async function TesoreriaPage() {
  const usuario = await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const hoy = hoyPanama();
  const supabase = createServiceClient();
  const v = await cargarPosicion(supabase, hoy);
  const { alertas } = await cargarAlertasTesoreria(supabase, v);
  const partida = (c: string) => v.posicion.partidas.find((p) => p.clave === c);
  const bancos = partida("bancos");
  const efectivo = partida("repartidores");
  const efectivoViejo = (v.antiguedad ?? []).some((a) => a.alerta);
  const deudaTotal = v.deuda
    ? Math.round((v.deuda.prestamos.reduce((a, p) => a + saldoAl(p, hoy).saldo, 0) + v.deuda.lineas.reduce((a, l) => a + l.usado, 0)) * 100) / 100
    : null;
  const desde = sumarDias(hoy, -59);
  const serieDropi = serieDiaria(
    v.dropiSaldos.map((s) => ({ cuentaId: "dropi", fecha: s.fecha, saldo: s.monto, origen: "manual" as const })),
    desde,
    hoy,
  );
  const d = v.dropi;
  const puedeRetiro = usuario.modulos.includes("retiros") && !usuario.modulosSoloLectura.includes("retiros");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Tesorería" />
      {v.sinMigracion && <AvisoTesoreria>{SIN_MIGRACION_TESORERIA}</AvisoTesoreria>}

      <FilaKpiAF4>
        <KpiAF4 titulo="Posición de caja" destacado valor={dineroKpi(v.posicion.total)} subtexto={v.posicion.fechaMasVieja ? `Dato más viejo: ${diaMes(v.posicion.fechaMasVieja)}` : undefined} />
        <KpiAF4
          titulo="Bancos"
          tono={bancos && bancos.antiguedad !== null && bancos.antiguedad > v.config.saldoDias ? "warning" : "neutral"}
          valor={bancos ? dineroKpi(bancos.monto) : "—"}
          subtexto={bancos?.fecha ? `Al ${fechaCorta(bancos.fecha)}` : "Sin saldos"}
          href="/tesoreria/saldos"
        />
        <KpiAF4
          titulo="Efectivo en repartidores"
          tono={efectivoViejo ? "warning" : "neutral"}
          valor={efectivo ? dineroKpi(efectivo.monto) : "—"}
          subtexto={efectivoViejo ? `Con más de ${v.config.efectivoDias} días` : undefined}
          href="/tesoreria/repartidores"
        />
        <KpiAF4
          titulo="Wallet de Dropi"
          tono={d?.pedir ? "warning" : "neutral"}
          valor={d?.saldo !== null && d?.saldo !== undefined ? dineroKpi(d.saldo) : "—"}
          subtexto={d?.fechaSaldo ? `Al ${fechaCorta(d.fechaSaldo)}` : undefined}
          href="#dropi"
        />
        <KpiAF4 titulo="Deuda financiera" valor={deudaTotal === null ? "—" : dineroKpi(deudaTotal)} href="/tesoreria/deuda" />
      </FilaKpiAF4>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <PosicionCajaAF4 posicion={v.posicion} hoy={hoy} diasViejo={v.config.saldoDias} />
        <AlertasTesoreriaAF4 alertas={alertas} />
      </div>

      <div id="dropi" className="scroll-mt-24">
        {d ? (
          <div className="flex flex-col gap-3">
            <MarcoAF4
              id="seguimiento-dropi"
              titulo="Saldo en Dropi"
              detalle={`Retiro sugerido desde ${dinero(v.config.dropiUmbral)} o cada ${v.config.dropiDias} días`}
              accion={
                d.pedir && puedeRetiro ? (
                  <Link href="/retiros?nuevo=1" className={`${claseAccionAF4} ${anilloFoco}`}>
                    Pedir retiro
                  </Link>
                ) : undefined
              }
            >
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${d.pedir ? "bg-warning" : "bg-success"}`} />
                    {d.pedir ? "Conviene pedir un retiro" : "Sin retiro pendiente"}
                  </dt>
                  <dd className="mt-0.5 font-medium">
                    {d.motivos.includes("umbral") ? `Saldo sobre ${dinero(v.config.dropiUmbral)}` : d.motivos.includes("dias") ? "Pasaron los días" : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Último retiro pedido</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{d.ultimoRetiro ? `${fechaCorta(d.ultimoRetiro)} · hace ${d.diasDesdeRetiro} días` : "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Retiros en camino</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{d.abiertos ? `${d.abiertos} · ${dinero(d.enCamino)}` : "Ninguno"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Saldo registrado</dt>
                  <dd className="mt-0.5 font-medium tabular-nums">{d.fechaSaldo ? `hace ${d.diasDesdeSaldo} días` : "Sin registro"}</dd>
                </div>
              </dl>
            </MarcoAF4>
            {serieDropi.some((x) => x !== null) && (
              <GraficaLineasAF4
                id="grafica-dropi"
                titulo="Wallet de Dropi por día"
                detalle="USD · últimos 60 días"
                etiquetaEje="Día"
                alto={220}
                datos={dias(desde, hoy).map((f, i) => ({ etiqueta: diaMes(f), wallet: serieDropi[i] }))}
                series={[{ clave: "wallet", nombre: "Saldo de la wallet", color: 2 }]}
                referencias={[{ valor: v.config.dropiUmbral, etiqueta: "Umbral de retiro", tipo: "meta" }]}
              />
            )}
          </div>
        ) : (
          <AvisoTesoreria>Sin datos de Dropi en Panamá.</AvisoTesoreria>
        )}
      </div>
    </Pagina>
  );
}
