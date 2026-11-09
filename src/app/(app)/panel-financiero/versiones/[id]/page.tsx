import { notFound } from "next/navigation";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora, mesCorto, mesLargo } from "@/lib/af4/fecha";
import { dinero, dineroKpi, porcentaje } from "@/lib/af4/formato";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { esSnapshotInforme, esSnapshotSemanal, textoInforme, textoSemanal } from "@/lib/finanzas/informe-envio";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import { CopiarInforme } from "../../informe/copiar-informe";

export const metadata = { title: "Versión del informe" };

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Una versión guardada de un informe, tal como era cuando se generó o se envió. */
export default async function VersionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulo("panel-financiero");
  const { id } = await params;
  if (!UUID.test(id) || !veTodaLaEmpresa(await cargarTiendasPermitidas())) notFound();
  const { data, error } = await createServiceClient().from("fin_informes_versiones").select("id, tipo, periodo, motivo, contenido, creado_por_nombre, creado_en").eq("id", id).maybeSingle();
  if (error) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Versión" oculto />
        <EstadoVacioAF4 titulo="Las versiones todavía no están instaladas">Falta correr la migración 0937 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  if (!data) notFound();
  const quien = [data.motivo === "enviado" ? "Enviado" : "Guardado", fechaHora(data.creado_en as string), data.creado_por_nombre].filter(Boolean).join(" · ");
  const contenido = data.contenido as unknown;

  if (data.tipo === "semanal" && esSnapshotSemanal(contenido)) {
    const texto = textoSemanal(contenido);
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EtiquetaMiga texto={`Semana del ${contenido.semana}`} />
        <EncabezadoAF4 titulo={`Resumen semanal · ${contenido.semana}`} actualizado={data.creado_en as string} imprimir={false} acciones={<CopiarInforme texto={texto} />} />
        <MarcoAF4 id="version-semanal" titulo="Resumen" detalle={quien}>
          <pre className="m-0 whitespace-pre-wrap font-sans text-sm">{texto}</pre>
        </MarcoAF4>
      </Pagina>
    );
  }
  if (!esSnapshotInforme(contenido)) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Versión" oculto />
        <EstadoVacioAF4 titulo="Esta versión no se puede mostrar" />
      </Pagina>
    );
  }
  const s = contenido;
  const contra = mesCorto(s.anterior);
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EtiquetaMiga texto={`Informe de ${mesCorto(s.mes)}`} />
      <EncabezadoAF4 titulo={`Informe · ${mesLargo(s.mes)}`} datosHasta={s.mes} actualizado={data.creado_en as string} acciones={<CopiarInforme texto={textoInforme(s)} />} />
      <p className="m-0 text-sm text-muted-foreground">{quien}</p>
      <FilaKpiAF4>
        <KpiAF4 titulo="Ingresos netos" valor={dineroKpi(s.actual.ingresos)} comparaciones={[{ v: calcularVariacion(s.actual.ingresos, s.previo.ingresos), contra }]} />
        <KpiAF4 titulo="Margen bruto" valor={porcentaje(s.actual.margenBrutoPct)} subtexto={dinero(s.actual.margenBruto)} />
        <KpiAF4 titulo="EBITDA" destacado tono={s.actual.ebitda < 0 ? "destructive" : "neutral"} valor={dineroKpi(s.actual.ebitda)} comparaciones={[{ v: calcularVariacion(s.actual.ebitda, s.previo.ebitda), contra }]} />
        <KpiAF4 titulo="Resultado neto" tono={s.actual.resultadoNeto < 0 ? "destructive" : "neutral"} valor={dineroKpi(s.actual.resultadoNeto)} />
        <KpiAF4 titulo="Valor de empresa" valor={dineroKpi(s.implicancias.valorEmpresaMes)} subtexto={`${s.multiplo}× EBITDA anual`} />
      </FilaKpiAF4>
      {s.explicacion && (
        <MarcoAF4 id="version-explicacion" titulo="Explicación del mes">
          <p className="m-0 whitespace-pre-line text-sm text-pretty">{s.explicacion}</p>
        </MarcoAF4>
      )}
      <MarcoAF4 id="version-causas" titulo="Qué lo explica" detalle={`${mesCorto(s.mes)} vs ${contra} · USD`} sinRelleno>
        <ul className="m-0 list-none p-0">
          {s.causas.map((c) => (
            <li key={`${c.seccion}-${c.tipo}`} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
              <span>
                {c.tipo} <span className="text-muted-foreground">· {c.etiqueta}</span>
              </span>
              <span className="tabular-nums">
                {dinero(c.anterior)} → {dinero(c.actual)} <span className={c.impacto < 0 ? "text-destructive" : ""}>({dinero(c.impacto, "USD", { conSigno: true })})</span>
              </span>
            </li>
          ))}
          {!s.causas.length && <li className="px-4 py-2 text-sm text-muted-foreground">Ninguna línea cambió.</li>}
        </ul>
      </MarcoAF4>
      {s.tiendas.length > 0 && (
        <MarcoAF4 id="version-tiendas" titulo="EBITDA por tienda" sinRelleno>
          <ul className="m-0 list-none p-0">
            {s.tiendas.map((t) => (
              <li key={t.nombre} className="flex justify-between gap-3 border-b border-border px-4 py-2 text-sm last:border-b-0">
                <span>{t.nombre}</span>
                <span className={`tabular-nums ${t.ebitda < 0 ? "text-destructive" : ""}`}>{dinero(t.ebitda)}</span>
              </li>
            ))}
          </ul>
        </MarcoAF4>
      )}
      <MarcoAF4 id="version-acciones" titulo="Qué hacer" sinRelleno>
        <ol className="m-0 list-none p-0">
          {(s.acciones.length ? s.acciones : [{ clave: "nada", texto: "Sin alertas este mes.", prioridad: 3 as const }]).map((a) => (
            <li key={a.clave} className="border-b border-border px-4 py-2 text-sm last:border-b-0">
              {a.texto}
            </li>
          ))}
        </ol>
      </MarcoAF4>
    </Pagina>
  );
}
