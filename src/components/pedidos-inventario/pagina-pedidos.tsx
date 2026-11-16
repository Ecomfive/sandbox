import { KpiCard, KpiGrid } from "@/components/ui/kpi-card";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import type { UsuarioActual } from "@/lib/auth";
import { cargarBodegasPedido, cargarPedidos, cargarStock } from "@/lib/pedidos-inventario/datos";
import { contarPorEstado, esEstado, ESTADOS } from "@/lib/pedidos-inventario/reglas";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerOpcionesSkuMaestro } from "@/lib/wms/skus-maestros";
import { LeyendaPedidos, NuevoPedido, TablaPedidos } from "./pedidos";

/**
 * Las dos páginas de «Pedir a inventario» (16 nov 2026, migración 0304; prototipo aprobado https://claude.ai/artifact/ReVGwYZrBG11rmKFUT7V5T):
 * los contadores por estado (filtran la tabla con `?estado=`), la tabla del Excel y la leyenda. Despacho además hace pedidos nuevos;
 * inventario ve lo que hay en la bodega de donde sale y envía.
 */
export async function PaginaPedidos({ modo, usuario, estado }: { modo: "despacho" | "inventario"; usuario: UsuarioActual; estado: string | undefined }) {
  const modulo = modo === "despacho" ? "despacho-pedir-inventario" : "inventario-pedidos-despacho";
  const ruta = modo === "despacho" ? "/despacho-pedir-inventario" : "/inventario-pedidos-despacho";
  const puedeEscribir = !usuario.modulosSoloLectura.includes(modulo);
  const supabase = createServiceClient();
  const [{ pedidos, faltaMigracion }, bodegas] = await Promise.all([cargarPedidos(supabase), cargarBodegasPedido(supabase)]);
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

  const tarjetas = [
    { clave: null, titulo: "Total pedidos", valor: pedidos.length, tono: "neutral" as const },
    ...ESTADOS.filter((e) => e.clave !== "cancelado").map((e) => ({
      clave: e.clave,
      titulo: modo === "inventario" && e.clave === "solicitud" ? "Por atender (Solicitud)" : e.etiqueta,
      valor: cuenta[e.clave],
      tono: (e.clave === "solicitud" ? "neutral" : e.clave === "en_proceso" ? "warning" : e.clave === "enviado" ? "info" : "success") as "neutral" | "warning" | "info" | "success",
    })),
  ];

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo={modo === "despacho" ? "Pedir a inventario" : "Pedidos de despacho"} oculto>
        {modo === "despacho"
          ? "Pide a inventario lo que se agotó en despacho. Te avisa en «Para ti» cuando lo prepara y cuando lo envía; al llegar, márcalo «Recibido»."
          : "Lo que despacho le pide a inventario: ponlo en proceso, escribe cuánto envías, elige de qué bodega sale y «Enviar» hace el traslado a despacho."}
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0304 («Pedir a inventario»).
        </p>
      ) : (
        <>
          {modo === "despacho" && puedeEscribir && (
            <div className="flex justify-end">
              <NuevoPedido opciones={opciones} />
            </div>
          )}
          {modo === "inventario" && !bodegas.destino && (
            <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
              No encontré la bodega de despacho de Panamá: hace falta una bodega propia activa cuyo nombre empiece con «Despacho».
            </p>
          )}
          <KpiGrid compacta>
            {tarjetas.map((t) => (
              <KpiCard
                key={t.clave ?? "total"}
                compacta
                titulo={t.titulo}
                valor={t.valor.toLocaleString("es-PA")}
                tono={t.tono}
                href={t.clave && elegido !== t.clave ? `${ruta}?estado=${t.clave}` : ruta}
                activa={t.clave === elegido}
              />
            ))}
          </KpiGrid>
          <TablaPedidos pedidos={visibles} modo={modo} puedeEscribir={puedeEscribir} origenes={bodegas.origenes} stock={stock} />
          <p className="m-0 text-xs text-muted-foreground">
            Se ven todos los pedidos abiertos y los cerrados de los últimos 30 días. {bodegas.destino ? `Lo enviado llega a ${bodegas.destino.nombre}.` : ""}
          </p>
          <LeyendaPedidos />
        </>
      )}
    </Pagina>
  );
}
