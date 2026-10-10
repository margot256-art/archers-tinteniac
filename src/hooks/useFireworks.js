import confetti from "canvas-confetti";

// Feu d'artifice (record battu, objectif de volume atteint) — voir Celebrations.jsx.
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
