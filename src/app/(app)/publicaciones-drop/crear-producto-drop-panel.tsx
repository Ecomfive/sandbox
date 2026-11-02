"use client";

import { useMemo, useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { EnlaceIcon, MargenIcon, NotificacionesIcon, ProductoIcon } from "@/lib/nav-icons";
import { descripcionPorDefecto, MAX_IMAGENES, MIN_IMAGENES, sugerirProductos, textoParaDrop, type BaseDeDrop } from "@/lib/publicaciones-drop/crear";
import { crearProductoDrop } from "./actions";

/**
 * «Crear producto» de Gestión de IDs Drop (el botón negro de Drop; se crea una publicación en Drop; 3 nov 2026, según Nicole; ver DROP-REFERENCIA.md). Pide lo mismo que Drop, que es poco: el nombre
 * (que también es el SKU y no se puede cambiar después), la descripción corta (se propone el mismo nombre), la categoría, el precio de venta y de 1 a 5 imágenes; opcionales, el enlace de los
 * creativos y el aviso por correo de poco stock. **No** pide precio sugerido, peso ni medidas, público o privado, simple o variable, nombre para la guía, videos ni garantías. El stock nace en
 * cero: se pide después con «Gestionar inventario».
 *
 * **Se vincula con nuestro producto** (pedido de Hernán): se elige uno de los productos que ya tenemos o el sistema lo vincula solo cuando lo escrito es igual al nombre o al SKU de uno. Al vincularlo,
 * lo que se escribe en Drop sale de nuestro producto, procurando que el SKU de Drop sea el mismo que el nuestro (o su nombre, si se prefiere). Si queda distinto, quedan los dos SKU, conectados.
 * Todavía el sistema no escribe en Drop: al crear, valida y lo dice.
 */
export function CrearProductoDropPanel({ opcionesSku }: { opcionesSku: OpcionSkuMaestro[] }) {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [descripcionEditada, setDescripcionEditada] = useState(false);
  const [imagenes, setImagenes] = useState(0);
  const [productoId, setProductoId] = useState<string | null>(null);
  // Si se quitó el vínculo a mano, el sistema no lo vuelve a poner solo.
  const [desvinculado, setDesvinculado] = useState(false);
  const [base, setBase] = useState<BaseDeDrop>("sku");
  const producto = useMemo(() => opcionesSku.find((o) => o.id === productoId) ?? null, [opcionesSku, productoId]);
  const parecidos = useMemo(() => (producto ? [] : sugerirProductos(nombre, opcionesSku).parecidos), [producto, nombre, opcionesSku]);

  const reiniciar = () => {
    setNombre("");
    setDescripcion("");
    setDescripcionEditada(false);
    setImagenes(0);
    setProductoId(null);
    setDesvinculado(false);
    setBase("sku");
  };
  const escribirNombre = (texto: string) => {
    setNombre(texto);
    if (!descripcionEditada) setDescripcion(descripcionPorDefecto(texto));
  };
  /** Vincula con un producto nuestro: en Drop se escribe lo suyo (su SKU, o su nombre). */
  const vincular = (p: OpcionSkuMaestro | null, deBase: BaseDeDrop = base) => {
    setProductoId(p?.id ?? null);
    setDesvinculado(!p);
    if (p) escribirNombre(textoParaDrop(p, deBase));
  };
  const elegirBase = (b: BaseDeDrop) => {
    setBase(b);
    if (producto) escribirNombre(textoParaDrop(producto, b));
  };
  const alEscribirNombre = (texto: string) => {
    escribirNombre(texto);
    // El sistema lo vincula solo cuando lo escrito es igual al nombre o al SKU de uno de nuestros productos.
    if (!productoId && !desvinculado) {
      const { exacto } = sugerirProductos(texto, opcionesSku);
      if (exacto) setProductoId(exacto.id);
    }
  };
  const iguales = !!producto && nombre.trim() === producto.codigo.trim();

  return (
    <ProveedorSkusMaestros opciones={opcionesSku}>
      <FichaCrear titulo="Crear producto" etiquetaBoton="Crear producto" etiquetaCrear="Guardar producto" action={crearProductoDrop} mensajeExito="Producto creado en Drop" alAbrir={reiniciar} puedeExtra={imagenes <= MAX_IMAGENES}>
        {({ faltante, invalido }) => (
          <>
            <Seccion icono={EnlaceIcon} titulo="Nuestro producto">
              <input type="hidden" name="sku_maestro_id" value={productoId ?? ""} />
              <Campo etiqueta="Producto de nuestro sistema" id="campo-producto-nuestro">
                <CampoSkuMaestro valor={productoId} alCambiar={(p) => vincular(p)} etiquetaAria="Producto de nuestro sistema" placeholder="Código o nombre de nuestro producto" claseContenedor="w-full" />
              </Campo>
              {producto ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-0 p-0">
                    <legend className="mb-1 p-0 text-xs text-muted-foreground">En Drop se escribe</legend>
                    {(["sku", "nombre"] as const).map((b) => (
                      <label key={b} className="flex items-center gap-1.5">
                        <input type="radio" name="base_drop" value={b} checked={base === b} onChange={() => elegirBase(b)} />
                        {b === "sku" ? "El SKU de nuestro producto" : "El nombre de nuestro producto"}
                      </label>
                    ))}
                  </fieldset>
                  <p className="m-0 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                    SKU nuestro: <b className="font-semibold text-foreground">{producto.codigo}</b> · SKU en Drop: <b className="font-semibold text-foreground">{nombre.trim() || "—"}</b>
                    {iguales ? " · iguales" : nombre.trim() ? " · distintos: quedan los dos, vinculados" : ""}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {parecidos.length > 0 && (
                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="text-xs text-muted-foreground">¿Es alguno de nuestros productos?</span>
                      {parecidos.map((p) => (
                        <button key={p.id} type="button" onClick={() => vincular(p)} className={`flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-muted ${anilloFoco}`}>
                          <span className="min-w-0 [overflow-wrap:anywhere]">
                            <span className="font-medium">{p.codigo}</span> <span className="text-muted-foreground">{p.nombre}</span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-primario">Vincular</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="m-0 text-xs text-muted-foreground">Sin vincular: podrás vincularlo después con «Vincular» en la lista.</p>
                </div>
              )}
            </Seccion>

            <Seccion icono={ProductoIcon} titulo="Producto en Drop">
              <Campo etiqueta="Nombre (también es el SKU)" id="campo-nombre" obligatorio faltante={faltante}>
                <input
                  id="campo-nombre"
                  name="nombre"
                  required
                  data-enfocar
                  aria-invalid={invalido("campo-nombre")}
                  value={nombre}
                  onChange={(e) => alEscribirNombre(e.target.value)}
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
    </ProveedorSkusMaestros>
  );
}
