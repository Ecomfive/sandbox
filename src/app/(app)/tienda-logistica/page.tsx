import { after } from "next/server";
import { AvisoConexion, BarraTienda, FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { formatearFechaHora } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { revisarSiHaceFalta } from "@/lib/tienda/conectar-shopify";
import { cargarTiendas, tiendaElegida } from "@/lib/tienda/datos";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { entregasDeOrdenes, guiasDeOrdenes } from "@/lib/tienda/entregas-monday";
import { etapaLogistica, razonAVerificar } from "@/lib/tienda/logistica";
import { tipoPrincipal } from "@/lib/tienda/postventa-tienda";
import type { SinPedidoMonday } from "./logistica-tienda";
import { diaPanama } from "@/lib/tienda/resumen";
import { LeerSiscore } from "./leer-siscore";
import { LogisticaTienda } from "./logistica-tienda";

export const metadata = { title: "Logística de tienda" };

export const dynamic = "force-dynamic";

/** Hasta dónde se buscan pedidos por preparar y en ruta (todos los pendientes, como Mi Reto Digital). */
const DIAS_LOGISTICA = 60;
/** Cuántos días se siguen viendo en Entregados y Rechazados los pedidos que cerraron Monday o Servientrega. */
const DIAS_CERRADOS = 7;

const ahoraMismo = () => Date.now();

/**
 * Gestión de tienda › Logística (12 nov 2026, como la pantalla de Mi Reto Digital, con lo que hay): los pedidos confirmados por preparar (listos hoy
 * o programados para después, por la fecha de la nota), los que van en ruta por zona y los demorados. Solo lectura. Shopify no trae la guía ni la
 * entrega de Kenku: lo despachado queda en ruta, con los días contados desde el pedido, salvo lo que Monday (ciudad) marca entregado o rechazado.
 */
export default async function LogisticaTiendaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("tienda-logistica");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, faltaMigracion } = await cargarTiendas(supabase, pais.id);
  const tienda = tiendaElegida(tiendas, sp.tienda);
  const miradas = tienda ? [tienda] : tiendas;
  // Solo la tienda que se mira (14 nov 2026: «si abro Kenku, que se actualice Kenku»); con «Todas», todas.
  after(() => revisarSiHaceFalta(createServiceClient(), miradas));
  const { pedidos, fuente } = await pedidosDeTiendas(supabase, miradas, pais.codigo, { tipo: "atajo", id: "hoy" }, { minDias: DIAS_LOGISTICA });
  // Lo que se gestiona: los que llegaron de Shopify (los del Excel de Finanzas son una foto vieja), por preparar o en ruta, lo más viejo arriba.
  // Desde el 12 nov 2026 lo que Monday o Servientrega dan por entregado o devuelto pasa a esa fase en la orden: para que las tarjetas Entregados y
  // Rechazados sigan diciendo algo, también van los cerrados por ellos en los últimos días (`DIAS_CERRADOS`).
  const candidatos = pedidos.filter((p) => !p.sinHora && etapaLogistica(p.estado) !== null).sort((a, b) => a.creado.localeCompare(b.creado));
  // Las entregas: de interior, la guía de Servientrega leída de SISCORE; de ciudad, lo registrado en Monday (entregado, rechazado, el repartidor).
  const ids = candidatos.map((p) => p.id);
  const [entregas, guias, { data: lecturas }] = await Promise.all([
    entregasDeOrdenes(supabase, ids),
    guiasDeOrdenes(supabase, ids),
    // La última lectura de SISCORE de la tienda que se mira (14 nov 2026: van por tienda); con «Todas», la última de cualquiera.
    (tienda ? supabase.from("tienda_guias_lecturas").select("fin").eq("estado", "listo").eq("tienda_id", tienda.id) : supabase.from("tienda_guias_lecturas").select("fin").eq("estado", "listo"))
      .order("fin", { ascending: false })
      .limit(1),
  ]);
  for (const p of candidatos) {
    const g = guias.get(p.id) ?? null;
    p.entrega = g ?? entregas.get(p.id) ?? null;
    if (g?.guia) {
      p.transportista = "Servientrega";
      p.guia = g.guia;
    } else if (!p.transportista && p.entrega?.repartidor) p.transportista = p.entrega.repartidor;
  }
  const desde = new Date(ahoraMismo() - DIAS_CERRADOS * 86_400_000).toISOString().slice(0, 10);
  // A verificar (13 nov 2026): lo que Monday o Servientrega no dejan asignar solo (en camino sin registro, cerrados que contradicen); van aunque sean viejos.
  for (const p of candidatos) p.aVerificar = razonAVerificar(p);
  const activos = candidatos.filter((p) => {
    const e = etapaLogistica(p.estado);
    return e === "por_preparar" || e === "en_ruta" || !!p.aVerificar || (!!p.entrega?.fecha && p.entrega.fecha >= desde);
  });
  const sinPedido = await mondaySinPedido(supabase, [...new Set(miradas.map((t) => fuente.unidadDe.get(t.id)).filter((u): u is string => !!u))]);
  const ultimaSiscore = (lecturas?.[0]?.fin as string | undefined) ?? null;
  const puedeLeer = !usuario.modulosSoloLectura.includes("tienda-logistica");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Logística" oculto>
        Los pedidos de las tiendas de {pais.nombre} por preparar y en ruta.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <FaltaMigracionTienda />
      ) : !tiendas.length ? (
        <SinTiendas pais={pais.nombre} />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <BarraTienda ruta="/tienda-logistica" tiendas={tiendas} tiendaId={tienda?.id ?? null} />
            {puedeLeer && <LeerSiscore key={tienda?.id ?? "todas"} ultima={ultimaSiscore ? formatearFechaHora(ultimaSiscore) : null} tiendaId={tienda?.id ?? null} tiendaNombre={tienda?.nombre ?? null} />}
          </div>
          <AvisoConexion tiendas={miradas} finanzas={fuente} />
          <LogisticaTienda
            pedidos={activos}
            codigoPais={pais.codigo}
            tiendas={Object.fromEntries(tiendas.map((t) => [t.id, t.nombre]))}
            hoy={diaPanama(new Date(ahoraMismo()).toISOString())}
            sinPedido={sinPedido}
          />
        </>
      )}
    </Pagina>
  );
}

/** Cuántos días atrás se buscan filas de Monday sin pedido (por la última actualización del ítem). */
const DIAS_SIN_PEDIDO = 45;

/**
 * Las filas de Monday de esas tiendas que no se enlazaron con ningún pedido del sistema (13 nov 2026, «A verificar»: un número mal escrito o un pedido
 * que no entró), actualizadas en los últimos `DIAS_SIN_PEDIDO` días; una por número, la más reciente. Sin la migración, ninguna.
 */
async function mondaySinPedido(supabase: ReturnType<typeof createServiceClient>, unidades: string[]): Promise<SinPedidoMonday[]> {
  if (!unidades.length) return [];
  const desde = new Date(ahoraMismo() - DIAS_SIN_PEDIDO * 86_400_000).toISOString();
  const [{ data, error }, { data: extra }, { data: cfg }, { data: casos }] = await Promise.all([
    supabase
      .from("mon_despachos")
      .select("numero_pedido, tablero_id, estado, estado_asesores, observaciones_asesores, courier, actualizado_monday")
      .is("orden_id", null)
      .in("unidad_id", unidades)
      .gte("actualizado_monday", desde)
      .order("actualizado_monday", { ascending: false })
      .limit(300),
    supabase.from("mon_tableros_extra").select("tablero_id, nombre"),
    supabase.from("mon_config").select("tablero_id, tablero_nombre").eq("id", 1).maybeSingle(),
    // Los cambios y reembolsos de Monday (migración 0290) cuyo pedido no está en el sistema; sin la tabla, ninguno.
    supabase
      .from("mon_postventa")
      .select("numero_pedido, nombre, tipos, estado, motivo, creado_monday")
      .is("orden_id", null)
      .in("unidad_id", unidades)
      .gte("creado_monday", desde)
      .order("creado_monday", { ascending: false })
      .limit(100),
  ]);
  if (error) return [];
  const nombres = new Map<string, string>(((extra ?? []) as { tablero_id: string; nombre: string }[]).map((t) => [t.tablero_id, t.nombre]));
  if (cfg?.tablero_id) nombres.set(String(cfg.tablero_id), "Consolidado");
  const vistos = new Set<string>();
  const filas: SinPedidoMonday[] = [];
  for (const x of (data ?? []) as Record<string, string | null>[]) {
    const numero = (x.numero_pedido ?? "").trim();
    if (!numero || vistos.has(numero)) continue;
    vistos.add(numero);
    filas.push({
      numero,
      tablero: nombres.get(String(x.tablero_id)) ?? String(x.tablero_id),
      estado: [x.estado, x.estado_asesores ? `asesores: ${x.estado_asesores}` : null].filter(Boolean).join(" · ") || "sin estado",
      nota: x.observaciones_asesores ?? null,
      repartidor: (x.courier ?? "").replace(/\s+/g, " ").trim() || null,
      fecha: x.actualizado_monday ? String(x.actualizado_monday).slice(0, 10) : null,
    });
  }
  for (const x of (casos ?? []) as Record<string, unknown>[]) {
    filas.push({
      numero: String(x.numero_pedido ?? x.nombre ?? "").trim() || "sin número",
      tablero: "Cambios y reembolsos",
      estado: [tipoPrincipal(Array.isArray(x.tipos) ? (x.tipos as string[]) : []), x.estado].filter(Boolean).join(" · "),
      nota: (x.motivo as string | null) ?? null,
      repartidor: null,
      fecha: x.creado_monday ? String(x.creado_monday).slice(0, 10) : null,
    });
  }
  return filas;
}
