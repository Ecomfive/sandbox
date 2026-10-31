"use client";

import { useCallback, useRef, useState } from "react";
import { Ventana } from "@/components/ui/ventana";
import { Campo } from "@/components/ui/campo-ficha";
import { CampoSkuMaestro, ProveedorSkusMaestros, useOpcionesSkuMaestro, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { InventarioIcon, MargenIcon, ProductoIcon } from "@/lib/nav-icons";
import { MAX_NOMBRE_CREAR, PRECIO_MINIMO, type OpcionesCrear } from "@/lib/publicaciones/crear-dropi";
import { UBICACIONES } from "@/lib/publicaciones/publicacion";
import { crearPublicacion, type PublicacionCreada } from "./actions";
import { BotonCrearProducto, CamposDatosDropi } from "./campos-datos-dropi";
import { CrearProductoAlAgregar } from "./crear-producto-al-agregar";
import { CrearProductoDePublicacion } from "./crear-producto-de-publicacion";

type Modo = "publicar" | "existente";

/**
 * «Agregar»: una publicación nueva. Por defecto se **publica en Dropi desde aquí** (pedido de Jhokser, 24 oct 2026): se piden todos los datos
 * que Dropi exige, y la publicación nace «Sin publicar» y queda pendiente en la lista de «Aplicar en Dropi» (se puede deshacer). Con
 * «Ya está en Dropi» solo se anota una que ya existe allá (con su ID).
 *
 * Si se crea sin elegir un producto de Producto (un pack de 2 o 3, o un combo de varios productos que todavía no existe), al terminar sale un aviso
 * con el atajo «Crear el producto»: abre la ficha del producto con el nombre, el SKU y la misma foto de la publicación, y lo deja vinculado
 * (pedido de Jhokser, 27 oct 2026). Lo puede hacer quien edita esta lista, sin abrir Producto.
 *
 * En los dos modos se busca el producto de Producto que se vincula y, si no existe, «No existe: crear el producto» lo crea ahí mismo y lo
 * deja elegido (pedido de Alcides, 27 oct 2026; reemplaza el botón «Nuevo producto» de la barra).
 */
export function CrearPublicacionPanel({ paisId, fulfillmentPais = null, opciones }: { paisId: string; codigoPais: string; fulfillmentPais?: number | null; opciones: OpcionesCrear }) {
  // El fulfillment del país (Bodegas): se ve, pero no se escribe.
  const fijo = fulfillmentPais;
  const [modo, setModo] = useState<Modo>("publicar");
  const publicar = modo === "publicar";
  // La publicación recién creada sin producto: se ofrece crearlo (el pack o combo).
  const [creada, setCreada] = useState<PublicacionCreada | null>(null);
  const [productoCreado, setProductoCreado] = useState(false);
  // El producto que se crea desde aquí: se suma a la lista del buscador y queda elegido.
  const opcionesSku = useOpcionesSkuMaestro();
  const [nuevos, setNuevos] = useState<OpcionSkuMaestro[]>([]);
  const [productoNuevo, setProductoNuevo] = useState<OpcionSkuMaestro | null>(null);
  const [vinculado, setVinculado] = useState<OpcionSkuMaestro | null>(null);
  const [nombreProducto, setNombreProducto] = useState("");
  const abrirProducto = useRef<(() => void) | null>(null);
  const quiereAbrir = useRef(false);
  const registrar = useCallback((abrir: () => void) => {
    abrirProducto.current = abrir;
    if (quiereAbrir.current) {
      quiereAbrir.current = false;
      abrir();
    }
  }, []);
  // La ficha del producto llega con el nombre escrito en la publicación; si cambió, se vuelve a armar y se abre al quedar lista.
  function pedirCrearProducto() {
    const nombre = (document.getElementById("pub-nombre") as HTMLInputElement | null)?.value.trim() ?? "";
    if (nombre === nombreProducto && abrirProducto.current) return abrirProducto.current();
    quiereAbrir.current = true;
    setNombreProducto(nombre);
  }
  function productoCreadoAqui(o: OpcionSkuMaestro) {
    setNuevos((a) => [o, ...a]);
    setProductoNuevo(o);
    setVinculado(o);
  }
  async function crear(f: FormData) {
    const r = await crearPublicacion(f);
    if (!r.error && r.id && r.sinProducto) {
      setCreada(r);
      setProductoCreado(false);
    }
    return r;
  }
  return (
    <ProveedorSkusMaestros opciones={nuevos.length ? [...nuevos, ...opcionesSku] : opcionesSku}>
    <FichaCrear
      titulo={publicar ? "Publicar en Dropi" : "Anotar publicación de Dropi"}
      etiquetaCrear={publicar ? "Crear y dejar pendiente para Dropi" : "Crear publicación"}
      action={crear}
      mensajeExito={publicar ? "Publicación creada: queda pendiente para Dropi" : "Publicación creada"}
      ocultos={{ pais_id: paisId, modo }}
      alAbrir={() => {
        setModo("publicar");
        setProductoNuevo(null);
        setVinculado(null);
      }}
      // Con datos sin completar se guarda como borrador («Sin publicar»): se completa y se publica después, o se elimina.
      secundario={
        publicar
          ? {
              etiqueta: "Guardar como borrador",
              mensajeExito: "Guardada como borrador («Sin publicar»)",
              action: (f) => {
                f.set("modo", "borrador");
                return crear(f);
              },
            }
          : undefined
      }
    >
      {({ faltante, invalido }) => (
        <>
          <div role="group" aria-label="Qué vas a crear" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 pb-1">
            {([["publicar", "Publicar en Dropi"], ["existente", "Ya está en Dropi"]] as const).map(([valor, texto]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={modo === valor}
                onClick={() => setModo(valor)}
                className={`min-h-9 rounded-md px-3 text-sm font-medium ${anilloFoco} ${modo === valor ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {texto}
              </button>
            ))}
          </div>
          <Seccion icono={ProductoIcon} titulo="Producto">
            <Campo etiqueta="Nombre" id="pub-nombre" obligatorio faltante={faltante}>
              <input
                id="pub-nombre"
                name="nombre"
                required
                data-enfocar
                autoComplete="off"
                maxLength={publicar ? MAX_NOMBRE_CREAR : 300}
                aria-invalid={invalido("pub-nombre")}
                placeholder="Ej: Crema Elimina Verrugas 20 g"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            {!publicar && (
              // El buscador lleva su propio nombre accesible («Producto vinculado»): el título va como texto, no como <label>.
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden="true" className={labelClassSm}>
                  Producto vinculado
                </span>
                <input type="hidden" name="sku_maestro_id" value={vinculado?.id ?? ""} />
                <CampoSkuMaestro valor={vinculado?.id ?? null} alCambiar={setVinculado} etiquetaAria="Producto vinculado" placeholder="Código o nombre del producto" claseContenedor="w-full" className={`${fieldClass} w-full`} />
                {!vinculado && <BotonCrearProducto alPulsar={pedirCrearProducto} />}
              </div>
            )}
            {!publicar && (
              <Campo etiqueta="ID en Dropi" id="pub-dropi">
                <input id="pub-dropi" name="dropi_id" autoComplete="off" maxLength={60} placeholder="Ej: 11144" className={`${fieldClass} w-full tabular-nums`} />
              </Campo>
            )}
          </Seccion>
          <Seccion icono={MargenIcon} titulo="Precio">
            <Campo etiqueta="Precio de venta" id="pub-precio" obligatorio={publicar} faltante={faltante}>
              <input
                id="pub-precio"
                name="precio_venta"
                type="number"
                required={publicar}
                min={publicar ? PRECIO_MINIMO : 0}
                step="0.01"
                aria-invalid={publicar ? invalido("pub-precio") : undefined}
                placeholder="Ej: 9.99"
                className={`${fieldClass} w-full tabular-nums`}
              />
            </Campo>
            <Campo etiqueta="Costo de producto" id="pub-costo">
              <input id="pub-costo" name="costo_mercancia" type="number" min={0} step="0.01" placeholder="Ej: 1.16" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Fulfillment" id="pub-fulfillment">
              {fijo !== null ? (
                <>
                  <input id="pub-fulfillment" value={fijo.toFixed(2)} disabled className={`${fieldClass} w-full tabular-nums disabled:cursor-not-allowed disabled:bg-muted`} />
                  <span className="text-xs text-muted-foreground">Igual en todas las de Panamá</span>
                </>
              ) : (
                <input id="pub-fulfillment" name="fulfillment" type="number" min={0} step="0.01" placeholder="Ej: 1.50" className={`${fieldClass} w-full tabular-nums`} />
              )}
            </Campo>
          </Seccion>
          {publicar ? (
            <CamposDatosDropi
              opciones={opciones}
              inicial={null}
              faltante={faltante}
              invalido={invalido}
              idBase="pub-dd"
              conProducto
              productoNuevo={productoNuevo}
              alPedirCrearProducto={pedirCrearProducto}
            />
          ) : (
            <Seccion icono={InventarioIcon} titulo="Stock">
              <Campo etiqueta="Dónde está" id="pub-ubicacion">
                <select id="pub-ubicacion" name="ubicacion" defaultValue="" className={`${fieldClass} w-full`}>
                  <option value="">Sin definir</option>
                  {UBICACIONES.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>
            </Seccion>
          )}
        </>
      )}
    </FichaCrear>
    {/* Fuera del formulario de «Agregar»: un formulario dentro de otro enviaría los dos. */}
    <CrearProductoAlAgregar key={nombreProducto} nombre={nombreProducto} alRegistrar={registrar} alCrear={productoCreadoAqui} />
    {creada?.id && (
      <Ventana abierto alCerrar={() => setCreada(null)} titulo={productoCreado ? "Producto creado" : "Publicación creada"} ancho="sm">
        <div className="flex flex-col gap-4 p-5 text-sm">
          {productoCreado ? (
            <p className="m-0">El producto quedó creado y vinculado a «{creada.nombre}».</p>
          ) : (
            <p className="m-0">
              «{creada.nombre}» no tiene un producto vinculado. Si es un pack o un combo que todavía no existe, créalo ahora: usa el mismo nombre, el SKU y la misma foto.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setCreada(null)} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
              {productoCreado ? "Cerrar" : "Ahora no"}
            </button>
            {!productoCreado && (
              <CrearProductoDePublicacion
                publicacionId={creada.id}
                nombre={creada.nombre ?? ""}
                sku={creada.sku}
                fotos={creada.fotos ?? []}
                alCrear={() => setProductoCreado(true)}
                boton={(abrir) => (
                  <button type="button" onClick={abrir} className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 ${anilloFoco}`}>
                    Crear el producto
                  </button>
                )}
              />
            )}
          </div>
        </div>
      </Ventana>
    )}
    </ProveedorSkusMaestros>
  );
}
