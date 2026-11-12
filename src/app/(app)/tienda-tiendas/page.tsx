import { FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { claseThLista, claseTdLista, MarcoTabla, Pastilla } from "@/components/panel/piezas-panel";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { formatearTiempoRelativo } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { esAdministrador } from "@/lib/permisos/acceso";
import { cargarTiendas, type Tienda } from "@/lib/tienda/datos";
import { appDeTienda } from "@/lib/tienda/shopify-app";
import { ConectarTienda } from "./conectar-tienda";

export const metadata = { title: "Tiendas Shopify" };

export const dynamic = "force-dynamic";
// Traer de Shopify y pasar las uniones a los pedidos puede tardar más de lo normal (sus acciones corren en esta página).
export const maxDuration = 60;

const ESTADO: Record<Tienda["estado"], { texto: string; tono: "exito" | "aviso" | "neutro" }> = {
  conectada: { texto: "Conectada", tono: "exito" },
  por_conectar: { texto: "Por conectar", tono: "aviso" },
  pausada: { texto: "Pausada", tono: "neutro" },
};

const hace = (iso: string | null) => (iso ? formatearTiempoRelativo(iso) : "—");

/**
 * Gestión de tienda › Tiendas (3 nov 2026): las tiendas de Shopify del país y si sus pedidos están llegando bien (el último aviso de Shopify, la
 * revisión cada 10 minutos y la conciliación con Shopify), como la pantalla de conexiones de Mi Reto Digital. Se conectan de una en una, empezando
 * por Kenku, y siempre solo de lectura. Desde el 12 nov 2026 un administrador la conecta aquí («Conectar») con la app de la tienda en el Dev Dashboard de
 * Shopify, cuyas claves están en Vercel (src/lib/tienda/shopify-app.ts).
 */
export default async function TiendasPage() {
  const usuario = await requireModulo("tienda-tiendas");
  const admin = esAdministrador(usuario) && !usuario.modulosSoloLectura.includes("tienda-tiendas");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tiendas, faltaMigracion } = await cargarTiendas(supabase, pais.id);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Tiendas Shopify" oculto>
        Las tiendas de Shopify conectadas y si sus pedidos están llegando bien. Se conectan de una en una.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <FaltaMigracionTienda />
      ) : !tiendas.length ? (
        <SinTiendas pais={pais.nombre} />
      ) : (
        <MarcoTabla ariaLabel="Tiendas">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={claseThLista}>Tienda</th>
                <th scope="col" className={claseThLista}>Estado</th>
                <th scope="col" className={claseThLista}>Avisos de Shopify</th>
                <th scope="col" className={claseThLista}>Revisión cada 10 min</th>
                <th scope="col" className={claseThLista}>Conciliación</th>
                <th scope="col" className={claseThLista}>Permiso</th>
                {admin && <th scope="col" className={claseThLista}>Conexión</th>}
              </tr>
            </thead>
            <tbody>
              {tiendas.map((t) => (
                <tr key={t.id}>
                  <td className={claseTdLista}>
                    <span className="block font-medium">{t.nombre}</span>
                    <span className="block text-xs text-muted-foreground">
                      {pais.nombre} · {t.moneda}
                      {t.dominio ? ` · ${t.dominio}` : ""}
                    </span>
                  </td>
                  <td className={claseTdLista}>
                    <Pastilla tono={ESTADO[t.estado].tono}>{ESTADO[t.estado].texto}</Pastilla>
                  </td>
                  <td className={claseTdLista}>{t.estado === "conectada" ? `Último ${hace(t.ultimoAvisoEn)}` : "—"}</td>
                  <td className={claseTdLista}>{t.estado === "conectada" ? hace(t.ultimaRevisionEn) : "—"}</td>
                  <td className={claseTdLista}>
                    {t.conciliadoEn && t.pedidosSistema !== null && t.pedidosShopify !== null ? (
                      <>
                        <span className="block">{t.pedidosSistema === t.pedidosShopify ? `${t.pedidosSistema.toLocaleString("es-PA")} en ambos` : `${t.pedidosSistema.toLocaleString("es-PA")} aquí · ${t.pedidosShopify.toLocaleString("es-PA")} en Shopify`}</span>
                        <span className={`block text-xs ${t.pedidosSistema === t.pedidosShopify ? "text-muted-foreground" : "text-destructive"}`}>
                          {t.pedidosSistema === t.pedidosShopify ? "Coincide" : "No coincide"} · {hace(t.conciliadoEn)}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={claseTdLista}>
                    <Pastilla>Solo lectura</Pastilla>
                  </td>
                  {admin && (
                    <td className={claseTdLista}>
                      {appDeTienda(t.nombre) ? (
                        <ConectarTienda tiendaId={t.id} conectada={t.estado === "conectada"} />
                      ) : (
                        <span className="text-xs text-muted-foreground">Faltan sus claves en Vercel</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </MarcoTabla>
      )}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="t-pasos" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h2 id="t-pasos" className="m-0 text-[15px] font-semibold">
            Cómo se conecta una tienda, paso a paso
          </h2>
          <ol className="m-0 flex list-decimal flex-col gap-2.5 pl-5 text-sm leading-relaxed">
            <li>
              <b>En el Dev Dashboard de Shopify</b> (dev.shopify.com, la misma organización de la tienda) se crea la app «Ecomfive Sistema (solo lectura)» con
              read_orders, read_customers, read_products y read_fulfillments, con acceso a los datos protegidos de clientes, y se instala en la tienda.
            </li>
            <li>
              <b>Sus claves van en Vercel</b>, nunca en un chat: SHOPIFY_KENKU_CLIENT_ID, SHOPIFY_KENKU_CLIENT_SECRET y SHOPIFY_KENKU_DOMINIO (para otra tienda,
              su nombre en lugar de KENKU). Luego, «Redeploy».
            </li>
            <li>
              <b>Un administrador pulsa «Conectar»</b>: se prueba el acceso (si la app puede escribir en Shopify, no se conecta) y se piden a Shopify los avisos de
              pedidos.
            </li>
            <li>
              <b>Se traen los pedidos y productos de antes</b>, sin tocar nada en Shopify.
            </li>
            <li>
              <b>Se activan los avisos de Shopify</b>: cada pedido nuevo o cambio llega al instante. Al abrir Pedidos o el Dashboard, si pasaron más de 10
              minutos desde la última revisión, se revisa Shopify por si se perdió alguno (y dos veces al día, solo).
            </li>
            <li>
              <b>Unos días de prueba</b>: la conciliación compara los pedidos del sistema con los de Shopify hasta que coincidan siempre. Recién ahí se pasa a la
              siguiente tienda.
            </li>
          </ol>
          <p className="m-0 text-xs text-muted-foreground">Primero Kenku (Panamá). Al caer un pedido nuevo, a quien tenga Pedidos de tienda le sale un aviso.</p>
        </section>
        <div className="flex flex-col gap-4">
          <section aria-labelledby="t-lee" className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
            <h2 id="t-lee" className="m-0 text-[15px] font-semibold">
              Lo que lee
            </h2>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
              <li>Pedidos, también los de más de 60 días</li>
              <li>Productos y variantes, con su SKU</li>
              <li>Envíos y guías</li>
              <li>Los datos del cliente de cada pedido</li>
            </ul>
          </section>
          <section aria-labelledby="t-nunca" className="flex flex-col gap-2 rounded-2xl border border-success/50 bg-card p-5">
            <h2 id="t-nunca" className="m-0 text-[15px] font-semibold">
              Lo que nunca hace
            </h2>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm">
              <li>Crear, editar ni cancelar pedidos</li>
              <li>Cambiar productos, precios ni inventario</li>
              <li>Marcar envíos ni tocar el despacho</li>
              <li>Escribirle al cliente</li>
            </ul>
            <p className="m-0 text-xs text-muted-foreground">Shopify no se lo permite: la app no tiene permisos de escritura.</p>
          </section>
        </div>
      </div>
    </Pagina>
  );
}
