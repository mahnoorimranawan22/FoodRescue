import { useEffect, useRef, useState } from "react";

/**
 * <Reveal> — fades/slides children in when they enter the viewport.
 * Direction variants: up (default), left, right, scale. Stagger with `delay` (ms).
 *
 * Robustness: if IntersectionObserver never fires (backgrounded tab, throttled
 * frame loop, or exotic scroll containers), a requestAnimationFrame + timeout
 * fallback still reveals the content — the animation is progressive
 * enhancement, never a gate on visibility.
 */
export default function Reveal({
  children,
  variant = "up",
  delay = 0,
  className = "",
  as: Tag = "div",
}) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      setVisible(true); // SSR / very old browsers
      return undefined;
    }

    // Hidden documents (background tabs, print, embedded webviews) get no
    // entrance animation — content is simply there when the tab becomes
    // visible. Animations only matter to someone who can see them.
    if (document.visibilityState === "hidden") {
      setVisible(true);
      return undefined;
    }

    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setVisible(true);
      observer.disconnect();
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) settle();
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    observer.observe(node);

    // Fallback 1: on each rendered frame, check geometry directly. Catches
    // environments where observer callbacks are starved but rAF still runs.
    let rafId = 0;
    const tick = () => {
      const rect = node.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) settle();
      else rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    // Fallback 2: absolute failsafe — reveal after 2.5s no matter what.
    const failsafe = setTimeout(settle, 2500);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafId);
      clearTimeout(failsafe);
    };
  }, []);

  const variantClass =
    variant === "left"
      ? "reveal-left"
      : variant === "right"
        ? "reveal-right"
        : variant === "scale"
          ? "reveal-scale"
          : "";

  return (
    <Tag
      ref={ref}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={`reveal ${variantClass} ${visible ? "is-visible" : ""} ${className}`
        .trim()
        .replace(/\s+/g, " ")}
    >
      {children}
    </Tag>
  );
}
