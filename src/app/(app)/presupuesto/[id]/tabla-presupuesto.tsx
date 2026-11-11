"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TablaFinanciera, type CeldaAF4 } from "@/components/af4/tabla-financiera";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { mesCorto } from "@/lib/af4/fecha";
import { totalFila, type FilaAF4 } from "@/lib/af4/tabla-financiera";
import type { Seccion } from "@/lib/finanzas/eerr";
import {
  CONCEPTOS,
  editarSeccion,
  esSeccion,
  redondear,
  serieDeDetalle,
  sumaEn,
  tieneTipos,
  valoresPorConcepto,
  type DetalleSecciones,
  type Escenario,
} from "@/lib/finanzas/presupuesto";
import { claseCampoPanel, PanelCelda, type MotivoCierre } from "../../compras/panel-celda";
import { editarCeldaPresupuesto } from "../actions";

/** A qué sección y tipo apunta cada fila editable (`tipo` undefined = la sección entera; null = «Otros»). */
type Destino = { seccion: Seccion; tipo: string | null | undefined; nombre: string };

/**
 * El presupuesto del escenario mes a mes (y el total del año) como tabla financiera AF4: secciones que se despliegan en
 * sus tipos de gasto, márgenes como subtotales y el resultado neto con doble filete. En borrador y con permiso, cada
 * celda (de una sección o de un tipo) se edita en su sitio: un clic, Enter o pulsar fuera guarda, Escape descarta.
 * Editar un tipo recalcula su sección; editar la sección la reparte entre sus tipos en la misma proporción
 * (`editarSeccion`, la misma regla que el servidor). Los resultados se recalculan al instante; si el servidor rechaza el
 * cambio, vuelve a como estaba.
 */
export function TablaPresupuesto({
  presupuestoId,
  escenario,
  unidad,
  meses,
  detalle: inicial,
  nombresTipo,
  editable,
  titulo,
  detalleTitulo,
}: {
  presupuestoId: string;
  escenario: Escenario;
  /** La tienda que se ve (null = consolidado). */
  unidad: string | null;
  meses: string[];
  detalle: DetalleSecciones;
  nombresTipo: Record<string, string>;
  editable: boolean;
  titulo: string;
  detalleTitulo?: string;
}) {
  const [detalle, setDetalle] = useState(inicial);
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [, startTransition] = useTransition();
  const valores = valoresPorConcepto(serieDeDetalle(detalle, meses), meses);

  const destinos = new Map<string, Destino>();
  const filas: FilaAF4[] = [];
  for (const c of CONCEPTOS) {
    const fila = valores[c.clave];
    const seccion = esSeccion(c.clave) ? c.clave : null;
    // La depreciación sin presupuesto ni real no se muestra (interruptor de Ajustes apagado).
    if (seccion === "depreciacion" && !detalle.depreciacion.length) continue;
    const valoresMes = meses.map((m) => fila[m] ?? 0);
    if (!seccion) {
      filas.push({ clave: c.clave, etiqueta: c.etiqueta, tipo: c.clave === "resultado" ? "total" : "subtotal", valores: valoresMes });
      continue;
    }
    filas.push({ clave: c.clave, etiqueta: c.etiqueta, tipo: "seccion", valores: valoresMes });
    destinos.set(c.clave, { seccion, tipo: undefined, nombre: c.etiqueta });
    if (!tieneTipos(detalle[seccion])) continue;
    for (const f of detalle[seccion]) {
      const nombre = f.tipo_id === null ? `Otros de ${c.etiqueta.toLowerCase()}` : (nombresTipo[f.tipo_id] ?? "Tipo");
      const clave = `${seccion}::${f.tipo_id ?? "otros"}`;
      filas.push({ clave, etiqueta: nombre, tipo: "detalle", padre: c.clave, valores: meses.map((m) => f.meses[m] ?? 0) });
      destinos.set(clave, { seccion, tipo: f.tipo_id, nombre });
    }
  }

  /** `tipo`: undefined = la sección; null = «Otros»; un id = ese tipo. `mes` null = el total del año. */
  function guardar(seccion: Seccion, tipo: string | null | undefined, mes: string | null, texto: string) {
    const n = Number(texto.replace(/\s/g, "").replace(",", "."));
    if (!texto.trim() || !Number.isFinite(n)) {
      mostrarToast("Escribe un monto válido.", "destructive");
      return;
    }
    const antes = detalle;
    const filasSeccion = detalle[seccion];
    const elegidas = tipo === undefined ? filasSeccion : filasSeccion.filter((f) => f.tipo_id === tipo);
    const actual = elegidas.reduce((a, f) => a + (mes ? (f.meses[mes] ?? 0) : sumaEn(f.meses, meses)), 0);
    if (redondear(n) === redondear(actual)) return;
    setDetalle({ ...detalle, [seccion]: editarSeccion(filasSeccion, meses, tipo, mes, n) });
    const fila = tipo === undefined ? "seccion" : tipo === null ? "otros" : tipo;
    startTransition(async () => {
      const r = await editarCeldaPresupuesto(presupuestoId, escenario, unidad, seccion, fila, mes, String(n)).catch(() => ({ error: "No se pudo guardar." }));
      if (r.error) {
        setDetalle(antes);
        mostrarToast(r.error, "destructive");
      } else router.refresh();
    });
  }

  const celdaPropia: CeldaAF4 | undefined = editable
    ? (f, columna, texto) => {
        const d = destinos.get(f.clave);
        if (!d) return undefined;
        const mes = columna === null ? null : meses[columna];
        const valor = columna === null ? (totalFila(f) ?? 0) : (f.valores[columna] ?? 0);
        const aria = mes ? `${d.nombre} de ${mesCorto(mes)}` : `${d.nombre}, total del año`;
        return <CeldaMonto aria={aria} valor={valor} texto={texto} alGuardar={(t) => guardar(d.seccion, d.tipo, mes, t)} />;
      }
    : undefined;

  return (
    <TablaFinanciera
      id="titulo-mensual"
      titulo={titulo}
      detalle={detalleTitulo}
      ariaLabel="Presupuesto por mes"
      columnas={meses.map((m) => ({ clave: m, etiqueta: mesCorto(m) }))}
      filas={filas}
      desplegado="nada"
      textoDesplegar="tipos"
      celdaPropia={celdaPropia}
    />
  );
}

/** Una celda de monto que se edita en su sitio con el panel de las celdas de Compras. */
function CeldaMonto({ aria, valor, texto, alGuardar }: { aria: string; valor: number; texto: string; alGuardar: (texto: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={boton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto(true)}
        className={`-mx-1.5 -my-0.5 block min-h-6 w-[calc(100%+0.75rem)] cursor-pointer rounded px-1.5 py-0.5 text-right transition-colors hover:bg-muted ${
          abierto ? "bg-muted ring-1 ring-primario/60" : ""
        } ${anilloFoco}`}
      >
        <span className="sr-only">Editar {aria}: </span>
        {texto}
      </button>
      {abierto && (
        <EditorMonto
          ancla={boton}
          aria={aria}
          inicial={String(redondear(valor))}
          alTerminar={(nuevo, motivo) => {
            setAbierto(false);
            if (motivo !== "fuera") boton.current?.focus();
            if (nuevo !== undefined) alGuardar(nuevo);
          }}
        />
      )}
    </>
  );
}

function EditorMonto({
  ancla,
  aria,
  inicial,
  alTerminar,
}: {
  ancla: React.RefObject<HTMLButtonElement | null>;
  aria: string;
  inicial: string;
  alTerminar: (texto: string | undefined, motivo: MotivoCierre | "elegido") => void;
}) {
  const [texto, setTexto] = useState(inicial);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    campo.current?.focus();
    campo.current?.select();
  }, []);
  const cambio = () => (texto === inicial ? undefined : texto);
  return (
    <PanelCelda ancla={ancla} etiqueta={aria} ancho={200} alCerrar={(m) => alTerminar(m === "escape" ? undefined : cambio(), m)}>
      <span className="flex items-center">
        <span className="pl-3 text-muted-foreground">$</span>
        <input
          ref={campo}
          type="text"
          inputMode="decimal"
          aria-label={aria}
          value={texto}
          maxLength={20}
          placeholder="0"
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              alTerminar(cambio(), "elegido");
            }
          }}
          className={`${claseCampoPanel} border-b-0 pl-1.5 tabular-nums`}
        />
      </span>
    </PanelCelda>
  );
}
