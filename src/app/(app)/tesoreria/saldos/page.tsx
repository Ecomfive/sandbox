import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { GraficaLineasAF4 } from "@/components/af4/graficas-af4";
import { Pagina } from "@/components/ui/pagina";
import { diaMes, hoyPanama } from "@/lib/af4/fecha";
import { requireModulo } from "@/lib/auth";
import { cargarConfigTesoreria, cargarCuentas, cargarPuntosSaldo, SIN_MIGRACION_TESORERIA } from "@/lib/finanzas/cargar-tesoreria";
import { dias, diasEntre, esCuentaDeCaja, serieDiaria, sumarDias, ultimosSaldos } from "@/lib/finanzas/tesoreria";
import type { IndiceColor } from "@/lib/af4/grafica";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";
import { TablasSaldos, type FilaSaldoManual, type FilaUltimoSaldo } from "./tabla-saldos";

export const metadata = { title: "Saldos bancarios" };

export const dynamic = "force-dynamic";

const DIAS_SERIE = 90;
const MAX_SERIES = 5;

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function SaldosBancariosPage() {
  const usuario = await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const hoy = hoyPanama();
  const desde = sumarDias(hoy, -(DIAS_SERIE - 1));
  const supabase = createServiceClient();
  const [config, cuentas, saldos, manuales] = await Promise.all([
    cargarConfigTesoreria(supabase),
    cargarCuentas(supabase),
    cargarPuntosSaldo(supabase, desde),
    supabase.from("fin_saldos_bancarios").select("id, fecha, saldo, nota, fin_cuentas(nombre)").order("fecha", { ascending: false }).limit(500),
  ]);
  const deCaja = cuentas.filter(esCuentaDeCaja);
  const ultimos = ultimosSaldos(saldos.puntos);
  const filas: FilaUltimoSaldo[] = deCaja.map((c) => {
    const u = ultimos.get(c.id);
    const d = u ? Math.max(diasEntre(u.fecha, hoy), 0) : null;
    return { id: c.id, cuenta: c.nombre, clase: c.clase, saldo: u?.saldo ?? null, fecha: u?.fecha ?? null, origen: u?.origen ?? null, dias: d, viejo: d !== null && d > config.saldoDias };
  });
  // Las cuentas con más saldo van a la gráfica (hasta 5: una serie por color de la paleta).
  const enGrafica = deCaja
    .filter((c) => saldos.puntos.some((p) => p.cuentaId === c.id && p.fecha >= desde))
    .sort((a, b) => Math.abs(ultimos.get(b.id)?.saldo ?? 0) - Math.abs(ultimos.get(a.id)?.saldo ?? 0))
    .slice(0, MAX_SERIES);
  const series = enGrafica.map((c) => serieDiaria(saldos.puntos.filter((p) => p.cuentaId === c.id), desde, hoy));
  const listaDias = dias(desde, hoy);
  const datos = listaDias.map((f, i) => ({ etiqueta: diaMes(f), ...Object.fromEntries(enGrafica.map((c, k) => [c.id, series[k][i]])) }));
  const filasManuales: FilaSaldoManual[] | null = manuales.error
    ? null
    : (manuales.data ?? []).map((m) => ({
        id: String(m.id),
        cuenta: uno(m.fin_cuentas as Uno<{ nombre: string }>)?.nombre ?? "—",
        fecha: String(m.fecha).slice(0, 10),
        saldo: Number(m.saldo),
        nota: (m.nota as string | null) ?? "",
      }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Saldos bancarios" />
      {saldos.sinMigracion && <AvisoTesoreria>{SIN_MIGRACION_TESORERIA}</AvisoTesoreria>}
      {enGrafica.length > 0 && (
        <GraficaLineasAF4
          id="grafica-saldos"
          titulo="Saldo diario por cuenta"
          detalle={`Últimos ${DIAS_SERIE} días · extractos de Conciliación y carga manual`}
          etiquetaEje="Día"
          alto={280}
          datos={datos}
          series={enGrafica.map((c, k) => ({ clave: c.id, nombre: c.nombre, color: (k + 1) as IndiceColor }))}
        />
      )}
      <TablasSaldos
        ultimos={filas}
        manuales={filasManuales}
        cuentas={deCaja.map((c) => ({ id: c.id, nombre: c.nombre }))}
        hoy={hoy}
        puedeEscribir={!usuario.modulosSoloLectura.includes("tesoreria")}
      />
    </Pagina>
  );
}
