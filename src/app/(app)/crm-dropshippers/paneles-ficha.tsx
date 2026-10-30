"use client";

import { useState, type ComponentType } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { AlertaIcon, DropshipperIcon, EtiquetaIcon, PersonaIcon, SugerenciaIcon } from "@/lib/nav-icons";
import { recomendarProducto } from "../sugerencias-clientes/actions";
import { FichaSugerencia } from "../sugerencias-clientes/ficha-sugerencia";
import { CampoTiendas } from "./campo-tiendas";
import { crearCaso, editarDropshipper } from "./actions";
import { CANALES, ESTADOS, NIVELES, PRIORIDADES, TIPOS_CASO, nombrePais, type FilaDropshipper } from "./def-crm";


/** Los datos mínimos de un dropshipper para elegirlo en una lista. */
export interface OpcionDropshipper {
  id: string;
  nombre: string;
  paises: string[];
}

/** Un botón de la fila de acciones de la ficha: ícono arriba y texto abajo. */
function BotonAccion({ texto, icono: Icono, alHacerClic }: { texto: string; icono: ComponentType<{ className?: string }>; alHacerClic: () => void }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={alHacerClic}
      className={`flex flex-col items-center gap-0.5 rounded-lg bg-accent px-1 py-2 text-[11.5px] font-medium hover:bg-accent-hover ${anilloFoco}`}
    >
      <Icono className="h-4 w-4" />
      {texto}
    </button>
  );
}

/** El país donde se registra algo: si el dropshipper vende en uno solo no hay nada que elegir. */
function CampoPais({ id, paises, inicial }: { id: string; paises: string[]; inicial: string }) {
  if (paises.length <= 1) return <input type="hidden" name="pais" value={paises[0] ?? inicial} />;
  return (
    <Campo etiqueta="País" id={id}>
      <select id={id} name="pais" defaultValue={paises.includes(inicial) ? inicial : paises[0]} className={`${fieldClass} w-full`}>
        {paises.map((c) => (
          <option key={c} value={c}>
            {nombrePais(c)}
          </option>
        ))}
      </select>
    </Campo>
  );
}

function Opciones({ lista }: { lista: readonly { valor: string; etiqueta: string }[] }) {
  return (
    <>
      {lista.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </>
  );
}

/**
 * Abrir un caso de soporte. Con `d` es el de ese dropshipper (botón de su ficha); sin `d`, el «Agregar caso» de la
 * tabla de casos, donde primero se elige a quién.
 */
export function PanelCaso({ d, dropshippers, codigoPais, alGuardar }: { d?: FilaDropshipper; dropshippers?: OpcionDropshipper[]; codigoPais: string; alGuardar?: () => void }) {
  const [elegido, setElegido] = useState("");
  const opciones = dropshippers ?? [];
  const paises = d ? d.paises : (opciones.find((o) => o.id === elegido)?.paises ?? []);
  return (
    <FichaCrear
      alGuardar={alGuardar}
      titulo="Nuevo caso"
      etiquetaBoton="Agregar caso"
      etiquetaCrear="Abrir caso"
      action={crearCaso}
      mensajeExito="Caso abierto"
      ocultos={d ? { dropshipper_id: d.id } : undefined}
      alAbrir={() => setElegido("")}
      boton={d ? (abrir) => <BotonAccion texto="Nuevo caso" icono={AlertaIcon} alHacerClic={abrir} /> : undefined}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={AlertaIcon} titulo="Caso">
            {!d && (
              <Campo etiqueta="Dropshipper" id="campo-ds-caso" obligatorio faltante={faltante}>
                <select
                  id="campo-ds-caso"
                  name="dropshipper_id"
                  required
                  data-enfocar
                  aria-invalid={invalido("campo-ds-caso")}
                  value={elegido}
                  onChange={(e) => setElegido(e.target.value)}
                  className={`${fieldClass} w-full`}
                >
                  <option value="">Selecciona un dropshipper</option>
                  {opciones.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo etiqueta="Título" id="campo-titulo-caso" obligatorio faltante={faltante}>
              <input
                id="campo-titulo-caso"
                type="text"
                name="titulo"
                required
                maxLength={200}
                autoComplete="off"
                data-enfocar={d ? true : undefined}
                aria-invalid={invalido("campo-titulo-caso")}
                placeholder="Ej: El pedido llegó incompleto"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Tipo" id="campo-tipo-caso">
                <select id="campo-tipo-caso" name="tipo" defaultValue="problema" className={`${fieldClass} w-full`}>
                  <Opciones lista={TIPOS_CASO} />
                </select>
              </Campo>
              <Campo etiqueta="Prioridad" id="campo-prioridad-caso">
                <select id="campo-prioridad-caso" name="prioridad" defaultValue="normal" className={`${fieldClass} w-full`}>
                  <Opciones lista={PRIORIDADES} />
                </select>
              </Campo>
              <Campo etiqueta="Canal" id="campo-canal-caso">
                <select id="campo-canal-caso" name="canal" defaultValue="whatsapp" className={`${fieldClass} w-full`}>
                  <Opciones lista={CANALES} />
                </select>
              </Campo>
              <Campo etiqueta="N.º de pedido" id="campo-pedido-caso">
                <input id="campo-pedido-caso" type="text" name="numero_pedido" autoComplete="off" placeholder="Ej: 48213" className={`${fieldClass} w-full`} />
              </Campo>
            </div>
            <CampoPais id="campo-pais-caso" paises={paises.length ? paises : [codigoPais]} inicial={codigoPais} />
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}

/**
 * «Recomendar»: el cliente nos recomienda un producto y Atención lo registra aquí. Llega a Testing Lab › Sugerencias de
 * clientes con su código SUG- sin que quien lo carga necesite ese módulo.
 */
export function PanelRecomendar({ d, alGuardar }: { d: FilaDropshipper; alGuardar?: () => void }) {
  return (
    <FichaSugerencia
      action={recomendarProducto}
      ocultos={{ dropshipper_id: d.id }}
      alGuardar={alGuardar}
      boton={(abrir) => <BotonAccion texto="Recomendar" icono={SugerenciaIcon} alHacerClic={abrir} />}
    />
  );
}

/** Editar los datos de un dropshipper. La ficha lleva `key` con su id, así que al cambiar de uno arranca con sus datos. */
export function PanelEditar({ d, alGuardar }: { d: FilaDropshipper; alGuardar?: () => void }) {
  return (
    <FichaCrear
      alGuardar={alGuardar}
      titulo={`Editar ${d.nombre}`}
      etiquetaCrear="Guardar cambios"
      action={editarDropshipper}
      mensajeExito="Cambios guardados"
      ocultos={{ id: d.id }}
      boton={(abrir) => <BotonAccion texto="Editar" icono={PersonaIcon} alHacerClic={abrir} />}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={DropshipperIcon} titulo="Dropshipper">
            <Campo etiqueta="Nombre" id="campo-nombre-editar" obligatorio faltante={faltante}>
              <input
                id="campo-nombre-editar"
                type="text"
                name="nombre"
                required
                data-enfocar
                autoComplete="off"
                aria-invalid={invalido("campo-nombre-editar")}
                defaultValue={d.nombre}
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Estado" id="campo-estado-editar">
                <select id="campo-estado-editar" name="estado" defaultValue={d.estado} className={`${fieldClass} w-full`}>
                  <Opciones lista={ESTADOS} />
                </select>
              </Campo>
              <Campo etiqueta="Tipo de cliente" id="campo-nivel-editar">
                <select id="campo-nivel-editar" name="nivel" defaultValue={d.nivel} className={`${fieldClass} w-full`}>
                  <Opciones lista={NIVELES} />
                </select>
              </Campo>
              <CampoTiendas id="campo-tienda-editar" inicial={d.tiendas} />
              <Campo etiqueta="Ciudad" id="campo-ciudad-editar">
                <input id="campo-ciudad-editar" type="text" name="ciudad" autoComplete="off" defaultValue={d.ciudad ?? ""} className={`${fieldClass} w-full`} />
              </Campo>
            </div>
          </Seccion>

          <Seccion icono={PersonaIcon} titulo="Contacto">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Correo" id="campo-correo-editar">
                <input id="campo-correo-editar" type="email" name="contacto_email" autoComplete="off" defaultValue={d.email ?? ""} className={`${fieldClass} w-full`} />
              </Campo>
              <Campo etiqueta="WhatsApp" id="campo-telefono-editar">
                <input
                  id="campo-telefono-editar"
                  type="text"
                  name="contacto_telefono"
                  autoComplete="off"
                  defaultValue=""
                  placeholder={d.tieneTelefono ? "Déjalo vacío para no cambiarlo" : "Ej: +57 300 111 2233"}
                  className={`${fieldClass} w-full`}
                />
              </Campo>
            </div>
          </Seccion>

          <Seccion icono={EtiquetaIcon} titulo="Detalle">
            <Campo etiqueta="Productos (separados por coma)" id="campo-productos-editar">
              <input id="campo-productos-editar" type="text" name="productos" autoComplete="off" defaultValue={d.productos.join(", ")} className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Notas" id="campo-notas-editar">
              <textarea id="campo-notas-editar" name="notas" rows={4} defaultValue={d.notas ?? ""} className={`${fieldClass} w-full resize-y`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
