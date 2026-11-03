import { FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { claseThLista, claseTdLista, MarcoTabla, Pastilla } from "@/components/panel/piezas-panel";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { formatearTiempoRelativo } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarTiendas, type Tienda } from "@/lib/tienda/datos";

export const metadata = { title: "Tiendas Shopify" };

export const dynamic = "force-dynamic";

const ESTADO: Record<Tienda["estado"], { texto: string; tono: "exito" | "aviso" | "neutro" }> = {
  conectada: { texto: "Conectada", tono: "exito" },
  por_conectar: { texto: "Por conectar", tono: "aviso" },
  pausada: { texto: "Pausada", tono: "neutro" },
};

const hace = (iso: string | null) => (iso ? formatearTiempoRelativo(iso) : "—");

/**
 * Gestión de tienda › Tiendas (3 nov 2026): las tiendas de Shopify del país y si sus pedidos están llegando bien (el último aviso de Shopify, la
 * revisión cada 10 minutos y la conciliación con Shopify), como la pantalla de conexiones de Mi Reto Digital. Se conectan de una en una, empezando
 * por Kenku, y siempre solo de lectura. Conectar llega en la etapa 2: aquí se explica cómo será.
 */
export default async function TiendasPage() {
  await requireModulo("tienda-tiendas");
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
              <b>En el admin de Shopify de la tienda</b> se crea una app propia «Ecomfive sistema» solo con permisos de lectura.
            </li>
            <li>
              <b>La clave se guarda en el sistema</b>, nunca en un chat. Antes de guardarla se prueba con una lectura pequeña: si no responde bien, no se guarda.
            </li>
            <li>
              <b>Se traen los pedidos y productos de antes</b>, sin tocar nada en Shopify.
            </li>
            <li>
              <b>Se activan los avisos de Shopify</b>: cada pedido nuevo o cambio llega al instante, y cada 10 minutos se revisa por si se perdió alguno.
            </li>
            <li>
              <b>Unos días de prueba</b>: la conciliación compara los pedidos del sistema con los de Shopify hasta que coincidan siempre. Recién ahí se pasa a la
              siguiente tienda.
            </li>
          </ol>
          <p className="m-0 text-xs text-muted-foreground">Primero Kenku (Panamá). Conectar se habilita en la siguiente etapa.</p>
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
