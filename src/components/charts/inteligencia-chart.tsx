"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { etiquetaMes, type PuntoMensual } from "@/lib/inteligencia/agregados";

export function InteligenciaChart({ datos, nombreSerie }: { datos: PuntoMensual[]; nombreSerie: string }) {
  const datosConEtiqueta = datos.map((p) => ({ ...p, etiqueta: etiquetaMes(p.mes) }));

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={datosConEtiqueta} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="etiqueta"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
        />
        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          formatter={(value) => [Number(value).toLocaleString("es"), nombreSerie]}
        />
        <Line type="monotone" dataKey="valor" name={nombreSerie} stroke="var(--accent)" strokeWidth={2} dot />
      </LineChart>
    </ResponsiveContainer>
  );
}
