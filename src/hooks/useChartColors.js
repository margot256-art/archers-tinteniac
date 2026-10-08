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
    text:    dark ? "#f1efec" : "#1d1b16",
    text2:   dark ? "#d6d4d0" : "#38352c",
    muted:   dark ? "#8d8b8f" : "#716c5c",
    dim:     dark ? "#6c6a70" : "#9a9480",
    grid:    dark ? "#2c2c33" : "#e1dbc8",
    theme,
  };
}
