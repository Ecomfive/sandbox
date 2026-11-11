import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4, type ComparacionKpi } from "@/components/af4/kpi-af4";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { mesCorto, mesEnCursoPanama } from "@/lib/af4/fecha";
import { dinero, dineroKpi, entero, porcentaje } from "@/lib/af4/formato";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { cargarLineas, cargarResumen, cargarSaldo, type ResumenMes } from "@/lib/conciliacion/cargar";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaLineas } from "./tabla-lineas";

export const metadata = { title: "Conciliación bancaria" };

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TITULO = "Conciliación bancaria";

/** % conciliado de un mes (sobre las líneas que no se ignoran); null sin líneas que conciliar. */
const pctConciliado = (r: ResumenMes | undefined): number | null => {
  const conciliables = (r?.lineas ?? 0) - (r?.ignoradas ?? 0);
  return conciliables > 0 ? (100 * (r?.conciliadas ?? 0)) / conciliables : null;
};

export default async function ConciliacionBancariaPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo("conciliacion-bancaria");
  const supabase = createServiceClient();
  const { cuenta, mes } = await searchParams;

  const datos = await cargarResumen(supabase);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={TITULO} imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer la conciliación">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const puedeEscribir = !usuario.modulosSoloLectura.includes("conciliacion-bancaria");
  if (!datos.cuentas.length) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={TITULO} imprimir={false} />
        <EstadoVacioAF4
          titulo="Todavía no hay extractos"
          accion={puedeEscribir ? { href: "/conciliacion-bancaria/importar", etiqueta: "Importar un extracto" } : undefined}
        />
      </Pagina>
    );
  }

  const cuentaId = typeof cuenta === "string" && UUID.test(cuenta) && datos.cuentas.some((c) => c.id === cuenta) ? cuenta : datos.cuentas[0].id;
  const meses = datos.resumen.filter((r) => r.cuentaId === cuentaId).map((r) => r.mes);
  // Sin pedir un mes, el último cerrado (el mes en curso está a medias; se elige igual y sale «parcial»).
  const enCurso = mesEnCursoPanama();
  const mesElegido = typeof mes === "string" && meses.includes(mes) ? mes : (meses.filter((m) => m < enCurso).at(-1) ?? meses[meses.length - 1]);
  const resumen = datos.resumen.find((r) => r.cuentaId === cuentaId && r.mes === mesElegido);
  const mesPrevio = meses[meses.indexOf(mesElegido) - 1];
  const previo = mesPrevio ? datos.resumen.find((r) => r.cuentaId === cuentaId && r.mes === mesPrevio) : undefined;

  const [lineas, saldo] = await Promise.all([cargarLineas(supabase, cuentaId, mesElegido), cargarSaldo(supabase, cuentaId, mesElegido, resumen)]);
  const filas = "error" in lineas ? [] : lineas;
  const conciliables = (resumen?.lineas ?? 0) - (resumen?.ignoradas ?? 0);
  // Con saldo inicial cargado (Flujo de caja › Saldos iniciales) se comparan saldos; sin él, lo que se movió en el mes.
  const diferencia = !saldo ? null : Math.round((saldo.conSaldoInicial ? saldo.banco - saldo.libro : saldo.netoBanco - saldo.netoLibro) * 100) / 100;
  const puedeCrear = puedeEscribir && usuario.modulos.includes("libro-movimientos") && !usuario.modulosSoloLectura.includes("libro-movimientos");
  const href = (c: string, m?: string) => `/conciliacion-bancaria?cuenta=${c}${m ? `&mes=${m}` : ""}`;

  const pct = pctConciliado(resumen);
  const pctPrevio = pctConciliado(previo);
  const contra = mesPrevio ? mesCorto(mesPrevio) : "";
  const compararPct: ComparacionKpi[] = pct !== null && pctPrevio !== null ? [{ v: calcularVariacion(pct, pctPrevio), contra, modo: "puntos" }] : [];
  const sinConciliar = resumen?.sinConciliar ?? 0;
  const compararSin: ComparacionKpi[] = previo ? [{ v: calcularVariacion(sinConciliar, previo.sinConciliar, "menos-es-mejor"), contra }] : [];
  const nombreCuenta = datos.cuentas.find((c) => c.id === cuentaId)?.nombre ?? "";

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        filtros={
          <>
            <ControlSegmentado
              etiqueta="Elegir cuenta"
              opciones={datos.cuentas.map((c) => ({ valor: c.id, etiqueta: c.nombre, href: href(c.id) }))}
              elegido={cuentaId}
              maxBotones={5}
            />
            <ControlSegmentado
              etiqueta="Elegir mes"
              opciones={meses.map((m) => ({ valor: m, etiqueta: m >= enCurso ? `${mesCorto(m)} · parcial` : mesCorto(m), href: href(cuentaId, m) }))}
              elegido={mesElegido}
              maxBotones={6}
            />
          </>
        }
        datosHasta={meses.at(-1) ?? null}
      />

      <FilaKpiAF4>
        <KpiAF4
          titulo="Conciliadas"
          destacado
          tono={conciliables && resumen?.conciliadas === conciliables ? "success" : "neutral"}
          valor={porcentaje(pct, { decimales: 0 })}
          comparaciones={compararPct}
          subtexto={`${entero(resumen?.conciliadas ?? 0)} de ${entero(conciliables)} líneas`}
        />
        <KpiAF4
          titulo="Monto sin conciliar"
          tono={sinConciliar > 0 ? "warning" : "success"}
          valor={dineroKpi(sinConciliar)}
          comparaciones={compararSin}
        />
        <KpiAF4
          titulo={saldo?.conSaldoInicial ? "Diferencia de saldo" : "Diferencia del mes"}
          tono={diferencia === null ? "neutral" : Math.abs(diferencia) < 0.01 ? "success" : "destructive"}
          valor={diferencia === null ? "—" : dinero(diferencia, "USD", { decimales: 2 })}
          subtexto={
            !saldo
              ? "Sin flujo de caja (migración 0904)"
              : saldo.conSaldoInicial
                ? `Banco ${dinero(saldo.banco)} · libro ${dinero(saldo.libro)}`
                : `En el mes: banco ${dinero(saldo.netoBanco)} · libro ${dinero(saldo.netoLibro)}`
          }
          href="/flujo-caja"
        />
        <KpiAF4
          titulo={`Movimiento de ${mesCorto(mesElegido)}`}
          valor={dineroKpi(resumen?.neto ?? 0)}
          subtexto={`${dinero(resumen?.creditos ?? 0)} entran · ${dinero(resumen?.debitos ?? 0)} salen`}
        />
      </FilaKpiAF4>

      <KpiGroup titulo={`${nombreCuenta} · ${mesCorto(mesElegido)} · USD`}>
        <KpiGrid compacta>
          <KpiCard compacta titulo="Líneas" valor={entero(resumen?.lineas ?? 0)} />
          <KpiCard compacta tono={(resumen?.sugeridas ?? 0) > 0 ? "info" : "neutral"} titulo="Sugeridas" valor={entero(resumen?.sugeridas ?? 0)} />
          <KpiCard
            compacta
            tono={(resumen?.pendientes ?? 0) > 0 ? "warning" : "neutral"}
            titulo="Pendientes"
            valor={entero(resumen?.pendientes ?? 0)}
            subtexto={resumen?.ignoradas ? `${entero(resumen.ignoradas)} ignoradas` : undefined}
          />
        </KpiGrid>
      </KpiGroup>

      {"error" in lineas ? (
        <EstadoVacioAF4 titulo="No se pudieron leer las líneas del extracto">{lineas.error}</EstadoVacioAF4>
      ) : (
        <TablaLineas filas={filas} cuentaId={cuentaId} mes={mesElegido} puedeEscribir={puedeEscribir} puedeCrear={puedeCrear} />
      )}
    </Pagina>
  );
}
