"use client";

import { useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { InventarioIcon, MargenIcon, ProductoIcon } from "@/lib/nav-icons";
import { ESTADOS, TIPOS, UBICACIONES } from "@/lib/publicaciones/publicacion";
import { crearPublicacion } from "./actions";
import type { Persona } from "./ficha-publicacion";
import { SelectorResponsables } from "./selector-responsables";

/** Los responsables al crear (sin elegir a nadie, queda quien la crea). */
function ResponsablesNuevos({ personas }: { personas: Persona[] }) {
  const [valor, setValor] = useState<string[]>([]);
  return <SelectorResponsables valor={valor} cambiar={setValor} personas={personas} nombre="responsables" vacio="Yo" />;
}

/** «Agregar»: un producto recién publicado en Dropi. Arranca como «Producto nuevo», publicado hoy y a cargo de quien lo crea. */
export function CrearPublicacionPanel({ paisId, personas }: { paisId: string; personas: Persona[] }) {
  return (
    <FichaCrear titulo="Nueva publicación en Dropi" etiquetaCrear="Crear publicación" action={crearPublicacion} mensajeExito="Publicación creada" ocultos={{ pais_id: paisId, estado: ESTADOS[0].valor }}>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={ProductoIcon} titulo="Producto">
            <Campo etiqueta="Nombre" id="pub-nombre" obligatorio faltante={faltante}>
              <input id="pub-nombre" name="nombre" required data-enfocar autoComplete="off" maxLength={300} aria-invalid={invalido("pub-nombre")} placeholder="Ej: Crema Elimina Verrugas 20 g" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="ID en Dropi" id="pub-dropi">
              <input id="pub-dropi" name="dropi_id" autoComplete="off" maxLength={60} placeholder="Ej: 11144" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Tipo" id="pub-tipo">
              <select id="pub-tipo" name="tipo_publicacion" defaultValue="publico" className={`${fieldClass} w-full`}>
                {TIPOS.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>
          <Seccion icono={MargenIcon} titulo="Precio">
            <Campo etiqueta="Precio de venta" id="pub-precio">
              <input id="pub-precio" name="precio_venta" type="number" min={0} step="0.01" placeholder="Ej: 9.99" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Costo mercancía" id="pub-costo">
              <input id="pub-costo" name="costo_mercancia" type="number" min={0} step="0.01" placeholder="Ej: 1.16" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Fulfillment" id="pub-fulfillment">
              <input id="pub-fulfillment" name="fulfillment" type="number" min={0} step="0.01" placeholder="Ej: 1.50" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
          </Seccion>
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
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>Responsables</span>
              <ResponsablesNuevos personas={personas} />
            </div>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
