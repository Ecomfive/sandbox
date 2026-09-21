import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { requireModulo } from "@/lib/auth";
import { margenActual, type ProductoFila } from "@/lib/margen";
import { TablaProductos } from "./tabla-productos";
import { EstadoVacio } from "@/components/ui/estado-vacio";

export const metadata = { title: "Productos y márgenes" };

export const dynamic = "force-dynamic";

export default async function ProductosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo("productos");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("productos");
  // Vincular a un SKU maestro es una acción del catálogo maestro: pide escritura allí, no en Productos.
  const puedeVincular = usuario.modulos.includes("catalogo-maestro") && !usuario.modulosSoloLectura.includes("catalogo-maestro");
  const sp = await searchParams;
  const buscar = typeof sp.buscar === "string" ? sp.buscar.trim() : "";

  const supabase = createServiceClient();
  const paisP = getPaisActual(supabase);

  // Los SKUs maestros no dependen del país: se piden a la vez que el país y los productos, no después.
  const [pais, { data }, { data: skusMaestrosDisponibles }] = await Promise.all([
    paisP,
    paisP.then((p) =>
      supabase
        .from("productos")
        .select(
          "id, sku, nombre, costo, precio_actual, margen_minimo, ultima_modificacion_precio, sku_maestro_id, plataformas(nombre)"
        )
        .eq("pais_id", p.id)
    ),
    supabase
      .from("skus_maestros")
      .select("id, codigo, nombre")
      .eq("tipo", "simple")
      .eq("estado", "aprobado")
      .order("codigo"),
  ]);

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

  // La plataforma y el estado del margen se filtran o agrupan desde la barra de herramientas de la lista.
  const buscarNormalizado = buscar.toLowerCase();
  const productosFiltrados = productos.filter(
    (p) =>
      buscarNormalizado === "" ||
      p.nombre.toLowerCase().includes(buscarNormalizado) ||
      p.sku.toLowerCase().includes(buscarNormalizado)
  );

  return (
    <Pagina ancho="ancha">
      <EncabezadoPagina titulo="Productos y márgenes" oculto className="mb-2">
        {pais.nombre} — costo, precio de venta y margen mínimo por producto. Con «Editar» también se vincula al SKU
        maestro del catálogo, para que el inventario cuadre entre plataformas.
      </EncabezadoPagina>
      {bajoMargen > 0 && (
        <p className="mb-4 text-sm">
          <Badge tone="destructive">{bajoMargen} producto{bajoMargen === 1 ? "" : "s"} bajo el margen mínimo</Badge>
        </p>
      )}
      {bajoMargen === 0 && conDatos > 0 && (
        <p className="mb-4">
          <Badge tone="success">Todos los productos están sobre su margen mínimo</Badge>
        </p>
      )}

      {productos.length === 0 ? (
        <EstadoVacio
          mensaje={`Todavía no hay productos registrados para ${pais.nombre}. Se crean automáticamente al cargar movimientos de inventario.`}
        />
      ) : (
        <>
          <form method="get" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <span className={labelClassSm}>Buscar por nombre o SKU</span>
              <input
                type="text"
                name="buscar"
                defaultValue={buscar}
                placeholder="Ej: aceite, MSK-0001…"
                className={fieldClass}
              />
            </label>
            <Button type="submit">Buscar</Button>
          </form>

          {productosFiltrados.length === 0 ? (
            <EstadoVacio mensaje="Ningún producto coincide con ese filtro." />
          ) : (
            <TablaProductos
              productos={productosFiltrados}
              codigoPais={pais.codigo}
              skusMaestros={skusMaestrosDisponibles ?? []}
              puedeEscribir={puedeEscribir}
              puedeVincular={puedeVincular}
            />
          )}
        </>
      )}
    </Pagina>
  );
}
