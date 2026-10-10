"use client";

import { useRef, useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, CatalogoIcon, ProductoIcon } from "@/lib/nav-icons";
import { svgCodigoBarras } from "@/lib/wms/codigo-barras";
import { crearProducto, reservarCodigoBarrasInterno, revisarSku, sugerirSkuLibre } from "./actions";
import { imprimirEtiqueta } from "./codigo-barras-producto";
import { ComboBuilder } from "./combo-builder";
import type { OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { CamposVariantes, type VariantesArmadas } from "./variantes-producto";

/**
 * «Agregar» de Producto: la ficha para crear un producto. El estado (Activo o Test) dice si ya se compra o se está probando;
 * el tipo (Simple o Compuesto) decide si aparece el bloque de componentes (con el mapa de cómo se arma). Los dos se eligen con
 * botones de opción, como la vía de envío de una compra. El SKU se sugiere solo mientras se escribe el nombre. El SKU es obligatorio: con él una venta de Dropi
 * o de una tienda de Shopify encuentra el producto para descontar el inventario.
 */
export function CrearProductoPanel({ opcionesSimples }: { opcionesSimples: OpcionSkuMaestro[] }) {
  const [tipo, setTipo] = useState("simple");
  const combo = tipo === "combo";
  // El código de barras (decisión de Hernán, 8 oct 2026): lo normal es que el producto venga sin código, así que viene marcado
  // «Interno» (también en un compuesto); si trae el del fabricante, se elige y se escribe.
  const [origenBarras, setOrigenBarras] = useState<"interno" | "fabricante" | "ninguno" | null>(null);
  const barras = origenBarras ?? "interno";
  // El código interno que tendrá: se separa al elegir «Interno» para verlo (número y etiqueta) antes de crear.
  const [interno, setInterno] = useState<string | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  async function pedirInterno() {
    if (interno || pidiendo) return;
    setPidiendo(true);
    const r = await reservarCodigoBarrasInterno().catch(() => ({ codigo: undefined }));
    setPidiendo(false);
    if (r.codigo) setInterno(r.codigo);
  }
  const svgInterno = interno ? svgCodigoBarras(interno, { modulo: 2, alto: 56 }) : null;
  // El nombre y el SKU se siguen para sugerir los de las variantes.
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  // Si el SKU escrito ya lo tiene otro producto (se revisa al salir del campo; el servidor lo vuelve a revisar al crear).
  const [skuOcupado, setSkuOcupado] = useState<string | null>(null);
  // Si la persona escribió el SKU a mano: entonces el sistema ya no lo cambia por su sugerencia.
  const [skuTocado, setSkuTocado] = useState(false);
  async function sugerir(desde: string) {
    if (!desde.trim()) return;
    const { codigo: sugerido } = await sugerirSkuLibre(desde);
    if (sugerido) {
      setCodigo(sugerido);
      setSkuOcupado(null);
    }
  }
  // Mientras se escribe el nombre, el SKU se sugiere solo (si no se escribió a mano), un momento después de dejar de teclear.
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  function alEscribirNombre(valor: string) {
    setNombre(valor);
    if (skuTocado) return;
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => void sugerir(valor), 450);
  }
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
        setSkuTocado(false);
        setConVariantes(false);
        setOrigenBarras(null);
        // El interno se separa al abrir (y se conserva hasta crear el producto: abrir y cerrar no gasta otro número).
        void pedirInterno();
      }}
      alGuardar={() => setInterno(null)}
      puedeExtra={!sinComponentes}
      alPulsarSinCompletar={() => document.getElementById("campo-componentes")?.scrollIntoView({ block: "center" })}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={CatalogoIcon} titulo="Producto">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Opciones
                titulo="Estado"
                nombre="clase"
                inicial="fisico"
                opciones={[
                  { valor: "fisico", etiqueta: "Activo", detalle: "se compra" },
                  { valor: "test", etiqueta: "Test", detalle: "se está probando" },
                ]}
              />
              <Opciones
                titulo="Tipo"
                nombre="tipo"
                valor={tipo}
                alCambiar={setTipo}
                opciones={[
                  { valor: "simple", etiqueta: "Simple", detalle: "un solo producto" },
                  { valor: "combo", etiqueta: "Compuesto", detalle: "lleva otros productos" },
                ]}
              />
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
                onChange={(e) => alEscribirNombre(e.target.value)}
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
                  setSkuTocado(true);
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
              {nombre.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    setSkuTocado(false);
                    void sugerir(nombre);
                  }}
                  className="mt-1 rounded text-xs font-medium text-primario hover:underline"
                >
                  Sugerir SKU con el nombre
                </button>
              )}
            </Campo>
            <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1 text-xs font-medium text-muted-foreground">Código de barras</legend>
              {(
                [
                  { valor: "interno", etiqueta: "Interno (lo genera el sistema)" },
                  { valor: "fabricante", etiqueta: "Del fabricante" },
                  { valor: "ninguno", etiqueta: "Sin código de barras" },
                ] as const
              ).map((o) => (
                <label key={o.valor} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="barras_origen" value={o.valor} checked={barras === o.valor} onChange={() => {
                      setOrigenBarras(o.valor);
                      if (o.valor === "interno") void pedirInterno();
                    }} className="h-4 w-4 accent-[var(--foreground)]" />
                  {o.etiqueta}
                </label>
              ))}
            </fieldset>
            {barras === "interno" && (
              <div className="flex flex-col gap-2">
                <input type="hidden" name="codigo_barras_interno" value={interno ?? ""} />
                {svgInterno ? (
                  <>
                    <p className="m-0 text-sm">
                      Código: <span className="font-mono font-medium tracking-wide">{interno}</span>
                    </p>
                    {/* El SVG lo arma `svgCodigoBarras` solo con los números del código interno: no lleva texto de ninguna persona. */}
                    <div className="w-fit max-w-full overflow-x-auto rounded-md border border-border bg-white p-2" dangerouslySetInnerHTML={{ __html: svgInterno }} />
                    <button
                      type="button"
                      onClick={() => imprimirEtiqueta(svgInterno, nombre || "Producto nuevo", codigo || "—")}
                      className="w-fit rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
                    >
                      Imprimir etiqueta
                    </button>
                  </>
                ) : (
                  <p className="m-0 text-xs text-muted-foreground">{pidiendo ? "Generando el código…" : "El código se genera al crear el producto."}</p>
                )}
              </div>
            )}
            {barras === "fabricante" && (
              <Campo etiqueta="Código de barras del fabricante" id="campo-barras-producto" obligatorio faltante={faltante}>
                <input
                  id="campo-barras-producto"
                  type="text"
                  name="codigo_barras"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={20}
                  aria-invalid={invalido("campo-barras-producto")}
                  placeholder="Ej: 4006381333931"
                  className={`${fieldClass} w-full`}
                />
              </Campo>
            )}
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
                  <ComboBuilder opciones={opcionesSimples} nombreProducto={nombre} />
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

/** Un grupo de botones de opción (Estado, Tipo), como la vía de envío de una compra: cada opción con su nombre y su detalle. */
function Opciones({
  titulo,
  nombre,
  opciones,
  inicial,
  valor,
  alCambiar,
}: {
  titulo: string;
  nombre: string;
  opciones: { valor: string; etiqueta: string; detalle: string }[];
  inicial?: string;
  valor?: string;
  alCambiar?: (v: string) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
      <legend className="mb-1.5 text-xs font-medium text-muted-foreground">
        {titulo}
        <span aria-hidden="true" className="text-destructive">
          {" "}
          *
        </span>
      </legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {opciones.map((o) => (
          <label key={o.valor} className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="radio"
              name={nombre}
              value={o.valor}
              required
              {...(alCambiar ? { checked: valor === o.valor, onChange: () => alCambiar(o.valor) } : { defaultChecked: inicial === o.valor })}
              className="h-4 w-4 accent-[var(--foreground)]"
            />
            <span>
              {o.etiqueta} <span className="text-xs text-muted-foreground">({o.detalle})</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
