import { useEffect, useRef } from 'react';

interface SpaceBackgroundProps {
  interactive?: boolean;
  density?: 'low' | 'normal' | 'high';
  showGrid?: boolean;
}

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  color: string;
}

interface Meteor {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  alpha: number;
  width: number;
  color: string;
}

interface NebulaCloud {
  x: number;
  y: number;
  radius: number;
  color: string;
  vx: number;
  vy: number;
}

export function SpaceBackground({ interactive = true, density = 'normal', showGrid = true }: SpaceBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', onResize);

    const starCount = density === 'low' ? 70 : density === 'high' ? 240 : 150;
    const colors = ['#ffffff', '#bae6fd', '#fbcfe8', '#a7f3d0', '#fef08a'];

    const stars: Star[] = Array.from({ length: starCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.8 + 0.4,
      speed: Math.random() * 0.25 + 0.05,
      alpha: Math.random() * 0.7 + 0.3,
      twinkleSpeed: Math.random() * 0.03 + 0.01,
      twinklePhase: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const meteors: Meteor[] = [];
    const maxMeteors = 3;

    const clouds: NebulaCloud[] = [
      { x: width * 0.2, y: height * 0.25, radius: Math.max(width, height) * 0.35, color: 'rgba(34, 211, 238, 0.06)', vx: 0.02, vy: 0.01 },
      { x: width * 0.8, y: height * 0.35, radius: Math.max(width, height) * 0.4, color: 'rgba(192, 132, 252, 0.05)', vx: -0.015, vy: 0.02 },
      { x: width * 0.5, y: height * 0.8, radius: Math.max(width, height) * 0.45, color: 'rgba(244, 63, 94, 0.04)', vx: 0.01, vy: -0.01 },
    ];

    let gridOffset = 0;
    let meteorCooldown = 120;
    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = mouseX;
    let targetMouseY = mouseY;

    const onMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      targetMouseX = e.clientX;
      targetMouseY = e.clientY;
    };
    window.addEventListener('mousemove', onMouseMove);

    const spawnMeteor = () => {
      const angle = (Math.random() * 20 + 35) * (Math.PI / 180);
      const startX = Math.random() * width * 1.2 - width * 0.1;
      meteors.push({
        x: startX,
        y: -50,
        length: Math.random() * 120 + 70,
        speed: Math.random() * 8 + 8,
        angle,
        alpha: 1,
        width: Math.random() * 1.5 + 1,
        color: Math.random() > 0.4 ? '#22d3ee' : '#f43f5e',
      });
    };

    const render = () => {
      // Ease mouse
      mouseX += (targetMouseX - mouseX) * 0.05;
      mouseY += (targetMouseY - mouseY) * 0.05;
      const parallaxX = (mouseX / width - 0.5) * 20;
      const parallaxY = (mouseY / height - 0.5) * 20;

      // Deep space clear
      ctx.fillStyle = '#04060e';
      ctx.fillRect(0, 0, width, height);

      // Render subtle nebula clouds
      clouds.forEach((cloud) => {
        cloud.x += cloud.vx;
        cloud.y += cloud.vy;
        if (cloud.x < 0 || cloud.x > width) cloud.vx *= -1;
        if (cloud.y < 0 || cloud.y > height) cloud.vy *= -1;

        const grad = ctx.createRadialGradient(
          cloud.x + parallaxX * 0.5,
          cloud.y + parallaxY * 0.5,
          10,
          cloud.x + parallaxX * 0.5,
          cloud.y + parallaxY * 0.5,
          cloud.radius
        );
        grad.addColorStop(0, cloud.color);
        grad.addColorStop(1, 'rgba(4, 6, 14, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cloud.x + parallaxX * 0.5, cloud.y + parallaxY * 0.5, cloud.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Render subtle tactical grid lines if enabled
      if (showGrid) {
        gridOffset = (gridOffset + 0.15) % 60;
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.025)';
        ctx.lineWidth = 1;

        // Vertical lines
        for (let x = -60 + (gridOffset % 60); x < width + 60; x += 60) {
          ctx.beginPath();
          ctx.moveTo(x + parallaxX * 0.2, 0);
          ctx.lineTo(x + parallaxX * 0.2, height);
          ctx.stroke();
        }

        // Horizontal lines
        for (let y = -60 + (gridOffset % 60); y < height + 60; y += 60) {
          ctx.beginPath();
          ctx.moveTo(0, y + parallaxY * 0.2);
          ctx.lineTo(width, y + parallaxY * 0.2);
          ctx.stroke();
        }

        // Tactical radar rings in center
        ctx.save();
        ctx.translate(width / 2 + parallaxX * 0.4, height / 2 + parallaxY * 0.4);
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.035)';
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(width, height) * 0.42, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(width, height) * 0.24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Render twinkling stars
      stars.forEach((star) => {
        star.y -= star.speed;
        if (star.y < 0) {
          star.y = height;
          star.x = Math.random() * width;
        }

        star.twinklePhase += star.twinkleSpeed;
        const currentAlpha = Math.max(0.1, star.alpha + Math.sin(star.twinklePhase) * 0.35);

        ctx.fillStyle = star.color;
        ctx.globalAlpha = currentAlpha;
        const starX = (star.x + parallaxX * star.speed * 2 + width) % width;
        const starY = (star.y + parallaxY * star.speed * 2 + height) % height;

        ctx.beginPath();
        ctx.arc(starX, starY, star.size, 0, Math.PI * 2);
        ctx.fill();

        // Cross flare on bright stars
        if (star.size > 1.6 && currentAlpha > 0.7) {
          ctx.strokeStyle = star.color;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(starX - 4, starY);
          ctx.lineTo(starX + 4, starY);
          ctx.moveTo(starX, starY - 4);
          ctx.lineTo(starX, starY + 4);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1.0;

      // Spawn meteors occasionally
      meteorCooldown--;
      if (meteorCooldown <= 0 && meteors.length < maxMeteors) {
        spawnMeteor();
        meteorCooldown = Math.floor(Math.random() * 180 + 100);
      }

      // Render meteors
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;
        m.alpha -= 0.012;

        if (m.alpha <= 0 || m.x > width + 100 || m.y > height + 100) {
          meteors.splice(i, 1);
          continue;
        }

        const tailX = m.x - Math.cos(m.angle) * m.length;
        const tailY = m.y - Math.sin(m.angle) * m.length;

        const grad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        grad.addColorStop(0.7, m.color);
        grad.addColorStop(1, '#ffffff');

        ctx.save();
        ctx.strokeStyle = grad;
        ctx.lineWidth = m.width;
        ctx.globalAlpha = m.alpha;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();

        // Glowing head
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.width * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('mousemove', onMouseMove);
    };
  }, [interactive, density, showGrid]);

  return <canvas ref={canvasRef} className="space-background-canvas" aria-hidden="true" />;
}
