"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { InventarioIcon } from "@/lib/nav-icons";
import { crearUbicacion } from "./actions";
import { ETIQUETA_PROPIEDAD, ETIQUETA_TAMANO, PROPIEDADES, TAMANOS } from "./def-ubicaciones";

/** «Agregar» de Ubicaciones: la ficha para sumar una ubicación (bin) a una bodega. */
export function CrearUbicacionPanel({ bodegas }: { bodegas: { id: string; nombre: string }[] }) {
  return (
    <FichaCrear titulo="Nueva ubicación" etiquetaCrear="Crear ubicación" action={crearUbicacion} mensajeExito="Ubicación creada" puedeExtra={bodegas.length > 0}>
      {({ faltante, invalido }) => (
        <Seccion icono={InventarioIcon} titulo="Ubicación">
          <Campo etiqueta="Bodega" id="campo-bodega-ubicacion" obligatorio faltante={faltante}>
            <select id="campo-bodega-ubicacion" name="bodega_id" required defaultValue="" data-enfocar aria-invalid={invalido("campo-bodega-ubicacion")} className={`${fieldClass} w-full`}>
              <option value="" disabled>
                Elige una bodega
              </option>
              {bodegas.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Código" id="campo-codigo-ubicacion" obligatorio faltante={faltante}>
            <input id="campo-codigo-ubicacion" type="text" name="codigo" required autoComplete="off" maxLength={60} aria-invalid={invalido("campo-codigo-ubicacion")} placeholder="Ej: A-01-03" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Propiedad" id="campo-propiedad-ubicacion" obligatorio faltante={faltante}>
            <select id="campo-propiedad-ubicacion" name="propiedad" required defaultValue="normal" aria-invalid={invalido("campo-propiedad-ubicacion")} className={`${fieldClass} w-full`}>
              {PROPIEDADES.map((p) => (
                <option key={p} value={p}>
                  {ETIQUETA_PROPIEDAD[p]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Tamaño" id="campo-tamano-ubicacion">
            <select id="campo-tamano-ubicacion" name="tamano" defaultValue="" className={`${fieldClass} w-full`}>
              <option value="">Sin tamaño</option>
              {TAMANOS.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TAMANO[t]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Código de barras" id="campo-barras-ubicacion">
            <input id="campo-barras-ubicacion" type="text" name="codigo_barras" autoComplete="off" maxLength={100} placeholder="Ej: 7501031311309" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Notas" id="campo-notas-ubicacion">
            <textarea id="campo-notas-ubicacion" name="notas" rows={3} maxLength={1000} className={`${fieldClass} w-full resize-y`} />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}
