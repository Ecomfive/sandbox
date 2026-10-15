"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { CampoFoto } from "@/components/ui/campo-foto";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { paisesDelMundo } from "@/lib/paises-mundo";
import { DropshipperIcon, SugerenciaIcon } from "@/lib/nav-icons";
import { prepararSubidaFotoSugerencia } from "./actions";

export interface ClienteCrm {
  id: string;
  /** «DS-0014 · David». */
  etiqueta: string;
}

/**
 * La ficha para registrar una sugerencia de cliente (`FichaCrear`). La usan dos puertas con la misma forma: «Recomendar
 * producto» en la ficha del dropshipper del CRM (el cliente ya viene en `ocultos`) y «Agregar» en Sugerencias de clientes
 * (con `clientes`, se elige a quién se le asigna por su código del CRM). La foto se sube antes de guardar.
 */
export function FichaSugerencia({
  action,
  boton,
  etiquetaBoton,
  ocultos,
  clientes,
  alGuardar,
}: {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  boton?: (abrir: () => void) => ReactNode;
  etiquetaBoton?: string;
  ocultos?: Record<string, string>;
  /** Con la lista, la ficha pide el cliente (desde el módulo); sin ella, el cliente ya viene en `ocultos` (desde el CRM). */
  clientes?: ClienteCrm[];
  alGuardar?: () => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const paises = useMemo(() => paisesDelMundo(), []);
  return (
    <FichaCrear
      titulo="Producto recomendado"
      etiquetaBoton={etiquetaBoton}
      etiquetaCrear="Guardar recomendación"
      action={action}
      mensajeExito="Recomendación guardada"
      ocultos={ocultos}
      boton={boton}
      puedeExtra={!subiendo}
      alGuardar={alGuardar}
    >
      {({ faltante, invalido }) => (
        <>
          {clientes && (
            <Seccion icono={DropshipperIcon} titulo="Cliente">
              <Campo etiqueta="Recomendado por" id="campo-cliente-sugerencia" obligatorio faltante={faltante}>
                <select id="campo-cliente-sugerencia" name="dropshipper_id" required defaultValue="" aria-invalid={invalido("campo-cliente-sugerencia")} className={`${fieldClass} w-full`}>
                  <option value="" disabled>
                    Elige el cliente por su código del CRM
                  </option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>
            </Seccion>
          )}
          <Seccion icono={SugerenciaIcon} titulo="Producto">
            <Campo etiqueta="Nombre" id="campo-nombre-sugerencia" obligatorio faltante={faltante}>
              <input
                id="campo-nombre-sugerencia"
                type="text"
                name="nombre"
                required
                data-enfocar
                maxLength={200}
                aria-invalid={invalido("campo-nombre-sugerencia")}
                placeholder="Ej: Masajeador cervical eléctrico"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <CampoFoto nombreCampo="foto_url" valorInicial={null} alCambiarSubiendo={setSubiendo} prepararSubida={prepararSubidaFotoSugerencia} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="País donde lo vio" id="campo-pais-sugerencia">
                <select id="campo-pais-sugerencia" name="pais_detectado" defaultValue="" className={`${fieldClass} w-full`}>
                  <option value="">Sin país</option>
                  {paises.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Categoría" id="campo-categoria-sugerencia">
                <input id="campo-categoria-sugerencia" type="text" name="categoria" maxLength={80} placeholder="Ej: Hogar" className={`${fieldClass} w-full`} />
              </Campo>
            </div>
            <Campo etiqueta="Notas" id="campo-notas-sugerencia">
              <textarea
                id="campo-notas-sugerencia"
                name="notas"
                rows={3}
                maxLength={4000}
                placeholder="Ej: Lo vio en un anuncio de TikTok con muchos comentarios; tiene proveedor en Dropi"
                className={`${fieldClass} w-full`}
              />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
