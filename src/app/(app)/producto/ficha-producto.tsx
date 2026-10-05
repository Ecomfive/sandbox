"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { anilloFoco } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { CalendarioIcon, CatalogoIcon, CheckIcon, FlechaAbajoIcon, FlechaArribaIcon, FlechaIzquierdaIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import { formatearFecha } from "@/lib/formato";
import { cambiarClaseProducto, obtenerHistorialProducto } from "./actions";
import { CodigoBarrasProducto } from "./codigo-barras-producto";
import { VencimientoProducto } from "./vencimiento-producto";
import { ETIQUETA_ASOCIACION, ETIQUETA_CLASE, ETIQUETA_TIPO, TONO_CLASE, type FilaProducto } from "./def-producto";

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm break-words">{children}</dd>
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
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Sube cada vez que se cambia la clase, para que la línea de tiempo se vuelva a pedir.
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
        mostrarToast(`Ahora es un producto ${ETIQUETA_CLASE[nueva].toLowerCase()}`);
        setVersion((v) => v + 1);
      }
    });
  }

  const esTest = producto?.clase === "test";
  return (
    <Ventana
      abierto={!!producto}
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        producto && (
          <>
            <span className="text-lg font-semibold">{producto.codigo}</span>
            <Badge tone="neutral">{ETIQUETA_TIPO[producto.tipo] ?? producto.tipo}</Badge>
            <Badge tone={TONO_CLASE[producto.clase]}>{ETIQUETA_CLASE[producto.clase] ?? producto.clase}</Badge>
          </>
        )
      }
      navegacion={
        <>
          <BotonNavegar texto="Producto anterior" icono={FlechaArribaIcon} activo={!!anterior && !pending} alHacerClic={() => anterior && irA(anterior)} />
          <BotonNavegar texto="Producto siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !pending} alHacerClic={() => siguiente && irA(siguiente)} />
        </>
      }
    >
      {producto && (
        <div className="flex flex-1 flex-col">
          <p className="px-5 pt-5 pb-4 text-sm text-muted-foreground">{producto.nombre}</p>

          {puedeEscribir && (
            <div className="flex flex-col gap-2 border-y border-border px-5 py-3">
              <div className="flex flex-wrap gap-2">
                <BotonAccion
                  icono={esTest ? CheckIcon : FlechaIzquierdaIcon}
                  tono={esTest ? "oscuro" : "neutro"}
                  disabled={pending}
                  onClick={() => cambiarClase(esTest ? "fisico" : "test")}
                >
                  {pending ? "Guardando..." : esTest ? "Marcar como físico" : "Marcar como test"}
                </BotonAccion>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col divide-y divide-border border-t border-border p-5">
            <Seccion icono={CatalogoIcon} titulo="Producto">
              <dl className="flex flex-col gap-3">
                <Dato etiqueta="Nombre">{producto.nombre}</Dato>
                <Dato etiqueta="SKU">{producto.codigo}</Dato>
                <Dato etiqueta="Tipo">{ETIQUETA_TIPO[producto.tipo] ?? producto.tipo}</Dato>
                <Dato etiqueta="Clase">{ETIQUETA_CLASE[producto.clase] ?? producto.clase}</Dato>
              </dl>
            </Seccion>

            {producto.tipo === "combo" && (
              <Seccion icono={ProductoIcon} titulo="Componentes">
                <p className="text-sm">{producto.componentes || "—"}</p>
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

            <Seccion icono={InventarioIcon} titulo="Inventario">
              {esTest ? (
                <p className="text-sm text-muted-foreground">Producto de prueba: no tiene stock hasta que se marque como físico.</p>
              ) : (
                <Link href="/inventario" className={`inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent ${anilloFoco}`}>
                  Ver en Inventario
                </Link>
              )}
            </Seccion>

            <Seccion icono={ProductoIcon} titulo="Asociaciones">
              {producto.asociaciones.length === 0 ? (
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

            <Seccion icono={CalendarioIcon} titulo="Fechas">
              <dl className="flex flex-col gap-3">
                <Dato etiqueta="Creado el">{formatearFecha(producto.creado)}</Dato>
              </dl>
            </Seccion>
          </div>

          <HistorialGenerico id={producto.id} codigoPais={codigoPais} version={version} obtener={obtenerHistorialProducto} />
        </div>
      )}
    </Ventana>
  );
}
