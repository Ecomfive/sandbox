import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { obtenerPendientesHoy } from "@/lib/pendientes-hoy";
import { CentroNotificaciones } from "./centro-notificaciones";

export const dynamic = "force-dynamic";

export default async function NotificacionesPage() {
  await requireModulo("notificaciones");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [pendientes, { data: eventos }, { data: sesionesDropi }] = await Promise.all([
    obtenerPendientesHoy(supabase, pais.id),
    supabase
      .from("historial_auditoria")
      .select("id, usuario_nombre, accion, entidad, entidad_id, detalle, antes, despues, creado_en")
      .order("creado_en", { ascending: false })
      .limit(200),
    supabase.from("dropi_sesiones").select("pais_codigo, tipo, renovada_en, ok, mensaje").order("pais_codigo"),
  ]);

  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Centro de notificaciones" oculto>
        Lo que hay que corregir hoy, quién hizo qué en operaciones sensibles, y si las sesiones
        de Dropi siguen vivas — todo en un solo lugar.
      </EncabezadoPagina>

      <CentroNotificaciones
        pendientes={pendientes}
        eventos={eventos ?? []}
        sesionesDropi={sesionesDropi ?? []}
        codigoPais={pais.codigo}
      />
    </Pagina>
  );
}
