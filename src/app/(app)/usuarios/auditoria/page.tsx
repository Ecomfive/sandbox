import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { formatearFechaHoraCompleta } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { calcularCambios } from "@/lib/auditoria-cambios";
import type { FilaAuditoria } from "./def-auditoria";
import { TablaAuditoria } from "./tabla-auditoria";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  await requireModulo("usuarios");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: eventos } = await supabase
    .from("historial_auditoria")
    .select("id, usuario_nombre, accion, entidad, entidad_id, detalle, antes, despues, creado_en")
    .order("creado_en", { ascending: false })
    .limit(200);

  // La fecha con la zona horaria del país y los cambios (antes → después) se resuelven aquí, en el servidor.
  const filas: FilaAuditoria[] = (eventos ?? []).map((e) => ({
    id: e.id,
    creadoEn: e.creado_en,
    fechaTexto: formatearFechaHoraCompleta(e.creado_en, pais.codigo),
    usuario: e.usuario_nombre,
    accion: e.accion,
    cambios: calcularCambios(e.antes, e.despues),
    detalle: e.detalle,
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Historial de auditoría" oculto>
        Quién modificó qué en operaciones sensibles — retiros, márgenes de productos y saldos de
        wallet. Los últimos 200 movimientos.
      </EncabezadoPagina>

      <TablaAuditoria eventos={filas} />
    </Pagina>
  );
}
