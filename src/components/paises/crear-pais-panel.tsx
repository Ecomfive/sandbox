"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { crearPais } from "@/lib/paises-actions";
import { ConfiguracionIcon } from "@/lib/nav-icons";
import { normalizar } from "@/lib/tabla/motor";
import { Bandera } from "./bandera";

// Códigos de región que no son países (Unión Europea, Naciones Unidas, zonas de prueba).
const NO_PAISES = new Set(["EU", "EZ", "UN", "QO", "XA", "XB", "ZZ"]);

/** Todos los países con su nombre en español, del propio navegador (sin listas a mano que se desactualicen). */
function listaPaises(): { codigo: string; nombre: string }[] {
  const nombres = new Intl.DisplayNames(["es"], { type: "region" });
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lista: { codigo: string; nombre: string }[] = [];
  for (const a of letras)
    for (const b of letras) {
      const codigo = a + b;
      if (NO_PAISES.has(codigo)) continue;
      const nombre = nombres.of(codigo);
      if (nombre && nombre !== codigo) lista.push({ codigo, nombre });
    }
  return lista.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
}

/**
 * Elegir el país de una lista con su bandera (busca por nombre o código): llena el nombre y el código, que se pueden
 * corregir a mano. La bandera que se verá en el sistema sale del código.
 */
function CamposPais({ faltante, invalido }: { faltante: string | null; invalido: (id: string) => true | undefined }) {
  const paises = useMemo(() => listaPaises(), []);
  const [busqueda, setBusqueda] = useState("");
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const q = normalizar(busqueda.trim());
  const encontrados = q ? paises.filter((p) => normalizar(`${p.nombre} ${p.codigo}`).includes(q)).slice(0, 8) : [];

  return (
    <>
      <Campo etiqueta="Buscar país" id="campo-buscar-pais">
        <input
          id="campo-buscar-pais"
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          data-enfocar
          autoComplete="off"
          placeholder="Ej: Colombia o CO"
          className={`${fieldClass} w-full`}
        />
      </Campo>
      {encontrados.length > 0 && (
        <ul role="list" aria-label="Países encontrados" className="m-0 flex list-none flex-col gap-0.5 rounded-lg border border-border p-1">
          {encontrados.map((p) => (
            <li key={p.codigo}>
              <button
                type="button"
                onClick={() => {
                  setNombre(p.nombre);
                  setCodigo(p.codigo);
                  setBusqueda("");
                }}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                <Bandera codigo={p.codigo} />
                <span className="flex-1">{p.nombre}</span>
                <span className="text-xs text-muted-foreground">{p.codigo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Campo etiqueta="Nombre" id="campo-nombre-pais" obligatorio faltante={faltante}>
        <input
          id="campo-nombre-pais"
          type="text"
          name="nombre"
          required
          maxLength={60}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          aria-invalid={invalido("campo-nombre-pais")}
          placeholder="Ej: México"
          className={`${fieldClass} w-full`}
        />
      </Campo>
      <Campo etiqueta="Código ISO (dos letras)" id="campo-codigo-pais" obligatorio faltante={faltante}>
        <span className="flex items-center gap-2">
          <input
            id="campo-codigo-pais"
            type="text"
            name="codigo"
            required
            minLength={2}
            maxLength={2}
            pattern="[A-Za-z]{2}"
            autoComplete="off"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            aria-invalid={invalido("campo-codigo-pais")}
            placeholder="Ej: MX"
            className={`${fieldClass} w-full uppercase`}
          />
          {/^[A-Za-z]{2}$/.test(codigo) && <Bandera codigo={codigo} className="h-6 w-9" />}
        </span>
      </Campo>
    </>
  );
}

/** La ficha para agregar un país (con su bandera). Por defecto se abre con «Agregar»; `boton` pone otro. */
export function CrearPaisPanel({ boton }: { boton?: (abrir: () => void) => ReactNode }) {
  return (
    <FichaCrear titulo="Nuevo país" etiquetaCrear="Agregar país" action={crearPais} mensajeExito="País agregado" boton={boton}>
      {({ faltante, invalido }) => (
        <Seccion icono={ConfiguracionIcon} titulo="País">
          <CamposPais faltante={faltante} invalido={invalido} />
        </Seccion>
      )}
    </FichaCrear>
  );
}
