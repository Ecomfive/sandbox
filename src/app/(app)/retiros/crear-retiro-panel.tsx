"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { pideCrear } from "@/lib/crear-global";
import { crearRetiro, verSiguienteCorrelativo } from "./actions";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { CerrarIcon, MasIcon } from "@/lib/nav-icons";

const hoy = () => new Date().toISOString().slice(0, 10);

const Obligatorio = () => (
  <span aria-hidden="true" className="text-destructive">
    {" "}
    *
  </span>
);

export interface Plataforma {
  id: string;
  nombre: string;
}
export interface Cuenta {
  id: string;
  nombre: string;
  comision_tipo: "porcentaje" | "monto_fijo" | "ambos" | null;
  comision_porcentaje: number | null;
  comision_monto_fijo: number | null;
}

/** Calcula cuánto sugiere cobrar la cuenta para un monto dado — porcentaje, monto fijo, o
 * los dos sumados si la cuenta tiene comisión "ambos" (ej. 2.5% + $3). Se usa también al
 * editar un retiro, si se cambia de cuenta destino. */
export function calcularComisionSugerida(cuenta: Cuenta, montoNum: number): number | null {
  if (!cuenta.comision_tipo) return null;
  const dePorcentaje =
    cuenta.comision_porcentaje != null ? (montoNum * cuenta.comision_porcentaje) / 100 : 0;
  const deMontoFijo = cuenta.comision_monto_fijo ?? 0;
  if (cuenta.comision_tipo === "porcentaje" && cuenta.comision_porcentaje != null) return dePorcentaje;
  if (cuenta.comision_tipo === "monto_fijo" && cuenta.comision_monto_fijo != null) return deMontoFijo;
  if (cuenta.comision_tipo === "ambos" && cuenta.comision_porcentaje != null && cuenta.comision_monto_fijo != null) {
    return dePorcentaje + deMontoFijo;
  }
  return null;
}

/** Botón "+ Crear" que despliega directo el panel de creación rápida (estilo "crear tarea"),
 * en vez de navegar a una página aparte. La plataforma se elige dentro del panel.
 * La persona asignada no se pide: la pone el sistema con quien crea el retiro. */
export function CrearRetiroPanel({
  paisId,
  plataformas,
  cuentas,
}: {
  paisId: string;
  plataformas: Plataforma[];
  cuentas: Cuenta[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [comisionValor, setComisionValor] = useState("0");
  const [comisionPorcentaje, setComisionPorcentaje] = useState("0");
  const [comisionManual, setComisionManual] = useState(false);
  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [correlativo, setCorrelativo] = useState<number | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const botonAbrirRef = useRef<HTMLButtonElement>(null);

  const parametros = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const yaAbrio = useRef(false);

  // Al abrir se MUESTRA el siguiente correlativo, sin gastarlo: solo se asigna al crear el retiro.
  // Se consulta en cada apertura (otra persona pudo crear uno mientras tanto) y, si no se guardó
  // nada, siempre sale el mismo número. También se limpia todo lo escrito la vez anterior: si se
  // canceló a medio llenar, la próxima vez que se abra debe empezar en blanco.
  async function abrirVentana() {
    setEnviando(false);
    setMonto("");
    setComisionValor("0");
    setComisionPorcentaje("0");
    setComisionManual(false);
    setFechaLimite("");
    setAbierto(true);
    setCorrelativo(null);
    setConsultando(true);
    // El <select> de cuenta arranca en la primera opción del navegador: se sincroniza acá
    // para que la comisión sugerida de esa cuenta ya aparezca sin tener que tocar el campo.
    if (cuentas.length > 0) alElegirCuenta(cuentas[0].id, 0);
    setCorrelativo(await verSiguienteCorrelativo().catch(() => null));
    setConsultando(false);
  }

  // El botón «Crear» de la barra de arriba llega con `?nuevo=1`: se abre el formulario de una vez y se quita el
  // parámetro de la dirección (para que recargar o volver atrás no lo abra otra vez).
  useEffect(() => {
    if (!pideCrear(parametros.get("nuevo")) || yaAbrio.current) return;
    yaAbrio.current = true;
    router.replace(pathname, { scroll: false });
    void abrirVentana();
    // Solo al llegar: abrirVentana lee el estado de este momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parametros]);

  // Mientras se guarda no se cierra: la ventana queda abierta con el botón en "Creando..." hasta pasar a la ficha.
  function cerrarVentana() {
    if (enviando) return;
    setAbierto(false);
    botonAbrirRef.current?.focus();
  }

  // Escape cierra el panel, y Tab queda atrapado dentro de él mientras está abierto.
  useEffect(() => {
    if (!abierto) return;

    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        cerrarVentana();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const enfocables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (enfocables.length === 0) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  const montoNum = parseFloat(monto) || 0;
  const comisionNum = parseFloat(comisionValor) || 0;
  // "A recibir" ya no se edita a mano: siempre es monto menos comisión (ver crearRetiro()).
  const montoNeto = montoNum - comisionNum;

  function alCambiarComisionValor(valor: string) {
    setComisionManual(true);
    setComisionValor(valor);
    const num = parseFloat(valor) || 0;
    setComisionPorcentaje(montoNum > 0 ? ((num / montoNum) * 100).toFixed(2) : "0");
  }

  function alCambiarComisionPorcentaje(valor: string) {
    setComisionManual(true);
    setComisionPorcentaje(valor);
    const num = parseFloat(valor) || 0;
    setComisionValor(montoNum > 0 ? ((montoNum * num) / 100).toFixed(2) : "0");
  }

  // Al elegir cuenta destino, sugiere la comisión configurada ahí (si tiene) — solo una
  // sugerencia: se puede seguir editando a mano, y no vuelve a aplicarse hasta cambiar de
  // cuenta otra vez. Cambiar la comisión de la cuenta después no afecta retiros ya creados.
  function alElegirCuenta(cuentaId: string, montoActual: number = montoNum) {
    setCuentaSeleccionadaId(cuentaId);
    setComisionManual(false);
    const cuenta = cuentas.find((c) => c.id === cuentaId);
    const sugerido = cuenta ? calcularComisionSugerida(cuenta, montoActual) : null;
    if (sugerido == null) return;
    setComisionValor(sugerido.toFixed(2));
    setComisionPorcentaje(montoActual > 0 ? ((sugerido / montoActual) * 100).toFixed(2) : "0");
  }

  // Si ya hay una sugerencia activa (no se tocó a mano) y la persona escribe el monto
  // después de elegir la cuenta, recalcula la comisión sugerida con el monto nuevo.
  useEffect(() => {
    if (comisionManual) return;
    const cuenta = cuentas.find((c) => c.id === cuentaSeleccionadaId);
    const sugerido = cuenta ? calcularComisionSugerida(cuenta, montoNum) : null;
    if (sugerido == null) return;
    setComisionValor(sugerido.toFixed(2));
    setComisionPorcentaje(montoNum > 0 ? ((sugerido / montoNum) * 100).toFixed(2) : "0");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoNum]);

  return (
    <>
      {/* «Agregar» abre directo la ficha de nuevo retiro; las cuentas destino se agregan en su propia pestaña. */}
      <Button
        ref={botonAbrirRef}
        type="button"
        aria-haspopup="dialog"
        onClick={abrirVentana}
        className="!bg-[#202020] !text-white hover:!bg-[#2d2d2d]"
      >
        <MasIcon className="mr-1 h-4 w-4" />
        Agregar
      </Button>

      {abierto && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={cerrarVentana}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-nuevo-retiro"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
          >
            <form action={crearRetiro} onSubmit={() => setEnviando(true)} aria-busy={enviando}>
              <input type="hidden" name="pais_id" value={paisId} />
              {correlativo !== null && <input type="hidden" name="numero_correlativo" value={correlativo} />}

              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span id="titulo-nuevo-retiro" className="flex items-center gap-2 text-sm font-semibold">
                  Nuevo retiro
                  <span
                    aria-live="polite"
                    className="rounded bg-muted px-2 py-0.5 text-xs font-medium tabular-nums"
                  >
                    {correlativo !== null
                      ? `#${String(correlativo).padStart(4, "0")}`
                      : consultando
                        ? "Calculando..."
                        : "Se asigna al guardar"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={cerrarVentana}
                  disabled={enviando}
                  aria-label="Cerrar"
                  className={`p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40 ${anilloFoco}`}
                >
                  <CerrarIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3 p-4">
                <div className="flex gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm} htmlFor="campo-plataforma">
                      Plataforma
                      <Obligatorio />
                    </label>
                    <select
                      id="campo-plataforma"
                      name="plataforma_id"
                      required
                      defaultValue={plataformas[0]?.id}
                      className={`${fieldClassSm} w-full min-w-0`}
                    >
                      {plataformas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm} htmlFor="campo-cuenta">
                      Cuenta destino
                      <Obligatorio />
                    </label>
                    {cuentas.length > 0 ? (
                      <select
                        id="campo-cuenta"
                        name="cuenta_retiro_id"
                        required
                        onChange={(e) => alElegirCuenta(e.target.value)}
                        className={`${fieldClassSm} w-full min-w-0`}
                      >
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p id="campo-cuenta" role="alert" className="py-1 text-xs text-destructive">
                        Sin cuentas activas. Crea una para poder guardar el retiro.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-gestionado-por">
                    Gestionado por
                    <Obligatorio />
                  </label>
                  <select
                    id="campo-gestionado-por"
                    name="gestionado_por"
                    required
                    defaultValue="plataforma"
                    className={`${fieldClassSm} w-40`}
                  >
                    <option value="plataforma">Plataforma</option>
                    <option value="correo">Correo</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <div className="flex w-24 shrink-0 flex-col gap-1">
                    <label className={labelClassSm} htmlFor="campo-monto">
                      Monto
                      <Obligatorio />
                    </label>
                    <input
                      id="campo-monto"
                      type="number"
                      step="0.01"
                      min="0"
                      name="monto"
                      required
                      autoFocus
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm} htmlFor="campo-fecha">
                      Fecha
                      <Obligatorio />
                    </label>
                    <input
                      id="campo-fecha"
                      type="date"
                      name="fecha"
                      defaultValue={hoy()}
                      required
                      className={`${fieldClassSm} w-full min-w-0`}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm} htmlFor="campo-fecha-limite">
                      Fecha límite
                    </label>
                    <input
                      id="campo-fecha-limite"
                      type="date"
                      name="fecha_limite"
                      value={fechaLimite}
                      onChange={(e) => setFechaLimite(e.target.value)}
                      className={`${fieldClassSm} w-full min-w-0`}
                    />
                  </div>
                </div>

                <div>
                  <p className={labelClassSm} id="etiqueta-comision">
                    Comisión
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <span className="text-sm text-muted-foreground">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        name="comision"
                        aria-label="Comisión en dólares"
                        aria-describedby="etiqueta-comision"
                        value={comisionValor}
                        onChange={(e) => alCambiarComisionValor(e.target.value)}
                        className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label="Comisión en porcentaje"
                        aria-describedby="etiqueta-comision"
                        value={comisionPorcentaje}
                        onChange={(e) => alCambiarComisionPorcentaje(e.target.value)}
                        className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelClassSm} htmlFor="campo-a-recibir">
                    A recibir
                  </label>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      id="campo-a-recibir"
                      type="number"
                      step="0.01"
                      readOnly
                      tabIndex={-1}
                      value={montoNeto.toFixed(2)}
                      className={`${fieldClassSm} w-full min-w-0 cursor-not-allowed bg-muted tabular-nums`}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClassSm} htmlFor="campo-notas">
                    Nota
                  </label>
                  <input
                    id="campo-notas"
                    type="text"
                    name="notas"
                    placeholder="Escribe una nota para este retiro"
                    className={`${fieldClass} mt-1 w-full text-sm`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
                <p className="mr-auto text-xs text-muted-foreground">
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>{" "}
                  Obligatorio
                </p>
                <Button type="button" variant="secondary" onClick={cerrarVentana} disabled={enviando}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={cuentas.length === 0 || enviando}
                  className="!rounded-full !bg-[#202020] !text-white hover:!bg-[#2d2d2d]"
                >
                  {enviando ? "Creando..." : "Crear retiro"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
