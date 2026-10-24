"use client";

import { MapaComponentes } from "./mapa-componentes";
import { useState, useTransition } from "react";
import Link from "next/link";
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { anilloFoco } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { Badge } from "@/components/ui/badge";
import { CalendarioIcon, CatalogoIcon, ComprasIcon, EnvioIcon, FlechaAbajoIcon, FlechaArribaIcon, InteligenciaIcon, InventarioIcon, PapeleraIcon, ProductoIcon, TestIcon, VentasIcon } from "@/lib/nav-icons";
import { BloqueCompetencia } from "@/components/competencia/piezas-competencia";
import { ResultadoTestProducto } from "./test-producto";
import { formatearFecha } from "@/lib/formato";
import { cambiarClaseProducto, eliminarProducto, obtenerHistorialProducto } from "./actions";
import { CodigoBarrasProducto } from "./codigo-barras-producto";
import { VencimientoProducto } from "./vencimiento-producto";
import { EnvioProductoBloque } from "./envio-producto";
import { VariantesProducto } from "./variantes-producto";
import { ETIQUETA_ASOCIACION, ETIQUETA_CLASE, ETIQUETA_TIPO, numeroProducto, TONO_CLASE, type FilaProducto, type ReferenciasTest } from "./def-producto";
import { FotoProducto } from "./foto-producto";
import { NombreProducto } from "./nombre-producto";
import { SkuCopiable } from "@/components/ui/sku-copiable";
import { SkuProducto } from "./sku-producto";
import { ComprasProducto } from "./compras-producto";
import { VentasDropiProducto } from "./ventas-dropi-producto";
import { ExclusividadProducto } from "./exclusividad-producto";
import { CategoriaProducto } from "./categoria-producto";
import { SelectorClaseProducto } from "./selector-clase";

function Dato({ etiqueta, children, className = "" }: { etiqueta: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${className}`}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** Botón de la cabecera para pasar al producto anterior o siguiente (mismo patrón que `FichaCuenta`). */
function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${
          activo ? "hover:bg-muted" : "cursor-default opacity-40"
        }`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

/**
 * Ficha de un producto: el panel a la derecha que se abre al pulsar su fila, con la misma estructura que `FichaCuenta` —
 * cabecera con sus insignias (tipo y clase), flechas de anterior y siguiente, el botón para pasarlo de Test a Físico (o al
 * revés) y los datos en bloques con ícono: el producto, sus componentes si es compuesto, las fichas de Shopify y de Dropi
 * enlazadas, el acceso a su inventario y la actividad al final.
 */
export function FichaProducto({
  producto,
  orden,
  codigoPais,
  puedeEscribir,
  puedeEliminar,
  referenciasTest,
  alIr,
  alCerrar,
}: {
  /** El producto que se ve; sin él (no abierto) el panel está cerrado. */
  producto: FilaProducto | undefined;
  /** Las claves de los productos en el orden de la tabla. */
  orden: string[];
  /** El producto es igual para todos los países; el código de país solo da formato a las fechas de la actividad. */
  codigoPais: string;
  puedeEscribir: boolean;
  /** Solo un administrador: elimina el producto de verdad (si nada depende de él). */
  puedeEliminar: boolean;
  /** El promedio de los winners: la marca negra del «Resultado del test». */
  referenciasTest: ReferenciasTest;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const puedeVerInventario = usePuedeAbrir("inventario");
  const puedeVerPublicaciones = usePuedeAbrir("publicaciones-dropi");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Sube cada vez que se cambia el estado, para que la línea de tiempo se vuelva a pedir.
  const [version, setVersion] = useState(0);

  const indice = producto ? orden.indexOf(producto.id) : -1;
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;

  function irA(id: string) {
    if (pending) return;
    setError(null);
    alIr(id);
  }

  function cambiarClase(nueva: string) {
    if (!producto) return;
    setError(null);
    startTransition(async () => {
      const r = await cambiarClaseProducto(producto.id, nueva);
      if (r.error) setError(r.error);
      else {
        mostrarToast(
          r.compra
            ? `Estado: Activo. Se creó su orden de compra OC-${String(r.compra.numero).padStart(4, "0")}${r.compra.codigo ? ` · ${r.compra.codigo}` : ""} (${r.compra.pais}) en Cotizar`
            : `Estado: ${ETIQUETA_CLASE[nueva]}`,
        );
        setVersion((v) => v + 1);
      }
    });
  }

  function eliminar() {
    if (!producto) return;
    if (!confirm(`¿Eliminar el producto ${producto.codigo}? No se puede deshacer.`)) return;
    setError(null);
    startTransition(async () => {
      const r = await eliminarProducto(producto.id).catch(() => ({ error: "No se pudo eliminar. Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Producto eliminado");
        alCerrar();
      }
    });
  }

  const esTest = producto?.clase === "test";
  return (
    <Ventana
      abierto={!!producto}
      alCerrar={alCerrar}
      lado="centro"
      ancho="xl"
      titulo={
        producto && (
          <>
            {producto.numero !== null && <span className="text-sm font-medium text-muted-foreground tabular-nums">{numeroProducto(producto.numero)}</span>}
            <SkuCopiable codigo={producto.codigo} className="text-lg font-semibold" />
            <Badge tone="neutral">{ETIQUETA_TIPO[producto.tipo] ?? producto.tipo}</Badge>
            <Badge tone={TONO_CLASE[producto.clase]}>{ETIQUETA_CLASE[producto.clase] ?? producto.clase}</Badge>
          </>
        )
      }
      navegacion={
        <>
          {/* La fecha de creación arriba a la derecha, como en una tarea de ClickUp. */}
          {/* Eliminar arriba, a la mano (solo administradores, y solo si nada depende del producto). */}
          {producto && puedeEliminar && (
            <button
              type="button"
              disabled={pending}
              onClick={eliminar}
              className={`mr-1 inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 text-xs font-medium text-destructive hover:bg-destructive-soft disabled:opacity-50 ${anilloFoco}`}
            >
              <PapeleraIcon aria-hidden="true" className="h-3.5 w-3.5" />
              {pending ? "Eliminando..." : "Eliminar"}
            </button>
          )}
          {producto && (
            <span className="mr-2 hidden items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground sm:inline-flex">
              <CalendarioIcon aria-hidden="true" className="h-3.5 w-3.5" />
              Creado el {formatearFecha(producto.creado)}
            </span>
          )}
          <BotonNavegar texto="Producto anterior" icono={FlechaArribaIcon} activo={!!anterior && !pending} alHacerClic={() => anterior && irA(anterior)} />
          <BotonNavegar texto="Producto siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !pending} alHacerClic={() => siguiente && irA(siguiente)} />
        </>
      }
    >
      {producto && (
        // Los bloques en dos columnas que se llenan cada una por su lado (sin huecos), leyendo de izquierda a derecha en el orden
        // pedido por Alcides (21 oct 2026): Producto, Asociaciones, Competencia, Compras, Código de barras, Envío… La actividad, al
        // final y a todo el ancho. En pantallas angostas, una sola columna.
        <div className="@container min-h-0 flex-1 overflow-y-auto">
          <ExclusividadProducto key={`exclusividad-${producto.id}`} skuId={producto.id} />
          <div className="grid grid-cols-1 gap-x-10 p-5 @3xl:grid-cols-2">
            <div className="flex min-w-0 flex-col divide-y divide-border">
            <Seccion icono={CatalogoIcon} titulo="Producto">
              {/* La foto al lado de los datos; el nombre a lo ancho y SKU, Tipo, Estado y Categoría de a dos. */}
              <div className="flex items-start gap-4">
              <FotoProducto key={producto.id} id={producto.id} nombre={producto.nombre} foto={producto.foto} puedeEscribir={puedeEscribir} />
              <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Dato etiqueta="Nombre" className="sm:col-span-2">
                  <NombreProducto key={`${producto.id}-${producto.nombre}`} id={producto.id} nombre={producto.nombre} puedeEscribir={puedeEscribir} />
                </Dato>
                <Dato etiqueta="SKU">
                  <SkuProducto key={`${producto.id}-${producto.codigo}`} id={producto.id} codigo={producto.codigo} puedeEscribir={puedeEscribir} />
                </Dato>
                <Dato etiqueta="Tipo">{ETIQUETA_TIPO[producto.tipo] ?? producto.tipo}</Dato>
                <Dato etiqueta="Estado">
                  {puedeEscribir ? (
                    <SelectorClaseProducto clase={producto.clase} deshabilitado={pending} alCambiar={cambiarClase} />
                  ) : (
                    (ETIQUETA_CLASE[producto.clase] ?? producto.clase)
                  )}
                  {error && (
                    <span role="alert" className="mt-1 block text-xs text-destructive">
                      {error}
                    </span>
                  )}
                </Dato>
                <Dato etiqueta="Categoría">
                  <CategoriaProducto key={`${producto.id}-${producto.categoria?.id ?? ""}-${producto.categoria?.revisar ?? ""}`} id={producto.id} categoria={producto.categoria} puedeEscribir={puedeEscribir} />
                </Dato>
              </dl>
              </div>
            </Seccion>
            {producto.tipo !== "combo" && (
              <Seccion icono={InteligenciaIcon} titulo="Competencia en Dropi">
                <BloqueCompetencia key={producto.id} skuId={producto.id} />
              </Seccion>
            )}
            <Seccion icono={CatalogoIcon} titulo="Código de barras">
              <CodigoBarrasProducto
                key={producto.id}
                id={producto.id}
                codigoBarras={producto.codigoBarras}
                origen={producto.codigoBarrasOrigen}
                nombre={producto.nombre}
                sku={producto.codigo}
                puedeEscribir={puedeEscribir}
              />
            </Seccion>
            {/* Si salió de Test productos: cómo le fue, con las mismas barras de su ficha allá. */}
            {producto.tests.length > 0 && (
              <Seccion icono={TestIcon} titulo="Resultado del test">
                <ResultadoTestProducto producto={producto} referencias={referenciasTest} />
              </Seccion>
            )}
            <Seccion icono={InventarioIcon} titulo="Inventario">
              {esTest ? (
                <p className="text-sm text-muted-foreground">Producto de prueba: no tiene stock hasta que se pase a Activo.</p>
              ) : producto.variantes.length > 0 ? (
                <p className="text-sm text-muted-foreground">El stock se lleva en cada variante (ábrelas desde Variantes).</p>
              ) : puedeVerInventario ? (
                <Link href="/inventario" className={`inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent ${anilloFoco}`}>
                  Ver en Inventario
                </Link>
              ) : null}
            </Seccion>
            </div>
            <div className="flex min-w-0 flex-col divide-y divide-border border-t border-border pt-5 @3xl:border-t-0 @3xl:pt-0">
            <Seccion icono={ProductoIcon} titulo="Asociaciones">
              {/* Sus publicaciones de Dropi como proveedor (Gestión de IDs Dropi): cómo se llama allá, en qué país y con qué ID. */}
              {producto.nombresDropi.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <h4 className="m-0 text-xs font-medium text-muted-foreground">Publicaciones en Dropi</h4>
                  <ul className="m-0 grid list-none grid-cols-1 gap-x-6 gap-y-2 p-0 text-sm sm:grid-cols-2">
                    {producto.nombresDropi.map((n, i) => (
                      <li key={`${n.id}-${i}`} className="flex min-w-0 flex-col">
                        {puedeVerPublicaciones ? (
                          <Link href={`/publicaciones-dropi?abrir=${n.id}`} className={`w-fit rounded font-medium underline-offset-2 hover:underline ${anilloFoco}`}>
                            {n.nombre}
                          </Link>
                        ) : (
                          <span className="font-medium">{n.nombre}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {n.pais}
                          {n.dropiId ? ` · ID ${n.dropiId}` : ""}
                          {n.archivada ? " · archivada" : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {producto.nombresDropi.length > 0 && producto.asociaciones.length > 0 && <h4 className="m-0 mt-1 text-xs font-medium text-muted-foreground">Otras fichas</h4>}
              {producto.asociaciones.length === 0 && producto.nombresDropi.length > 0 ? null : producto.asociaciones.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin fichas enlazadas.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
                  {producto.asociaciones.map((a, i) => (
                    <li key={`${a.tipo}-${i}`} className="flex flex-col">
                      {a.href ? (
                        <Link href={a.href} className="font-medium underline-offset-2 hover:underline">
                          {a.nombre}
                        </Link>
                      ) : (
                        <span className="font-medium">{a.nombre}</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {ETIQUETA_ASOCIACION[a.tipo]} · {a.detalle}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {puedeEscribir && (
                <Link
                  href={`/wms-productos/nuevo?sku_maestro=${producto.id}`}
                  className={`mt-2 inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent ${anilloFoco}`}
                >
                  Crear ficha Shopify
                </Link>
              )}
            </Seccion>
            {producto.nombresDropi.length > 0 && (
              <Seccion icono={VentasIcon} titulo="Ventas en Dropi">
                <VentasDropiProducto key={producto.id} id={producto.id} />
              </Seccion>
            )}
            {producto.tipo !== "combo" && (
              <Seccion icono={ComprasIcon} titulo="Compras">
                <ComprasProducto key={producto.id} id={producto.id} />
              </Seccion>
            )}
            <Seccion icono={EnvioIcon} titulo="Envío">
              <EnvioProductoBloque key={producto.id} id={producto.id} envio={producto.envio} puedeEscribir={puedeEscribir} />
            </Seccion>
            {producto.tipo !== "combo" && (
              <Seccion icono={ProductoIcon} titulo="Variantes">
                <VariantesProducto key={producto.id} producto={producto} puedeEscribir={puedeEscribir} alAbrir={irA} />
              </Seccion>
            )}
            {producto.tipo === "combo" && (
              <Seccion icono={ProductoIcon} titulo="Componentes">
                {producto.listaComponentes.length ? (
                  <MapaComponentes componentes={producto.listaComponentes} nombre={producto.nombre} />
                ) : (
                  <p className="text-sm text-muted-foreground">Sin componentes.</p>
                )}
              </Seccion>
            )}
            {producto.tipo !== "combo" && (
              <Seccion icono={CalendarioIcon} titulo="Vencimiento">
                <VencimientoProducto
                  key={producto.id}
                  id={producto.id}
                  maneja={producto.manejaVencimiento}
                  diasAviso={producto.diasAvisoVencimiento}
                  puedeEscribir={puedeEscribir}
                />
              </Seccion>
            )}
            </div>
          </div>
          <section aria-label="Actividad del producto" className="border-t border-border bg-muted/30">
          <HistorialGenerico id={producto.id} codigoPais={codigoPais} version={version} obtener={obtenerHistorialProducto} />
          </section>
        </div>
      )}
    </Ventana>
  );
}
