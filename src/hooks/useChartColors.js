import { useState, useEffect } from "react";

function readTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function useChartColors() {
  const [theme, setTheme] = useState(readTheme);

  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  const dark = theme !== "light";
  return {
    text:    dark ? "#e8e8e8" : "#1a1a1a",
    text2:   dark ? "#d0d0d0" : "#444444",
    muted:   dark ? "#888888" : "#777777",
    dim:     dark ? "#666666" : "#999999",
    grid:    dark ? "#2a2a2a" : "#e0e0e0",
    theme,
  };
}
