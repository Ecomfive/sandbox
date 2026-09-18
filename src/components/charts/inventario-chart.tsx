"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PuntoInventario } from "@/lib/dashboard/queries";

export function InventarioChart({ datos }: { datos: PuntoInventario[] }) {
  return (
    <ResponsiveContainer width="100%" height={340}>
      <LineChart data={datos} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="fecha"
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={{ stroke: "var(--border)" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="entradas" name="Entradas" stroke="var(--success)" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="salidas" name="Salidas" stroke="var(--foreground)" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
