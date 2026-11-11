import { notFound } from "next/navigation";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { fechaHora, mesLargo, mesMedio } from "@/lib/af4/fecha";
import { requireModulo } from "@/lib/auth";
import { leerSnapshot } from "@/lib/finanzas/cargar-paquete-bancario";
import { createServiceClient } from "@/lib/supabase/server";
import { TextoManual } from "../../../../ayuda/manuales/texto-manual";
import { EstiloPaquete, leerPapel } from "../../estilo-paquete";
import { puedeVerPaquete } from "../../parametros";
import { VistaPaquete } from "../../vista-paquete";

export const metadata = { title: "Versión del paquete bancario" };

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Una versión guardada del paquete bancario, tal como era el día que se guardó. */
export default async function VersionPaquetePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ papel?: string }> }) {
  await requireModulo("panel-financiero");
  const { id } = await params;
  if (!UUID.test(id) || !(await puedeVerPaquete())) notFound();
  const { data, error } = await createServiceClient().from("fin_paquetes_bancarios").select("id, contenido, creado_por_nombre, creado_en").eq("id", id).maybeSingle();
  if (error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Versión" oculto />
        <EstadoVacioAF4 titulo="Las versiones del paquete todavía no están instaladas">Falta correr la migración 0940 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  if (!data) notFound();
  const s = leerSnapshot(data.contenido);
  if (!s) notFound();
  const papel = leerPapel((await searchParams).papel);
  const etiqueta = `Cierre de ${mesMedio(s.corte)} · ${s.entidad === "consolidado" ? "Consolidado" : s.entidad}`;
  return (
    <Pagina ancho="ancha" className="paquete-bancario flex flex-col gap-6">
      <EtiquetaMiga texto={etiqueta} />
      <EstiloPaquete papel={papel} encabezado={`${s.empresa.nombre} · Paquete de información financiera`} pie={`Cierre de ${mesLargo(s.corte)} · ${s.alcance} · USD`} />
      <div data-sin-imprimir>
        <EncabezadoAF4
          titulo={etiqueta}
          datosHasta={s.corte}
          actualizado={data.creado_en as string}
          descarga={{ href: `/api/exportar-paquete-bancario?version=${id}` }}
          acciones={<span className="text-xs text-muted-foreground">Guardado {fechaHora(data.creado_en as string)}{data.creado_por_nombre ? ` · ${data.creado_por_nombre}` : ""}</span>}
        />
      </div>
      <VistaPaquete s={s} carta={s.carta ? <div className="rounded-xl border border-border bg-card p-4"><TextoManual texto={s.carta} /></div> : null} />
    </Pagina>
  );
}
