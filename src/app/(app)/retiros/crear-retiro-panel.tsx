"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { pideCrear } from "@/lib/crear-global";
import { crearRetiro, verSiguienteCorrelativo } from "./actions";
import { BotonAgregar } from "@/components/ui/boton-agregar";
import { AvisoFaltante, BotonCrear } from "@/components/ui/boton-crear";
import { fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, ExtractoIcon, GastoIcon, WalletIcon } from "@/lib/nav-icons";
import { leerCorrelativo } from "@/lib/retiros/correlativo";

const formatoCorrelativo = (numero: number) => `#${String(numero).padStart(4, "0")}`;

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

/** Botón "Agregar" que despliega directo la ficha de nuevo retiro, un panel que sale por la derecha (como las demás
 * fichas), en vez de navegar a una página aparte. La plataforma se elige dentro de la ficha.
 * La persona asignada no se pide: la pone el sistema con quien crea el retiro.
 * Al final hay un botón grande de crear: apagado mientras falte un dato obligatorio, y al pulsarlo así lleva al dato
 * que falta (ver `useFaltantes`). Al guardar, `crearRetiro` manda de vuelta a la lista (`/retiros`), no a la ficha
 * del retiro recién creado; si el número mostrado ya lo había ocupado otro retiro, avisa con un toast. */
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
  // La comisión arranca vacía: es un dato obligatorio que hay que escribir (o que sugiere la cuenta al elegirla).
  const [comisionValor, setComisionValor] = useState("");
  const [comisionPorcentaje, setComisionPorcentaje] = useState("");
  const [comisionManual, setComisionManual] = useState(false);
  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState("");
  const [fechaLimite, setFechaLimite] = useState("");
  const [correlativo, setCorrelativo] = useState<number | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const botonAbrirRef = useRef<HTMLButtonElement>(null);
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const invalido = (id: string) => faltante === id || undefined;

  const parametros = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const yaAbrio = useRef(false);
  const yaAvisoCambio = useRef(false);
  const { mostrarToast } = useToast();

  // Al abrir se MUESTRA el siguiente correlativo, sin gastarlo: solo se asigna al crear el retiro.
  // Se consulta en cada apertura (otra persona pudo crear uno mientras tanto) y, si no se guardó
  // nada, siempre sale el mismo número. También se limpia todo lo escrito la vez anterior: si se
  // canceló a medio llenar, la próxima vez que se abra debe empezar en blanco.
  async function abrirVentana() {
    setEnviando(false);
    setMonto("");
    setComisionValor("");
    setComisionPorcentaje("");
    setComisionManual(false);
    setFechaLimite("");
    // Ninguna cuenta destino viene elegida: la persona tiene que escoger una de la lista.
    setCuentaSeleccionadaId("");
    setAbierto(true);
    setCorrelativo(null);
    setConsultando(true);
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

  // Al crear, `crearRetiro` manda de vuelta a la lista (ya no a la ficha del retiro). Si otra persona ocupó
  // primero el número que se vio al abrir la ficha, llega como `?correlativo_cambio=X&correlativo_final=Y`:
  // se avisa con un aviso y se quita de la dirección, igual que `nuevo`.
  useEffect(() => {
    const pedido = leerCorrelativo(parametros.get("correlativo_cambio"));
    const final = leerCorrelativo(parametros.get("correlativo_final"));
    if (pedido === null || final === null || yaAvisoCambio.current) return;
    yaAvisoCambio.current = true;
    router.replace(pathname, { scroll: false });
    mostrarToast(
      `Otra persona creó primero el retiro ${formatoCorrelativo(pedido)}. Este quedó como ${formatoCorrelativo(final)}: escribe ${formatoCorrelativo(final)} en el concepto del retiro en Dropi.`,
      "info"
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parametros]);

  // Mientras se guarda no se cierra: la ventana queda abierta con el botón en "Creando..." hasta pasar a la ficha.
  // `Ventana` se encarga de Escape, del foco dentro de la ficha y de que el foco vuelva a donde estaba.
  function cerrarVentana() {
    if (enviando) return;
    setAbierto(false);
    requestAnimationFrame(() => botonAbrirRef.current?.focus());
  }

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

  // Sin cuentas activas no hay retiro que crear aunque el resto esté lleno: el botón pide llevar a ese aviso.
  const puedeCrear = completo && cuentas.length > 0;

  function alPulsarSinCompletar() {
    if (!señalarFaltante()) document.getElementById("campo-cuenta")?.scrollIntoView({ block: "center" });
  }

  return (
    <>
      {/* «Agregar» abre directo la ficha de nuevo retiro; las cuentas destino se agregan en su propia pestaña. */}
      <BotonAgregar ref={botonAbrirRef} onClick={abrirVentana} />

      <Ventana
        abierto={abierto}
        alCerrar={cerrarVentana}
        lado="derecha"
        ancho="lg"
        titulo={
          <>
            <span className="text-lg font-semibold">Retiro</span>
            <span aria-live="polite" className="rounded bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
              {correlativo !== null
                ? `#${String(correlativo).padStart(4, "0")}`
                : consultando
                  ? "Calculando..."
                  : "Se asigna al guardar"}
            </span>
          </>
        }
      >
        <form
          ref={formRef}
          action={crearRetiro}
          onSubmit={() => setEnviando(true)}
          onInput={revisar}
          onChange={revisar}
          aria-busy={enviando}
          className="flex flex-1 flex-col"
        >
          <input type="hidden" name="pais_id" value={paisId} />
          {correlativo !== null && <input type="hidden" name="numero_correlativo" value={correlativo} />}

          <div className="flex flex-1 flex-col divide-y divide-border p-5">
            <Seccion icono={WalletIcon} titulo="Retiro">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-plataforma">
                    Plataforma
                    <Obligatorio />
                  </label>
                  <select
                    id="campo-plataforma"
                    name="plataforma_id"
                    required
                    aria-invalid={invalido("campo-plataforma")}
                    defaultValue={plataformas[0]?.id}
                    className={`${fieldClass} w-full min-w-0`}
                  >
                    {plataformas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  <AvisoFaltante id="campo-plataforma" faltante={faltante} />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-cuenta">
                    Cuenta destino
                    <Obligatorio />
                  </label>
                  {cuentas.length > 0 ? (
                    <>
                      <select
                        id="campo-cuenta"
                        name="cuenta_retiro_id"
                        required
                        aria-invalid={invalido("campo-cuenta")}
                        defaultValue=""
                        onChange={(e) => alElegirCuenta(e.target.value)}
                        className={`${fieldClass} w-full min-w-0`}
                      >
                        <option value="">Selecciona una cuenta</option>
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                      <AvisoFaltante id="campo-cuenta" faltante={faltante} />
                    </>
                  ) : (
                    <p id="campo-cuenta" role="alert" className="py-1 text-xs text-destructive">
                      Sin cuentas activas. Crea una para poder guardar el retiro.
                    </p>
                  )}
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-gestionado-por">
                    Gestionado por
                    <Obligatorio />
                  </label>
                  <select
                    id="campo-gestionado-por"
                    name="gestionado_por"
                    required
                    aria-invalid={invalido("campo-gestionado-por")}
                    defaultValue="plataforma"
                    className={`${fieldClass} w-full min-w-0`}
                  >
                    <option value="plataforma">Plataforma</option>
                    <option value="correo">Correo</option>
                  </select>
                  <AvisoFaltante id="campo-gestionado-por" faltante={faltante} />
                </div>
              </div>
            </Seccion>

            <Seccion icono={GastoIcon} titulo="Montos">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-monto">
                    Monto
                    <Obligatorio />
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      id="campo-monto"
                      type="number"
                      step="0.01"
                      min="0.01"
                      name="monto"
                      required
                      data-enfocar
                      aria-invalid={invalido("campo-monto")}
                      placeholder="Ej: 1500.00"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      className={`${fieldClass} w-full min-w-0 tabular-nums`}
                    />
                  </div>
                  {/* El monto tiene que ser mayor a cero: con un 0 escrito el aviso lo dice, no «falta». */}
                  <AvisoFaltante
                    id="campo-monto"
                    faltante={faltante}
                    mensaje={monto !== "" ? "Debe ser mayor a cero" : undefined}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-a-recibir">
                    A recibir
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      id="campo-a-recibir"
                      type="number"
                      step="0.01"
                      readOnly
                      tabIndex={-1}
                      value={montoNeto.toFixed(2)}
                      className={`${fieldClass} w-full min-w-0 cursor-not-allowed bg-muted tabular-nums`}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <p className={labelClassSm} id="etiqueta-comision">
                    Comisión
                    <Obligatorio />
                  </p>
                  <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex min-w-0 items-center gap-1">
                      <span className="text-sm text-muted-foreground">$</span>
                      <input
                        id="campo-comision"
                        type="number"
                        step="0.01"
                        min="0"
                        name="comision"
                        required
                        aria-invalid={invalido("campo-comision")}
                        aria-label="Comisión en dólares"
                        aria-describedby="etiqueta-comision"
                        placeholder="Ej: 3.00"
                        value={comisionValor}
                        onChange={(e) => alCambiarComisionValor(e.target.value)}
                        className={`${fieldClass} w-full min-w-0 tabular-nums`}
                      />
                    </div>
                    <div className="flex min-w-0 items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label="Comisión en porcentaje"
                        aria-describedby="etiqueta-comision"
                        placeholder="Ej: 2.5"
                        value={comisionPorcentaje}
                        onChange={(e) => alCambiarComisionPorcentaje(e.target.value)}
                        className={`${fieldClass} w-full min-w-0 tabular-nums`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className="mt-1">
                    <AvisoFaltante id="campo-comision" faltante={faltante} />
                  </div>
                </div>
              </div>
            </Seccion>

            <Seccion icono={CalendarioIcon} titulo="Fechas">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-fecha">
                    Fecha de creación
                  </label>
                  <input
                    id="campo-fecha"
                    type="text"
                    readOnly
                    tabIndex={-1}
                    value={formatearFecha(hoy())}
                    className={`${fieldClass} w-full min-w-0 cursor-not-allowed bg-muted`}
                  />
                  {/* Siempre es el día de hoy: no se elige a mano, así que va como oculto en vez de en el `<input>` de arriba. */}
                  <input type="hidden" name="fecha" value={hoy()} />
                </div>
                <div className="flex min-w-0 flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-fecha-limite">
                    Fecha límite
                  </label>
                  <input
                    id="campo-fecha-limite"
                    type="date"
                    name="fecha_limite"
                    value={fechaLimite}
                    onChange={(e) => setFechaLimite(e.target.value)}
                    className={`${fieldClass} w-full min-w-0`}
                  />
                </div>
              </div>
            </Seccion>

            <Seccion icono={ExtractoIcon} titulo="Nota">
              <input
                id="campo-notas"
                type="text"
                name="notas"
                aria-label="Nota"
                placeholder="Ej: Retiro semanal de ventas de septiembre"
                className={`${fieldClass} w-full`}
              />
            </Seccion>
          </div>

          <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">
              <span aria-hidden="true" className="text-destructive">
                *
              </span>{" "}
              Obligatorio
            </p>
            <BotonCrear
              puede={puedeCrear}
              enviando={enviando}
              etiqueta="Crear retiro"
              alPulsarSinCompletar={alPulsarSinCompletar}
            />
          </div>
        </form>
      </Ventana>
    </>
  );
}
