import { useEffect, useRef } from "react";
import confetti from "canvas-confetti";

const storageKey = () => `fireworks-${new Date().getFullYear()}-${new Date().getMonth()}`;

export function launch() {
  const fire = (x, angle) =>
    confetti({
      particleCount: 60,
      angle,
      spread: 55,
      origin: { x, y: 0.9 },
      colors: ["#FF007A", "#ff69b4", "#ffb3d1", "#ffffff"],
      startVelocity: 45,
      gravity: 0.8,
      ticks: 200,
    });

  fire(0.2, 60);
  setTimeout(() => fire(0.8, 120), 150);
  setTimeout(() => fire(0.5, 90), 300);
  setTimeout(() => confetti({
    particleCount: 80,
    spread: 100,
    origin: { x: 0.5, y: 0.5 },
    colors: ["#FF007A", "#ff69b4", "#ffb3d1", "#ffffff"],
    startVelocity: 30,
    gravity: 0.6,
    ticks: 250,
  }), 450);
}

export function useFireworks(pct) {
  const prevPct = useRef(pct);

  useEffect(() => {
    const key = storageKey();
    const alreadyShown = localStorage.getItem(key);

    if (pct >= 100 && !alreadyShown) {
      launch();
      localStorage.setItem(key, "1");
    }

    // Déclenche aussi si on passe le seuil en direct (nouvelle séance saisie)
    if (pct >= 100 && prevPct.current < 100) {
      launch();
      localStorage.setItem(key, "1");
    }

    prevPct.current = pct;
  }, [pct]);
}
