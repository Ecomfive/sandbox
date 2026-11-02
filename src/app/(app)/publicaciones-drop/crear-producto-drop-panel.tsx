"use client";

import { useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { EnlaceIcon, MargenIcon, NotificacionesIcon, ProductoIcon } from "@/lib/nav-icons";
import { descripcionPorDefecto, MAX_IMAGENES, MIN_IMAGENES } from "@/lib/publicaciones-drop/crear";
import { crearProductoDrop } from "./actions";

/**
 * «Crear producto» de Gestión de IDs Drop (el botón negro de Drop, 3 nov 2026; ver DROP-REFERENCIA.md). Pide lo mismo que Drop, que es poco: el nombre (que también es el SKU y no se
 * puede cambiar), la descripción corta (se propone el mismo nombre), la categoría, el precio de venta y de 1 a 5 imágenes; opcionales, el enlace de los creativos y el aviso por correo
 * de poco stock. **No** pide precio sugerido, peso ni medidas, público o privado, simple o variable, nombre para la guía, videos ni garantías. El stock nace en cero: se pide después con
 * «Gestionar inventario». Todavía el sistema no escribe en Drop: al crear, valida y lo dice.
 */
export function CrearProductoDropPanel() {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [descripcionEditada, setDescripcionEditada] = useState(false);
  const [imagenes, setImagenes] = useState(0);
  const reiniciar = () => {
    setNombre("");
    setDescripcion("");
    setDescripcionEditada(false);
    setImagenes(0);
  };
  return (
    <FichaCrear titulo="Crear producto" etiquetaBoton="Crear producto" etiquetaCrear="Guardar producto" action={crearProductoDrop} mensajeExito="Producto creado en Drop" alAbrir={reiniciar} puedeExtra={imagenes <= MAX_IMAGENES}>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={ProductoIcon} titulo="Producto">
            <Campo etiqueta="Nombre (también es el SKU)" id="campo-nombre" obligatorio faltante={faltante}>
              <input
                id="campo-nombre"
                name="nombre"
                required
                data-enfocar
                aria-invalid={invalido("campo-nombre")}
                value={nombre}
                onChange={(e) => {
                  setNombre(e.target.value);
                  if (!descripcionEditada) setDescripcion(descripcionPorDefecto(e.target.value));
                }}
                placeholder="Ej: Crema Nida 50 ml"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Descripción" id="campo-descripcion" obligatorio faltante={faltante}>
              <input
                id="campo-descripcion"
                name="descripcion"
                required
                aria-invalid={invalido("campo-descripcion")}
                value={descripcion}
                onChange={(e) => {
                  setDescripcion(e.target.value);
                  setDescripcionEditada(true);
                }}
                placeholder="Ej: Crema Nida 50 ml"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Categoría" id="campo-categoria" obligatorio faltante={faltante}>
              <input id="campo-categoria" name="categoria" required aria-invalid={invalido("campo-categoria")} placeholder="Ej: Belleza" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>

          <Seccion icono={MargenIcon} titulo="Precio">
            <Campo etiqueta="Precio de venta (₡)" id="campo-precio" obligatorio faltante={faltante}>
              <input id="campo-precio" type="number" name="precio" min="1" step="1" required aria-invalid={invalido("campo-precio")} placeholder="Ej: 12000" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
          </Seccion>

          <Seccion icono={ProductoIcon} titulo={`Imágenes (de ${MIN_IMAGENES} a ${MAX_IMAGENES})`}>
            <Campo etiqueta="Imágenes del producto" id="campo-imagenes" obligatorio faltante={faltante}>
              <input
                id="campo-imagenes"
                type="file"
                name="imagenes"
                accept="image/*"
                multiple
                required
                aria-invalid={invalido("campo-imagenes") ?? (imagenes > MAX_IMAGENES ? true : undefined)}
                onChange={(e) => setImagenes(e.target.files?.length ?? 0)}
                className={`${fieldClass} w-full`}
              />
              {imagenes > MAX_IMAGENES && (
                <p role="alert" className="m-0 text-xs text-destructive">
                  Máximo {MAX_IMAGENES} imágenes: elegiste {imagenes}.
                </p>
              )}
            </Campo>
          </Seccion>

          <Seccion icono={EnlaceIcon} titulo="Opcional">
            <Campo etiqueta="Enlace de los creativos" id="campo-creativos">
              <input id="campo-creativos" type="url" name="enlace_creativos" placeholder="Ej: https://drive.google.com/drive/folders/…" className={`${fieldClass} w-full`} />
            </Campo>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="aviso_stock_bajo" className="h-4 w-4" />
              <NotificacionesIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              Avisarme por correo si queda poco stock
            </label>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
