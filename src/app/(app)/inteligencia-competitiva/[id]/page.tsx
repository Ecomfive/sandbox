import { Pagina } from "@/components/ui/pagina";
import { notFound } from "next/navigation";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModulo } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { claseCeldaColumna, claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { fechaHaceMeses, snapshotMasCercano } from "@/lib/inteligencia/agregados";
import { formatearFecha } from "@/lib/formato";
import { EstadoVacio } from "@/components/ui/estado-vacio";

export const metadata = { title: "Detalle de proveedor" };

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

  const [{ data: proveedor }, { data: historial }] = await Promise.all([
    supabase
      .from("proveedores_competencia")
      .select("id, nombre, tienda, ciudad, categorias, primera_vez_visto")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("snapshots_proveedor_competencia")
      .select("fecha, productos_count")
      .eq("proveedor_id", id)
      .order("fecha", { ascending: false }),
  ]);

  if (!proveedor) notFound();

  const snapshots = historial ?? [];
  const actual = snapshots[0] ?? null;

  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <div>
        <EtiquetaMiga texto={proveedor.tienda || proveedor.nombre} />
        <h1 className="text-xl font-semibold tracking-tight">{proveedor.tienda || proveedor.nombre}</h1>
        {proveedor.tienda && <p className="text-sm text-muted-foreground">{proveedor.nombre}</p>}
        <p className="mt-1 text-sm text-muted-foreground">
          {proveedor.ciudad ?? "Ciudad desconocida"} · {proveedor.categorias.join(", ") || "Sin categorías"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Detectado por primera vez el {formatearFecha(proveedor.primera_vez_visto)}.
        </p>
      </div>

      {!actual ? (
        <EstadoVacio mensaje="Todavía no hay rastreos registrados para este proveedor." />
      ) : (
        <>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-medium">Productos actuales</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{actual.productos_count}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Última carga: {formatearFecha(actual.fecha)}</p>
          </div>

          <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr className={claseFilaEncabezado}>
                  <th className={claseEncabezadoColumna}>Período</th>
                  <th className={claseEncabezadoColumna}>Productos hace ese tiempo</th>
                  <th className={claseEncabezadoColumna}>Cambio en productos</th>
                </tr>
              </thead>
              <tbody>
                {PERIODOS.map(({ etiqueta, meses }) => {
                  const objetivo = fechaHaceMeses(meses);
                  const pasado = snapshotMasCercano(snapshots, objetivo);
                  const cambio = pasado ? actual.productos_count - pasado.productos_count : null;
                  return (
                    <tr key={etiqueta} className="border-b border-border/60 last:border-0">
                      <td className={`${claseCeldaColumna} font-medium`}>{etiqueta}</td>
                      <td className={`${claseCeldaColumna} tabular-nums text-muted-foreground`}>
                        {pasado ? `${pasado.productos_count} (${formatearFecha(pasado.fecha)})` : "Sin dato"}
                      </td>
                      <td className={claseCeldaColumna}>
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

          <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full min-w-[20rem] border-collapse text-sm">
              <thead>
                <tr className={claseFilaEncabezado}>
                  <th className={claseEncabezadoColumna}>Fecha</th>
                  <th className={claseEncabezadoColumna}>Productos</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.fecha} className="border-b border-border/60 last:border-0">
                    <td className={claseCeldaColumna}>{formatearFecha(s.fecha)}</td>
                    <td className={`${claseCeldaColumna} tabular-nums`}>{s.productos_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Pagina>
  );
}
