import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useScrollReveal } from "@/hooks/useScrollReveal";

describe("useScrollReveal", () => {
  let observeMock: ReturnType<typeof vi.fn>;
  let unobserveMock: ReturnType<typeof vi.fn>;
  let disconnectMock: ReturnType<typeof vi.fn>;
  let capturedCallback: IntersectionObserverCallback;
  let capturedOptions: IntersectionObserverInit;

  beforeEach(() => {
    observeMock = vi.fn();
    unobserveMock = vi.fn();
    disconnectMock = vi.fn();

    // vi.fn() wraps a regular function (not arrow) so `new` works AND spy assertions work.
    // Use a loose `this` type to avoid DOM interface read-only / exact-signature constraints.
    global.IntersectionObserver = vi.fn(function (
      this: Record<string, unknown>,
      cb: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      capturedCallback = cb;
      capturedOptions = options ?? {};
      this.observe = observeMock;
      this.unobserve = unobserveMock;
      this.disconnect = disconnectMock;
      this.takeRecords = vi.fn();
      this.root = null;
      this.rootMargin = "";
      this.thresholds = [];
    }) as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when containerRef.current is null", () => {
    const ref = { current: null } as React.RefObject<Element | null>;
    renderHook(() => useScrollReveal(ref));
    expect(global.IntersectionObserver).not.toHaveBeenCalled();
  });

  it("does nothing when container has no .animate-on-scroll elements", () => {
    const container = document.createElement("div");
    container.appendChild(document.createElement("p"));
    const ref = { current: container } as React.RefObject<Element | null>;
    renderHook(() => useScrollReveal(ref));
    expect(global.IntersectionObserver).not.toHaveBeenCalled();
  });

  it("creates IntersectionObserver and observes all .animate-on-scroll elements", () => {
    const container = document.createElement("div");
    const el1 = document.createElement("div");
    el1.className = "animate-on-scroll";
    const el2 = document.createElement("div");
    el2.className = "animate-on-scroll";
    container.appendChild(el1);
    container.appendChild(el2);

    const ref = { current: container } as React.RefObject<Element | null>;
    renderHook(() => useScrollReveal(ref));

    expect(global.IntersectionObserver).toHaveBeenCalledOnce();
    expect(observeMock).toHaveBeenCalledTimes(2);
    expect(observeMock).toHaveBeenCalledWith(el1);
    expect(observeMock).toHaveBeenCalledWith(el2);
  });

  it("passes default threshold and rootMargin to IntersectionObserver", () => {
    const container = document.createElement("div");
    const el = document.createElement("div");
    el.className = "animate-on-scroll";
    container.appendChild(el);

    const ref = { current: container } as React.RefObject<Element | null>;
    renderHook(() => useScrollReveal(ref));

    expect(capturedOptions).toEqual({
      threshold: 0.1,
      rootMargin: "0px 0px -50px 0px",
    });
  });

  it("passes custom options to IntersectionObserver", () => {
    const container = document.createElement("div");
    const el = document.createElement("div");
    el.className = "animate-on-scroll";
    container.appendChild(el);

    const ref = { current: container } as React.RefObject<Element | null>;
    renderHook(() =>
      useScrollReveal(ref, { threshold: 0.5, rootMargin: "0px" }),
    );

    expect(capturedOptions).toEqual({ threshold: 0.5, rootMargin: "0px" });
  });

  it("adds is-visible class and unobserves when entry is intersecting", () => {
    const container = document.createElement("div");
    const el = document.createElement("div");
    el.className = "animate-on-scroll";
    container.appendChild(el);

    const ref = { current: container } as React.RefObject<Element | null>;
    renderHook(() => useScrollReveal(ref));

    const entry = {
      isIntersecting: true,
      target: el,
    } as unknown as IntersectionObserverEntry;
    capturedCallback([entry], {} as IntersectionObserver);

    expect(el.classList.contains("is-visible")).toBe(true);
    expect(unobserveMock).toHaveBeenCalledWith(el);
  });

  it("does not add is-visible when entry is not intersecting", () => {
    const container = document.createElement("div");
    const el = document.createElement("div");
    el.className = "animate-on-scroll";
    container.appendChild(el);

    const ref = { current: container } as React.RefObject<Element | null>;
    renderHook(() => useScrollReveal(ref));

    const entry = {
      isIntersecting: false,
      target: el,
    } as unknown as IntersectionObserverEntry;
    capturedCallback([entry], {} as IntersectionObserver);

    expect(el.classList.contains("is-visible")).toBe(false);
    expect(unobserveMock).not.toHaveBeenCalled();
  });

  it("disconnects observer on unmount", () => {
    const container = document.createElement("div");
    const el = document.createElement("div");
    el.className = "animate-on-scroll";
    container.appendChild(el);

    const ref = { current: container } as React.RefObject<Element | null>;
    const { unmount } = renderHook(() => useScrollReveal(ref));
    unmount();

    expect(disconnectMock).toHaveBeenCalledOnce();
  });
});
