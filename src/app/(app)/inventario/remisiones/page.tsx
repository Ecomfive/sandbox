import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { textoCajasEnviadas, type CajaGuardada } from "@/lib/wms/cajas";
import { textoCorreccion, type TipoCorreccion } from "@/lib/wms/correccion-remision";
import { BODEGA_DE_PLATAFORMA } from "@/lib/wms/cuadro-plataformas";
import { PAISES_SALIDA_CON_REMISION } from "@/lib/wms/recepcion";
import type { Plataforma } from "@/lib/wms/stock-plataformas";
import { leerStockPlataformas } from "../datos-plataformas";
import { CorreccionesPendientes, type CorreccionVista } from "./correcciones";
import { ListaEnvios, type FilaEnvio } from "./lista-envios";
import { NuevaRemision, type BodegaRemision, type CajasPorBodega, type StockPorBodega } from "./nueva-remision";

export const metadata = { title: "Remisiones" };

export const dynamic = "force-dynamic";

const uno = <T,>(r: T | T[] | null): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

/**
 * Las remisiones a las bodegas externas del país (Dropi, Effi, Boxfull, Dunamixfy): una fila por remisión, las que siguen en camino primero; en su
 * ficha están los productos, para anotar cuántas unidades dice el tercero que llegaron, y las ya recibidas con su diferencia.
 */
export default async function RemisionesPage() {
  const usuario = await requireModulo("inventario");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data, error } = await supabase
    .from("wms_envios_dropi")
    .select(
      "id, enviado_en, enviada, recibida, estado, referencia, motivo_diferencia, recibido_en, remision_id, wms_remisiones(notas), skus_maestros(codigo, nombre, foto_url, numero, codigo_barras), wms_bodegas!wms_envios_dropi_bodega_origen_id_fkey!inner(nombre, pais_id), destino:wms_bodegas!wms_envios_dropi_bodega_dropi_id_fkey(nombre)",
    )
    .eq("wms_bodegas.pais_id", pais.id)
    .order("estado")
    .order("enviado_en", { ascending: false })
    .limit(500);

  // Qué cajas salieron en cada línea (migración 0236; sin ella, nada).
  const { data: conCajas } = await supabase.from("wms_envios_dropi").select("id, cajas").in("id", (data ?? []).map((e) => e.id as string));
  const cajasDeLinea = new Map((conCajas ?? []).map((c) => [c.id as string, textoCajasEnviadas(c.cajas)]));

  const filas: FilaEnvio[] = (data ?? []).map((e) => {
    const sku = uno(e.skus_maestros as { codigo: string; nombre: string; foto_url: string | null; numero: number | null; codigo_barras: string | null } | { codigo: string; nombre: string; foto_url: string | null; numero: number | null; codigo_barras: string | null }[] | null);
    return {
      id: e.id as string,
      codigo: sku?.codigo ?? "—",
      nombre: sku?.nombre ?? "",
      foto: sku?.foto_url ?? null,
      numero: sku?.numero ?? null,
      barras: sku?.codigo_barras ?? null,
      desde: uno(e.wms_bodegas as { nombre: string } | { nombre: string }[] | null)?.nombre ?? "—",
      hacia: uno(e.destino as { nombre: string } | { nombre: string }[] | null)?.nombre ?? "—",
      enviadoEn: e.enviado_en as string,
      enviada: Number(e.enviada),
      recibida: e.recibida === null ? null : Number(e.recibida),
      estado: e.estado as FilaEnvio["estado"],
      referencia: (e.referencia as string | null) ?? null,
      remisionId: (e.remision_id as string | null) ?? null,
      notas: uno(e.wms_remisiones as { notas: string | null } | { notas: string | null }[] | null)?.notas ?? null,
      motivo: (e.motivo_diferencia as string | null) ?? null,
      cajas: cajasDeLinea.get(e.id as string) ?? null,
    };
  });

  const puedeEscribir = !usuario.modulosSoloLectura.includes("inventario");
  // Las peticiones de corrección de estas líneas (migración 0237): sin ella, la lista se ve igual.
  const ids = filas.map((f) => f.id);
  const { data: filasCorreccion } = ids.length
    ? await supabase
        .from("wms_correcciones_remision")
        .select("id, envio_id, tipo, recibida_antes, recibida_nueva, motivo, estado, solicitante_nombre, autoriza_a, resuelta_por_nombre, nota_resolucion")
        .in("envio_id", ids)
        .order("creado_en", { ascending: false })
    : { data: [] };
  const correcciones: CorreccionVista[] = (filasCorreccion ?? []).map((c) => {
    const f = filas.find((x) => x.id === c.envio_id);
    return {
      id: c.id as string,
      envioId: c.envio_id as string,
      tipo: c.tipo as TipoCorreccion,
      recibidaAntes: c.recibida_antes as number | null,
      recibidaNueva: c.recibida_nueva as number | null,
      enviada: f?.enviada ?? 0,
      motivo: c.motivo as string,
      estado: c.estado as CorreccionVista["estado"],
      solicitante: c.solicitante_nombre as string,
      resueltaPor: (c.resuelta_por_nombre as string | null) ?? null,
      nota: (c.nota_resolucion as string | null) ?? null,
      codigo: f?.codigo ?? "—",
      remision: f?.referencia ?? null,
      meToca: puedeEscribir && ((c.autoriza_a as string[] | null) ?? []).includes(usuario.id),
    };
  });
  const pendientes = correcciones.filter((c) => c.estado === "pendiente");
  const conPendiente = new Set(pendientes.map((c) => c.envioId));
  const ultimas = new Map<string, string>();
  for (const c of correcciones) {
    if (c.estado === "pendiente" || ultimas.has(c.envioId)) continue;
    ultimas.set(c.envioId, `${c.estado === "autorizada" ? "Autorizó" : "Rechazó"} ${c.resueltaPor ?? "—"}: ${textoCorreccion(c)}${c.nota ? ` · ${c.nota}` : ""}`);
  }
  const { data: bodegas } = await supabase.from("wms_bodegas").select("id, nombre, tipo, codigo").eq("pais_id", pais.id).eq("activa", true).order("nombre");
  const propias = (bodegas ?? []).filter((b) => b.tipo === "propia").map((b) => ({ id: b.id as string, nombre: b.nombre as string }));
  const externas = (bodegas ?? []).filter((b) => b.tipo === "externa").map((b) => ({ id: b.id as string, nombre: b.nombre as string }));
  // Solo se puede remitir lo que hay: un compuesto o un producto con variantes no llevan stock propio.
  const [conStock, productos] = puedeEscribir && propias.length
    ? await Promise.all([
        traerTodasConError<{ bodega_id: string; sku_maestro_id: string; disponible: number }>((d, h) =>
          supabase.from("wms_stock").select("bodega_id, sku_maestro_id, disponible").in("bodega_id", propias.map((b) => b.id)).gt("disponible", 0).order("sku_maestro_id").range(d, h),
        ),
        traerTodasConError<{ id: string; codigo: string; nombre: string; estado: string; numero: number | null; foto_url: string | null; codigo_barras: string | null }>((d, h) =>
          supabase.from("skus_maestros").select("id, codigo, nombre, estado, numero, foto_url, codigo_barras").neq("tipo", "combo").is("opciones_variantes", null).order("codigo").range(d, h),
        ),
      ])
    : [{ data: [] }, { data: [] }];
  const stock: StockPorBodega = {};
  for (const s of conStock.data ?? []) (stock[s.bodega_id] ??= {})[s.sku_maestro_id] = Number(s.disponible);
  const hay = new Set((conStock.data ?? []).map((s) => s.sku_maestro_id));
  // Donde toda salida va con remisión, también se remite de una plataforma a otra: lo que hay allá es lo de su última lectura (Dunamixfy todavía no se lee).
  const plataformas: BodegaRemision[] = [];
  if (puedeEscribir && PAISES_SALIDA_CON_REMISION.includes(pais.codigo)) {
    const { porProducto } = await leerStockPlataformas(supabase, pais.id);
    for (const p of Object.keys(BODEGA_DE_PLATAFORMA) as Plataforma[]) {
      const bodega = (bodegas ?? []).find((b) => b.tipo === "externa" && b.codigo === BODEGA_DE_PLATAFORMA[p]);
      if (!bodega) continue;
      plataformas.push({ id: bodega.id as string, nombre: bodega.nombre as string });
      for (const [sku, s] of porProducto) {
        if (s[p] <= 0) continue;
        (stock[bodega.id as string] ??= {})[sku] = s[p];
        hay.add(sku);
      }
    }
  }
  // Las cajas de cada producto en cada bodega propia (migración 0236; sin ella, se sigue por unidades).
  const { data: guardadas } = puedeEscribir && propias.length
    ? await traerTodasConError<{ id: string; bodega_id: string; sku_maestro_id: string; cajas: number; unidades_por_caja: number; observacion: string | null; wms_ubicaciones: unknown }>((d, h) =>
        supabase.from("wms_cajas").select("id, bodega_id, sku_maestro_id, cajas, unidades_por_caja, observacion, wms_ubicaciones(codigo, notas)").in("bodega_id", propias.map((b) => b.id)).order("id").range(d, h),
      )
    : { data: [] };
  const cajas: CajasPorBodega = {};
  for (const c of guardadas ?? []) {
    const u = uno(c.wms_ubicaciones as { codigo: string; notas: string | null } | { codigo: string; notas: string | null }[] | null);
    const caja: CajaGuardada = { id: c.id, ubicacion: u?.codigo ?? "—", lugar: u?.notas ?? null, cajas: Number(c.cajas), porCaja: Number(c.unidades_por_caja), observacion: c.observacion };
    ((cajas[c.bodega_id] ??= {})[c.sku_maestro_id] ??= []).push(caja);
  }
  for (const porSku of Object.values(cajas)) for (const lista of Object.values(porSku)) lista.sort((a, b) => a.ubicacion.localeCompare(b.ubicacion) || b.porCaja - a.porCaja);
  const opciones = (productos.data ?? []).filter((p) => hay.has(p.id)).map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, estado: p.estado, numero: p.numero, barras: p.codigo_barras, foto: p.foto_url }));

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Remisiones" oculto />
      {puedeEscribir && (
        <div className="flex justify-end">
          <NuevaRemision propias={propias} externas={externas} plataformas={plataformas} productos={opciones} stock={stock} cajas={cajas} />
        </div>
      )}
      <CorreccionesPendientes pendientes={pendientes} />
      {error ? (
        <p role="alert" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          {/remision_id/.test(error.message) ? "Falta correr la migración 0233 en la base." : "No se pudieron cargar las remisiones."}
        </p>
      ) : (
        <ListaEnvios filas={filas} puedeEscribir={puedeEscribir} codigoPais={pais.codigo} conPendiente={[...conPendiente]} resueltas={Object.fromEntries(ultimas)} />
      )}
    </Pagina>
  );
}
