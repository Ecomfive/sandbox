"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { fieldClassSm } from "@/components/ui/field";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { conStockPrimero } from "@/lib/wms/total-stock";
import { formatearTiempoRelativo } from "@/lib/formato";
import { ETIQUETA_PLATAFORMA, lecturaVieja, type LecturasPlataformas, type Plataforma } from "@/lib/wms/stock-plataformas";
import { DEF_STOCK, DEF_STOCK_PLATAFORMAS, type FilaStock } from "./def-stock";
import { FichaStock } from "./ficha-stock";
import { EncabezadoFilasStock, FilaStockLista } from "./fila-stock";
import type { BodegaOpcion, UbicacionOpcion } from "./panel-movimiento";
import { TableroStock } from "./tablero-stock";

const NOMBRE: NombreFilas = { singular: "SKU", plural: "SKUs" };
const ICONOS: Record<string, IconoComp> = { sku: ProductoIcon, existencia: InventarioIcon, tipo: ProductoIcon, clase: ProductoIcon, fisico: InventarioIcon, plataformas: InventarioIcon, disponible: InventarioIcon, vencido: InventarioIcon, enCamino: InventarioIcon };

/** Elige de qué bodega se ve el stock (todas las del país, o una): se guarda en la dirección, `?bodega=`. */
function SelectorBodega({ bodegas, elegida }: { bodegas: { id: string; nombre: string; externa: boolean }[]; elegida: string }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <select
      aria-label="Bodega"
      value={elegida}
      onChange={(e) => router.replace(e.target.value ? `${pathname}?bodega=${e.target.value}` : pathname)}
      className={fieldClassSm}
    >
      <option value="">Todas las bodegas</option>
      {bodegas.map((b) => (
        <option key={b.id} value={b.id}>
          {b.nombre}
          {b.externa ? " (externa)" : ""}
        </option>
      ))}
    </select>
  );
}

/** Cuándo se leyó cada plataforma: una lectura vieja se avisa, porque lo que se ve es lo de ese momento. Dunamixfy todavía no se lee. */
function AvisoLecturas({ lecturas, fallaron, conDunamixfy }: { lecturas: LecturasPlataformas; fallaron: boolean; conDunamixfy: boolean }) {
  return (
    <p className="m-0 mt-3 text-xs text-muted-foreground">
      Plataformas, según su última lectura:{" "}
      {(["dropi", "effi", "drop"] as Plataforma[]).filter((p) => lecturas[p] !== null || conDunamixfy).map((p, i) => (
        <span key={p}>
          {i > 0 && " · "}
          <span className={lecturaVieja(lecturas[p]) ? "font-medium text-warning" : ""}>
            {ETIQUETA_PLATAFORMA[p]} {lecturas[p] ? formatearTiempoRelativo(lecturas[p]) : "sin lectura"}
          </span>
        </span>
      ))}
      {conDunamixfy && " · Dunamixfy sin conectar"}
      {fallaron && <span className="font-medium text-destructive"> · Una lectura no cargó: faltan unidades. Recarga la página.</span>}
    </p>
  );
}

/**
 * Inventario por SKU maestro: lo que hay en las bodegas del país (o en una), en cubetas. Empieza en cero y un saldo puede
 * quedar negativo (se ve en rojo) hasta que se registren las entradas o se conecten las fuentes. Arriba, el tablero con los
 * totales de lo que se está viendo. **La fila no tiene botones**: toda ella abre la ficha del SKU con su stock por bodega, sus
 * movimientos y los botones de entrada, salida y ajuste.
 */
export function ListaStock({
  filas,
  bodegas,
  bodegaElegida,
  bodegasPropias,
  ubicaciones,
  puedeEscribir,
  codigoPais,
  bodegasExternas,
  lecturas,
  lecturasFallaron,
  esAdmin,
}: {
  filas: FilaStock[];
  bodegas: { id: string; nombre: string; externa: boolean }[];
  bodegaElegida: string;
  bodegasPropias: BodegaOpcion[];
  ubicaciones: UbicacionOpcion[];
  puedeEscribir: boolean;
  /** El país de la barra de arriba: la ficha muestra las compras de ese país (el stock también es de ese país). */
  codigoPais: string;
  bodegasExternas: BodegaOpcion[];
  /** Cuándo se leyó cada plataforma; `null` en los países que no las muestran. */
  lecturas: LecturasPlataformas | null;
  lecturasFallaron: boolean;
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState<string | null>(null);
  const sku = abierto ? filas.find((f) => f.id === abierto) : undefined;
  const conPlataformas = lecturas !== null;
  const def = conPlataformas ? DEF_STOCK_PLATAFORMAS : DEF_STOCK;
  const enOrden = useMemo(() => conStockPrimero(filas, (f) => f.plataformas?.total ?? 0), [filas]);

  return (
    <>
      <ListaDatos
        def={def}
        filas={enOrden}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        variante="filas"
        encabezado={<EncabezadoFilasStock conPlataformas={conPlataformas} />}
        renderFila={(f) => <FilaStockLista f={f} conPlataformas={conPlataformas} alAbrir={() => setAbierto(f.id)} />}
        formatearTotal={(n) => `${n.toLocaleString("es-PA")} u.`}
        accionPrincipal={<SelectorBodega bodegas={bodegas} elegida={bodegaElegida} />}
        resumen={(visibles) => (
          <>
            <TableroStock filas={visibles} def={def} conPlataformas={conPlataformas} />
            {lecturas && <AvisoLecturas lecturas={lecturas} fallaron={lecturasFallaron} conDunamixfy={codigoPais === "CR"} />}
          </>
        )}
        vacio="Todavía no hay SKUs maestros."
      />
      <FichaStock
        sku={sku}
        bodegasPropias={bodegasPropias}
        ubicaciones={ubicaciones}
        puedeEscribir={puedeEscribir}
        codigoPais={codigoPais}
        bodegasExternas={bodegasExternas}
        conPlataformas={conPlataformas}
        esAdmin={esAdmin}
        alCerrar={() => setAbierto(null)}
        alCambiar={() => router.refresh()}
      />
    </>
  );
}
