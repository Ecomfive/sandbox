"use client";

import { useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { guardarPrefijoCompras } from "@/lib/paises-actions";
import { Bandera } from "@/components/paises/bandera";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CrearPaisPanel } from "@/components/paises/crear-pais-panel";
import { ConfiguracionIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";

export interface FilaPais {
  id: string;
  codigo: string;
  nombre: string;
  /** Prefijo de las órdenes de compra del país (null: todavía no tiene) y el último número usado. */
  prefijo: string | null;
  ultimo: number;
}

/**
 * El prefijo de las órdenes de compra de un país, editable en el lugar (se guarda al salir del campo), con el código que
 * tomará la próxima compra.
 */
function PrefijoCompras({ pais, puedeEscribir }: { pais: FilaPais; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [valor, setValor] = useState(pais.prefijo ?? "");
  const [pendiente, start] = useTransition();
  const proximo = pais.prefijo ? `${pais.prefijo}-${String(pais.ultimo + 1).padStart(4, "0")}` : null;

  function guardar() {
    const limpio = valor.trim().toUpperCase();
    if (limpio === (pais.prefijo ?? "") || !limpio) return setValor(pais.prefijo ?? "");
    start(async () => {
      const r = await guardarPrefijoCompras(pais.codigo, limpio);
      if (r.error) {
        mostrarToast(r.error, "destructive");
        setValor(pais.prefijo ?? "");
      } else mostrarToast(`Prefijo de ${pais.nombre}: ${limpio}`);
    });
  }

  if (!puedeEscribir) return <span className="tabular-nums">{pais.prefijo ? `${pais.prefijo} · próxima ${proximo}` : "—"}</span>;
  return (
    <span className="flex items-center gap-2">
      <input
        type="text"
        value={valor}
        maxLength={12}
        disabled={pendiente}
        aria-label={`Prefijo de las órdenes de compra de ${pais.nombre}`}
        placeholder="Ej: ECOM05"
        onChange={(e) => setValor(e.target.value.toUpperCase())}
        onBlur={guardar}
        onClick={(e) => e.stopPropagation()}
        className={`${fieldClass} w-28 py-1 uppercase`}
      />
      <span className="text-xs whitespace-nowrap text-muted-foreground">{proximo ? `próxima ${proximo}` : "sin código"}</span>
    </span>
  );
}

const DEF_PAISES: DefTabla<FilaPais> = {
  clave: "configuracion-paises",
  campos: [
    { id: "nombre", etiqueta: "País", tipo: "texto", valor: (p) => p.nombre },
    { id: "codigo", etiqueta: "Código", tipo: "texto", valor: (p) => p.codigo },
  ],
};
const NOMBRE: NombreFilas = { singular: "país", plural: "países" };
const ICONOS: Record<string, IconoComp> = { nombre: ConfiguracionIcon, codigo: ConfiguracionIcon };
const COLUMNAS: ColumnaTabla<FilaPais, boolean>[] = [
  {
    id: "nombre",
    label: "País",
    ocultable: false,
    clase: "font-medium",
    render: (p) => (
      <span className="flex items-center gap-2">
        <Bandera codigo={p.codigo} />
        {p.nombre}
      </span>
    ),
  },
  { id: "codigo", label: "Código", ocultable: true, clase: "text-muted-foreground tabular-nums", render: (p) => p.codigo },
  {
    id: "compras",
    label: "Órdenes de compra",
    descripcion: "Prefijo del código de las compras del país: cada compra nueva toma el número siguiente.",
    ocultable: true,
    render: (p, puedeEscribir) => <PrefijoCompras key={`${p.codigo}-${p.prefijo}`} pais={p} puedeEscribir={puedeEscribir} />,
  },
];

/** Los países del sistema, con «Agregar» para sumar uno nuevo (queda disponible en Compras, el CRM, etc.). */
export function TablaPaises({ paises, puedeEscribir }: { paises: FilaPais[]; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF_PAISES}
      filas={paises}
      columnas={COLUMNAS}
      contexto={puedeEscribir}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(p) => p.id}
      accionPrincipal={puedeEscribir ? <CrearPaisPanel /> : undefined}
      anchoMinimo="36rem"
      ariaLabel="Países del sistema"
      vacio="No hay países."
    />
  );
}
