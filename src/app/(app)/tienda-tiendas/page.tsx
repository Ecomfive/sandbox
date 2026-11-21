import { FaltaMigracionTienda, SinTiendas } from "@/components/tienda/barra-tienda";
import { claseThLista, claseTdLista, MarcoTabla, Pastilla } from "@/components/panel/piezas-panel";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requirePanel } from "@/lib/auth";
import { formatearTiempoRelativo } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { esAdministrador } from "@/lib/permisos/acceso";
import { type Tienda } from "@/lib/tienda/datos";
import { tiendasVisibles } from "@/lib/confirmacion-ia/acceso";
import { appDeTienda } from "@/lib/tienda/shopify-app";
import { ConectarTienda } from "./conectar-tienda";
import { ConectarIcomfly } from "./conectar-icomfly";
import { EscrituraTienda } from "./escritura-tienda";
import { ahoraMismo, haceDias, resumirNotasBot, type FilaNotaBot } from "@/lib/tienda/notas-bot-resumen";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { conexionesIcomfly } from "@/lib/tienda/icomfly";

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
/** Lo que vuelve de la autorización de iComfly (`?icomfly=`). */
const AVISO_ICOMFLY: Record<string, { texto: string; error: boolean }> = {
  conectado: { texto: "iComfly quedó conectado.", error: false },
  cancelado: { texto: "Se canceló la autorización en iComfly.", error: true },
  "sin-clave": { texto: "Falta la clave para cifrar los tokens en el servidor.", error: true },
  "tienda-invalida": { texto: "Esa tienda no es válida.", error: true },
  error: { texto: "No se pudo conectar iComfly.", error: true },
};

export default async function TiendasPage({ searchParams }: { searchParams: Promise<{ icomfly?: string; motivo?: string }> }) {
  const usuario = await requirePanel("/tienda-tiendas", "tienda-tiendas");
  const { icomfly, motivo } = await searchParams;
  const aviso = icomfly ? AVISO_ICOMFLY[icomfly] : undefined;
  const admin = esAdministrador(usuario) && !usuario.modulosSoloLectura.includes("tienda-tiendas");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  // Solo las tiendas de la persona (17 nov 2026).
  const { tiendas, faltaMigracion } = await tiendasVisibles(supabase, pais.id);
  // La conexión con iComfly (el bot de WhatsApp de las tiendas, 13 nov 2026); null si falta la migración 0284.
  const icomflyDe = admin ? await conexionesIcomfly(supabase, tiendas.map((t) => t.id)) : new Map();
  // Escribir en Shopify (19 nov 2026): qué tiendas lo tienen encendido. Sin la migración 0337, ninguna.
  const idsTiendas = tiendas.map((t) => t.id);
  let escrituras: { id: unknown; escribe_shopify?: unknown; quitar_nota_bot?: unknown; ia_pone_etiqueta?: unknown }[] | null = [];
  if (idsTiendas.length) {
    const r = await supabase.from("tiendas").select("id, escribe_shopify, quitar_nota_bot, ia_pone_etiqueta").in("id", idsTiendas);
    // Sin la migración 0348 no existe `ia_pone_etiqueta`: se lee sin ella.
    escrituras = r.error ? (await supabase.from("tiendas").select("id, escribe_shopify, quitar_nota_bot").in("id", idsTiendas)).data : r.data;
  }
  // Etiquetas de zona que puso la IA hoy (hora de Panamá) y las que fallaron (migración 0348); sin ella, vacío.
  const hoyPanama = ahoraMismo().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const { data: puestas } = idsTiendas.length ? await supabase.from("confirmacion_ia_analisis").select("tienda_id, etiqueta_puesta_en, etiqueta_error, actualizado_en").in("tienda_id", idsTiendas).gte("actualizado_en", haceDias(2)) : { data: [] };
  const etiquetasIaDe = new Map<string, { hoy: number; conError: number }>();
  for (const f of puestas ?? []) {
    const id = f.tienda_id as string;
    const r = etiquetasIaDe.get(id) ?? { hoy: 0, conError: 0 };
    if (f.etiqueta_puesta_en && new Date(f.etiqueta_puesta_en as string).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) === hoyPanama) r.hoy++;
    if (f.etiqueta_error && new Date(f.actualizado_en as string).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) === hoyPanama) r.conError++;
    etiquetasIaDe.set(id, r);
  }
  // Pedidos del bot de iComfly vistos en cada tienda y qué pasó con su nota (21 nov 2026: para elegir dónde probar «Quitar la nota del bot»). Sin la migración 0303, vacío.
  const notasBot = await traerTodasLasFilas<FilaNotaBot>((a, b) => supabase.from("tienda_notas_bot").select("tienda_id, dominio, estado, creado_en").gte("creado_en", haceDias(8)).order("creado_en").range(a, b)).catch(() => [] as FilaNotaBot[]);
  const resumenNotas = resumirNotasBot(notasBot, ahoraMismo(), tiendas.map((t) => ({ id: t.id, dominio: t.dominio })));
  const escrituraDe = new Map((escrituras ?? []).map((e) => [e.id as string, { escribe: e.escribe_shopify === true, quitaNotaBot: e.quitar_nota_bot === true, iaPoneEtiqueta: e.ia_pone_etiqueta === true }]));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Tiendas Shopify" oculto>
        Las tiendas de Shopify conectadas y si sus pedidos están llegando bien. Se conectan de una en una.
      </EncabezadoPagina>
      {aviso && (
        <p role={aviso.error ? "alert" : "status"} className={`m-0 rounded-lg border px-4 py-3 text-sm ${aviso.error ? "border-destructive/40 bg-destructive-soft text-destructive" : "border-border bg-card text-success"}`}>
          {aviso.texto}
          {aviso.error && motivo ? ` ${motivo.slice(0, 160)}` : ""}
        </p>
      )}
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
                {admin && <th scope="col" className={claseThLista}>WhatsApp (iComfly)</th>}
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
                    <div className="flex flex-col items-start gap-1.5">
                      {escrituraDe.get(t.id)?.escribe ? <Pastilla tono="exito">Escribe etiquetas</Pastilla> : <Pastilla>Solo lectura</Pastilla>}
                      {admin && t.estado === "conectada" && appDeTienda(t.nombre) && (
                        <EscrituraTienda tiendaId={t.id} escribe={escrituraDe.get(t.id)?.escribe ?? false} quitaNotaBot={escrituraDe.get(t.id)?.quitaNotaBot ?? false} notasBot={resumenNotas.get(t.id) ?? null} iaPoneEtiqueta={escrituraDe.get(t.id)?.iaPoneEtiqueta ?? false} etiquetasIa={etiquetasIaDe.get(t.id) ?? null} />
                      )}
                    </div>
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
                  {admin && (
                    <td className={claseTdLista}>
                      {icomflyDe === null ? (
                        <span className="text-xs text-muted-foreground">Falta la migración 0284</span>
                      ) : (
                        <ConectarIcomfly
                          tiendaId={t.id}
                          url={icomflyDe.get(t.id)?.mcpUrl ?? null}
                          conectado={icomflyDe.get(t.id)?.conectado ?? false}
                          ultimaPrueba={icomflyDe.get(t.id)?.ultimaPrueba ?? null}
                          ultimoError={icomflyDe.get(t.id)?.ultimoError ?? null}
                        />
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
              <b>Sus claves van en Vercel</b>, nunca en un chat: SHOPIFY_KENKU_CLIENT_ID, SHOPIFY_KENKU_CLIENT_SECRET y SHOPIFY_KENKU_DOMINIO (para Oferfy, SHOPIFY_OFERFY_…; para Nuvo, SHOPIFY_NUVO_…; para otra tienda,
              su nombre en lugar de KENKU). Luego, «Redeploy».
            </li>
            <li>
              <b>Un administrador pulsa «Conectar»</b>: se prueba el acceso (si la app tiene un permiso de escritura distinto de write_orders, no se conecta) y se
              piden a Shopify los avisos de pedidos.
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
            <li>
              <b>Escribir en Shopify</b> (cuando se quiera gestionar desde el sistema): en el Dev Dashboard se agrega write_orders en una versión nueva de la app
              (Versions → Create version → Scopes → Release) y se aprueba en el admin de la tienda. Luego un administrador pulsa aquí «Encender escritura»: se
              revisa con Shopify que el permiso esté y, desde ahí, atención al cliente cambia las etiquetas y confirma pedidos desde la ficha.
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
              <li>Crear ni cancelar pedidos, ni cambiar sus productos</li>
              <li>Cambiar productos, precios ni inventario</li>
              <li>Marcar envíos ni tocar el despacho</li>
              <li>Escribirle al cliente</li>
            </ul>
            <p className="m-0 text-xs text-muted-foreground">
              Lo único que puede escribir, si un administrador lo enciende en la tienda: las etiquetas del pedido (y «Confirmar pedido», que es la etiqueta
              «Confirmada») y quitar la nota del bot. La app solo puede tener el permiso write_orders: con cualquier otro, no se conecta.
            </p>
          </section>
        </div>
      </div>
    </Pagina>
  );
}
