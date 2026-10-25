import { useEffect, useRef, useState } from 'react';
import { SHIP_COLORS, SHIP_COLOR_NAMES } from '@lss/shared';
import { soundManager } from '../game/audio/SoundManager.js';

interface ShipHoloPreviewProps {
  onSelectColor?: (index: number) => void;
  initialColorIndex?: number;
}

export function ShipHoloPreview({ onSelectColor, initialColorIndex = 0 }: ShipHoloPreviewProps) {
  const [selectedIdx, setSelectedIdx] = useState(initialColorIndex);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const activeColor = SHIP_COLORS[selectedIdx] ?? '#22d3ee';
  const activeColorName = SHIP_COLOR_NAMES[selectedIdx] ?? 'Cyan';

  const handleColorChange = (idx: number) => {
    setSelectedIdx(idx);
    soundManager.playUiClick();
    onSelectColor?.(idx);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let rotation = 0;
    let pitch = 0.28;
    let hoverOffset = 0;
    const particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string }> = [];

    const dpr = window.devicePixelRatio || 1;
    const width = 240;
    const height = 180;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const render = () => {
      rotation += 0.016;
      hoverOffset = Math.sin(rotation * 2) * 5;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2 + hoverOffset;

      // Hologram pedestal base rings
      ctx.save();
      ctx.translate(cx, height - 26);
      ctx.scale(1, 0.35);

      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.arc(0, 0, 75, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.stroke();

      // Pedestal light beam
      const beamGrad = ctx.createLinearGradient(0, 0, 0, -120);
      beamGrad.addColorStop(0, activeColor);
      beamGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = beamGrad;
      ctx.globalAlpha = 0.08;
      ctx.beginPath();
      ctx.arc(0, 0, 60, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      // Ship 3D projection:
      // A sleek delta-wing interceptor
      // Vertices in 3D: Nose (0, 0, 42), Left Wing (-38, 0, -22), Right Wing (38, 0, -22), Cockpit Crest (0, -16, 8), Engine Center (0, 4, -26)
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);
      const cosP = Math.cos(pitch);
      const sinP = Math.sin(pitch);

      const project = (x: number, y: number, z: number) => {
        // Rotate around Y
        const rx = x * cosR - z * sinR;
        const rz = x * sinR + z * cosR;
        // Pitch around X
        const ry = y * cosP - rz * sinP;
        const rzFinal = y * sinP + rz * cosP;

        const scale = 1.25;
        return {
          x: cx + rx * scale,
          y: cy + ry * scale,
          z: rzFinal,
        };
      };

      const nose = project(0, 0, 36);
      const leftWing = project(-32, 0, -18);
      const rightWing = project(32, 0, -18);
      const cockpit = project(0, -14, 6);
      const engine = project(0, 4, -20);
      const leftFin = project(-16, -10, -20);
      const rightFin = project(16, -10, -20);

      // Spawn thruster particles
      if (Math.random() > 0.3) {
        const pAngle = rotation + Math.PI / 2 + (Math.random() - 0.5) * 0.4;
        particles.push({
          x: engine.x + (Math.random() - 0.5) * 4,
          y: engine.y + (Math.random() - 0.5) * 4,
          vx: Math.cos(pAngle) * (Math.random() * 2 + 1),
          vy: Math.sin(pAngle) * (Math.random() * 2 + 1) + 1.2,
          life: 1,
          maxLife: 24,
          color: activeColor,
        });
      }

      // Render thruster particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1 / p.maxLife;

        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life * 0.7;
        ctx.beginPath();
        ctx.arc(p.x, p.y, (1 - p.life) * 2 + 1, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw ship faces
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = 10;

      // Wing outline
      ctx.beginPath();
      ctx.moveTo(nose.x, nose.y);
      ctx.lineTo(leftWing.x, leftWing.y);
      ctx.lineTo(engine.x, engine.y);
      ctx.lineTo(rightWing.x, rightWing.y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(10, 20, 40, 0.5)';
      ctx.fill();
      ctx.stroke();

      // Top ridge lines to cockpit
      ctx.beginPath();
      ctx.moveTo(nose.x, nose.y);
      ctx.lineTo(cockpit.x, cockpit.y);
      ctx.lineTo(engine.x, engine.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cockpit.x, cockpit.y);
      ctx.lineTo(leftWing.x, leftWing.y);
      ctx.moveTo(cockpit.x, cockpit.y);
      ctx.lineTo(rightWing.x, rightWing.y);
      ctx.stroke();

      // Fins
      ctx.beginPath();
      ctx.moveTo(leftWing.x, leftWing.y);
      ctx.lineTo(leftFin.x, leftFin.y);
      ctx.lineTo(engine.x, engine.y);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(rightWing.x, rightWing.y);
      ctx.lineTo(rightFin.x, rightFin.y);
      ctx.lineTo(engine.x, engine.y);
      ctx.stroke();

      // Glowing Cockpit Core
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.85;
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#ffffff';
      ctx.beginPath();
      ctx.arc(cockpit.x, cockpit.y, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Thruster flame glow
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = 20;
      ctx.fillStyle = activeColor;
      ctx.globalAlpha = 0.7 + Math.sin(rotation * 15) * 0.25;
      ctx.beginPath();
      ctx.arc(engine.x, engine.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;

      animId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animId);
  }, [activeColor]);

  return (
    <div className="ship-holo-card cockpit-panel">
      <div className="ship-holo-canvas-wrapper">
        <canvas ref={canvasRef} className="ship-holo-canvas" />
        <div className="ship-holo-scanlines" />
        <div className="ship-holo-reticle-tl" />
        <div className="ship-holo-reticle-br" />
      </div>

      <div className="ship-holo-name" style={{ color: activeColor }}>
        {activeColorName.toUpperCase()} FIGHTER
      </div>

      <div className="ship-color-palette">
        {SHIP_COLORS.map((hex, i) => (
          <button
            key={hex}
            type="button"
            className={`ship-color-btn ${selectedIdx === i ? 'active' : ''}`}
            style={{ backgroundColor: hex, boxShadow: selectedIdx === i ? `0 0 12px ${hex}` : 'none' }}
            onClick={() => handleColorChange(i)}
            onMouseEnter={() => soundManager.playUiHover()}
            title={SHIP_COLOR_NAMES[i]}
            aria-label={`Select ${SHIP_COLOR_NAMES[i]} ship color`}
          />
        ))}
      </div>
    </div>
  );
}
