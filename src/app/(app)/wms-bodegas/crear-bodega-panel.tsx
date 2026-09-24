"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { InventarioIcon } from "@/lib/nav-icons";
import { crearBodega } from "./actions";
import { ETIQUETA_TIPO_BODEGA, TIPOS_BODEGA } from "./def-bodegas";

/** «Agregar» de Bodegas: la ficha para sumar una bodega más, además de las 6 fuentes que ya vienen cargadas. */
export function CrearBodegaPanel({ paisId }: { paisId: string }) {
  return (
    <FichaCrear titulo="Nueva bodega" etiquetaCrear="Crear bodega" action={crearBodega} mensajeExito="Bodega creada" ocultos={{ pais_id: paisId }}>
      {({ faltante, invalido }) => (
        <Seccion icono={InventarioIcon} titulo="Bodega">
          <Campo etiqueta="Nombre" id="campo-nombre-bodega" obligatorio faltante={faltante}>
            <input id="campo-nombre-bodega" type="text" name="nombre" required data-enfocar autoComplete="off" maxLength={120} aria-invalid={invalido("campo-nombre-bodega")} placeholder="Ej: Bodega Costa Rica" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Tipo" id="campo-tipo-bodega" obligatorio faltante={faltante}>
            <select id="campo-tipo-bodega" name="tipo" required defaultValue="" aria-invalid={invalido("campo-tipo-bodega")} className={`${fieldClass} w-full`}>
              <option value="" disabled>
                Elige un tipo
              </option>
              {TIPOS_BODEGA.map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_BODEGA[t]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Dirección" id="campo-direccion-bodega">
            <input id="campo-direccion-bodega" type="text" name="direccion" autoComplete="off" maxLength={300} placeholder="Ej: Ave Centenario, Costa del Este" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Contacto" id="campo-contacto-bodega">
            <input id="campo-contacto-bodega" type="text" name="contacto" autoComplete="off" maxLength={200} placeholder="Ej: Ana Pérez · 6000-0000" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Notas" id="campo-notas-bodega">
            <textarea id="campo-notas-bodega" name="notas" rows={3} maxLength={1000} className={`${fieldClass} w-full resize-y`} />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}
