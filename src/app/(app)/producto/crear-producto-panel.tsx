"use client";

import { useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, CatalogoIcon, ProductoIcon } from "@/lib/nav-icons";
import { crearProducto, revisarSku } from "./actions";
import { ComboBuilder } from "./combo-builder";
import { CamposVariantes, type VariantesArmadas } from "./variantes-producto";

/**
 * «Agregar» de Producto: la ficha para crear un producto. El estado (Activo o Test) dice si ya se compra o se está probando;
 * el tipo (Simple o Compuesto) decide si aparece el bloque de componentes. El SKU es obligatorio: con él una venta de Dropi
 * o de una tienda de Shopify encuentra el producto para descontar el inventario.
 */
export function CrearProductoPanel({ opcionesSimples }: { opcionesSimples: { id: string; codigo: string; nombre: string }[] }) {
  const [tipo, setTipo] = useState("simple");
  const combo = tipo === "combo";
  // El nombre y el SKU se siguen para sugerir los de las variantes.
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  // Si el SKU escrito ya lo tiene otro producto (se revisa al salir del campo; el servidor lo vuelve a revisar al crear).
  const [skuOcupado, setSkuOcupado] = useState<string | null>(null);
  const [conVariantes, setConVariantes] = useState(false);
  const [armadas, setArmadas] = useState<VariantesArmadas>({ opciones: [], variantes: [] });
  // Un compuesto sin productos simples no se puede armar: el botón lleva a ese aviso.
  const sinComponentes = combo && opcionesSimples.length === 0;

  return (
    <FichaCrear
      titulo="Nuevo producto"
      etiquetaCrear="Crear producto"
      action={crearProducto}
      mensajeExito="Producto creado"
      alAbrir={() => {
        setTipo("simple");
        setNombre("");
        setCodigo("");
        setConVariantes(false);
      }}
      puedeExtra={!sinComponentes}
      alPulsarSinCompletar={() => document.getElementById("campo-componentes")?.scrollIntoView({ block: "center" })}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={CatalogoIcon} titulo="Producto">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Estado" id="campo-clase-producto" obligatorio faltante={faltante}>
                <select id="campo-clase-producto" name="clase" required defaultValue="fisico" aria-invalid={invalido("campo-clase-producto")} className={`${fieldClass} w-full`}>
                  <option value="fisico">Activo (se compra)</option>
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
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
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
                value={codigo}
                onChange={(e) => {
                  setCodigo(e.target.value.replace(/\s/g, ""));
                  setSkuOcupado(null);
                }}
                onBlur={(e) => {
                  const valor = e.target.value.trim();
                  if (valor) void revisarSku(valor).then((r) => setSkuOcupado(r.error ?? null));
                }}
                aria-invalid={invalido("campo-codigo-producto") || !!skuOcupado}
                aria-describedby={skuOcupado ? "sku-ocupado" : undefined}
                placeholder={combo ? "Ej: KIT-LIMPIEZA-01" : "Ej: CREMA-50"}
                className={`${fieldClass} w-full`}
              />
              {skuOcupado && (
                <p id="sku-ocupado" role="alert" className="mt-1 text-xs text-destructive">
                  {skuOcupado}
                </p>
              )}
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

          {!combo && (
            <Seccion icono={ProductoIcon} titulo="Variantes">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={conVariantes} onChange={(e) => setConVariantes(e.target.checked)} className="h-4 w-4" />
                Tiene variantes (colores, tallas u otras opciones; cada una lleva su propio stock)
              </label>
              {conVariantes && (
                <>
                  <CamposVariantes codigoBase={codigo} nombreBase={nombre} alCambiar={setArmadas} />
                  <input type="hidden" name="variantes" value={armadas.variantes.length ? JSON.stringify(armadas) : ""} />
                </>
              )}
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
