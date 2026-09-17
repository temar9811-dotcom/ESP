// ui/src/components/global/OceanWaves.jsx
// VERSION: 1.0
// Reusable layered SVG wave background (kick-mrchi theme only; inert everywhere else).
export default function OceanWaves() {
  return (
    <div className="ocean-waves" aria-hidden="true">
      <div className="wave wave-1"></div>
      <div className="wave wave-2"></div>
      <div className="wave wave-3"></div>
      <div className="wave wave-4"></div>
      <div className="wave-shade"></div>
    </div>
  );
}