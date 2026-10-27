"use client";

import { useState } from "react";
import { Ventana } from "@/components/ui/ventana";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { InventarioIcon, MargenIcon, ProductoIcon } from "@/lib/nav-icons";
import { MAX_NOMBRE_CREAR, PRECIO_MINIMO, type OpcionesCrear } from "@/lib/publicaciones/crear-dropi";
import { fulfillmentFijo, UBICACIONES } from "@/lib/publicaciones/publicacion";
import { crearPublicacion, type PublicacionCreada } from "./actions";
import { CamposDatosDropi } from "./campos-datos-dropi";
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
 */
export function CrearPublicacionPanel({ paisId, codigoPais, opciones }: { paisId: string; codigoPais: string; opciones: OpcionesCrear }) {
  const fijo = fulfillmentFijo(codigoPais);
  const [modo, setModo] = useState<Modo>("publicar");
  const publicar = modo === "publicar";
  // La publicación recién creada sin producto: se ofrece crearlo (el pack o combo).
  const [creada, setCreada] = useState<PublicacionCreada | null>(null);
  const [productoCreado, setProductoCreado] = useState(false);
  async function crear(f: FormData) {
    const r = await crearPublicacion(f);
    if (!r.error && r.id && r.sinProducto) {
      setCreada(r);
      setProductoCreado(false);
    }
    return r;
  }
  return (
    <>
    <FichaCrear
      titulo={publicar ? "Publicar en Dropi" : "Anotar publicación de Dropi"}
      etiquetaCrear={publicar ? "Crear y dejar pendiente para Dropi" : "Crear publicación"}
      action={crear}
      mensajeExito={publicar ? "Publicación creada: queda pendiente para Dropi" : "Publicación creada"}
      ocultos={{ pais_id: paisId, modo }}
      alAbrir={() => setModo("publicar")}
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
            <CamposDatosDropi opciones={opciones} inicial={null} faltante={faltante} invalido={invalido} idBase="pub-dd" conProducto />
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
    </>
  );
}
