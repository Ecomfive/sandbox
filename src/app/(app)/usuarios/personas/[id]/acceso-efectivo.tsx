import { Chip } from "@/components/permisos/piezas-permisos";
import { BarraCobertura, LeyendaCobertura } from "@/components/permisos/piezas-permisos";
import { CheckIcon, OjoIcon } from "@/lib/nav-icons";
import type { Cobertura } from "@/lib/permisos/acceso";
import type { Nivel } from "@/lib/permisos/catalogo";

function ChipNivel({ nivel }: { nivel: Nivel }) {
  if (nivel === "n") return <Chip>Sin acceso</Chip>;
  if (nivel === "r")
    return (
      <Chip tono="azul">
        <OjoIcon className="h-3.5 w-3.5" />
        Solo lectura
      </Chip>
    );
  return <Chip tono="primario">Edición</Chip>;
}

/** Lo que de verdad puede la persona: la cobertura y, módulo por módulo, en qué se aparta de su rol. */
export function AccesoEfectivo({
  cobertura,
  diferencias,
  sinCambios,
}: {
  cobertura: Cobertura;
  diferencias: { modulo: string; etiqueta: string; delRol: Nivel; efectivo: Nivel; ajustes: number }[];
  sinCambios: { modulo: string; etiqueta: string; nivel: Nivel }[];
}) {
  const total = cobertura.w + cobertura.r;
  return (
    <aside aria-labelledby="h-efectivo" className="rounded-[14px] border border-border bg-card shadow-sm lg:sticky lg:top-4">
      <div className="flex items-center gap-2.5 border-b border-border px-[18px] py-3.5">
        <span aria-hidden="true" className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-primario-suave text-primario">
          <CheckIcon className="h-4 w-4" />
        </span>
        <h2 id="h-efectivo" className="text-[15px] font-bold">
          Acceso efectivo
        </h2>
      </div>
      <div className="flex flex-col gap-3 p-[18px]">
        <BarraCobertura w={cobertura.w} r={cobertura.r} n={cobertura.n} etiqueta={`${total} módulos: ${cobertura.w} con edición, ${cobertura.r} de solo lectura, ${cobertura.n} sin acceso`} />
        <LeyendaCobertura w={cobertura.w} r={cobertura.r} n={cobertura.n} />
      </div>
      {diferencias.length > 0 && (
        <div className="overflow-x-auto border-t border-border">
          <table className="w-full border-separate border-spacing-0 text-sm">
            <caption className="sr-only">Diferencias entre el rol y lo que la persona tiene</caption>
            <thead>
              <tr className="bg-muted text-left text-muted-foreground">
                {["Módulo", "Del rol", "Resultado"].map((t) => (
                  <th key={t} scope="col" className="border-b border-border px-4 py-2.5 text-[11.5px] font-semibold tracking-wide uppercase">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diferencias.map((d) => (
                <tr key={d.modulo}>
                  <td className="border-b border-border px-4 py-3 font-medium">{d.etiqueta}</td>
                  <td className="border-b border-border px-4 py-3">
                    <ChipNivel nivel={d.delRol} />
                  </td>
                  <td className="border-b border-border px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ChipNivel nivel={d.efectivo} />
                      {d.ajustes > 0 && <Chip tono="aviso">{d.ajustes} ajuste{d.ajustes === 1 ? "" : "s"}</Chip>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sinCambios.length > 0 && (
        <details className="group border-t border-border px-[18px] py-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px] font-semibold text-muted-foreground hover:text-foreground">
            Ver los {sinCambios.length} módulos sin cambios
          </summary>
          <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
            {sinCambios.map((m) => (
              <li key={m.modulo} className="flex items-center gap-3 text-sm">
                <span className="grow">{m.etiqueta}</span>
                <ChipNivel nivel={m.nivel} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}
