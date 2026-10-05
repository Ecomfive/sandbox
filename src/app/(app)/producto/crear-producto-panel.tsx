"use client";

import { useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, CatalogoIcon, ProductoIcon } from "@/lib/nav-icons";
import { crearProducto } from "./actions";
import { ComboBuilder } from "./combo-builder";

/**
 * «Agregar» de Producto: la ficha para crear un producto. La clase (Físico o Test) dice si ya se compró o se está probando;
 * el tipo (Simple o Compuesto) decide si aparece el bloque de componentes. El SKU es obligatorio: con él una venta de Dropi
 * o de una tienda de Shopify encuentra el producto para descontar el inventario.
 */
export function CrearProductoPanel({ opcionesSimples }: { opcionesSimples: { id: string; codigo: string; nombre: string }[] }) {
  const [tipo, setTipo] = useState("simple");
  const combo = tipo === "combo";
  // Un compuesto sin productos simples no se puede armar: el botón lleva a ese aviso.
  const sinComponentes = combo && opcionesSimples.length === 0;

  return (
    <FichaCrear
      titulo="Nuevo producto"
      etiquetaCrear="Crear producto"
      action={crearProducto}
      mensajeExito="Producto creado"
      alAbrir={() => setTipo("simple")}
      puedeExtra={!sinComponentes}
      alPulsarSinCompletar={() => document.getElementById("campo-componentes")?.scrollIntoView({ block: "center" })}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={CatalogoIcon} titulo="Producto">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Clase" id="campo-clase-producto" obligatorio faltante={faltante}>
                <select id="campo-clase-producto" name="clase" required defaultValue="fisico" aria-invalid={invalido("campo-clase-producto")} className={`${fieldClass} w-full`}>
                  <option value="fisico">Físico (ya se compró)</option>
                  <option value="test">Test (se está probando)</option>
                </select>
              </Campo>
              <Campo etiqueta="Tipo" id="campo-tipo-producto" obligatorio faltante={faltante}>
                <select
                  id="campo-tipo-producto"
                  name="tipo"
                  required
                  aria-invalid={invalido("campo-tipo-producto")}
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className={`${fieldClass} w-full`}
                >
                  <option value="simple">Simple</option>
                  <option value="combo">Compuesto</option>
                </select>
              </Campo>
            </div>
            <Campo etiqueta="Nombre" id="campo-nombre-producto" obligatorio faltante={faltante}>
              <input
                id="campo-nombre-producto"
                type="text"
                name="nombre"
                required
                data-enfocar
                autoComplete="off"
                maxLength={200}
                aria-invalid={invalido("campo-nombre-producto")}
                placeholder={combo ? "Ej: Kit de limpieza facial" : "Ej: Crema hidratante 50 ml"}
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="SKU" id="campo-codigo-producto" obligatorio faltante={faltante}>
              <input
                id="campo-codigo-producto"
                type="text"
                name="codigo"
                required
                autoComplete="off"
                maxLength={60}
                aria-invalid={invalido("campo-codigo-producto")}
                placeholder={combo ? "Ej: KIT-LIMPIEZA-01" : "Ej: CREMA-50"}
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Código de barras del fabricante (opcional)" id="campo-barras-producto">
              <input
                id="campo-barras-producto"
                type="text"
                name="codigo_barras"
                inputMode="numeric"
                autoComplete="off"
                maxLength={20}
                placeholder="Ej: 4006381333931"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="generar_barras" value="1" className="h-4 w-4" />
              Generar un código de barras interno
            </label>
          </Seccion>

          {!combo && (
            <Seccion icono={CalendarioIcon} titulo="Vencimiento">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="maneja_vencimiento" value="1" className="h-4 w-4" />
                Tiene fecha de vencimiento (se controla por lote)
              </label>
              <Campo etiqueta="Avisar con cuántos días de anticipación (opcional, 60 por defecto)" id="campo-aviso-producto">
                <input id="campo-aviso-producto" type="number" name="dias_aviso_vencimiento" min="1" max="3650" step="1" inputMode="numeric" placeholder="Ej: 90" className={`${fieldClass} w-full`} />
              </Campo>
            </Seccion>
          )}

          {combo && (
            <Seccion icono={ProductoIcon} titulo="Componentes">
              {opcionesSimples.length > 0 ? (
                <div id="campo-componentes">
                  <ComboBuilder opciones={opcionesSimples} />
                </div>
              ) : (
                <p id="campo-componentes" role="alert" className="py-1 text-xs text-destructive">
                  Todavía no hay productos simples. Crea al menos uno para armar un compuesto.
                </p>
              )}
            </Seccion>
          )}
        </>
      )}
    </FichaCrear>
  );
}
