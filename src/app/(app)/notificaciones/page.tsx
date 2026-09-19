import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { obtenerPendientesHoy } from "@/lib/pendientes-hoy";
import { NotificacionesIcon } from "@/lib/nav-icons";
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div className="flex items-center gap-3">
        <NotificacionesIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Centro de notificaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Lo que hay que corregir hoy, quién hizo qué en operaciones sensibles, y si las sesiones
            de Dropi siguen vivas — todo en un solo lugar.
          </p>
        </div>
      </div>

      <CentroNotificaciones
        pendientes={pendientes}
        eventos={eventos ?? []}
        sesionesDropi={sesionesDropi ?? []}
        codigoPais={pais.codigo}
      />
    </main>
  );
}
