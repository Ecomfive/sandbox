"use client";

import { useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CatalogoIcon, ProductoIcon } from "@/lib/nav-icons";
import { proponerSku } from "./actions";
import { ComboBuilder } from "./combo-builder";

/**
 * «Agregar» del catálogo: la ficha para proponer un SKU. El tipo (Simple o Combo) decide si aparece el bloque de
 * componentes; un combo se arma con SKU simples ya aprobados. Todo SKU nuevo queda «propuesto» y pasa por revisión.
 */
export function CrearSkuPanel({ opcionesSimples }: { opcionesSimples: { id: string; codigo: string; nombre: string }[] }) {
  const [tipo, setTipo] = useState("simple");
  const combo = tipo === "combo";
  // Un combo sin SKU simples aprobados no se puede armar: el botón lleva a ese aviso.
  const sinComponentes = combo && opcionesSimples.length === 0;

  return (
    <FichaCrear
      titulo="Nuevo SKU"
      etiquetaCrear="Proponer SKU"
      action={proponerSku}
      mensajeExito="SKU propuesto"
      alAbrir={() => setTipo("simple")}
      puedeExtra={!sinComponentes}
      alPulsarSinCompletar={() => document.getElementById("campo-componentes")?.scrollIntoView({ block: "center" })}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={CatalogoIcon} titulo="SKU">
            <Campo etiqueta="Tipo" id="campo-tipo-sku" obligatorio faltante={faltante}>
              <select
                id="campo-tipo-sku"
                name="tipo"
                required
                aria-invalid={invalido("campo-tipo-sku")}
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className={`${fieldClass} w-full`}
              >
                <option value="simple">Simple</option>
                <option value="combo">Combo</option>
              </select>
            </Campo>
            <Campo etiqueta="Nombre" id="campo-nombre-sku" obligatorio faltante={faltante}>
              <input
                id="campo-nombre-sku"
                type="text"
                name="nombre"
                required
                data-enfocar
                autoComplete="off"
                aria-invalid={invalido("campo-nombre-sku")}
                placeholder={combo ? "Ej: Kit de limpieza facial" : "Ej: Crema hidratante 50 ml"}
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Código" id="campo-codigo-sku">
              <input
                id="campo-codigo-sku"
                type="text"
                name="codigo"
                autoComplete="off"
                placeholder={combo ? "Ej: CMB-001" : "Ej: MSK-001"}
                className={`${fieldClass} w-full`}
              />
            </Campo>
          </Seccion>

          {combo && (
            <Seccion icono={ProductoIcon} titulo="Componentes">
              {opcionesSimples.length > 0 ? (
                <div id="campo-componentes">
                  <ComboBuilder opciones={opcionesSimples} />
                </div>
              ) : (
                <p id="campo-componentes" role="alert" className="py-1 text-xs text-destructive">
                  Sin SKUs simples aprobados. Aprueba al menos uno para armar un combo.
                </p>
              )}
            </Seccion>
          )}
        </>
      )}
    </FichaCrear>
  );
}
