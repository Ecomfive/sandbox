"use client";

import { useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { InventarioIcon, MargenIcon, ProductoIcon } from "@/lib/nav-icons";
import { MAX_NOMBRE_CREAR, PRECIO_MINIMO, type OpcionesCrear } from "@/lib/publicaciones/crear-dropi";
import { UBICACIONES } from "@/lib/publicaciones/publicacion";
import { crearPublicacion } from "./actions";
import { CamposDatosDropi } from "./campos-datos-dropi";

type Modo = "publicar" | "existente";

/**
 * «Agregar»: una publicación nueva. Por defecto se **publica en Dropi desde aquí** (pedido de Jhokser, 24 oct 2026): se piden todos los datos
 * que Dropi exige, y la publicación nace «Sin publicar» y queda pendiente en la lista de «Aplicar en Dropi» (se puede deshacer). Con
 * «Ya está en Dropi» solo se anota una que ya existe allá (con su ID).
 */
export function CrearPublicacionPanel({ paisId, opciones }: { paisId: string; opciones: OpcionesCrear }) {
  const [modo, setModo] = useState<Modo>("publicar");
  const publicar = modo === "publicar";
  return (
    <FichaCrear
      titulo={publicar ? "Publicar en Dropi" : "Anotar publicación de Dropi"}
      etiquetaCrear={publicar ? "Crear y dejar pendiente para Dropi" : "Crear publicación"}
      action={crearPublicacion}
      mensajeExito={publicar ? "Publicación creada: queda pendiente para Dropi" : "Publicación creada"}
      ocultos={{ pais_id: paisId, modo }}
      alAbrir={() => setModo("publicar")}
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
              <input id="pub-fulfillment" name="fulfillment" type="number" min={0} step="0.01" placeholder="Ej: 1.50" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
          </Seccion>
          {publicar ? (
            <CamposDatosDropi opciones={opciones} inicial={null} faltante={faltante} invalido={invalido} idBase="pub-dd" />
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
  );
}
