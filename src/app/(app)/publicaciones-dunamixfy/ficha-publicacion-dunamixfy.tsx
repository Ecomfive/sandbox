"use client";

import Link from "next/link";
import { CambioPrecioPlataforma } from "@/components/publicaciones/cambio-precio-plataforma";
import { useState, useTransition } from "react";
import { BloqueCompetencia, FotoAmpliable } from "@/components/competencia/piezas-competencia";
import { CodigosProducto } from "@/components/ui/codigos-producto";
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CampoSkuMaestro, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { SkuCopiable } from "@/components/ui/sku-copiable";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { formatearFechaHora } from "@/lib/formato";
import { ComprasIcon, DunamixfyIcon, InteligenciaIcon, InventarioIcon, MargenIcon, ProductoIcon, VentasIcon } from "@/lib/nav-icons";
import { formatoEnDolares, formatoMonto, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import { MARGEN_BAJO } from "@/lib/publicaciones/publicacion";
import { ETIQUETA_SUGERENCIA, type TipoSugerencia } from "@/lib/publicaciones/vincular";
import { ComprasProducto } from "../producto/compras-producto";
import { EnCaminoProducto } from "../producto/en-camino-producto";
import { FichaProductoEmbebida } from "../producto/ficha-producto-embebida";
import { AvisoEnCamino } from "../publicaciones-dropi/ventas-publicacion";
import { vincularPublicacionDunamixfy } from "./actions";
import type { FilaPublicacionDunamixfy, ProductoDunamixfy } from "./def-publicaciones-dunamixfy";
import { InsigniaConectadoDunamixfy } from "./insignia-conectado-dunamixfy";
import { plataformasDePais } from "@/lib/plataformas";
import { VentasPlataformasProducto } from "../producto/ventas-plataformas-producto";

function Producto({ sku }: { sku: ProductoDunamixfy }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <FotoAmpliable url={sku.foto} nombre={sku.codigo} tam="h-10 w-10" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">
          {sku.nombre}
          {sku.tipo === "combo" && " · compuesto"}
        </span>
        <SkuCopiable codigo={sku.codigo} className="font-mono text-xs font-semibold" />
        <CodigosProducto numero={sku.numero} barras={sku.barras} />
      </span>
    </span>
  );
}

function Monto({ valor, moneda }: { valor: number | null; moneda: MonedaPublicaciones }) {
  const usd = formatoEnDolares(valor, moneda);
  return (
    <>
      {formatoMonto(valor, moneda)}
      {usd && <span className="ml-1 text-xs font-normal text-muted-foreground">{usd}</span>}
    </>
  );
}

function Dato({ etiqueta, children, ayuda }: { etiqueta: string; children: React.ReactNode; ayuda?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className={labelClassSm}>{etiqueta}</span>
      <span className="text-sm tabular-nums [overflow-wrap:anywhere]">{children}</span>
      {ayuda && <span className="text-xs text-muted-foreground">{ayuda}</span>}
    </div>
  );
}

/** El producto de esta publicación, o la sugerencia de la lectura con «Vincular» y un buscador para elegir otro. Guarda al instante; como en Dropi y Drop, lo decide una persona. */
function VinculoSkuDunamixfy({ p, puedeEscribir, siguiente, alAbrirProducto }: { p: FilaPublicacionDunamixfy; puedeEscribir: boolean; siguiente?: () => void; alAbrirProducto: (id: string) => void }) {
  const { mostrarToast } = useToast();
  const puedeAbrirProducto = usePuedeAbrir("producto");
  const [pendiente, empezar] = useTransition();
  const [elegido, setElegido] = useState<OpcionSkuMaestro | null>(null);
  const [cambiando, setCambiando] = useState(false);

  const vincular = (skuId: string | null, despues?: () => void) =>
    empezar(async () => {
      const r = await vincularPublicacionDunamixfy(p.id, skuId).catch(() => ({ error: "No se pudo guardar el vínculo." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(skuId ? "Producto vinculado" : "Vínculo quitado");
      setElegido(null);
      setCambiando(false);
      despues?.();
    });

  const buscador = puedeEscribir && (
    <div className="flex flex-wrap items-center gap-2">
      <CampoSkuMaestro valor={elegido?.id ?? null} alCambiar={setElegido} etiquetaAria="Buscar otro producto de Producto" placeholder="Buscar otro producto por SKU o nombre" claseContenedor="min-w-0 flex-1" />
      <Button type="button" variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={!elegido || pendiente} onClick={() => elegido && vincular(elegido.id)}>
        Vincular
      </Button>
    </div>
  );

  if (p.producto && !cambiando)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Producto sku={p.producto} />
        <span className="flex gap-1.5">
          {puedeAbrirProducto && (
            <Link
              href={`/producto?abrir=${p.producto.id}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                alAbrirProducto(p.producto!.id);
              }}
              className="rounded-md border border-azul/30 bg-azul-soft px-3 py-1.5 text-xs font-medium text-azul hover:border-azul"
            >
              Abrir en Producto
            </Link>
          )}
          {puedeEscribir && (
            <>
              <Button type="button" variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={pendiente} onClick={() => setCambiando(true)}>
                Cambiar
              </Button>
              <Button type="button" variant="ghost" className="text-xs" disabled={pendiente} onClick={() => vincular(null)}>
                Quitar vínculo
              </Button>
            </>
          )}
        </span>
      </div>
    );

  const tipo = (p.sugerencia ?? "ninguno") as TipoSugerencia;
  return (
    <div className="flex flex-col gap-3">
      {p.sugerido && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/50 p-3">
          <p className="text-xs text-muted-foreground">
            {ETIQUETA_SUGERENCIA[tipo] ?? "Sugerido"}: {tipo === "seguro" ? "una publicación de Dropi del país con el mismo nombre, o el mismo nombre en Producto" : "el nombre se parece"}.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Producto sku={p.sugerido} />
            {puedeEscribir && (
              <span className="flex gap-1.5">
                <Button type="button" className="!px-3 !py-1.5 text-xs" disabled={pendiente} onClick={() => vincular(p.sugerido!.id)}>
                  Vincular
                </Button>
                {siguiente && (
                  <Button type="button" variant="secondary" className="!px-3 !py-1.5 text-xs" disabled={pendiente} onClick={() => vincular(p.sugerido!.id, siguiente)}>
                    Vincular y siguiente
                  </Button>
                )}
              </span>
            )}
          </div>
        </div>
      )}
      {!p.sugerido && <p className="text-sm text-muted-foreground">{tipo === "varios" ? "Hay varios productos parecidos: búscalo abajo." : "No se encontró un producto parecido en Producto."}</p>}
      {buscador}
      {cambiando && (
        <Button type="button" variant="ghost" className="w-fit text-xs" onClick={() => setCambiando(false)}>
          Cancelar
        </Button>
      )}
    </div>
  );
}

/** La ficha de un producto de Dunamixfy, con la forma de la de Drop. Los datos no se editan aquí: se leen de Dunamixfy. Lo único que se guarda es el vínculo con Producto. */
export function FichaPublicacionDunamixfy({
  publicacion,
  moneda,
  codigoPais,
  nombrePais,
  puedeEscribir,
  puedeVerCompras,
  siguiente,
  alCerrar,
}: {
  publicacion: FilaPublicacionDunamixfy | undefined;
  moneda: MonedaPublicaciones;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  /** Solo un administrador: las compras del producto vinculado (el servidor lo vuelve a comprobar). */
  puedeVerCompras: boolean;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  const [productoAbierto, setProductoAbierto] = useState<string | null>(null);
  if (!publicacion) return null;
  const p = publicacion;
  return (
    <Ventana
      abierto
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        <>
          <span className="text-sm font-medium text-muted-foreground tabular-nums">#{p.idDunamixfy}</span>
          <span className="text-lg font-semibold">{p.nombre}</span>
          {p.conectado ? <Badge color="#30a46c">En Dunamixfy</Badge> : <Badge color="#e5484d">No aparece en Dunamixfy</Badge>}
        </>
      }
    >
      <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-wrap gap-2 border-y border-border bg-card px-5 py-3">
        <a
          href="https://dunamixfy.cr/inventory"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-16 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-center text-xs leading-tight font-bold hover:bg-muted"
        >
          <DunamixfyIcon marca aria-hidden="true" className="h-5 w-5" />
          Abrir en Dunamixfy
        </a>
      </div>
      {!p.conectado && (
        <p role="note" className="m-0 flex items-start gap-2 border-b border-border px-5 py-3 text-sm">
          <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
          <span>
            <span className="font-semibold">Ya no aparece en Dunamixfy.</span> La última lectura que lo encontró fue el {formatearFechaHora(p.ultimaVez)}. Se guarda aquí con sus datos de entonces.
          </span>
        </p>
      )}

      <div className="border-b border-border px-5 py-5">
        <Seccion icono={InventarioIcon} titulo="Producto vinculado (SKU)">
          <VinculoSkuDunamixfy p={p} puedeEscribir={puedeEscribir} siguiente={siguiente} alAbrirProducto={setProductoAbierto} />
        </Seccion>
      </div>

      <div className="flex min-w-0 flex-col divide-y divide-border p-5">
        <Seccion icono={ProductoIcon} titulo="Producto">
          <div className="flex gap-4">
            <FotoAmpliable url={p.fotoUrl} nombre={p.nombre} tam="h-24 w-24" />
            <div className="grid min-w-0 flex-1 gap-3">
              <Dato etiqueta="Nombre en Dunamixfy">{p.nombre}</Dato>
              <div className="flex">
                <InsigniaConectadoDunamixfy conectado={p.conectado} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Dato etiqueta="ID en Dunamixfy">{p.idDunamixfy}</Dato>
                <Dato etiqueta="SKU en Dunamixfy">{p.skuDunamixfy || "—"}</Dato>
                <Dato etiqueta="Categoría">{p.categoria || "—"}</Dato>
                <Dato etiqueta="En el Marketplace">{!p.activo ? "Inactivo: no se puede vender" : p.privado ? "Privado" : "Público"}</Dato>
                <Dato etiqueta="Última lectura">{formatearFechaHora(p.ultimaVez)}</Dato>
              </div>
            </div>
          </div>
        </Seccion>

        <Seccion icono={MargenIcon} titulo="Precio y margen">
          <div className="grid gap-3 sm:grid-cols-2">
            <Dato etiqueta="Precio al dropshipper">
              <span className="font-semibold">
                <Monto valor={p.precio} moneda={moneda} />
              </span>
            </Dato>
            <Dato etiqueta="Precio sugerido">{p.precioSugerido === null ? "—" : <Monto valor={p.precioSugerido} moneda={moneda} />}</Dato>
            <Dato etiqueta="Costo" ayuda="El del producto en Gestión de IDs Dropi del país">
              {p.costo === null ? "—" : <Monto valor={p.costo} moneda={moneda} />}
            </Dato>
            <Dato etiqueta="Fulfillment" ayuda={p.fulfillmentPaga === "dropshipper" ? "No cuenta en el margen" : p.fulfillment === null ? "Ponlo en Configuración, fila «Dunamixfy»" : "El de Dunamixfy en Configuración"}>
              {p.fulfillmentPaga === "dropshipper" ? "Lo paga el dropshipper" : p.fulfillment === null ? "—" : <Monto valor={p.fulfillment} moneda={moneda} />}
            </Dato>
          </div>
          <CambioPrecioPlataforma
            key={p.id}
            plataforma="dunamixfy"
            publicacionId={p.id}
            etiquetaPrecio="Precio al dropshipper"
            precio={p.precio}
            sugerido={p.precioSugerido}
            moneda={moneda}
            esperando={p.cambioPrecio}
            puedeEscribir={puedeEscribir}
            bloqueo={p.conectado ? null : "Ya no aparece en Dunamixfy: no se puede cambiar su precio."}
          />
          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted px-4 py-3 text-sm tabular-nums">
            <div>
              <dt className="text-xs text-muted-foreground">Utilidad bruta</dt>
              <dd className="font-semibold">{p.utilidad === null ? "—" : <Monto valor={p.utilidad} moneda={moneda} />}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Margen bruto</dt>
              <dd className="flex items-center gap-1.5 font-semibold">
                {p.margen !== null && p.margen < MARGEN_BAJO && <span role="img" aria-label="Margen bajo" className="h-2 w-2 rounded-full bg-destructive" />}
                {p.margen === null ? "—" : `${Math.round(p.margen * 100)} %`}
              </dd>
            </div>
          </dl>
        </Seccion>

        {p.producto && plataformasDePais(codigoPais).length > 1 && (
          <Seccion icono={VentasIcon} titulo={`Ventas globales del país · ${nombrePais}`}>
            <VentasPlataformasProducto key={`${p.producto.id}-${codigoPais}`} id={p.producto.id} pais={codigoPais} />
          </Seccion>
        )}

        <Seccion icono={InventarioIcon} titulo="Stock">
          <AvisoEnCamino enCamino={p.enCamino} llegada={p.llegadaCamino} sinFecha={p.sinFechaCamino} sinEnvio={p.sinEnvioCamino} enCotizacion={p.enCotizacion} etapaCotizacion={p.etapaCotizacion} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Dato etiqueta="En Dunamixfy" ayuda="Nuestra bodega allá, solo los inventarios activos.">
              <span className={p.stock === 0 ? "font-semibold text-destructive" : "font-semibold"}>{p.stock === null ? "—" : `${p.stock.toLocaleString("es-PA")} unidades`}</span>
            </Dato>
            <Dato etiqueta="Apartadas" ayuda="Por pedidos que todavía no salen.">{p.reservado === null ? "—" : `${p.reservado.toLocaleString("es-PA")} unidades`}</Dato>
          </div>
        </Seccion>

        {/* Quien ve «Compras» ya tiene ahí cada compra con su llegada aprox. (9 nov 2026, pedido de Alcides). */}
        {!puedeVerCompras && p.producto && p.producto.tipo !== "combo" && (
          <Seccion icono={ComprasIcon} titulo="En camino">
            <EnCaminoProducto key={`${p.producto.id}-${codigoPais}`} id={p.producto.id} pais={codigoPais} nombrePais={nombrePais} />
          </Seccion>
        )}

        {p.producto && p.producto.tipo !== "combo" && (
          <Seccion icono={InteligenciaIcon} titulo="Competencia del producto">
            <BloqueCompetencia key={`${p.producto.id}-${codigoPais}`} skuId={p.producto.id} pais={codigoPais} />
          </Seccion>
        )}

        {puedeVerCompras && p.producto && (
          <Seccion icono={ComprasIcon} titulo="Compras">
            <ComprasProducto key={p.producto.id} id={p.producto.id} />
          </Seccion>
        )}
      </div>
      <FichaProductoEmbebida productoId={productoAbierto} alCerrar={() => setProductoAbierto(null)} />
    </Ventana>
  );
}
