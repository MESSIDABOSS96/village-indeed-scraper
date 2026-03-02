"use client";

import { useState, useEffect } from "react";

const TITLE = "Jackson's Indeed Scraper";

export default function Header({ onReset }: { onReset?: () => void }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount < TITLE.length) {
      const timeout = setTimeout(() => {
        setVisibleCount((c) => c + 1);
      }, 60);
      return () => clearTimeout(timeout);
    }
  }, [visibleCount]);

  return (
    <header className="pt-10 pb-6 px-6">
      <h1
        className={`text-5xl font-bold text-white text-center tracking-tight ${onReset ? "cursor-pointer hover:text-gray-200 transition-colors" : ""}`}
        onClick={onReset}
      >
        {TITLE.split("").map((char, i) => (
          <span
            key={i}
            className="inline-block transition-all duration-300"
            style={{
              opacity: i < visibleCount ? 1 : 0,
              transform: i < visibleCount ? "translateY(0)" : "translateY(12px)",
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
      </h1>
    </header>
  );
}
