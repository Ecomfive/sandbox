import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { esAdministrador } from "@/lib/permisos/acceso";
import { idsDeDropi } from "@/lib/publicaciones/sincronizar-dropi";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { armarCuadro, BODEGA_DE_PLATAFORMA, CON_VENTAS, diaSiguiente, type NovedadCuadro, type RemisionCuadro, type VentaDia } from "@/lib/wms/cuadro-plataformas";
import { PAISES_CON_RECEPCION } from "@/lib/wms/recepcion";
import type { Plataforma } from "@/lib/wms/stock-plataformas";
import { leerStockPlataformas } from "../datos-plataformas";
import { Cuadro, type FilaVista } from "./cuadro";

export const metadata = { title: "Cuadro" };

export const dynamic = "force-dynamic";

const ES_PLATAFORMA = (v: unknown): v is Plataforma => v === "dropi" || v === "effi" || v === "drop";

/** El cuadro de una plataforma: corte + remisiones − ventas contra su última lectura. No cambia nada; solo «Tomar corte» escribe, y solo en una plataforma que no lo tiene. */
export default async function CuadroPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (!PAISES_CON_RECEPCION.includes(pais.codigo)) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Cuadro" oculto />
        <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">El cuadro de plataformas por ahora es solo para Costa Rica. Elige ese país arriba para verlo.</p>
      </Pagina>
    );
  }
  const { plataforma: pedida } = await searchParams;
  const plataforma: Plataforma = ES_PLATAFORMA(pedida) ? pedida : "dropi";

  const [{ porProducto, lecturas, fallaron }, { data: bodega }] = await Promise.all([
    leerStockPlataformas(supabase, pais.id),
    supabase.from("wms_bodegas").select("id").eq("pais_id", pais.id).eq("codigo", BODEGA_DE_PLATAFORMA[plataforma]).maybeSingle(),
  ]);
  const { data: cortes } = bodega
    ? await traerTodasConError<{ fecha: string; sku_maestro_id: string | null; dropi_producto_id: number | null; cantidad: number }>((d, h) =>
        supabase.from("wms_cortes_externa").select("fecha, sku_maestro_id, dropi_producto_id, cantidad").eq("bodega_id", bodega.id).order("id").range(d, h),
      )
    : { data: [] };
  const fechaCorte = (cortes ?? []).reduce<string | null>((a, c) => (!a || c.fecha > a ? c.fecha : a), null);
  const desde = fechaCorte ? diaSiguiente(fechaCorte) : null;

  // Los IDs de Dropi de cada producto: el corte y las ventas vienen por ID.
  const skuDeDropi = new Map<number, string>();
  if (plataforma === "dropi") {
    const { data: pubs } = await traerTodasConError<{ sku_maestro_id: string; dropi_id: string | null }>((d, h) =>
      supabase.from("dropi_publicaciones").select("sku_maestro_id, dropi_id").eq("pais_id", pais.id).not("sku_maestro_id", "is", null).not("dropi_id", "is", null).order("id").range(d, h),
    );
    for (const p of pubs ?? []) for (const id of idsDeDropi(p.dropi_id)) if (!skuDeDropi.has(id)) skuDeDropi.set(id, p.sku_maestro_id);
  }

  const cortePorSku = new Map<string, number>();
  for (const c of (cortes ?? []).filter((x) => x.fecha === fechaCorte)) {
    const sku = (c.dropi_producto_id !== null ? skuDeDropi.get(c.dropi_producto_id) : null) ?? c.sku_maestro_id;
    if (sku) cortePorSku.set(sku, (cortePorSku.get(sku) ?? 0) + c.cantidad);
  }

  let remisiones: RemisionCuadro[] = [];
  let salidas: RemisionCuadro[] = [];
  let novedades: NovedadCuadro[] = [];
  let ventas: VentaDia[] = [];
  let ventasHasta: string | null = null;
  if (bodega && desde) {
    const leer = (columna: "bodega_dropi_id" | "bodega_origen_id") =>
      traerTodasConError<{ sku_maestro_id: string; estado: string; enviada: number; recibida: number | null }>((d, h) =>
        supabase.from("wms_envios_dropi").select("sku_maestro_id, estado, enviada, recibida").eq(columna, bodega.id).gte("enviado_en", desde).order("id").range(d, h),
      );
    const aRemision = (r: { sku_maestro_id: string; estado: string; enviada: number; recibida: number | null }): RemisionCuadro => ({ sku: r.sku_maestro_id, estado: r.estado, enviada: r.enviada, recibida: r.recibida });
    const [entradas, salieron] = await Promise.all([leer("bodega_dropi_id"), leer("bodega_origen_id")]);
    remisiones = (entradas.data ?? []).map(aRemision);
    salidas = (salieron.data ?? []).map(aRemision);
    // Sin la migración 0243 no hay novedades: el cuadro sale igual.
    const { data: filasNovedad } = await supabase.from("wms_novedades_plataforma").select("sku_maestro_id, estado, cantidad").eq("bodega_id", bodega.id).neq("estado", "por_revisar").gte("resuelto_en", desde).limit(2000);
    novedades = (filasNovedad ?? []).map((n) => ({ sku: n.sku_maestro_id as string, estado: n.estado as string, cantidad: Number(n.cantidad) }));
    if (plataforma === "dropi") {
      const { data: dias } = await traerTodasConError<{ dropi_producto_id: number; dia: string; pedidas: number; canceladas: number; rechazadas: number; devueltas: number }>((d, h) =>
        supabase.from("dropi_ventas_diarias").select("dropi_producto_id, dia, pedidas, canceladas, rechazadas, devueltas").eq("pais_id", pais.id).gte("dia", desde).order("dia").order("dropi_producto_id").range(d, h),
      );
      ventas = (dias ?? []).flatMap((v) => {
        const sku = skuDeDropi.get(v.dropi_producto_id);
        return sku ? [{ sku, pedidas: v.pedidas, canceladas: v.canceladas, rechazadas: v.rechazadas, devueltas: v.devueltas }] : [];
      });
      ventasHasta = (dias ?? []).reduce<string | null>((a, v) => (!a || v.dia > a ? v.dia : a), null);
    } else if (CON_VENTAS[plataforma]) {
      // Effi (migración 0244): remisiones y devoluciones de la bodega Principal por artículo y día; el artículo se pasa a producto por su publicación de Effi.
      const [{ data: dias }, { data: pubs }] = await Promise.all([
        traerTodasConError<{ producto_id: string; dia: string; salidas: number; devueltas: number }>((d, h) =>
          supabase.from("plataforma_ventas_diarias").select("producto_id, dia, salidas, devueltas").eq("pais_id", pais.id).eq("plataforma", plataforma).gte("dia", desde).order("dia").order("producto_id").range(d, h),
        ),
        traerTodasConError<{ effi_id: string; sku_maestro_id: string }>((d, h) =>
          supabase.from("effi_publicaciones").select("effi_id, sku_maestro_id").eq("pais_id", pais.id).not("sku_maestro_id", "is", null).order("id").range(d, h),
        ),
      ]);
      const skuDeEffi = new Map((pubs ?? []).map((p) => [String(p.effi_id), p.sku_maestro_id]));
      ventas = (dias ?? []).flatMap((v) => {
        const sku = skuDeEffi.get(v.producto_id);
        return sku ? [{ sku, pedidas: v.salidas, canceladas: 0, rechazadas: 0, devueltas: v.devueltas }] : [];
      });
      ventasHasta = (dias ?? []).reduce<string | null>((a, v) => (!a || v.dia > a ? v.dia : a), null);
    }
  }

  const dice = new Map([...porProducto].flatMap(([sku, s]): [string, number][] => (s[plataforma] ? [[sku, s[plataforma]]] : [])));
  const filas = fechaCorte ? armarCuadro({ cortes: cortePorSku, remisiones, salidas, ventas, novedades, dice }) : [];
  const ids = filas.map((f) => f.sku);
  const { data: productos } = ids.length ? await supabase.from("skus_maestros").select("id, codigo, nombre, foto_url").in("id", ids) : { data: [] };
  const producto = new Map((productos ?? []).map((p) => [p.id as string, p]));
  const vista: FilaVista[] = filas.map((f) => ({ ...f, codigo: (producto.get(f.sku)?.codigo as string) ?? "", nombre: (producto.get(f.sku)?.nombre as string) ?? "Producto", foto: (producto.get(f.sku)?.foto_url as string | null) ?? null }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Cuadro" oculto />
      <Cuadro
        key={plataforma}
        plataforma={plataforma}
        filas={vista}
        fechaCorte={fechaCorte}
        lectura={lecturas[plataforma]}
        ventasHasta={ventasHasta}
        lecturaFallo={fallaron}
        puedeTomarCorte={esAdministrador(usuario) && !usuario.modulosSoloLectura.includes("inventario")}
      />
    </Pagina>
  );
}
