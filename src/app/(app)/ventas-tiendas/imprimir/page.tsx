import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { hoyPanama } from "@/lib/af4/fecha";
import { etiquetaFranja } from "@/lib/ventas/operacion";
import { BotonImprimir } from "./boton-imprimir";

export const metadata = { title: "Imprimir" };
export const dynamic = "force-dynamic";

type Fila = { id: string; numero: string; tienda: string; productos: string; cobrar: number | null; guia: string | null; metodo: string | null; franja: string | null; etiquetas: string[] };
const ORDEN_FRANJA: Record<string, number> = { manana: 0, tarde: 1, noche: 2 };
const UUID = /^[0-9a-f-]{36}$/i;

export default async function Imprimir({ searchParams }: { searchParams: Promise<{ mensajero?: string; orden?: string }> }) {
  await requireModulo("ventas-tiendas");
  const q = await searchParams;
  const db = createServiceClient();
  const permitidas = await cargarTiendasPermitidas();
  let consulta = db
    .from("ven_ordenes")
    .select("id, numero, unidad_id, total, metodo_pago, cod_esperado, guia, ven_orden_lineas(linea, producto, cantidad)")
    .limit(300);
  let titulo = "";
  if (q.orden && UUID.test(q.orden)) {
    consulta = consulta.eq("id", q.orden);
    titulo = "Etiqueta de la orden";
  } else if (q.mensajero && UUID.test(q.mensajero)) {
    consulta = consulta.eq("repartidor_id", q.mensajero).eq("fase", "despachada");
    const { data: m } = await db.from("del_repartidores").select("nombre").eq("id", q.mensajero).maybeSingle();
    titulo = `Hoja de ruta · ${m?.nombre ?? "mensajero"}`;
  } else {
    return <p className="p-6">Falta elegir una orden o un mensajero.</p>;
  }
  const [{ data }, { data: uni }] = await Promise.all([consulta, db.from("fin_unidades").select("id, nombre").eq("clase", "tienda")]);
  const nombre = new Map((uni ?? []).map((u) => [String(u.id), String(u.nombre)]));
  const filas: Fila[] = ((data ?? []) as Record<string, unknown>[])
    .filter((o) => permitidas === null || permitidas.includes(String(o.unidad_id)))
    .map((o) => {
      const l = ((o.ven_orden_lineas as { linea: number; producto: string; cantidad: number | string }[] | null) ?? []).sort((a, b) => a.linea - b.linea);
      return {
        id: String(o.id),
        numero: String(o.numero),
        tienda: nombre.get(String(o.unidad_id)) ?? "—",
        productos: l.map((x) => `${Number(x.cantidad)}× ${x.producto}`).join(" · "),
        cobrar: o.cod_esperado === null || o.cod_esperado === undefined ? null : Number(o.cod_esperado),
        guia: (o.guia as string | null) ?? null,
        metodo: (o.metodo_pago as string | null) ?? null,
        franja: null,
        etiquetas: [],
      };
    });
  // Mejora 54: franja y etiquetas (migración 0968; sin ella, nada). La hoja de ruta va de la mañana a la noche.
  if (filas.length) {
    const ef = await db.from("ven_ordenes").select("id, franja, etiquetas_equipo").in("id", filas.map((f) => f.id));
    if (!ef.error) {
      const por = new Map((ef.data ?? []).map((e) => [String(e.id), e]));
      for (const f of filas) {
        f.franja = (por.get(f.id)?.franja as string | null) ?? null;
        f.etiquetas = (por.get(f.id)?.etiquetas_equipo as string[] | null) ?? [];
      }
      filas.sort((a, b) => (ORDEN_FRANJA[a.franja ?? ""] ?? 3) - (ORDEN_FRANJA[b.franja ?? ""] ?? 3));
    }
  }
  const total = filas.reduce((s, f) => s + (f.cobrar ?? 0), 0);
  return (
    <main className="mx-auto max-w-3xl p-6 text-sm">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <h1 className="text-lg font-semibold">{titulo}</h1>
        <BotonImprimir />
      </div>
      <h2 className="mb-1 hidden text-lg font-semibold print:block">{titulo}</h2>
      <p className="mb-3 text-muted-foreground">{hoyPanama()} · {filas.length} {filas.length === 1 ? "orden" : "órdenes"}</p>
      {filas.length === 0 ? (
        <p>No hay órdenes para imprimir.</p>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-foreground text-left">
              <th className="py-1 pr-2">Orden</th><th className="pr-2">Tienda</th><th className="pr-2">Productos</th><th className="pr-2">Guía</th><th className="text-right">Cobrar</th><th className="w-24 pl-3">Firma</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="break-inside-avoid border-b align-top">
                <td className="py-2 pr-2 font-medium">#{f.numero}</td>
                <td className="pr-2">{f.tienda}</td>
                <td className="pr-2">
                  {f.productos}
                  {(f.franja || f.etiquetas.length > 0) && (
                    <div className="text-xs font-medium">{[f.franja ? etiquetaFranja(f.franja) : null, ...f.etiquetas].filter(Boolean).join(" · ")}</div>
                  )}
                </td>
                <td className="pr-2">{f.guia ?? "—"}</td>
                <td className="text-right tabular-nums">{f.cobrar === null ? "Pagada" : `$${f.cobrar.toFixed(2)}`}</td>
                <td className="pl-3"><div className="h-8 border-b border-foreground" /></td>
              </tr>
            ))}
          </tbody>
          {filas.length > 1 && (
            <tfoot><tr><td colSpan={4} className="pt-2 text-right font-medium">Total a cobrar</td><td className="pt-2 text-right font-semibold tabular-nums">${total.toFixed(2)}</td><td /></tr></tfoot>
          )}
        </table>
      )}
    </main>
  );
}
