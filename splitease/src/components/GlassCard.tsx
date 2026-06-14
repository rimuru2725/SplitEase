"use client";

import { useRef, useState, type ReactNode, type MouseEvent } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  variant?: "default" | "elevated" | "interactive";
  tilt?: boolean;
  glow?: boolean;
  onClick?: () => void;
}

export default function GlassCard({
  children,
  className = "",
  variant = "default",
  tilt = false,
  glow = false,
  onClick,
}: GlassCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("");

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!tilt || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -6;
    const rotateY = ((x - centerX) / centerX) * 6;

    setTransform(`perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`);
  };

  const handleMouseLeave = () => {
    if (!tilt) return;
    setTransform("");
  };

  const baseClasses =
    variant === "elevated"
      ? "glass-elevated"
      : variant === "interactive"
      ? "glass glass-interactive"
      : "glass";

  return (
    <div
      ref={cardRef}
      className={`rounded-2xl relative overflow-hidden noise-overlay ${baseClasses} ${glow ? "glow-border" : ""} ${className}`}
      style={{
        transform: transform || undefined,
        transition: "transform 0.25s ease-out, border-color 0.3s ease",
        willChange: tilt ? "transform" : undefined,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
