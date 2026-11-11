import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { TablaMetas } from "@/components/finanzas/metas-plan";
import { KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora, hoyPanama, leerPeriodo, mesCorto, mesLargo, sumarMeses } from "@/lib/af4/fecha";
import { requireModulo } from "@/lib/auth";
import { cargarMetasMes } from "@/lib/finanzas/cargar-planificacion";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { ETIQUETA_ESTADO_META, INDICADORES_META, estadoGeneral, type EstadoMeta } from "@/lib/finanzas/metas-plan";
import { createServiceClient } from "@/lib/supabase/server";
import { MODULO_PLAN } from "../comun";

export const metadata = { title: "Metas · Planificación" };
export const dynamic = "force-dynamic";

const TITULO = "Metas por tienda";
const TONO: Record<EstadoMeta, "success" | "warning" | "destructive" | "neutral"> = { cumple: "success", cerca: "warning", lejos: "destructive", sin_datos: "neutral" };

export default async function MetasPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo(MODULO_PLAN);
  const permitidas = await cargarTiendasPermitidas();
  const mesEnCurso = `${hoyPanama().slice(0, 7)}-01`;
  const opciones = Array.from({ length: 15 }, (_, i) => sumarMeses(mesEnCurso, -i));
  const pedido = leerPeriodo((await searchParams).mes);
  const mes = pedido && opciones.includes(pedido) ? pedido : sumarMeses(mesEnCurso, -1);
  const datos = await cargarMetasMes(createServiceClient(), permitidas, mes);
  const filtros = (
    <SelectorEnlace
      etiqueta="Elegir el mes"
      opciones={opciones.map((m) => ({ valor: m, etiqueta: m === mesEnCurso ? `${mesCorto(m)} (en curso)` : mesCorto(m), href: `/planificacion/metas?mes=${m.slice(0, 7)}` }))}
      elegido={mes}
    />
  );
  if ("error" in datos || "sinPlan" in datos)
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={TITULO} filtros={filtros} imprimir={false} />
        <EstadoVacioAF4 titulo={"error" in datos ? "Faltan las migraciones de planificación" : `Sin plan aprobado para ${datos.anio}`} accion={"error" in datos ? undefined : { href: `/planificacion/plan-anual?anio=${datos.anio}`, etiqueta: "Ir al plan anual" }}>
          {"error" in datos ? datos.error : null}
        </EstadoVacioAF4>
      </Pagina>
    );
  const conteo = (e: EstadoMeta) => datos.delMes.filter((f) => estadoGeneral(f) === e).length;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo={TITULO} filtros={filtros} datosHasta={mes} actualizado={datos.version.aprobadoEn} />
      <KpiGroup titulo={`${mesLargo(mes)} · plan «${datos.version.nombre}»${datos.version.aprobadoEn ? ` aprobado el ${fechaHora(datos.version.aprobadoEn)}` : ""}`}>
        <FilaKpiAF4>
          {INDICADORES_META.map((d) => (
            <KpiAF4
              key={d.clave}
              titulo={d.etiqueta}
              valor={ETIQUETA_ESTADO_META[datos.totalMes.estado[d.clave]]}
              tono={TONO[datos.totalMes.estado[d.clave]]}
              subtexto={`Acumulado: ${ETIQUETA_ESTADO_META[datos.totalAcumulado.estado[d.clave]].toLowerCase()}`}
            />
          ))}
          <KpiAF4 titulo="Tiendas en meta" valor={`${conteo("cumple")} de ${datos.delMes.length}`} tono={conteo("lejos") ? "destructive" : conteo("cerca") ? "warning" : "success"} subtexto={`${conteo("cerca")} cerca · ${conteo("lejos")} lejos`} />
        </FilaKpiAF4>
      </KpiGroup>
      <TablaMetas id="titulo-metas-mes" titulo={`Metas de ${mesCorto(mes)}`} detalle="Real · meta" filas={datos.delMes} total={datos.totalMes} nombres={datos.nombres} />
      <TablaMetas id="titulo-metas-acumulado" titulo={`Acumulado ${datos.anio} hasta ${mesCorto(mes)}`} detalle="Real · meta" filas={datos.acumulado} total={datos.totalAcumulado} nombres={datos.nombres} />
    </Pagina>
  );
}
