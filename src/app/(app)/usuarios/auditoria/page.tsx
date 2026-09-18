import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { linkClass } from "@/components/ui/link";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { formatearFechaHoraCompleta } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";

export const dynamic = "force-dynamic";

const ETIQUETA_ACCION: Record<string, string> = {
  actualizar_margen: "Actualizó margen",
  actualizar_margen_masivo: "Actualizó margen (en lote)",
  registrar_saldo: "Registró saldo de wallet",
  crear_retiro: "Creó un retiro",
  cerrar_retiro: "Cerró un retiro",
  cerrar_retiro_con_novedad: "Cerró un retiro con novedad",
  cancelar_retiro: "Canceló un retiro",
};

export default async function AuditoriaPage() {
  await requireModulo("usuarios");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data: eventos } = await supabase
    .from("historial_auditoria")
    .select("id, usuario_nombre, accion, entidad, entidad_id, detalle, creado_en")
    .order("creado_en", { ascending: false })
    .limit(200);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/usuarios" className={linkClass}>
          ← Usuarios y roles
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">Historial de auditoría</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quién modificó qué en operaciones sensibles — retiros, márgenes de productos y saldos de
          wallet. Los últimos 200 movimientos.
        </p>
      </div>

      <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[48rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="py-2 pr-3 pl-4 font-medium">Fecha</th>
              <th className="py-2 pr-3 font-medium">Usuario</th>
              <th className="py-2 pr-3 font-medium">Acción</th>
              <th className="py-2 pr-3 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {(eventos ?? []).map((e) => (
              <tr key={e.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 pl-4 whitespace-nowrap">
                  {formatearFechaHoraCompleta(e.creado_en, pais.codigo)}
                </td>
                <td className="py-2 pr-3 font-medium">{e.usuario_nombre ?? "—"}</td>
                <td className="py-2 pr-3">{ETIQUETA_ACCION[e.accion] ?? e.accion}</td>
                <td className="py-2 pr-3 text-muted-foreground">{e.detalle}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(eventos ?? []).length === 0 && (
          <EstadoVacio mensaje="Todavía no hay movimientos registrados en el historial de auditoría." />
        )}
      </div>
    </main>
  );
}
