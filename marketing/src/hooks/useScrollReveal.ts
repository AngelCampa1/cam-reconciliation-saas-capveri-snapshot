"use client";

import { useEffect, useRef } from "react";

interface UseScrollRevealOptions {
  threshold?: number;
  rootMargin?: string;
}

export function useScrollReveal(
  containerRef: React.RefObject<Element | null>,
  options: UseScrollRevealOptions = {},
): void {
  const { threshold = 0.1, rootMargin = "0px 0px -50px 0px" } = options;
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const elements =
      container.querySelectorAll<HTMLElement>(".animate-on-scroll");
    if (elements.length === 0) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observerRef.current?.unobserve(entry.target);
          }
        });
      },
      { threshold, rootMargin },
    );

    elements.forEach((el) => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
    };
  }, [containerRef, threshold, rootMargin]);
}
