"use client";

import { useEffect, useState } from "react";
import { Pastilla } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { CopiarIcon, FlechaAbajoIcon, FlechaArribaIcon } from "@/lib/nav-icons";
import type { OrdenTienda } from "@/lib/tienda/orden-detalle";
import { estadoDeOrden, subtituloOrden } from "./[id]/detalle-finanzas";
import { FichaOrdenTienda } from "./[id]/ficha-orden";
import { obtenerPedidoTienda } from "./ficha-actions";

function BotonCabecera({ texto, icono: Icono, activo = true, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo?: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${activo ? "hover:bg-muted" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

/**
 * La ficha de un pedido a un lado de la lista (12 nov 2026, como en Mi Reto Digital): se abre al tocar cualquier parte de la fila, sin salir de Pedidos.
 * Las flechas (o Alt + ↑ / ↓) pasan al pedido de arriba o de abajo en el orden en que se ve la lista; «Copiar enlace» copia la dirección que la abre.
 */
export function FichaPedido({ id, orden: ordenLista, alCerrar, alIr }: { id: string | null; orden: string[]; alCerrar: () => void; alIr: (id: string) => void }) {
  const { mostrarToast } = useToast();
  const [datos, setDatos] = useState<{ id: string; orden: OrdenTienda; codigoPais: string; puedeEscribir: boolean } | { id: string; error: string } | null>(null);
  const indice = id ? ordenLista.indexOf(id) : -1;
  const anterior = indice > 0 ? ordenLista[indice - 1] : null;
  const siguiente = indice >= 0 && indice < ordenLista.length - 1 ? ordenLista[indice + 1] : null;

  useEffect(() => {
    if (!id) return;
    let vigente = true;
    obtenerPedidoTienda(id)
      .then((r) => vigente && setDatos("error" in r ? { id, error: r.error } : { id, ...r }))
      .catch(() => vigente && setDatos({ id, error: "No se pudo cargar el pedido." }));
    return () => {
      vigente = false;
    };
  }, [id]);

  // Alt + ↑ / ↓: el pedido de arriba o de abajo.
  useEffect(() => {
    if (!id) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
      const destino = e.key === "ArrowUp" ? anterior : siguiente;
      if (!destino) return;
      e.preventDefault();
      alIr(destino);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [id, anterior, siguiente, alIr]);

  const actual = datos && datos.id === id ? datos : null;
  const orden = actual && "orden" in actual ? actual.orden : null;
  const estado = orden ? estadoDeOrden(orden.o) : null;

  async function copiarEnlace() {
    if (!id) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tienda-pedidos?pedido=${id}`);
      mostrarToast("Enlace al pedido copiado");
    } catch {
      mostrarToast("No se pudo copiar el enlace", "destructive");
    }
  }

  return (
    <Ventana
      abierto={!!id}
      alCerrar={alCerrar}
      lado="derecha"
      ancho="xl"
      titulo={
        <span className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold">{orden?.o.numero ?? "Pedido"}</span>
            {estado && <Pastilla tono={estado.tono}>{estado.etiqueta}</Pastilla>}
          </span>
          {orden && <span className="text-xs font-normal text-muted-foreground">{subtituloOrden(orden.o, orden.tienda)}</span>}
        </span>
      }
      navegacion={
        <>
          <BotonCabecera texto="Copiar el enlace al pedido" icono={CopiarIcon} alHacerClic={copiarEnlace} />
          <BotonCabecera texto={anterior ? "El de arriba (Alt + ↑)" : "Este es el primero de la lista"} icono={FlechaArribaIcon} activo={!!anterior} alHacerClic={() => anterior && alIr(anterior)} />
          <BotonCabecera texto={siguiente ? "El de abajo (Alt + ↓)" : "Este es el último de la lista"} icono={FlechaAbajoIcon} activo={!!siguiente} alHacerClic={() => siguiente && alIr(siguiente)} />
        </>
      }
    >
      {!actual ? (
        <p className="m-0 p-5 text-sm text-muted-foreground">Cargando el pedido…</p>
      ) : "error" in actual ? (
        <p role="alert" className="m-0 p-5 text-sm text-destructive">
          {actual.error}
        </p>
      ) : (
        <FichaOrdenTienda key={actual.id} orden={actual.orden} codigoPais={actual.codigoPais} puedeEscribir={actual.puedeEscribir} />
      )}
    </Ventana>
  );
}
