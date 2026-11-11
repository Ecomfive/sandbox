import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { diaMes, hoyPanama } from "@/lib/af4/fecha";
import { dinero, dineroKpi } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarConfigTesoreria, cargarDeuda, SIN_MIGRACION_DEUDA } from "@/lib/finanzas/cargar-tesoreria";
import { cuotasEntre, estadoLinea, proximoVencimientoCiclo, saldoAl, saldoCicloAl, tablaAmortizacion, vencimientosCiclo } from "@/lib/finanzas/deuda";
import { SIN_MIGRACION_0946 } from "@/lib/finanzas/cargar-deuda-avanzada";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";
import { TablaCiclos, TablaLineas, TablaPrestamos, type FilaCiclo, type FilaLinea, type FilaPrestamo } from "./vista-deuda";

export const metadata = { title: "Deuda" };

export const dynamic = "force-dynamic";

const finDeMes = (f: string) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)), 0)).toISOString().slice(0, 10);

export default async function DeudaPage() {
  const usuario = await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const hoy = hoyPanama();
  const supabase = createServiceClient();
  const [config, deuda, tipos, cuentas] = await Promise.all([
    cargarConfigTesoreria(supabase),
    cargarDeuda(supabase),
    supabase.from("fin_tipos").select("id, nombre, signo").order("nombre"),
    supabase.from("fin_cuentas").select("id, nombre, activo").order("nombre"),
  ]);
  if (!deuda) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Deuda" imprimir={false} />
        <AvisoTesoreria>{SIN_MIGRACION_DEUDA}</AvisoTesoreria>
      </Pagina>
    );
  }
  const lineas: FilaLinea[] = deuda.lineas.map((l) => ({ ...l, estado: estadoLinea(l, hoy, config.lineaDias) }));
  const mes = { desde: `${hoy.slice(0, 7)}-01`, hasta: finDeMes(hoy) };
  let interesesCuotasMes = 0;
  let corriente = 0;
  let noCorriente = 0;
  let proxima: { fecha: string; cuota: number; nombre: string } | null = null;
  const prestamos: FilaPrestamo[] = deuda.prestamos.map((p) => {
    const tabla = tablaAmortizacion(p);
    const s = saldoAl(p, hoy, tabla);
    interesesCuotasMes += cuotasEntre(tabla, mes.desde, mes.hasta).reduce((a, c) => a + c.interes, 0);
    corriente += s.corriente;
    noCorriente += s.noCorriente;
    if (s.proxima && (!proxima || s.proxima.fecha < proxima.fecha)) proxima = { fecha: s.proxima.fecha, cuota: s.proxima.cuota, nombre: p.nombre };
    return { ...p, saldo: s.saldo, cuotasPagadas: s.cuotasPagadas, proxima: s.proxima ? { fecha: s.proxima.fecha, cuota: s.proxima.cuota } : null };
  });
  const ciclos: FilaCiclo[] = deuda.ciclos.map((c) => ({ ...c, saldo: saldoCicloAl(c, hoy), proximo: proximoVencimientoCiclo(c, hoy) }));
  const saldoCiclos = ciclos.reduce((a, c) => a + c.saldo, 0);
  const costoCiclosMes = deuda.ciclos.reduce((a, c) => a + vencimientosCiclo(c, mes.desde, mes.hasta).reduce((b, v) => b + v.interes, 0), 0);
  const usadoLineas = lineas.reduce((a, l) => a + l.usado, 0);
  const cupoLineas = lineas.reduce((a, l) => a + l.cupo, 0);
  const interesesLineas = lineas.reduce((a, l) => a + l.estado.interesesMes, 0);
  const total = corriente + noCorriente + usadoLineas + saldoCiclos;
  const conAlerta = lineas.filter((l) => l.estado.alertas.length > 0).length;
  const prox = proxima as { fecha: string; cuota: number; nombre: string } | null;
  const puedeEscribir = !usuario.modulosSoloLectura.includes("tesoreria");
  const opcionesCuentas = (cuentas.data ?? []).filter((c) => c.activo !== false).map((c) => ({ id: String(c.id), nombre: String(c.nombre) }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Deuda" />
      <FilaKpiAF4>
        <KpiAF4 titulo="Deuda financiera" destacado valor={dineroKpi(total)} subtexto={`Corriente ${dinero(corriente + usadoLineas + saldoCiclos)} · no corriente ${dinero(noCorriente)}`} />
        <KpiAF4 titulo="Líneas de crédito usadas" tono={conAlerta ? "warning" : "neutral"} valor={dineroKpi(usadoLineas)} subtexto={cupoLineas ? `Disponible ${dinero(cupoLineas - usadoLineas)}` : undefined} />
        <KpiAF4 titulo="Intereses del mes" valor={dineroKpi(interesesLineas + interesesCuotasMes + costoCiclosMes)} subtexto="Líneas, cuotas y ciclos" />
        <KpiAF4 titulo="Próxima cuota" valor={prox ? dineroKpi(prox.cuota) : "—"} subtexto={prox ? `${diaMes(prox.fecha)} · ${prox.nombre}` : undefined} />
      </FilaKpiAF4>
      <section aria-labelledby="titulo-lineas" className="flex flex-col gap-2">
        <h2 id="titulo-lineas" className="text-sm font-semibold">
          Líneas de crédito
        </h2>
        <TablaLineas filas={lineas} cuentas={opcionesCuentas} puedeEscribir={puedeEscribir} />
      </section>
      <section aria-labelledby="titulo-ciclos" className="flex flex-col gap-2">
        <h2 id="titulo-ciclos" className="text-sm font-semibold">
          Financiamientos por ciclo
        </h2>
        {deuda.sinMigracionCiclos ? <AvisoTesoreria>{SIN_MIGRACION_0946}</AvisoTesoreria> : <TablaCiclos filas={ciclos} cuentas={opcionesCuentas} hoy={hoy} puedeEscribir={puedeEscribir} />}
      </section>
      <section aria-labelledby="titulo-prestamos" className="flex flex-col gap-2">
        <h2 id="titulo-prestamos" className="text-sm font-semibold">
          Préstamos y financiamientos
        </h2>
        <TablaPrestamos
          filas={prestamos}
          tipos={(tipos.data ?? []).filter((t) => Number(t.signo) === -1).map((t) => ({ id: String(t.id), nombre: String(t.nombre) }))}
          cuentas={opcionesCuentas}
          hoy={hoy}
          puedeEscribir={puedeEscribir}
        />
      </section>
    </Pagina>
  );
}
