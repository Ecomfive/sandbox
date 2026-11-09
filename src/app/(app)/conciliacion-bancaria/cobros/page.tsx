import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { inicioDeMes } from "@/lib/af4/fecha";
import { dineroKpi, entero, fraccion } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { ETIQUETA_FUENTE, cargarCobros, type Fuente } from "@/lib/conciliacion/cargar";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaLotes } from "./tabla-lotes";

export const metadata = { title: "Cobros" };

export const dynamic = "force-dynamic";

const FUENTES: Fuente[] = ["yappy", "mipos", "servientrega"];

export default async function CobrosPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("conciliacion-bancaria");
  const { fuente } = await searchParams;
  const elegida: Fuente = FUENTES.includes(fuente as Fuente) ? (fuente as Fuente) : "yappy";
  const datos = await cargarCobros(createServiceClient(), "2000-01-01", "2100-12-31");

  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Cobros" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudieron leer los cobros">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const lotes = datos.lotes.filter((l) => l.fuente === elegida).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const sum = (f: (l: (typeof lotes)[number]) => number) => lotes.reduce((a, l) => a + f(l), 0);
  const cobrado = sum((l) => l.bruto);
  const depositado = sum((l) => l.depositado);
  const comision = sum((l) => l.comision);
  const sinDepositar = sum((l) => (l.estado === "Sin depositar" ? l.bruto : 0));
  const lotesSin = lotes.filter((l) => l.estado !== "Depositado").length;
  const ultimo = lotes[0]?.fecha;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Cobros"
        filtros={
          <ControlSegmentado
            etiqueta="Elegir fuente de cobro"
            opciones={FUENTES.map((f) => ({ valor: f, etiqueta: ETIQUETA_FUENTE[f], href: `/conciliacion-bancaria/cobros?fuente=${f}` }))}
            elegido={elegida}
          />
        }
        datosHasta={ultimo ? inicioDeMes(ultimo) : null}
      />

      <FilaKpiAF4>
        <KpiAF4 titulo="Cobrado" destacado valor={dineroKpi(cobrado)} subtexto={`${entero(sum((l) => l.cobros))} cobros`} />
        <KpiAF4 titulo="Depositado" valor={dineroKpi(depositado)} subtexto={cobrado ? `${fraccion(depositado / cobrado, { decimales: 0 })} de lo cobrado` : undefined} />
        <KpiAF4 titulo="Comisiones" valor={dineroKpi(comision)} subtexto={cobrado ? `${fraccion(comision / cobrado, { decimales: 2 })} de lo cobrado` : undefined} />
        <KpiAF4
          titulo="Sin depositar"
          tono={sinDepositar > 0 ? "warning" : "success"}
          valor={dineroKpi(sinDepositar)}
          subtexto={`${entero(lotesSin)} ${lotesSin === 1 ? "lote sin cerrar" : "lotes sin cerrar"}`}
        />
      </FilaKpiAF4>

      <TablaLotes filas={lotes} />
    </Pagina>
  );
}
