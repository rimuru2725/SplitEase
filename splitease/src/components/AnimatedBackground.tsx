"use client";

export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {/* Primary gradient orbs */}
      <div
        className="absolute w-[600px] h-[600px] rounded-full animate-orb-1"
        style={{
          top: "-10%",
          left: "-5%",
          background: "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />
      <div
        className="absolute w-[500px] h-[500px] rounded-full animate-orb-2"
        style={{
          bottom: "-15%",
          right: "-8%",
          background: "radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)",
          filter: "blur(80px)",
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full animate-orb-1"
        style={{
          top: "40%",
          right: "20%",
          background: "radial-gradient(circle, rgba(192,132,252,0.06) 0%, transparent 70%)",
          filter: "blur(100px)",
          animationDelay: "-10s",
        }}
      />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
          backgroundSize: "64px 64px",
        }}
      />

      {/* Floating particle dots */}
      {Array.from({ length: 20 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: `${Math.random() * 3 + 1}px`,
            height: `${Math.random() * 3 + 1}px`,
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            background: `rgba(${130 + Math.random() * 60}, ${100 + Math.random() * 60}, 248, ${0.15 + Math.random() * 0.2})`,
            animation: `particle-drift ${15 + Math.random() * 20}s linear infinite`,
            animationDelay: `-${Math.random() * 20}s`,
          }}
        />
      ))}

      {/* Vignette overlay */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(6,6,14,0.4) 100%)",
        }}
      />
    </div>
  );
}
