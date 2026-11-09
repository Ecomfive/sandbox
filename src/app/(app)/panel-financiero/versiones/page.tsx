import Link from "next/link";
import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora, mesLargo } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Versiones de los informes" };

export const dynamic = "force-dynamic";

interface Version {
  id: string;
  tipo: "mensual" | "semanal";
  periodo: string;
  motivo: "generado" | "enviado";
  creado_por_nombre: string | null;
  creado_en: string;
}

export default async function VersionesPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireModulo("panel-financiero");
  if (!veTodaLaEmpresa(await cargarTiendasPermitidas())) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Versiones" oculto />
        <EstadoVacioAF4 titulo="Los informes son de toda la empresa" />
      </Pagina>
    );
  }
  const { tipo: tipoPedido } = await searchParams;
  const tipo = tipoPedido === "semanal" ? "semanal" : "mensual";
  const { data, error } = await createServiceClient()
    .from("fin_informes_versiones")
    .select("id, tipo, periodo, motivo, creado_por_nombre, creado_en")
    .eq("tipo", tipo)
    .order("creado_en", { ascending: false })
    .limit(200);
  if (error) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Versiones" oculto />
        <EstadoVacioAF4 titulo="Las versiones todavía no están instaladas">Falta correr la migración 0937 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const lista = (data ?? []) as Version[];
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Versiones"
        filtros={
          <ControlSegmentado
            etiqueta="Tipo de informe"
            opciones={[
              { valor: "mensual", etiqueta: "Informe mensual", href: "/panel-financiero/versiones" },
              { valor: "semanal", etiqueta: "Resumen semanal", href: "/panel-financiero/versiones?tipo=semanal" },
            ]}
            elegido={tipo}
          />
        }
        actualizado={lista[0]?.creado_en ?? null}
        imprimir={false}
      />
      <MarcoAF4 id="versiones-lista" titulo={tipo === "mensual" ? "Informes mensuales" : "Resúmenes semanales"} detalle={entero(lista.length)} sinRelleno>
        {lista.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">Todavía no hay versiones guardadas.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {lista.map((v) => (
              <li key={v.id} className="border-b border-border last:border-b-0">
                <Link href={`/panel-financiero/versiones/${v.id}`} className={`flex flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-muted ${anilloFoco}`}>
                  <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${v.motivo === "enviado" ? "bg-success" : "bg-muted-foreground"}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{v.tipo === "mensual" ? mesLargo(String(v.periodo)) : `Semana del ${String(v.periodo).slice(0, 10)}`}</span>
                    <span className="block text-xs text-muted-foreground">
                      {v.motivo === "enviado" ? "Enviado" : "Guardado"} · {fechaHora(v.creado_en)}
                      {v.creado_por_nombre ? ` · ${v.creado_por_nombre}` : ""}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </MarcoAF4>
    </Pagina>
  );
}
