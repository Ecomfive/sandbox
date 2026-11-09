"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CalendarioIcon, EstadoIcon, ExtractoIcon, PersonaIcon, TiendaIcon, WalletIcon } from "@/lib/nav-icons";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { atribuirRetiro } from "../actions";

export interface FilaRetiroSocio {
  id: string;
  mes: string;
  tienda: string;
  descripcion: string;
  cuenta: string;
  monto: number;
  socio: string;
  socioId: string | null;
  /** A mano, por el nombre en la descripción o sin atribuir. */
  como: "A mano" | "Por nombre" | "Sin atribuir";
}

const DEF: DefTabla<FilaRetiroSocio> = {
  clave: "utilidades-retiros",
  campos: [
    { id: "socio", etiqueta: "Socio", tipo: "seleccion", valores: (r) => [r.socio], agrupable: true },
    { id: "como", etiqueta: "Atribución", tipo: "seleccion", valores: (r) => [r.como], agrupable: true },
    { id: "mes", etiqueta: "Mes", tipo: "seleccion", valores: (r) => [r.mes.slice(0, 7)], agrupable: true },
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (r) => [r.tienda], agrupable: true },
    { id: "cuenta", etiqueta: "Forma de pago", tipo: "seleccion", valores: (r) => [r.cuenta], agrupable: true },
    { id: "descripcion", etiqueta: "Descripción", tipo: "texto", valor: (r) => r.descripcion },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (r) => r.monto },
  ],
  total: (r) => r.monto,
  vistaInicial: { agrupar: "socio" },
};
const NOMBRE: NombreFilas = { singular: "retiro", plural: "retiros" };
const ICONOS: Record<string, IconoComp> = {
  socio: PersonaIcon,
  como: EstadoIcon,
  mes: CalendarioIcon,
  tienda: TiendaIcon,
  cuenta: WalletIcon,
  descripcion: ExtractoIcon,
  monto: WalletIcon,
};
const usd = (v: number) => dinero(v, "USD", { decimales: 2 });
const AUTOMATICO = "auto";

/** Elegir el socio de un retiro: se guarda al elegir. «Automático» vuelve a la atribución por nombre. */
function ElegirSocio({ fila, socios }: { fila: FilaRetiroSocio; socios: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const valor = fila.como === "A mano" && fila.socioId ? fila.socioId : AUTOMATICO;
  return (
    <select
      aria-label={`Socio del retiro de ${usd(fila.monto)} de ${mesCorto(fila.mes)}`}
      disabled={pendiente}
      value={valor}
      onChange={(e) =>
        iniciar(async () => {
          const elegido = e.target.value === AUTOMATICO ? null : e.target.value;
          const r = await atribuirRetiro(fila.id, elegido);
          if (r.error) mostrarToast(r.error, "destructive");
          else mostrarToast("Retiro atribuido");
          router.refresh();
        })
      }
      className={fieldClassSm}
    >
      <option value={AUTOMATICO}>Automático</option>
      {socios.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nombre}
        </option>
      ))}
    </select>
  );
}

const COLUMNAS: ColumnaTabla<FilaRetiroSocio, null>[] = [
  { id: "mes", label: "Mes", ocultable: false, render: (r) => mesCorto(r.mes) },
  {
    id: "socio",
    label: "Socio",
    ocultable: false,
    render: (r) =>
      r.como === "Sin atribuir" ? (
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
          Sin atribuir
        </span>
      ) : (
        r.socio
      ),
  },
  { id: "como", label: "Atribución", ocultable: true, render: (r) => <span className="text-muted-foreground">{r.como}</span> },
  { id: "tienda", label: "Tienda", ocultable: true, render: (r) => r.tienda },
  { id: "descripcion", label: "Descripción", ocultable: false, render: (r) => <span className="line-clamp-2 max-w-xl">{r.descripcion}</span> },
  { id: "cuenta", label: "Forma de pago", ocultable: true, render: (r) => r.cuenta },
  { id: "monto", label: "Monto", ocultable: false, clase: "text-right tabular-nums", render: (r) => usd(r.monto), total: (fs) => usd(fs.reduce((a, r) => a + r.monto, 0)) },
];

export function TablaRetirosSocios({
  filas,
  socios,
  puedeEscribir,
}: {
  filas: FilaRetiroSocio[];
  socios: { id: string; nombre: string }[];
  puedeEscribir: boolean;
}) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      // Agrupada desde el principio: sin esto se veían todos los retiros de una vez.
      paginarSiempre
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(r) => r.id}
      accion={puedeEscribir ? { etiqueta: "Atribuir a", render: (r) => <ElegirSocio fila={r} socios={socios} /> } : undefined}
      ariaLabel="Retiros de dividendos por socio"
      vacio="No hay retiros de dividendos en el libro."
    />
  );
}
