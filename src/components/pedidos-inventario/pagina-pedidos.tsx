import Link from "next/link";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import type { UsuarioActual } from "@/lib/auth";
import { cargarBodegasPedido, cargarPedidos, cargarStock, fichasDeProductos, stockInventario } from "@/lib/pedidos-inventario/datos";
import { contarPorEstado, esEstado } from "@/lib/pedidos-inventario/reglas";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerOpcionesSkuMaestro } from "@/lib/wms/skus-maestros";
import { LeyendaPedidos, NuevoPedido, TablaPedidos, TableroPedidos } from "./pedidos";

/**
 * Las dos páginas de «Pedir a inventario» (16 nov 2026, migración 0305; prototipo aprobado https://claude.ai/artifact/ReVGwYZrBG11rmKFUT7V5T):
 * los contadores por estado (filtran la tabla con `?estado=`), la tabla del Excel y la leyenda. Despacho además hace pedidos nuevos;
 * inventario ve lo que hay en la bodega de donde sale y envía.
 */
export async function PaginaPedidos({ modo, usuario, estado, archivados = false }: { modo: "despacho" | "inventario"; usuario: UsuarioActual; estado: string | undefined; archivados?: boolean }) {
  const modulo = modo === "despacho" ? "despacho-pedir-inventario" : "inventario-pedidos-despacho";
  const ruta = modo === "despacho" ? "/despacho-ciudad/pedir-inventario" : "/inventario-pedidos-despacho";
  const puedeEscribir = !usuario.modulosSoloLectura.includes(modulo);
  const supabase = createServiceClient();
  const [{ pedidos, faltaMigracion, totalArchivados, sinArchivo }, bodegas] = await Promise.all([cargarPedidos(supabase, { archivados }), cargarBodegasPedido(supabase)]);
  const elegido = esEstado(estado) ? estado : null;
  const visibles = elegido ? pedidos.filter((p) => p.estado === elegido) : pedidos;
  const cuenta = contarPorEstado(pedidos);

  // Despacho elige de la lista del catálogo: sin combos y sin el producto «padre» de unas variantes (se pide la variante exacta).
  const opciones =
    modo === "despacho" && puedeEscribir
      ? await obtenerOpcionesSkuMaestro(supabase).then((os) => {
          const padres = new Set(os.map((o) => o.padreId).filter(Boolean));
          return os.filter((o) => !o.compuesto && !padres.has(o.id));
        })
      : [];
  // Despacho ve cuánto hay en inventario de cada producto al elegirlo, y no puede pedir lo que no hay (19 nov 2026).
  const hayEnInventario = modo === "despacho" && puedeEscribir ? await stockInventario(supabase, bodegas.origenes) : {};
  // Comunicación despacho (20 nov 2026): al tocar el producto se abre su ficha de stock, para ver cómo está repartido. Solo con el permiso de Inventario
  // (la ficha lo pide para leer el stock).
  const fichas = modo === "inventario" && usuario.modulos.includes("inventario") ? await fichasDeProductos(supabase, [...new Set(pedidos.flatMap((p) => p.items.map((it) => it.skuId)).filter(Boolean))]) : null;
  // Inventario ve cuánto hay en cada bodega de origen de lo que está por enviar.
  const porEnviar = pedidos.filter((p) => p.estado === "solicitud" || p.estado === "en_proceso");
  const stock =
    modo === "inventario" && porEnviar.length
      ? await cargarStock(
          supabase,
          bodegas.origenes.map((b) => b.id),
          [...new Set(porEnviar.flatMap((p) => p.items.map((it) => it.skuId)))],
        )
      : {};

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo={modo === "despacho" ? "Pedir a inventario" : "Solicitudes de despacho"} oculto>
        {modo === "despacho"
          ? "Pide a inventario lo que se agotó en despacho. Te avisa en «Para ti» cuando lo prepara y cuando lo envía; al llegar, márcalo «Recibido»."
          : "Lo que despacho le pide a inventario: ponlo en proceso, escribe cuánto envías, elige de qué bodega sale y «Enviar» hace el traslado a despacho. Cuando llega, «Marcar entregado» cierra el pedido."}
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0305 («Pedir a inventario»).
        </p>
      ) : (
        <>
          {modo === "despacho" && puedeEscribir && (
            <div className="flex justify-end">
              <NuevoPedido opciones={opciones} stock={hayEnInventario} />
            </div>
          )}
          {modo === "inventario" && !bodegas.destino && (
            <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
              No encontré la bodega de despacho de Panamá: hace falta una bodega propia activa cuyo nombre empiece con «Despacho».
            </p>
          )}
          {archivados ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <span>
                <span className="font-semibold">Pedidos archivados</span> · {pedidos.length.toLocaleString("es-PA")}. Ya no salen en la lista de siempre.
              </span>
              <Link href={ruta} className="font-medium text-primario underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Volver a los pedidos
              </Link>
            </div>
          ) : (
            <TableroPedidos modo={modo} ruta={ruta} cuenta={cuenta} total={pedidos.length} elegido={elegido} />
          )}
          <TablaPedidos pedidos={archivados ? pedidos : visibles} modo={modo} puedeEscribir={puedeEscribir} origenes={bodegas.origenes} stock={stock} fichas={fichas} opciones={opciones} hayEnInventario={hayEnInventario} />
          {!archivados && !sinArchivo && (
            <p className="m-0 text-sm">
              <Link href={`${ruta}?archivados=1`} className="font-medium text-primario underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                Ver archivados ({totalArchivados.toLocaleString("es-PA")})
              </Link>
            </p>
          )}
          <p className="m-0 text-xs text-muted-foreground">
            Se ven todos los pedidos abiertos y los cerrados de los últimos 30 días que no estén archivados. {bodegas.destino ? `Lo enviado llega a ${bodegas.destino.nombre}.` : ""}
          </p>
          <LeyendaPedidos />
        </>
      )}
    </Pagina>
  );
}
