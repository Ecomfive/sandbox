import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { requireModulo } from "@/lib/auth";
import { crearPatron, eliminarPatron } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/components/ui/field";
import { EstadoVacio } from "@/components/ui/estado-vacio";
import { FormularioConToast } from "@/components/ui/toast";

export const dynamic = "force-dynamic";

export default async function PatronesBancariosPage() {
  await requireModulo("extractos");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);

  const [{ data: plataformas }, { data: patrones }] = await Promise.all([
    supabase.from("plataformas").select("id, nombre").order("nombre"),
    supabase
      .from("patrones_bancarios")
      .select("id, fragmento, plataforma_id, plataformas(nombre)")
      .eq("pais_id", pais.id)
      .order("fragmento"),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Diccionario de patrones bancarios</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {pais.nombre} — cuando la descripción de un movimiento contiene uno de estos textos, el
          sistema le asigna la plataforma sola al cargar el extracto. Se llena automáticamente cada
          vez que asignas una plataforma a mano, pero también puedes agregar o afinar patrones aquí.
        </p>
      </div>

      <FormularioConToast
        action={crearPatron}
        mensajeExito="Patrón guardado"
        className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4"
      >
        <input type="hidden" name="pais_id" value={pais.id} />
        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label className={labelClass}>Texto a buscar</label>
          <input
            type="text"
            name="fragmento"
            required
            placeholder="Ej: TRANSF SINPE DROPI"
            className={fieldClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className={labelClass}>Plataforma</label>
          <select name="plataforma_id" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Selecciona…
            </option>
            {(plataformas ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit">Guardar patrón</Button>
      </FormularioConToast>

      <div className="min-w-0 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[30rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-left text-muted-foreground">
              <th className="py-2 pr-3 pl-4 font-medium">Texto a buscar</th>
              <th className="py-2 pr-3 font-medium">Plataforma</th>
              <th className="py-2 pr-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {(patrones ?? []).map((p) => (
              <tr key={p.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pr-3 pl-4 font-mono text-xs">{p.fragmento}</td>
                <td className="py-2 pr-3">
                  {(p.plataformas as unknown as { nombre: string } | null)?.nombre ?? "—"}
                </td>
                <td className="py-2 pr-3 text-right">
                  <form action={eliminarPatron}>
                    <input type="hidden" name="id" value={p.id} />
                    <Button type="submit" variant="ghost" className="text-xs">
                      Eliminar
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {(patrones ?? []).length === 0 && (
          <EstadoVacio mensaje="Todavía no hay patrones guardados. Asigna una plataforma a un movimiento en Extractos y quedará guardado aquí." />
        )}
      </div>
    </main>
  );
}
