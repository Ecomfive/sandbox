import Link from "next/link";
import { BarraTienda, FaltaMigracionTienda, SinTiendas, rutaCon } from "@/components/tienda/barra-tienda";
import { anilloFoco } from "@/components/ui/field";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { formatearFechaHora } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { tiendasDeLaPersona } from "@/lib/tienda/acceso";
import { cambioDeTexto, efectoEtiquetas, resumirAsesores, textoMinutos, type EventoEtiqueta, type PedidoAsesor } from "@/lib/tienda/asesores";
import { etapaConfirmacion, tiempoEsperando } from "@/lib/tienda/confirmacion";
import { periodoElegido } from "@/lib/tienda/datos";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { diaPanama } from "@/lib/tienda/resumen";
import { sumarDias } from "@/lib/tienda/rango";

export const metadata = { title: "Asesores de tienda" };

export const dynamic = "force-dynamic";

type FilaEvento = { orden_id: string; usuario: string | null; usuario_id?: string | null; creado_en: string; agregadas?: string[] | null; quitadas?: string[] | null; detalle: string | null };

const texto = (x: string | string[] | undefined) => (typeof x === "string" && x ? x : null);
const num = (n: number) => n.toLocaleString("es-PA");
const ahoraMismo = () => Date.now();

/**
 * Pedidos de tienda › Asesores (20 nov 2026, pedido de Hernán: que Beatriz, la encargada de atención, vea el rendimiento de los asesores). Cada asesor queda
 * registrado cuando confirma o cambia etiquetas de un pedido desde el sistema (`etiquetas-actions.ts`); lo que se hace directo en Shopify no tiene asesor y
 * sale aparte («fuera del sistema»). Por asesor: confirmación (atendidos, confirmados, cancelados, en gestión, % de confirmación) y rapidez (cuánto tarda en
 * confirmar desde que entra el pedido). Arriba, la cola de cada tienda. Cada persona ve solo sus tiendas (`tiendas_permitidas`). Módulo «tienda-asesores».
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

  // Los cambios de etiquetas hechos desde el sistema en el periodo (días de Panamá).
  const desde = `${periodo.desde}T00:00:00-05:00`;
  const hasta = `${sumarDias(periodo.hasta, 1)}T00:00:00-05:00`;
  const leer = (columnas: string) =>
    traerTodasLasFilas<FilaEvento>((d, h) =>
      supabase.from("ven_orden_eventos").select(columnas).eq("tipo", "etiqueta").gte("creado_en", desde).lt("creado_en", hasta).order("creado_en").range(d, h) as unknown as PromiseLike<{ data: FilaEvento[] | null; error: unknown }>,
    );
  // Sin la migración 0344 no están el perfil ni las etiquetas: se leen del texto del historial.
  const filas = await leer("orden_id, usuario, usuario_id, creado_en, agregadas, quitadas, detalle").catch(() => leer("orden_id, usuario, creado_en, detalle").catch(() => [] as FilaEvento[]));

  // De qué tienda es cada pedido y cuándo entró (solo los de las tiendas que se miran).
  const ids = [...new Set(filas.map((f) => f.orden_id))];
  const pedidosAsesor = new Map<string, PedidoAsesor>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from("ven_ordenes").select("id, unidad_id, creado_origen").in("id", ids.slice(i, i + 300));
    for (const o of data ?? []) {
      const t = tiendaDeUnidad.get(o.unidad_id as string);
      if (t) pedidosAsesor.set(o.id as string, { tiendaId: t, creado: (o.creado_origen as string | null) ?? null });
    }
  }
  const eventos: EventoEtiqueta[] = filas.map((f) => {
    const viejo = Array.isArray(f.agregadas) ? null : cambioDeTexto(f.detalle);
    return {
      ordenId: f.orden_id,
      usuarioId: f.usuario_id ?? null,
      usuario: f.usuario,
      creadoEn: f.creado_en,
      agregadas: viejo ? viejo.agregadas : (f.agregadas ?? []),
      quitadas: viejo ? viejo.quitadas : (f.quitadas ?? []),
    };
  });
  const asesores = resumirAsesores(eventos, pedidosAsesor, nombreTienda);

  // Confirmados del periodo (de Shopify) que nadie confirmó desde el sistema: se hicieron directo en Shopify.
  const confirmadosEnSistema = new Set(eventos.filter((e) => pedidosAsesor.has(e.ordenId) && efectoEtiquetas(e.agregadas).confirma).map((e) => e.ordenId));
  const delPeriodo = pedidos.filter((p) => !p.sinHora && diaPanama(p.creado) >= periodo.desde && diaPanama(p.creado) <= periodo.hasta);
  const confirmadosPeriodo = delPeriodo.filter((p) => etapaConfirmacion(p) === "confirmado");
  const fueraDelSistema = confirmadosPeriodo.filter((p) => !confirmadosEnSistema.has(p.id)).length;

  // La cola de cada tienda ahora: por confirmar, esperando respuesta y el más viejo.
  const ahora = ahoraMismo();
  const cola = miradas.map((t) => {
    const sinConfirmar = pedidos.filter((p) => p.tiendaId === t.id && p.estado === "nuevo" && !p.sinHora).sort((a, b) => a.creado.localeCompare(b.creado));
    return {
      tienda: t,
      porConfirmar: sinConfirmar.filter((p) => etapaConfirmacion(p) === "por_confirmar").length,
      esperando: sinConfirmar.filter((p) => etapaConfirmacion(p) === "esperando").length,
      masViejo: sinConfirmar[0] ? tiempoEsperando(sinConfirmar[0].creado, ahora) : null,
      escribe: (escritura ?? []).find((x) => x.id === t.id)?.escribe_shopify === true,
    };
  });
  const sinEscribir = cola.filter((c) => !c.escribe).map((c) => c.tienda.nombre);

  const fechas = { periodo: texto(sp.periodo), desde: texto(sp.desde), hasta: texto(sp.hasta) };
  const th = "px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase whitespace-nowrap";
  const thN = `${th} text-right`;
  const td = "px-3 py-2 text-sm";
  const tdN = `${td} text-right tabular-nums`;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <EncabezadoPagina titulo="Asesores" oculto>
        El rendimiento de los asesores de las tiendas de {pais.nombre}: cuánto confirman y qué tan rápido.
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

      <section aria-label="Resumen" className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg border border-border bg-card px-4 py-3 text-sm">
        <span>
          <b className="tabular-nums text-primario">{num(confirmadosEnSistema.size)}</b> confirmados desde el sistema
        </span>
        <span>
          <b className="tabular-nums">{num(fueraDelSistema)}</b> confirmados directo en Shopify (sin asesor)
        </span>
        <span>
          <b className="tabular-nums">{num(asesores.length)}</b> {asesores.length === 1 ? "asesor" : "asesores"} con movimiento · {periodo.etiqueta.toLowerCase()}
        </span>
      </section>

      <section aria-label="Rendimiento por asesor" className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold">Por asesor</h2>
        {asesores.length ? (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[56rem] border-collapse">
              <thead className="bg-muted">
                <tr>
                  <th className={th}>Asesor</th>
                  <th className={th}>Tiendas</th>
                  <th className={thN}>Atendidos</th>
                  <th className={thN}>Confirmados</th>
                  <th className={thN}>Cancelados</th>
                  <th className={thN}>En gestión</th>
                  <th className={thN}>% confirmación</th>
                  <th className={thN}>Tarda en confirmar</th>
                  <th className={th}>Último movimiento</th>
                </tr>
              </thead>
              <tbody>
                {asesores.map((a) => (
                  <tr key={a.clave} className="border-t border-border/60">
                    <td className={`${td} font-medium`}>{a.nombre}</td>
                    <td className={`${td} text-muted-foreground`}>{a.tiendas.join(", ")}</td>
                    <td className={tdN}>{num(a.atendidos)}</td>
                    <td className={`${tdN} font-semibold text-primario`}>{num(a.confirmados)}</td>
                    <td className={tdN}>{num(a.cancelados)}</td>
                    <td className={tdN}>{num(a.enGestion)}</td>
                    <td className={tdN}>{a.tasa === null ? "—" : `${a.tasa.toLocaleString("es-PA")} %`}</td>
                    <td className={tdN} title={a.minutosPromedio === null ? undefined : `Promedio: ${textoMinutos(a.minutosPromedio)}`}>
                      {textoMinutos(a.minutosMediana)}
                    </td>
                    <td className={`${td} whitespace-nowrap text-muted-foreground`}>{formatearFechaHora(a.ultimo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
            Nadie confirmó ni cambió etiquetas desde el sistema en {periodo.etiqueta.toLowerCase()}. Cada asesor aparece aquí cuando usa «Confirmar pedido» o cambia las
            etiquetas en la ficha del pedido.
          </p>
        )}
        <p className="m-0 text-xs text-muted-foreground">
          Cuenta lo que cada asesor hace desde el sistema: confirmar (etiqueta «Confirmada»), cancelar («ANULADO…» o «Cancelado») o dejar en gestión («Pendiente»,
          «Modificar…»). Un pedido cuenta una vez por asesor, con lo último que hizo. «Tarda en confirmar» es la mediana desde que entró el pedido en Shopify hasta que lo
          confirmó (pasa el cursor para ver el promedio).
          {sinEscribir.length ? ` ${sinEscribir.join(", ")} todavía no tiene encendido «Escribir en Shopify»: ahí no se puede confirmar desde el sistema.` : ""}
        </p>
      </section>

      <section aria-label="Cola de cada tienda" className="flex flex-col gap-2">
        <h2 className="m-0 text-sm font-semibold">Cola ahora</h2>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[32rem] border-collapse">
            <thead className="bg-muted">
              <tr>
                <th className={th}>Tienda</th>
                <th className={thN}>Por confirmar</th>
                <th className={thN}>Esperando respuesta</th>
                <th className={thN}>El más viejo lleva</th>
              </tr>
            </thead>
            <tbody>
              {cola.map((c) => (
                <tr key={c.tienda.id} className="border-t border-border/60">
                  <td className={`${td} font-medium`}>
                    <Link href={rutaCon("/tienda-pedidos/confirmacion", { tienda: c.tienda.id })} className={`underline-offset-2 hover:underline ${anilloFoco}`}>
                      {c.tienda.nombre}
                    </Link>
                  </td>
                  <td className={tdN}>{num(c.porConfirmar)}</td>
                  <td className={tdN}>{num(c.esperando)}</td>
                  <td className={tdN}>{c.masViejo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Pagina>
  );
}
