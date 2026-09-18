import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { actualizarProducto } from "./actions";
import { vincularProductoASku } from "../catalogo-maestro/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface ProductoFila {
  id: string;
  sku: string;
  nombre: string;
  costo: number | null;
  precio_actual: number | null;
  margen_minimo: number;
  ultima_modificacion_precio: string | null;
  plataforma_nombre: string | null;
  sku_maestro_id: string | null;
}

function margenActual(p: ProductoFila): number | null {
  if (p.costo === null || p.precio_actual === null || p.precio_actual === 0) return null;
  return ((p.precio_actual - p.costo) / p.precio_actual) * 100;
}

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireModulo("productos");
  const sp = await searchParams;
  const buscar = typeof sp.buscar === "string" ? sp.buscar.trim() : "";
  const plataformaFiltro = typeof sp.plataforma === "string" ? sp.plataforma : "";

  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const { data } = await supabase
    .from("productos")
    .select(
      "id, sku, nombre, costo, precio_actual, margen_minimo, ultima_modificacion_precio, sku_maestro_id, plataformas(nombre)"
    )
    .eq("pais_id", pais.id);

  const { data: skusMaestrosDisponibles } = await supabase
    .from("skus_maestros")
    .select("id, codigo, nombre")
    .eq("tipo", "simple")
    .eq("estado", "aprobado")
    .order("codigo");

  const productos: ProductoFila[] = (data ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    nombre: p.nombre,
    costo: p.costo === null ? null : Number(p.costo),
    precio_actual: p.precio_actual === null ? null : Number(p.precio_actual),
    margen_minimo: Number(p.margen_minimo),
    ultima_modificacion_precio: p.ultima_modificacion_precio,
    plataforma_nombre: (p.plataformas as unknown as { nombre: string } | null)?.nombre ?? null,
    sku_maestro_id: p.sku_maestro_id,
  }));

  productos.sort((a, b) => {
    const ma = margenActual(a);
    const mb = margenActual(b);
    if (ma === null && mb === null) return a.nombre.localeCompare(b.nombre);
    if (ma === null) return 1;
    if (mb === null) return -1;
    return ma - mb;
  });

  const conDatos = productos.filter((p) => margenActual(p) !== null).length;
  const bajoMargen = productos.filter((p) => {
    const m = margenActual(p);
    return m !== null && m < p.margen_minimo;
  }).length;

  const plataformasDisponibles = Array.from(
    new Set(productos.map((p) => p.plataforma_nombre).filter((n): n is string => n !== null))
  ).sort();

  const buscarNormalizado = buscar.toLowerCase();
  const productosFiltrados = productos.filter((p) => {
    const coincideBusqueda =
      buscarNormalizado === "" ||
      p.nombre.toLowerCase().includes(buscarNormalizado) ||
      p.sku.toLowerCase().includes(buscarNormalizado);
    const coincidePlataforma = plataformaFiltro === "" || p.plataforma_nombre === plataformaFiltro;
    return coincideBusqueda && coincidePlataforma;
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <h1 className="text-lg font-semibold tracking-tight">Productos y márgenes</h1>
      <p className="mt-1 mb-2 text-sm text-muted-foreground">
        {pais.nombre} — costo, precio de venta y margen mínimo por producto.
      </p>
      {bajoMargen > 0 && (
        <p className="mb-6 text-sm">
          <Badge tone="destructive">{bajoMargen} producto{bajoMargen === 1 ? "" : "s"} bajo el margen mínimo</Badge>
        </p>
      )}
      {bajoMargen === 0 && conDatos > 0 && (
        <p className="mb-6">
          <Badge tone="success">Todos los productos están sobre su margen mínimo</Badge>
        </p>
      )}

      {productos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay productos registrados para {pais.nombre}. Se crean automáticamente al
          cargar movimientos de inventario.
        </p>
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <label className={labelClassSm}>Buscar por nombre o SKU</label>
              <input
                type="text"
                name="buscar"
                defaultValue={buscar}
                placeholder="Ej: aceite, MSK-0001…"
                className={fieldClass}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClassSm}>Plataforma</label>
              <select name="plataforma" defaultValue={plataformaFiltro} className={fieldClass}>
                <option value="">Todas</option>
                {plataformasDisponibles.map((nombre) => (
                  <option key={nombre} value={nombre}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Filtrar</Button>
          </form>

          {productosFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ningún producto coincide con ese filtro.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {productosFiltrados.map((p) => {
            const margen = margenActual(p);
            return (
              <form
                key={p.id}
                action={actualizarProducto}
                className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4"
              >
                <input type="hidden" name="id" value={p.id} />
                <div className="min-w-[10rem] flex-1">
                  <p className="text-sm font-medium">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.sku} {p.plataforma_nombre ? `· ${p.plataforma_nombre}` : ""}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClassSm}>Costo</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="costo"
                    defaultValue={p.costo ?? ""}
                    className={`${fieldClassSm} w-24 tabular-nums`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClassSm}>Precio venta</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="precio_actual"
                    defaultValue={p.precio_actual ?? ""}
                    className={`${fieldClassSm} w-24 tabular-nums`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClassSm}>Mínimo %</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    name="margen_minimo"
                    defaultValue={p.margen_minimo}
                    required
                    className={`${fieldClassSm} w-20 tabular-nums`}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <p className={labelClassSm}>Margen actual</p>
                  {margen === null ? (
                    <Badge tone="neutral">Sin datos</Badge>
                  ) : margen < p.margen_minimo ? (
                    <Badge tone="destructive">{margen.toFixed(1)}%</Badge>
                  ) : (
                    <Badge tone="success">{margen.toFixed(1)}%</Badge>
                  )}
                </div>
                <Button type="submit" variant="secondary" className="text-xs">
                  Guardar
                </Button>
              </form>
                );
              })}
            </div>
          )}
        </>
      )}

      {skusMaestrosDisponibles !== null && productosFiltrados.length > 0 && (
        <div className="mt-8 flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-semibold">Vincular al catálogo maestro de SKU</h2>
            <p className="text-xs text-muted-foreground">
              Une esta fila (específica de una plataforma) con el SKU maestro que representa el
              mismo producto físico, para que el inventario cuadre entre plataformas.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {productosFiltrados.map((p) => (
              <form
                key={p.id}
                action={vincularProductoASku}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                <input type="hidden" name="producto_id" value={p.id} />
                <div className="min-w-[10rem] flex-1 text-sm">
                  {p.nombre} <span className="text-xs text-muted-foreground">({p.sku})</span>
                </div>
                <select name="sku_maestro_id" defaultValue={p.sku_maestro_id ?? ""} className={`${fieldClass} w-64`}>
                  <option value="">Sin vincular</option>
                  {(skusMaestrosDisponibles ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.codigo} — {s.nombre}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="secondary" className="text-xs">
                  Guardar
                </Button>
              </form>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
