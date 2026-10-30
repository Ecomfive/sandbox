"use client";

import { useState, type ComponentType } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { AlertaIcon, SugerenciaIcon } from "@/lib/nav-icons";
import { recomendarProducto } from "../sugerencias-clientes/actions";
import { FichaSugerencia } from "../sugerencias-clientes/ficha-sugerencia";
import { crearCaso } from "./actions";
import { ItemFila } from "./botones-ficha";
import { CANALES, PRIORIDADES, TIPOS_CASO, nombrePais, type FilaDropshipper } from "./def-crm";


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
      enSitio
      boton={
        d
          ? (abrir) => (
              <ItemFila id="caso">
                <BotonAccion texto="Nuevo caso" icono={AlertaIcon} alHacerClic={abrir} />
              </ItemFila>
            )
          : undefined
      }
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
      enSitio
      boton={(abrir) => (
        <ItemFila id="recomendar">
          <BotonAccion texto="Recomendar" icono={SugerenciaIcon} alHacerClic={abrir} />
        </ItemFila>
      )}
    />
  );
}
