import Link from "next/link";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { fechaHaceMeses, snapshotMasCercano } from "@/lib/inteligencia/agregados";
import { formatearFecha } from "@/lib/formato";

export const dynamic = "force-dynamic";

const PERIODOS = [
  { etiqueta: "Último mes", meses: 1 },
  { etiqueta: "Últimos 3 meses", meses: 3 },
  { etiqueta: "Últimos 6 meses", meses: 6 },
  { etiqueta: "Último año", meses: 12 },
];

export default async function DetalleProveedorCompetenciaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireModulo("inteligencia-competitiva");
  const { id } = await params;
  const supabase = createServiceClient();

  const { data: proveedor } = await supabase
    .from("proveedores_competencia")
    .select("id, nombre, tienda, ciudad, categorias, primera_vez_visto")
    .eq("id", id)
    .maybeSingle();

  if (!proveedor) notFound();

  const { data: historial } = await supabase
    .from("snapshots_proveedor_competencia")
    .select("fecha, productos_count")
    .eq("proveedor_id", id)
    .order("fecha", { ascending: false });

  const snapshots = historial ?? [];
  const actual = snapshots[0] ?? null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
      <div>
        <Link href="/inteligencia-competitiva" className="text-sm text-muted-foreground hover:underline">
          ← Inteligencia competitiva
        </Link>
        <h1 className="mt-2 text-lg font-semibold tracking-tight">{proveedor.tienda || proveedor.nombre}</h1>
        {proveedor.tienda && <p className="text-sm text-muted-foreground">{proveedor.nombre}</p>}
        <p className="mt-1 text-sm text-muted-foreground">
          {proveedor.ciudad ?? "Ciudad desconocida"} · {proveedor.categorias.join(", ") || "Sin categorías"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Detectado por primera vez el {formatearFecha(proveedor.primera_vez_visto)}.
        </p>
      </div>

      {!actual ? (
        <p className="text-sm text-muted-foreground">Todavía no hay rastreos registrados para este proveedor.</p>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm font-medium">Productos actuales</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{actual.productos_count}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Última carga: {formatearFecha(actual.fecha)}</p>
          </div>

          <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                  <th className="py-2 pr-3 pl-4 font-medium">Período</th>
                  <th className="py-2 pr-3 font-medium">Productos hace ese tiempo</th>
                  <th className="py-2 pr-3 font-medium">Cambio en productos</th>
                </tr>
              </thead>
              <tbody>
                {PERIODOS.map(({ etiqueta, meses }) => {
                  const objetivo = fechaHaceMeses(meses);
                  const pasado = snapshotMasCercano(snapshots, objetivo);
                  const cambio = pasado ? actual.productos_count - pasado.productos_count : null;
                  return (
                    <tr key={etiqueta} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 pl-4 font-medium">{etiqueta}</td>
                      <td className="py-2 pr-3 tabular-nums text-muted-foreground">
                        {pasado ? `${pasado.productos_count} (${formatearFecha(pasado.fecha)})` : "Sin dato"}
                      </td>
                      <td className="py-2 pr-3">
                        {cambio === null ? (
                          <span className="text-xs text-muted-foreground">Sin historial suficiente</span>
                        ) : cambio === 0 ? (
                          <Badge tone="neutral">Sin cambio</Badge>
                        ) : cambio > 0 ? (
                          <Badge tone="success">+{cambio}</Badge>
                        ) : (
                          <Badge tone="destructive">{cambio}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            Órdenes por proveedor: pendiente — Dropi no expone esa información en el directorio de
            proveedores; hay que revisar la ficha individual con la sesión de dropshipper activa.
          </p>

          <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[20rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-muted-foreground">
                  <th className="py-2 pr-3 pl-4 font-medium">Fecha</th>
                  <th className="py-2 pr-3 font-medium">Productos</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.fecha} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3 pl-4">{formatearFecha(s.fecha)}</td>
                    <td className="py-2 pr-3 tabular-nums">{s.productos_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
