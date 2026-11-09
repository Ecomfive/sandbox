import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { plataformaDe, plataformasDePais, vistaVentasValida } from "@/lib/plataformas";
import { dineroPorMes, margen, utilidad, type DineroDia } from "@/lib/publicaciones/dinero";
import { cargarStockProveedor, stockVigente } from "@/lib/publicaciones/proveedor-datos";
import { fechaHoraLectura } from "@/lib/publicaciones/sincronizar-dropi";
import { agruparProductos, resumirProductos, restarDias, totalesPorDia, totalesPorMes, type ProductoDropi, type VentaDia } from "@/lib/publicaciones/ventas";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { traerDineroPorMes, traerVentasDiarias } from "@/lib/publicaciones/ventas-compactas";
import { createServiceClient } from "@/lib/supabase/server";
import { NOMBRE_PLATAFORMA_VENTAS, textoEtiquetas, type PlataformaVentas, type VentasDePlataforma } from "@/lib/publicaciones/ventas-plataformas";
import { cargarVentasPlataforma } from "./datos-plataformas";
import { SelectorVistaVentas } from "./selector-vista-ventas";
import { TableroVentas, type DineroVentas, type DropshipperVentas, type ProductoVentas } from "./tablero-ventas";

export const metadata = { title: "Ventas Proveeduría" };

export const dynamic = "force-dynamic";

/** Los meses que muestra la gráfica: el último año y algo más (Dropi Panamá empieza en septiembre de 2025). */
const MESES_ATRAS = 13;

/**
 * Desempeño › Ventas Proveeduría (antes «Ventas Dropi»; 7 nov 2026, pedido de Hernán): cuánto vende cada producto de ECOMFIVE (del país de la barra), qué se está acabando, qué
 * crece y qué cae, y quién vende. Con más de una plataforma en el país (Costa Rica: Dropi, Drop y Effi) arriba hay un selector: «Todas» (el análisis general) o una sola plataforma
 * (`?ver=`). Dropi sale del Historial de Existencia que carga scripts/importar-ventas-dropi.ts (migración 0120). Drop y Effi, de `plataforma_ventas_diarias` (migración 0244: lo
 * que salió y lo que volvió, por artículo y día; 9 nov 2026), en el mismo tablero sin cancelaciones ni dropshippers. «Todas» suma las tres y junta por producto del sistema.
 * La ruta y el módulo de permisos siguen siendo `ventas-dropi`.
 */
export default async function VentasDropiPage({ searchParams }: { searchParams: Promise<{ ver?: string | string[] }> }) {
  await requireModulo("ventas-dropi");
  const { ver } = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const vista = vistaVentasValida(Array.isArray(ver) ? ver[0] : ver, pais.codigo);
  const selector = <SelectorVistaVentas vista={vista} codigoPais={pais.codigo} />;

  // Drop y Effi: sus ventas leídas (salidas y devoluciones por artículo y día), en el mismo tablero.
  if (vista === "drop" || vista === "effi") {
    const datos = await cargarVentasPlataforma(supabase, pais.id, vista);
    if (!datos || !datos.ultimoDia) {
      return (
        <Pagina ancho="ancha" className="flex flex-col gap-6">
          <EncabezadoPagina titulo="Ventas Proveeduría" oculto />
          {selector}
          <p role="status" className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            {!datos
              ? "No se pudieron cargar las ventas. Vuelve a intentarlo; si sigue, falta correr en Supabase la migración 0244."
              : vista === "effi"
                ? "Todavía no hay ventas de Effi leídas. La lectura diaria las pide por la API de Effi: si «Actualizar desde Effi» (Gestión de IDs) avisa que falta un permiso, en Effi › Administración › Perfiles de usuario dale al perfil del usuario del sistema la consulta de «Notas de remisión de venta» y «Devoluciones de venta»."
                : `Todavía no hay ventas de ${plataformaDe(vista).nombre} leídas. Se leen con «Actualizar» en la pestaña de Drop, con la cuenta de proveedor.`}
          </p>
        </Pagina>
      );
    }
    const corteP = datos.ultimoDia;
    const desdeMesP = restarDias(`${corteP.slice(0, 7)}-15`, MESES_ATRAS * 30.5);
    const conEtiquetas = (r: ReturnType<typeof resumirProductos>[number], ids: number[], clave: string | null): ProductoVentas => {
      const s = clave ? [...datos.skuDe.values()].find((x) => x.codigo === clave) : datos.skuDe.get(r.id);
      return { ...r, ids, etiquetas: textoEtiquetas(ids, datos.etiquetaDe), sku: s?.codigo ?? null, numero: s?.numero ?? null, barras: s?.barras ?? null, dinero: null };
    };
    const gruposP = agruparProductos(datos.productos, datos.dias, (id) => {
      const s = datos.skuDe.get(id);
      return s ? { clave: s.codigo, nombre: s.nombre } : null;
    });
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Ventas Proveeduría" oculto />
        {selector}
        <TableroVentas
          plataforma={NOMBRE_PLATAFORMA_VENTAS[vista]}
          soloSalidas
          fuente={`Ventas leídas de ${NOMBRE_PLATAFORMA_VENTAS[vista]} hasta el ${new Date(`${corteP}T12:00:00Z`).toLocaleDateString("es-PA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · ${datos.productos.length.toLocaleString("es-PA")} artículos. Netas = lo que salió − lo devuelto; ${NOMBRE_PLATAFORMA_VENTAS[vista]} no dice cancelaciones ni rechazos. El stock es el de la última lectura de ${NOMBRE_PLATAFORMA_VENTAS[vista]}.`}
          corte={corteP}
          movimientos={datos.dias.length}
          productos={resumirProductos(datos.productos, datos.dias, corteP).map((r) => conEtiquetas(r, [r.id], null))}
          porProducto={resumirProductos(gruposP.productos, gruposP.dias, corteP).map((r) => conEtiquetas(r, gruposP.ids.get(r.id) ?? [r.id], gruposP.clave.get(r.id) ?? null))}
          meses={totalesPorMes(datos.dias, `${desdeMesP.slice(0, 7)}-01`, corteP)}
          dias={totalesPorDia(datos.dias, corteP, 90)}
          dropshippers={[]}
          dinero={null}
        />
      </Pagina>
    );
  }

  const { data: carga, error: errorCarga } = await supabase.from("dropi_ventas_cargas").select("corte, productos, movimientos").eq("pais_id", pais.id).order("corte", { ascending: false }).limit(1).maybeSingle();
  if (errorCarga || !carga) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Ventas Proveeduría" oculto />
        {selector}
        <p role={errorCarga ? "alert" : "status"} className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          {errorCarga ? "No se pudieron cargar las ventas. Falta correr en Supabase la migración 0120." : `Todavía no hay ventas de Dropi cargadas para ${pais.nombre}.`}
        </p>
      </Pagina>
    );
  }

  const corte = new Date(new Date(carga.corte as string).getTime() - 5 * 3600e3).toISOString().slice(0, 10);
  const [productosR, diasR, dsR, pubsR, dineroR, cargaDineroR, stockActual] = await Promise.all([
    traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("dropi_ventas_productos").select("dropi_producto_id, nombre, lista, privado, variable, stock, primera_venta, ultima_venta").eq("pais_id", pais.id).order("dropi_producto_id").range(d, h)),
    // Rendimiento (27 oct 2026, migración 0163): los últimos 90 días día por día y lo anterior sumado por mes; las cuentas dan lo mismo.
    traerVentasDiarias(supabase, pais.id, corte),
    traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("dropi_ventas_dropshippers").select("dropi_usuario_id, nombre, pedidas, ordenes, no_efectivas, netas_30d, productos, ultima_orden").eq("pais_id", pais.id).order("dropi_usuario_id").range(d, h)),
    traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("dropi_publicaciones").select("dropi_id, skus_maestros(codigo, nombre, numero, codigo_barras)").eq("pais_id", pais.id).not("sku_maestro_id", "is", null).order("id").range(d, h)),
    // La plata (migración 0130): sin la migración o sin carga, la página sigue solo con las unidades.
    // Sumada por producto y mes en la base (migración 0163): aquí solo se usa por mes.
    traerDineroPorMes(supabase, pais.id),
    supabase.from("dropi_ventas_dinero_cargas").select("hasta, ordenes, fuente").eq("pais_id", pais.id).order("cargado_en", { ascending: false }).limit(1).maybeSingle(),
    // El stock de la última lectura de «Mis productos» de Dropi (migración 0131): manda sobre el de la carga, que puede tener días.
    cargarStockProveedor(supabase, pais.id),
  ]);
  if (productosR.error || diasR.error || dsR.error) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Ventas Proveeduría" oculto />
        {selector}
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          No se pudieron cargar las ventas. Vuelve a intentarlo.
        </p>
      </Pagina>
    );
  }

  // El SKU del sistema de cada producto de Dropi, por el vínculo de Gestión de IDs Dropi.
  const skuDe = new Map<number, { clave: string; nombre: string }>();
  // El N.º y el código de barras de cada producto del sistema, por su SKU.
  const codigosDe = new Map<string, { numero: number | null; barras: string | null }>();
  for (const p of pubsR.data ?? []) {
    const sku = p.skus_maestros as { codigo: string; nombre: string; numero: number | null; codigo_barras: string | null } | null;
    if (!sku?.codigo) continue;
    codigosDe.set(sku.codigo, { numero: sku.numero ?? null, barras: sku.codigo_barras || null });
    for (const id of String(p.dropi_id ?? "").match(/\d{3,6}/g) ?? []) skuDe.set(Number(id), { clave: sku.codigo, nombre: sku.nombre || sku.codigo });
  }

  const productos: ProductoDropi[] = (productosR.data ?? []).map((p) => ({
    id: Number(p.dropi_producto_id),
    nombre: p.nombre as string,
    lista: p.lista === "archivado" ? "archivado" : "activo",
    privado: !!p.privado,
    variable: !!p.variable,
    stock: stockVigente(Number(p.dropi_producto_id), Number(p.stock), stockActual?.stock),
    primeraVenta: (p.primera_venta as string | null) ?? null,
    ultimaVenta: (p.ultima_venta as string | null) ?? null,
  }));
  const dias: VentaDia[] = (diasR.data ?? []).map((d) => ({
    producto: Number(d.dropi_producto_id),
    dia: d.dia as string,
    pedidas: Number(d.pedidas),
    ordenes: Number(d.ordenes),
    canceladas: Number(d.canceladas),
    rechazadas: Number(d.rechazadas),
    devueltas: Number(d.devueltas),
  }));
  // «Todas» en un país con más plataformas (Costa Rica): se suman Drop y Effi, cada artículo con su número propio y su producto del sistema.
  const extras: { plataforma: PlataformaVentas; datos: VentasDePlataforma }[] = [];
  if (vista === "todas") {
    const otras = plataformasDePais(pais.codigo)
      .map((p) => p.id)
      .filter((p): p is PlataformaVentas => p === "drop" || p === "effi");
    for (const plataforma of otras) {
      const datos = await cargarVentasPlataforma(supabase, pais.id, plataforma);
      if (datos?.ultimoDia) extras.push({ plataforma, datos });
    }
  }
  const etiquetaDe = new Map<number, string>();
  for (const { datos } of extras) {
    productos.push(...datos.productos);
    dias.push(...datos.dias);
    for (const [id, e] of datos.etiquetaDe) etiquetaDe.set(id, e);
    for (const [id, sku] of datos.skuDe) {
      skuDe.set(id, { clave: sku.codigo, nombre: sku.nombre });
      if (!codigosDe.has(sku.codigo)) codigosDe.set(sku.codigo, { numero: sku.numero, barras: sku.barras });
    }
  }
  const etiquetas = (ids: number[]) => (extras.length ? textoEtiquetas(ids, etiquetaDe) : undefined);
  const filasDinero: DineroDia[] = dineroR.error
    ? []
    : (dineroR.data ?? []).map((d) => ({
        producto: Number(d.dropi_producto_id),
        dia: d.dia as string,
        entregadas: Number(d.entregadas),
        unidades: Number(d.unidades),
        ganancia: Number(d.ganancia),
        comision: Number(d.comision),
        coste: Number(d.coste),
        descuentos: Number(d.descuentos),
      }));
  // La plata de cada producto en todo lo cargado y por mes.
  const sumas = new Map<number, { ganancia: number; comision: number; coste: number; descuentos: number; porMes: Record<string, number> }>();
  for (const d of filasDinero) {
    const x = sumas.get(d.producto) ?? { ganancia: 0, comision: 0, coste: 0, descuentos: 0, porMes: {} };
    sumas.set(d.producto, x);
    x.ganancia += d.ganancia;
    x.comision += d.comision;
    x.coste += d.coste;
    x.descuentos += d.descuentos;
    x.porMes[d.dia.slice(0, 7)] = (x.porMes[d.dia.slice(0, 7)] ?? 0) + utilidad(d);
  }
  // La plata de varios IDs de Dropi juntos (una fila de «por producto»); null si ninguno tiene órdenes en el Excel.
  const dineroDe = (ids: number[]) => {
    const xs = ids.map((id) => sumas.get(id)).filter((x) => !!x);
    if (!xs.length) return null;
    const t = { ganancia: 0, comision: 0, coste: 0, descuentos: 0, porMes: {} as Record<string, number> };
    for (const x of xs) {
      t.ganancia += x.ganancia;
      t.comision += x.comision;
      t.coste += x.coste;
      t.descuentos += x.descuentos;
      for (const [m, n] of Object.entries(x.porMes)) t.porMes[m] = (t.porMes[m] ?? 0) + n;
    }
    return { ganancia: t.ganancia, utilidad: utilidad(t), margen: margen(t), porMes: t.porMes };
  };
  const dinero: DineroVentas | null =
    filasDinero.length && cargaDineroR.data
      ? {
          hasta: cargaDineroR.data.hasta as string,
          ordenes: Number(cargaDineroR.data.ordenes),
          fuente: cargaDineroR.data.fuente as string,
          meses: [...dineroPorMes(filasDinero)].sort(([a], [b]) => a.localeCompare(b)).map(([mes, x]) => ({ mes, ...x })),
        }
      : null;
  const resumen: ProductoVentas[] = resumirProductos(productos, dias, corte).map((r) => ({ ...r, ids: [r.id], etiquetas: etiquetas([r.id]), sku: skuDe.get(r.id)?.clave ?? null, numero: codigosDe.get(skuDe.get(r.id)?.clave ?? "")?.numero ?? null, barras: codigosDe.get(skuDe.get(r.id)?.clave ?? "")?.barras ?? null, dinero: dineroDe([r.id]) }));
  // Los mismos datos con los IDs de Dropi de un mismo producto del sistema juntos (públicos, privados, archivados, de la B280…).
  const grupos = agruparProductos(productos, dias, (id) => skuDe.get(id) ?? null);
  const porProducto: ProductoVentas[] = resumirProductos(grupos.productos, grupos.dias, corte).map((r) => {
    const ids = grupos.ids.get(r.id) ?? [r.id];
    const clave = grupos.clave.get(r.id) ?? skuDe.get(r.id)?.clave ?? null;
    return { ...r, ids, etiquetas: etiquetas(ids), sku: clave, numero: codigosDe.get(clave ?? "")?.numero ?? null, barras: codigosDe.get(clave ?? "")?.barras ?? null, dinero: dineroDe(ids) };
  });
  const desdeMes = restarDias(`${corte.slice(0, 7)}-15`, MESES_ATRAS * 30.5);
  const dropshippers: DropshipperVentas[] = (dsR.data ?? []).map((d) => ({
    id: Number(d.dropi_usuario_id),
    nombre: d.nombre as string,
    pedidas: Number(d.pedidas),
    ordenes: Number(d.ordenes),
    noEfectivas: Number(d.no_efectivas),
    netas: Number(d.pedidas) - Number(d.no_efectivas),
    netas30: Number(d.netas_30d),
    productos: Number(d.productos),
    ultimaOrden: (d.ultima_orden as string | null) ?? null,
  }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Ventas Proveeduría" oculto />
      {selector}
      {vista === "todas" && plataformasDePais(pais.codigo).length > 1 && (
        <p role="status" className="m-0 -mt-3 text-xs text-muted-foreground">
          «Todas» suma Dropi
          {extras.map(({ plataforma, datos }) => ` y ${NOMBRE_PLATAFORMA_VENTAS[plataforma]} (leído hasta el ${new Date(`${datos.ultimoDia}T12:00:00Z`).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "UTC" })})`).join("")}
          {plataformasDePais(pais.codigo).some((p) => (p.id === "drop" || p.id === "effi") && !extras.some((x) => x.plataforma === p.id)) &&
            `. Sin ventas leídas todavía: ${plataformasDePais(pais.codigo)
              .filter((p) => (p.id === "drop" || p.id === "effi") && !extras.some((x) => x.plataforma === p.id))
              .map((p) => p.nombre)
              .join(" y ")}`}
          . Cada producto del sistema junta sus ventas de todas las plataformas en «Por producto».
        </p>
      )}
      <TableroVentas
        corte={corte}
        stockLeido={stockActual ? fechaHoraLectura(stockActual.leidoEn) : null}
        movimientos={Number(carga.movimientos)}
        productos={resumen}
        porProducto={porProducto}
        meses={totalesPorMes(dias, `${desdeMes.slice(0, 7)}-01`, corte)}
        dias={totalesPorDia(dias, corte, 90)}
        dropshippers={dropshippers}
        dinero={dinero}
      />
    </Pagina>
  );
}
