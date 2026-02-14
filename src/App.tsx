import { useMemo, useState } from "react";
import type { Bar } from "./gantt/core/data.ts";
import { GanttChart } from "./gantt/react/GanttChart.tsx";
import { generateMockBars } from "./mock/data.ts";

const BAR_COUNT = 400_000;

export default function App() {
  const bars = useMemo(() => generateMockBars(BAR_COUNT), []);
  const [info, setInfo] = useState(`Rendering ${BAR_COUNT.toLocaleString()} bars — drag to zoom`);

  const formatTooltip = useMemo(
    () => (bar: Bar) => {
      const fmt = (ms: number) =>
        new Date(ms).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
      return `${bar.label} | ${fmt(bar.start)} — ${fmt(bar.end)}`;
    },
    [],
  );

  const onBarClick = useMemo(
    () => (bar: Bar, idx: number) => {
      setInfo(`Clicked: ${bar.label} (index ${idx})`);
    },
    [],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", padding: 20 }}>
      <GanttChart bars={bars} onBarClick={onBarClick} formatTooltip={formatTooltip} />
      <div style={{ paddingTop: 6, fontSize: 12, color: "#666" }}>{info}</div>
    </div>
  );
}
