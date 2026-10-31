"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { ContadorPestana } from "@/components/migas/contador-pestana";
import type { AccesoCrm } from "@/lib/crm/areas";
import { AlertaIcon, CalendarioIcon, ChatIcon, DropshipperIcon, EnlaceIcon, EstadoIcon, PersonaIcon, VentasIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { BurbujaWhatsapp } from "./burbuja-whatsapp";
import { CrearDropshipperPanel } from "./crear-dropshipper-panel";
import { DEF_DROPSHIPPERS, type FilaCaso, type FilaDropshipper } from "./def-crm";
import { EncabezadoFilasCrm, FilaDropshipperLista } from "./fila-dropshipper";
import { FichaDropshipper } from "./ficha-dropshipper";
import { TableroCrm } from "./tablero-crm";

const NOMBRE: NombreFilas = { singular: "dropshipper", plural: "dropshippers" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  fase: PersonaIcon,
  plataforma: EnlaceIcon,
  etapa: EstadoIcon,
  nivel: EstadoIcon,
  venta: DropshipperIcon,
  origen: DropshipperIcon,
  ciudad: DropshipperIcon,
  whatsapp: ChatIcon,
  casos: AlertaIcon,
  actividad: CalendarioIcon,
  cuenta: EnlaceIcon,
  pedidos: VentasIcon,
  ventas: VentasIcon,
  ultimoPedido: CalendarioIcon,
  ingreso: CalendarioIcon,
};

/**
 * La lista del CRM (26 oct 2026, rediseño al estilo de Gestión de IDs Dropi): el tablero de lo que hay que atender arriba y, debajo,
 * los dropshippers con la barra de herramientas común (buscar, filtrar, agrupar, descargar) y «Agregar». Toda la fila abre la ficha,
 * con flechas para pasar al anterior y al siguiente; la ficha abierta queda en la dirección (`?abrir=`).
 */
export function ListaDropshippers({
  dropshippers,
  casos,
  paisId,
  codigoPais,
  hoy,
  acceso,
  abrirInicial = null,
  sinResponder,
}: {
  dropshippers: FilaDropshipper[];
  casos: FilaCaso[];
  paisId: string;
  codigoPais: string;
  hoy: string;
  acceso: AccesoCrm;
  abrirInicial?: string | null;
  /** Conversaciones de WhatsApp sin responder (también las de quien no está en el CRM), para la burbuja de la bandeja. */
  sinResponder: number;
}) {
  const [abierto, setAbierto] = useState<string | null>(() => (abrirInicial && dropshippers.some((d) => d.id === abrirInicial) ? abrirInicial : null));
  useEffect(() => {
    const url = new URL(window.location.href);
    if (abierto) url.searchParams.set("abrir", abierto);
    else url.searchParams.delete("abrir");
    url.searchParams.delete("buscar");
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  }, [abierto]);
  const [orden, setOrden] = useState<string[]>([]);
  const i = abierto ? orden.indexOf(abierto) : -1;
  // La ficha se dibuja en `<body>` (portal): con `?abrir=` arranca abierta, así que solo se monta ya en el navegador.
  const enNavegador = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <>
      <ContadorPestana href="/crm-dropshippers/bandeja" cantidad={sinResponder} />
      <BurbujaWhatsapp sinResponder={sinResponder} />
      <TableroCrm dropshippers={dropshippers} casos={casos} />
      <ListaDatos
        def={DEF_DROPSHIPPERS}
        filas={dropshippers}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(d) => d.id}
        variante="filas"
        encabezado={<EncabezadoFilasCrm />}
        renderFila={(d, enOrden) => (
          <FilaDropshipperLista
            d={d}
            codigoPais={codigoPais}
            hoy={hoy}
            alAbrir={() => {
              setOrden(enOrden.map((x) => x.id));
              setAbierto(d.id);
            }}
          />
        )}
        accionPrincipal={acceso.escribeAtencion ? <CrearDropshipperPanel paisId={paisId} conFase={acceso.escribeComercial} /> : undefined}
        vacio="Todavía no hay dropshippers. Usa «Agregar» para registrar el primero."
      />
      <FichaDropshipper
        dropshipper={enNavegador ? dropshippers.find((d) => d.id === abierto) : undefined}
        casos={casos}
        codigoPais={codigoPais}
        hoy={hoy}
        acceso={acceso}
        anterior={i > 0 ? () => setAbierto(orden[i - 1]) : undefined}
        siguiente={i >= 0 && i < orden.length - 1 ? () => setAbierto(orden[i + 1]) : undefined}
        alCerrar={() => setAbierto(null)}
      />
    </>
  );
}
