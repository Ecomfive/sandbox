import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { claseThLista, claseTdLista, Pastilla } from "@/components/panel/piezas-panel";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { formatearFechaHora, formatearMoneda } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarOrdenTienda } from "@/lib/tienda/orden-detalle";
import { ESTADOS_PEDIDO, esEstadoPedido } from "@/lib/tienda/resumen";
import { tituloVariante } from "@/lib/tienda/vincular-variante";
import { DetalleOrdenFinanzas } from "./detalle-finanzas";
import { NotaPedido } from "./nota-pedido";

export const metadata = { title: "Pedido de tienda" };

export const dynamic = "force-dynamic";

function Tarjeta({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col gap-3 rounded-2xl border border-border bg-card p-5">
      <h2 id={id} className="m-0 text-[15px] font-semibold">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0 text-right">{children}</dd>
    </div>
  );
}

/**
 * Gestión de tienda › el detalle de un pedido de Shopify: sus productos con el SKU de Shopify y el producto nuestro al que corresponde, los totales,
 * el cliente y la entrega, el historial y las notas internas del equipo. Solo lectura de Shopify: lo único que se escribe son las notas, que no van allá.
 */
export default async function PedidoTiendaPage({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await requireModulo("tienda-pedidos");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { data: p } = await supabase
    .from("tienda_pedidos")
    .select(
      "id, tienda_id, shopify_pedido_id, numero, creado_shopify, cliente_nombre, cliente_telefono, provincia, ciudad, direccion, moneda, subtotal, descuentos, envio, total, estado, estado_pago, transportista, guia, cancelado_en, motivo, recibido_en, actualizado_en, tiendas(nombre, dominio, pais_id)",
    )
    .eq("id", id)
    .maybeSingle();
  const tienda = (p?.tiendas ?? null) as unknown as { nombre: string; dominio: string | null; pais_id: string } | null;
  // Una tienda sin conectar muestra las órdenes de Finanzas (11 nov 2026): si no es un pedido de Shopify, puede ser una de ellas.
  if (!p) {
    // Una tienda sin conectar (o conectada en vivo) muestra sus órdenes de `ven_ordenes` (11 y 12 nov 2026): la misma ficha que se abre al lado en Pedidos.
    const orden = await cargarOrdenTienda(supabase, id, pais.id);
    if (!orden) notFound();
    return <DetalleOrdenFinanzas orden={orden} codigoPais={pais.codigo} puedeEscribir={!usuario.modulosSoloLectura.includes("tienda-pedidos")} />;
  }
  // Solo los pedidos de las tiendas del país elegido arriba.
  if (!tienda || tienda.pais_id !== pais.id) notFound();

  const [{ data: lineas }, { data: notas }] = await Promise.all([
    supabase.from("tienda_pedido_lineas").select("id, shopify_variante_id, titulo, variante_titulo, sku, cantidad, precio").eq("pedido_id", id).order("shopify_linea_id"),
    supabase.from("tienda_pedido_notas").select("id, texto, autor_nombre, creado_en").eq("pedido_id", id).order("creado_en"),
  ]);
  const varianteIds = (lineas ?? []).map((l) => l.shopify_variante_id).filter((v): v is number => v !== null);
  const { data: variantes } = varianteIds.length
    ? await supabase.from("tienda_variantes").select("shopify_variante_id, sku_maestro_id, no_fisico, skus_maestros(codigo, nombre)").eq("tienda_id", p.tienda_id).in("shopify_variante_id", varianteIds)
    : { data: [] };
  const vinculo = new Map((variantes ?? []).map((v) => [Number(v.shopify_variante_id), v]));
  const estado = ESTADOS_PEDIDO.find((e) => e.id === (esEstadoPedido(p.estado) ? p.estado : "nuevo"))!;
  const dinero = (n: number | null) => (n === null ? "—" : formatearMoneda(Number(n), pais.codigo));
  const puedeEscribir = !usuario.modulosSoloLectura.includes("tienda-pedidos");
  const enShopify = tienda.dominio ? `https://${tienda.dominio}/admin/orders/${p.shopify_pedido_id}` : null;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-5">
      <Link href="/tienda-pedidos" className="text-sm font-medium text-primario">
        ← Volver a Pedidos
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="m-0 text-xl font-semibold tracking-tight">Pedido {p.numero}</h1>
          <Pastilla tono={estado.tono}>{estado.etiqueta}</Pastilla>
          <span className="text-sm text-muted-foreground">
            {tienda.nombre} · {formatearFechaHora(p.creado_shopify)}
          </span>
        </div>
        {enShopify && (
          <a href={enShopify} target="_blank" rel="noreferrer" className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted">
            Abrir en Shopify ↗
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-5 min-[1100px]:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <Tarjeta id="t-prod" titulo="Productos">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className={claseThLista}>En Shopify</th>
                    <th scope="col" className={claseThLista}>SKU de Shopify</th>
                    <th scope="col" className={claseThLista}>Producto nuestro</th>
                    <th scope="col" className={`${claseThLista} text-right`}>Cant.</th>
                    <th scope="col" className={`${claseThLista} text-right`}>Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {(lineas ?? []).map((l) => {
                    const v = l.shopify_variante_id === null ? undefined : vinculo.get(Number(l.shopify_variante_id));
                    const sku = (v?.skus_maestros ?? null) as unknown as { codigo: string; nombre: string } | null;
                    const variante = tituloVariante(l.variante_titulo);
                    return (
                      <tr key={l.id}>
                        <td className={claseTdLista}>
                          {l.titulo}
                          {variante ? <span className="text-muted-foreground"> · {variante}</span> : null}
                        </td>
                        <td className={`${claseTdLista} font-mono text-xs`}>{l.sku || "(sin SKU)"}</td>
                        <td className={claseTdLista}>
                          {v?.no_fisico ? (
                            <Pastilla>No sale de bodega</Pastilla>
                          ) : sku ? (
                            <span>
                              {sku.nombre} <span className="font-mono text-xs text-muted-foreground">{sku.codigo}</span>
                            </span>
                          ) : (
                            <Link href="/tienda-productos" className="no-underline">
                              <Pastilla tono="aviso">Sin vincular · vincular</Pastilla>
                            </Link>
                          )}
                        </td>
                        <td className={`${claseTdLista} text-right tabular-nums`}>{l.cantidad}</td>
                        <td className={`${claseTdLista} text-right tabular-nums`}>{dinero(l.precio)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <dl className="m-0 ml-auto flex w-full max-w-xs flex-col gap-1.5">
              <Dato etiqueta="Subtotal">{dinero(p.subtotal)}</Dato>
              <Dato etiqueta="Descuentos">{dinero(p.descuentos)}</Dato>
              <Dato etiqueta="Envío cobrado">{dinero(p.envio)}</Dato>
              <Dato etiqueta="Total">
                <b>{dinero(p.total)}</b>
              </Dato>
              {p.estado_pago && <Dato etiqueta="Pago">{p.estado_pago}</Dato>}
            </dl>
          </Tarjeta>

          <Tarjeta id="t-hist" titulo="Historial">
            <ol className="m-0 flex list-disc flex-col gap-2 pl-5 text-sm">
              <li>
                <b>Creado en Shopify</b> <span className="text-muted-foreground">· {formatearFechaHora(p.creado_shopify)}</span>
              </li>
              <li>
                <b>Llegó al sistema</b> <span className="text-muted-foreground">· {formatearFechaHora(p.recibido_en)}</span>
              </li>
              {p.cancelado_en && (
                <li>
                  <b>Cancelado</b> <span className="text-muted-foreground">· {formatearFechaHora(p.cancelado_en)}{p.motivo ? ` · ${p.motivo}` : ""}</span>
                </li>
              )}
              {(notas ?? []).map((n) => (
                <li key={n.id}>
                  <b>Nota de {n.autor_nombre ?? "alguien del equipo"}</b> <span className="text-muted-foreground">· {formatearFechaHora(n.creado_en)}</span>
                  <span className="block whitespace-pre-line">{n.texto}</span>
                </li>
              ))}
            </ol>
          </Tarjeta>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Tarjeta id="t-cli" titulo="Cliente y dirección">
            <dl className="m-0 flex flex-col gap-1.5">
              <Dato etiqueta="Nombre">{p.cliente_nombre ?? "—"}</Dato>
              <Dato etiqueta="Teléfono">{p.cliente_telefono ?? "—"}</Dato>
              <Dato etiqueta="Zona">{[p.provincia, p.ciudad].filter(Boolean).join(", ") || "—"}</Dato>
              <Dato etiqueta="Dirección">{p.direccion ?? "—"}</Dato>
            </dl>
          </Tarjeta>
          <Tarjeta id="t-ent" titulo="Entrega">
            <dl className="m-0 flex flex-col gap-1.5">
              <Dato etiqueta="Transportista">{p.transportista ?? "—"}</Dato>
              <Dato etiqueta="Guía">{p.guia ?? "—"}</Dato>
            </dl>
          </Tarjeta>
          <Tarjeta id="t-notas" titulo="Notas del equipo">
            {puedeEscribir ? <NotaPedido pedidoId={p.id} /> : <p className="m-0 text-sm text-muted-foreground">Tu rol solo puede leer los pedidos.</p>}
          </Tarjeta>
        </div>
      </div>
    </Pagina>
  );
}
