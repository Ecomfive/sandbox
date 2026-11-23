import Link from "next/link";
import { BarraTienda, FaltaMigracionTienda, SinTiendas, rutaCon } from "@/components/tienda/barra-tienda";
import { anilloFoco } from "@/components/ui/field";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { tiendasDeLaPersona } from "@/lib/tienda/acceso";
import {
  atencionesDe,
  cambioDeTexto,
  confirmadosPorDia,
  contarRangos,
  efectoEtiquetas,
  notaDelBot,
  puntuarAsesores,
  resumirBot,
  resumirAsesores,
  type EventoEtiqueta,
  type PedidoAsesor,
} from "@/lib/tienda/asesores";
import { etapaConfirmacion, tiempoEsperando } from "@/lib/tienda/confirmacion";
import { periodoElegido } from "@/lib/tienda/datos";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { diaPanama } from "@/lib/tienda/resumen";
import { sumarDias } from "@/lib/tienda/rango";
import { PanelAsesores, type DatosPanelAsesores } from "./panel-asesores";

export const metadata = { title: "Asesores de tienda" };

export const dynamic = "force-dynamic";

type FilaEvento = { orden_id: string; usuario: string | null; usuario_id?: string | null; creado_en: string; agregadas?: string[] | null; quitadas?: string[] | null; detalle: string | null };

const texto = (x: string | string[] | undefined) => (typeof x === "string" && x ? x : null);
const ahoraMismo = () => Date.now();
/** Cuántos pedidos de cada asesor salen en su paso a paso (los más recientes). */
const PASOS_POR_ASESOR = 40;

/**
 * Pedidos de tienda › Asesores (20 nov 2026; panel del 23 nov 2026 con el prototipo aprobado por Hernán: donas, rangos de atención, corona a los 3 mejores y
 * paso a paso). Cada asesor queda registrado cuando confirma o cambia etiquetas de un pedido desde el sistema (`etiquetas-actions.ts`); lo que se hace directo
 * en Shopify no tiene asesor y sale aparte. Cada persona ve solo sus tiendas (`tiendas_permitidas`). Módulo «tienda-asesores».
 */
export default async function AsesoresTiendaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("tienda-asesores");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, tienda, limitado, faltaMigracion } = await tiendasDeLaPersona(supabase, pais.id, sp.tienda);
  const eleccion = periodoElegido(sp);
  const miradas = tienda ? [tienda] : tiendas;
  if (faltaMigracion || !tiendas.length)
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-5">
        <EncabezadoPagina titulo="Asesores" oculto>
          El rendimiento de los asesores de las tiendas de {pais.nombre}.
        </EncabezadoPagina>
        {faltaMigracion ? <FaltaMigracionTienda /> : <SinTiendas pais={pais.nombre} />}
      </Pagina>
    );

  // Los pedidos del periodo (para lo confirmado fuera del sistema) y la cola de 60 días (los sin confirmar), como Confirmación.
  const [{ pedidos, fuente, periodo }, { data: escritura }] = await Promise.all([
    pedidosDeTiendas(supabase, miradas, pais.codigo, eleccion, { minDias: 60, abiertos: ["nuevo", "confirmado"], periodoLiviano: true }),
    supabase.from("tiendas").select("id, escribe_shopify").in("id", miradas.map((t) => t.id)),
  ]);
  const tiendaDeUnidad = new Map<string, string>();
  for (const t of miradas) {
    const u = fuente.unidadDe.get(t.id);
    if (u) tiendaDeUnidad.set(u, t.id);
  }
  const nombreTienda = (id: string) => tiendas.find((t) => t.id === id)?.nombre ?? "—";

  // Los cambios de etiquetas hechos desde el sistema: los del periodo y, para comparar, los del periodo anterior del mismo largo (días de Panamá).
  const leer = (de: string, a: string, columnas: string) =>
    traerTodasLasFilas<FilaEvento>((d, h) =>
      supabase.from("ven_orden_eventos").select(columnas).eq("tipo", "etiqueta").gte("creado_en", `${de}T00:00:00-05:00`).lt("creado_en", `${a}T00:00:00-05:00`).order("creado_en").range(d, h) as unknown as PromiseLike<{ data: FilaEvento[] | null; error: unknown }>,
    );
  // Sin la migración 0345 no están el perfil ni las etiquetas: se leen del texto del historial.
  const leerConViejo = (de: string, a: string) => leer(de, a, "orden_id, usuario, usuario_id, creado_en, agregadas, quitadas, detalle").catch(() => leer(de, a, "orden_id, usuario, creado_en, detalle").catch(() => [] as FilaEvento[]));
  const [filas, filasAntes] = await Promise.all([leerConViejo(periodo.desde, sumarDias(periodo.hasta, 1)), leerConViejo(sumarDias(periodo.desde, -periodo.dias), periodo.desde)]);

  // De qué tienda es cada pedido, cuándo entró, su número, su cliente y su primer producto (solo los de las tiendas que se miran).
  const ids = [...new Set([...filas, ...filasAntes].map((f) => f.orden_id))];
  const pedidosAsesor = new Map<string, PedidoAsesor>();
  const detalle = new Map<string, { numero: string; cliente: string | null; producto: string | null }>();
  for (let i = 0; i < ids.length; i += 300) {
    const tanda = ids.slice(i, i + 300);
    const [{ data }, { data: lineas }] = await Promise.all([
      supabase.from("ven_ordenes").select("id, numero, unidad_id, creado_origen, ven_ordenes_clientes(nombre)").in("id", tanda),
      supabase.from("ven_orden_lineas").select("orden_id, linea, producto, es_servicio").in("orden_id", tanda).order("linea"),
    ]);
    const primero = new Map<string, string>();
    for (const l of lineas ?? []) if (!l.es_servicio && !primero.has(l.orden_id as string)) primero.set(l.orden_id as string, String(l.producto ?? ""));
    for (const o of data ?? []) {
      const t = tiendaDeUnidad.get(o.unidad_id as string);
      if (!t) continue;
      pedidosAsesor.set(o.id as string, { tiendaId: t, creado: (o.creado_origen as string | null) ?? null });
      const cli = o.ven_ordenes_clientes as { nombre?: string | null } | { nombre?: string | null }[] | null;
      detalle.set(o.id as string, { numero: String(o.numero ?? "—"), cliente: (Array.isArray(cli) ? cli[0]?.nombre : cli?.nombre) ?? null, producto: primero.get(o.id as string) ?? null });
    }
  }
  const aEventos = (xs: FilaEvento[]): EventoEtiqueta[] =>
    xs.map((f) => {
      const viejo = Array.isArray(f.agregadas) ? null : cambioDeTexto(f.detalle);
      return { ordenId: f.orden_id, usuarioId: f.usuario_id ?? null, usuario: f.usuario, creadoEn: f.creado_en, agregadas: viejo ? viejo.agregadas : (f.agregadas ?? []), quitadas: viejo ? viejo.quitadas : (f.quitadas ?? []) };
    });
  const eventos = aEventos(filas);
  const asesores = puntuarAsesores(resumirAsesores(eventos, pedidosAsesor, nombreTienda));
  const atenciones = atencionesDe(eventos, pedidosAsesor);

  // Confirmados desde el sistema (una vez por pedido, el día del primero) y los del periodo anterior, para comparar.
  const primerConfirmado = (xs: EventoEtiqueta[]) => {
    const m = new Map<string, string>();
    for (const e of xs) if (pedidosAsesor.has(e.ordenId) && efectoEtiquetas(e.agregadas).confirma && !m.has(e.ordenId)) m.set(e.ordenId, e.creadoEn);
    return m;
  };
  const confirmadosSistema = primerConfirmado(eventos);
  const confirmadosAntes = primerConfirmado(aEventos(filasAntes)).size;
  // Confirmados del periodo (de Shopify) que nadie confirmó desde el sistema: se hicieron directo en Shopify.
  const delPeriodo = pedidos.filter((p) => !p.sinHora && diaPanama(p.creado) >= periodo.desde && diaPanama(p.creado) <= periodo.hasta);
  const enShopify = delPeriodo.filter((p) => etapaConfirmacion(p) === "confirmado" && !confirmadosSistema.has(p.id));

  // Las ventas del bot de iComfly (23 nov 2026): los pedidos del periodo con la etiqueta «chatbot» o con la nota que deja el bot («… Venta por bot …»).
  // La nota no viene en la lista de pedidos: se buscan aparte los del periodo que la tienen.
  const unidades = [...tiendaDeUnidad.keys()];
  const conNotaBot = new Set(
    unidades.length
      ? (
          await traerTodasLasFilas<{ orden_id: string; notas: string | null }>((d, h) =>
            supabase
              .from("ven_ordenes_clientes")
              .select("orden_id, notas, ven_ordenes!inner(unidad_id, fecha)")
              .ilike("notas", "%venta por bot%")
              .in("ven_ordenes.unidad_id", unidades)
              .gte("ven_ordenes.fecha", periodo.desde)
              .lte("ven_ordenes.fecha", periodo.hasta)
              .order("orden_id")
              .range(d, h) as unknown as PromiseLike<{ data: { orden_id: string; notas: string | null }[] | null; error: unknown }>,
          ).catch(() => [] as { orden_id: string; notas: string | null }[])
        )
          .filter((f) => notaDelBot(f.notas))
          .map((f) => f.orden_id)
      : [],
  );
  const bot = resumirBot(
    delPeriodo.map((p) => ({ tienda: nombreTienda(p.tiendaId), estado: p.estado, creado: p.creado, esBot: p.entrada === "bot" || conNotaBot.has(p.id) })),
    periodo.desde,
    periodo.hasta,
  );

  // La cola de cada tienda ahora: por confirmar, esperando respuesta y el más viejo.
  const ahora = ahoraMismo();
  const cola = miradas.map((t) => {
    const sinConfirmar = pedidos.filter((p) => p.tiendaId === t.id && p.estado === "nuevo" && !p.sinHora).sort((a, b) => a.creado.localeCompare(b.creado));
    return {
      tiendaId: t.id,
      tienda: t.nombre,
      porConfirmar: sinConfirmar.filter((p) => etapaConfirmacion(p) === "por_confirmar").length,
      esperando: sinConfirmar.filter((p) => etapaConfirmacion(p) === "esperando").length,
      masViejo: sinConfirmar[0] ? tiempoEsperando(sinConfirmar[0].creado, ahora) : null,
      escribe: (escritura ?? []).find((x) => x.id === t.id)?.escribe_shopify === true,
    };
  });

  // El paso a paso: los más recientes de cada asesor, con el número, la tienda, el cliente y el producto del pedido.
  const porAsesor = new Map<string, number>();
  const pasos = atenciones
    .filter((a) => {
      const n = porAsesor.get(a.clave) ?? 0;
      porAsesor.set(a.clave, n + 1);
      return n < PASOS_POR_ASESOR;
    })
    .map((a) => {
      const p = pedidosAsesor.get(a.ordenId)!;
      const d = detalle.get(a.ordenId);
      return { clave: a.clave, ordenId: a.ordenId, numero: d?.numero ?? "—", tiendaId: p.tiendaId, tienda: nombreTienda(p.tiendaId), cliente: d?.cliente ?? null, producto: d?.producto ?? null, entra: p.creado, resultado: a.resultado, minutos: a.minutos, pasos: a.pasos };
    });
  const minutosConfirmados = atenciones.filter((a) => a.resultado === "confirma" && a.minutos !== null).map((a) => a.minutos as number);
  const resueltos = atenciones.filter((a) => a.resultado === "confirma" || a.resultado === "cancela");
  const mediana = (() => {
    const s = [...minutosConfirmados].sort((a, b) => a - b);
    if (!s.length) return null;
    const m = Math.floor(s.length / 2);
    return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
  })();

  const datos: DatosPanelAsesores = {
    periodo: periodo.etiqueta.toLowerCase(),
    totales: {
      confirmadosSistema: confirmadosSistema.size,
      confirmadosAntes,
      enShopify: enShopify.length,
      atendidos: atenciones.length,
      confirmados: atenciones.filter((a) => a.resultado === "confirma").length,
      cancelados: atenciones.filter((a) => a.resultado === "cancela").length,
      enGestion: atenciones.filter((a) => a.resultado === "gestion" || a.resultado === "otro").length,
      tasa: resueltos.length ? Math.round((resueltos.filter((a) => a.resultado === "confirma").length / resueltos.length) * 1000) / 10 : null,
      mediana,
    },
    asesores,
    rangos: contarRangos(minutosConfirmados),
    porDia: confirmadosPorDia([...confirmadosSistema.values()].map((t) => ({ t })), enShopify, periodo.desde, periodo.hasta),
    pasos,
    cola,
    multiTienda: miradas.length > 1,
    bot,
  };

  const fechas = { periodo: texto(sp.periodo), desde: texto(sp.desde), hasta: texto(sp.hasta) };
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Asesores" oculto>
        El rendimiento de los asesores de las tiendas de {pais.nombre}: cuánto confirman, qué tan rápido y qué hacen con cada pedido.
      </EncabezadoPagina>
      <BarraTienda
        ruta="/tienda-pedidos/asesores"
        rutaTiendas="/tienda-pedidos"
        tiendas={tiendas}
        tiendaId={null}
        tiendaActiva={false}
        periodo={periodo}
        extra={{ tienda: tienda?.id ?? null }}
        sinTodas
        enlaces={[{ texto: "Asesores", href: rutaCon("/tienda-pedidos/asesores", fechas), activo: true }]}
      />

      {/* De qué tiendas se mide (la barra de arriba lleva a los pedidos de cada tienda). */}
      <nav aria-label="Tiendas que se miden" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Asesores de:</span>
        {!limitado && (
          <Link href={rutaCon("/tienda-pedidos/asesores", fechas)} aria-current={!tienda ? "page" : undefined} className={`rounded-full border px-3 py-1 ${anilloFoco} ${!tienda ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`}>
            Todas
          </Link>
        )}
        {tiendas.map((t) => (
          <Link
            key={t.id}
            href={rutaCon("/tienda-pedidos/asesores", { ...fechas, tienda: t.id })}
            aria-current={tienda?.id === t.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1 ${anilloFoco} ${tienda?.id === t.id ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`}
          >
            {t.nombre}
          </Link>
        ))}
      </nav>

      <PanelAsesores datos={datos} />
    </Pagina>
  );
}
