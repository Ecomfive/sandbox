"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { BloqueCompetencia, FotoAmpliable } from "@/components/competencia/piezas-competencia";
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { Button } from "@/components/ui/button";
import { labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CampoSkuMaestro, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { SkuCopiable } from "@/components/ui/sku-copiable";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { ActualizarIcon, ApagarIcon, ArchivarIcon, CandadoAbiertoIcon, ComprasIcon, DropIcon, EstadoIcon, EtiquetaIcon, InteligenciaIcon, InventarioIcon, MargenIcon, PapeleraIcon, PausaIcon, ProductoIcon, ReactivarIcon } from "@/lib/nav-icons";
import { formatearFechaHora } from "@/lib/formato";
import { MOTIVO_SOLO_DROPI, accionDeEstado, ETIQUETA_ESTADO_DROP, motivoAccesoPrivado, motivoCambioEstado, motivoEliminar, motivoGestionarInventario, motivoLiquidacion } from "@/lib/publicaciones-drop/acciones";
import { formatoEnDolares, formatoMonto, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import { MARGEN_BAJO } from "@/lib/publicaciones/publicacion";
import { ETIQUETA_SUGERENCIA, type TipoSugerencia } from "@/lib/publicaciones/vincular";
import { BotonAccionApagado } from "../publicaciones-dropi/boton-icono-fila";
import { AvisoEnCamino } from "../publicaciones-dropi/ventas-publicacion";
import { ComprasProducto } from "../producto/compras-producto";
import { EnCaminoProducto } from "../producto/en-camino-producto";
import { FichaProductoEmbebida } from "../producto/ficha-producto-embebida";
import { vincularPublicacionDrop } from "./actions";
import { DialogoAccesoPrivado, DialogoSolicitudInventario } from "./dialogos-fila-drop";
import type { FilaPublicacionDrop, ProductoDrop } from "./def-publicaciones-drop";
import { InsigniaConectadoDrop } from "./insignia-conectado-drop";

const AVISO_SIN_CONEXION = "Todavía no se escribe en Drop desde el sistema: por ahora solo se leen sus publicaciones. Hazlo en Drop.";
const urlDrop = (p: FilaPublicacionDrop) => `https://app.soydrop.com/vendor/products/details/${p.dropInterno}/inventory`;
const fecha = (iso: string | null) => (iso ? formatearFechaHora(iso) : "—");

/** Un producto de Producto: su foto, el SKU (se copia con un clic) y el nombre, como en la ficha de Dropi. */
function Producto({ sku, pequeño = false }: { sku: ProductoDrop; pequeño?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <FotoAmpliable url={sku.foto} nombre={sku.codigo} tam={pequeño ? "h-8 w-8" : "h-10 w-10"} />
      <span className="flex min-w-0 flex-col">
        <SkuCopiable codigo={sku.codigo} className="font-mono text-xs font-semibold" />
        <span className="truncate text-xs text-muted-foreground">
          {sku.nombre}
          {sku.tipo === "combo" && " · compuesto"}
        </span>
      </span>
    </span>
  );
}

/** Un monto en la moneda de Drop con su valor en dólares en pequeño. */
function Monto({ valor, moneda }: { valor: number | null; moneda: MonedaPublicaciones }) {
  const usd = formatoEnDolares(valor, moneda);
  return (
    <>
      {formatoMonto(valor, moneda)}
      {usd && <span className="ml-1 text-xs font-normal text-muted-foreground">{usd}</span>}
    </>
  );
}

/**
 * «Producto vinculado (SKU)» de la ficha de Drop, como el de Dropi: el producto de Producto de esta publicación, o la sugerencia de la lectura con «Vincular»
 * (y «Vincular y siguiente»), y un buscador para elegir otro. Guarda al instante.
 */
function VinculoSkuDrop({ p, puedeEscribir, siguiente, alAbrirProducto }: { p: FilaPublicacionDrop; puedeEscribir: boolean; siguiente?: () => void; alAbrirProducto: (id: string) => void }) {
  const { mostrarToast } = useToast();
  const puedeAbrirProducto = usePuedeAbrir("producto");
  const [pendiente, empezar] = useTransition();
  const [elegido, setElegido] = useState<OpcionSkuMaestro | null>(null);
  const [cambiando, setCambiando] = useState(false);

  const vincular = (skuId: string | null, despues?: () => void) =>
    empezar(async () => {
      const r = await vincularPublicacionDrop(p.id, skuId).catch(() => ({ error: "No se pudo guardar el vínculo." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(skuId ? "Publicación vinculada" : "Vínculo quitado");
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
                // Con Ctrl, Cmd, Mayús o clic central sigue siendo un enlace: abre la ficha exacta en otra pestaña.
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
            {ETIQUETA_SUGERENCIA[tipo] ?? "Sugerido"}: {tipo === "seguro" ? "una publicación de Dropi del país con el mismo nombre, o el mismo nombre en Producto" : "el nombre o la foto se parecen"}.
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

/**
 * La ficha de una publicación de Drop (3 nov 2026, pedido de Hernán: «copia la de Dropi»): se abre a la derecha al tocar una fila, con la misma forma que la de
 * Gestión de IDs Dropi. Arriba, los mismos botones de la fila (los que Drop no tiene van apagados y dicen por qué; los demás todavía no escriben en Drop). Debajo:
 * Producto vinculado (con la sugerencia y «Vincular»), otras publicaciones de Drop del mismo producto, Producto (foto, nombre, ID y SKU de Drop, conexión),
 * Estado, Precio y margen, Stock, En camino, Competencia y Compras del producto. Los datos de Drop no se editan aquí: se leen de Drop.
 */
export function FichaPublicacionDrop({
  publicacion,
  moneda,
  codigoPais,
  nombrePais,
  puedeEscribir,
  puedeVerCompras,
  mismoProducto = [],
  alAbrirOtra,
  siguiente,
  alCerrar,
}: {
  publicacion: FilaPublicacionDrop | undefined;
  moneda: MonedaPublicaciones;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  /** Solo un administrador: las compras del producto vinculado (el servidor lo vuelve a comprobar). */
  puedeVerCompras: boolean;
  mismoProducto?: FilaPublicacionDrop[];
  alAbrirOtra?: (id: string) => void;
  /** Para «Vincular y siguiente». */
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [productoAbierto, setProductoAbierto] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<"inventario" | "privado" | null>(null);
  if (!publicacion) return null;
  const p = publicacion;
  const estado = { estado: p.estado, idDrop: p.idDrop };
  const cambio = accionDeEstado(estado);
  const aviso = () => mostrarToast(AVISO_SIN_CONEXION);
  const motivoEstado = motivoCambioEstado(estado);
  const motivoBorrar = motivoEliminar(estado);
  const motivoPrivado = motivoAccesoPrivado(estado);
  const motivoInventario = motivoGestionarInventario(estado);

  return (
    <Ventana
      abierto
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        <>
          <span className="text-sm font-medium text-muted-foreground tabular-nums">{p.idDrop || "Sin ID de Drop"}</span>
          <span className="text-lg font-semibold">{p.nombre}</span>
          {!p.conectado ? <Badge color="#e5484d">No aparece en Drop</Badge> : p.estado === "activo" ? <Badge color="#30a46c">Activa en Drop</Badge> : <Badge color="#8d8d8d">Inactiva en Drop</Badge>}
        </>
      }
    >
      {/* Los mismos botones que la fila, en su orden: los de Dropi, más «Gestionar inventario» y «Eliminar». */}
      {puedeEscribir && (
        <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-wrap gap-2 border-y border-border bg-card px-5 py-3">
          <BotonAccionApagado icono={ActualizarIcon} texto="Republicar" motivo={MOTIVO_SOLO_DROPI.republicar} />
          {motivoPrivado === null ? (
            <BotonAccion icono={CandadoAbiertoIcon} tono="privado" onClick={() => setDialogo("privado")}>
              Dar acceso privado
            </BotonAccion>
          ) : (
            <BotonAccionApagado icono={CandadoAbiertoIcon} texto="Dar acceso privado" motivo={motivoPrivado} />
          )}
          {motivoInventario === null ? (
            <BotonAccion icono={InventarioIcon} tono="info" onClick={() => setDialogo("inventario")}>
              Gestionar inventario
            </BotonAccion>
          ) : (
            <BotonAccionApagado icono={InventarioIcon} texto="Gestionar inventario" motivo={motivoInventario} />
          )}
          {motivoEstado === null ? (
            <BotonAccion icono={cambio.accion === "inactivar" ? ApagarIcon : ReactivarIcon} tono={cambio.accion === "inactivar" ? "peligro" : "exito"} onClick={aviso}>
              {cambio.accion === "inactivar" ? "Inactivar en Drop" : "Activar en Drop"}
            </BotonAccion>
          ) : (
            <BotonAccionApagado icono={ApagarIcon} texto={cambio.accion === "inactivar" ? "Inactivar en Drop" : "Activar en Drop"} motivo={motivoEstado} />
          )}
          <BotonAccionApagado icono={PausaIcon} texto="Pausar por falta de stock" motivo={MOTIVO_SOLO_DROPI.pausar} />
          <BotonAccionApagado icono={EtiquetaIcon} texto="Poner en liquidación" motivo={motivoLiquidacion()} />
          <BotonAccionApagado icono={ArchivarIcon} texto="Archivar" motivo={MOTIVO_SOLO_DROPI.archivar} />
          {motivoBorrar === null ? (
            <BotonAccion icono={PapeleraIcon} tono="alerta" onClick={aviso}>
              Eliminar en Drop
            </BotonAccion>
          ) : (
            <BotonAccionApagado icono={PapeleraIcon} texto="Eliminar en Drop" motivo={motivoBorrar} />
          )}
          <a
            href={urlDrop(p)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-16 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-border bg-card px-2 py-1.5 text-center text-xs leading-tight font-bold hover:bg-muted"
          >
            <DropIcon marca aria-hidden="true" className="h-5 w-5" />
            Abrir en Drop
          </a>
        </div>
      )}
      {!p.conectado && (
        <p role="note" className="m-0 flex items-start gap-2 border-b border-border px-5 py-3 text-sm">
          <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />
          <span>
            <span className="font-semibold">Ya no aparece en Drop.</span> La última lectura que la encontró fue el {fecha(p.ultimaVez)}: se eliminó en Drop o cambió de cuenta. Se
            guarda aquí con sus datos de entonces.
          </span>
        </p>
      )}

      <div className="border-b border-border px-5 py-5">
        <Seccion icono={InventarioIcon} titulo="Producto vinculado (SKU)">
          <VinculoSkuDrop p={p} puedeEscribir={puedeEscribir} siguiente={siguiente} alAbrirProducto={setProductoAbierto} />
        </Seccion>
      </div>
      {p.producto && alAbrirOtra && mismoProducto.length > 0 && (
        <div className="border-b border-border px-5 py-5">
          <Seccion icono={ProductoIcon} titulo="Otras publicaciones de Drop del producto">
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {mismoProducto.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => alAbrirOtra(o.id)} className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                    <span className="min-w-0 truncate">
                      <span className="text-muted-foreground tabular-nums">{o.idDrop || "Sin ID"}</span> · {o.nombre}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ETIQUETA_ESTADO_DROP[o.estado]}</span>
                  </button>
                </li>
              ))}
            </ul>
          </Seccion>
        </div>
      )}

      <div className="flex min-w-0 flex-col divide-y divide-border p-5">
        <Seccion icono={ProductoIcon} titulo="Producto">
          <div className="flex gap-4">
            <FotoAmpliable url={p.fotoUrl} nombre={p.nombre} tam="h-24 w-24" />
            <div className="grid min-w-0 flex-1 gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Nombre en Drop</span>
                <span className="text-sm font-medium">{p.nombre}</span>
              </div>
              <div className="flex">
                <InsigniaConectadoDrop conectado={p.conectado} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className={labelClassSm}>ID en Drop</span>
                  <span className="text-sm tabular-nums">{p.idDrop || "Drop no le muestra ID"}</span>
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <span className={labelClassSm}>SKU de Drop</span>
                  <span className="text-sm [overflow-wrap:anywhere]">{p.skuDrop || "—"}</span>
                  <span className="text-xs text-muted-foreground">No se cambia ni en Drop ni aquí.</span>
                </div>
              </div>
            </div>
          </div>
        </Seccion>

        <Seccion icono={EstadoIcon} titulo="Estado">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>En Drop</span>
              <span className="text-sm">{p.conectado ? `${ETIQUETA_ESTADO_DROP[p.estado]}` : "Ya no aparece"}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>Creada en Drop</span>
              <span className="text-sm">{fecha(p.creadoEnDrop)}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>Última lectura</span>
              <span className="text-sm">{fecha(p.ultimaVez)}</span>
            </div>
          </div>
        </Seccion>

        <Seccion icono={MargenIcon} titulo="Precio y margen">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>Precio en Drop</span>
              <span className="text-sm font-semibold tabular-nums">
                <Monto valor={p.precio} moneda={moneda} />
              </span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>Costo de producto</span>
              <span className="text-sm tabular-nums">{p.costo === null ? "—" : <Monto valor={p.costo} moneda={moneda} />}</span>
              <span className="text-xs text-muted-foreground">{p.producto ? (p.costo === null ? "Su producto no tiene costo en Gestión de IDs Dropi" : "El de su producto en Gestión de IDs Dropi") : "Vincula el producto para verlo"}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>Fulfillment</span>
              <span className="text-sm tabular-nums">{p.fulfillment === null ? "—" : <Monto valor={p.fulfillment} moneda={moneda} />}</span>
              <span className="text-xs text-muted-foreground">{p.fulfillment === null ? "Ponlo en Configuración, fila «Drop»" : "El de Drop en Configuración"}</span>
            </div>
          </div>
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

        <Seccion icono={InventarioIcon} titulo="Stock">
          <AvisoEnCamino enCamino={p.enCamino} llegada={p.llegadaCamino} sinFecha={p.sinFechaCamino} sinEnvio={p.sinEnvioCamino} enCotizacion={p.enCotizacion} etapaCotizacion={p.etapaCotizacion} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>Dónde está</span>
              <span className="text-sm">Bodega Drop</span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>Inventario en Drop</span>
              <span className={`text-sm font-semibold tabular-nums ${p.inventario === 0 ? "text-destructive" : ""}`}>{p.inventario === null ? "—" : `${p.inventario.toLocaleString("es-PA")} unidades`}</span>
              <span className="text-xs text-muted-foreground">No se edita: entra con «Gestionar inventario» (una solicitud de ingreso que la bodega aprueba).</span>
            </div>
          </div>
        </Seccion>

        {p.producto && p.producto.tipo !== "combo" && (
          <Seccion icono={ComprasIcon} titulo="En camino">
            <EnCaminoProducto key={`${p.producto.id}-${codigoPais}`} id={p.producto.id} pais={codigoPais} nombrePais={nombrePais} />
          </Seccion>
        )}

        {p.producto && p.producto.tipo !== "combo" && (
          <Seccion icono={InteligenciaIcon} titulo="Competencia del producto">
            <BloqueCompetencia key={p.producto.id} skuId={p.producto.id} />
          </Seccion>
        )}

        {puedeVerCompras && p.producto && (
          <Seccion icono={ComprasIcon} titulo="Compras">
            <ComprasProducto key={p.producto.id} id={p.producto.id} />
          </Seccion>
        )}
      </div>
      <FichaProductoEmbebida productoId={productoAbierto} alCerrar={() => setProductoAbierto(null)} />
      {dialogo === "inventario" && <DialogoSolicitudInventario nombre={p.nombre} alCerrar={() => setDialogo(null)} />}
      {dialogo === "privado" && <DialogoAccesoPrivado nombre={p.nombre} disponibles={p.inventario} alCerrar={() => setDialogo(null)} />}
    </Ventana>
  );
}
