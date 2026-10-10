"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { NormBox } from "@/lib/cv/types";
import type { TapResult } from "@/lib/game/types";

export interface StageMarker {
  /** Natural image pixels. */
  x: number;
  y: number;
  result: TapResult;
}

interface ImageStageProps {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** Transparent overlay with the same size as the image, for example the heatmap. */
  overlaySrc?: string | null;
  /** When set, a tap or Enter reports a point in natural image pixels. */
  onPick?: (x: number, y: number) => void;
  markers?: readonly StageMarker[];
  /** Outline of the changed region, shown on the reveal. */
  box?: NormBox | null;
  loupe?: boolean;
  className?: string;
  /** Extra controls rendered in the toolbar next to the zoom buttons. */
  toolbar?: React.ReactNode;
}

interface View {
  scale: number;
  tx: number;
  ty: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 6;
const TAP_SLOP = 8;
const LOUPE_SIZE = 148;
const LOUPE_ZOOM = 3;

function clampView(view: View, w: number, h: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale));
  return {
    scale,
    tx: Math.min(0, Math.max(w * (1 - scale), view.tx)),
    ty: Math.min(0, Math.max(h * (1 - scale), view.ty)),
  };
}

const MARKER_STYLE: Record<TapResult, string> = {
  hit: "border-real bg-real/25",
  close: "border-[#b7791f] bg-[#b7791f]/20",
  miss: "border-edited bg-edited/20",
};

/**
 * The image viewer used for hunting and for the reveal: wheel, pinch and button zoom,
 * drag to pan, tap or Enter to pick a point, an optional 3x loupe, and a keyboard crosshair.
 */
export function ImageStage({
  src,
  width,
  height,
  alt,
  overlaySrc,
  onPick,
  markers = [],
  box,
  loupe = false,
  className = "",
  toolbar,
}: ImageStageProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, tx: 0, ty: 0 });
  const viewRef = useRef(view);
  const [cross, setCross] = useState<{ x: number; y: number } | null>(null);
  const [lens, setLens] = useState<{ cx: number; cy: number; nx: number; ny: number } | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startX: number;
    startY: number;
    moved: boolean;
    pinch: { distance: number; scale: number } | null;
    multi: boolean;
  } | null>(null);

  const apply = useCallback((next: View) => {
    const frame = frameRef.current;
    const clamped = frame ? clampView(next, frame.clientWidth, frame.clientHeight) : next;
    viewRef.current = clamped;
    setView(clamped);
  }, []);

  /** Zooms around a point given in frame coordinates. */
  const zoomAt = useCallback(
    (factor: number, fx: number, fy: number) => {
      const v = viewRef.current;
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
      const k = scale / v.scale;
      apply({ scale, tx: fx - (fx - v.tx) * k, ty: fy - (fy - v.ty) * k });
    },
    [apply],
  );

  const zoomCenter = useCallback(
    (factor: number) => {
      const frame = frameRef.current;
      if (frame) zoomAt(factor, frame.clientWidth / 2, frame.clientHeight / 2);
    },
    [zoomAt],
  );

  // The wheel listener must be non-passive to stop the page from scrolling while zooming.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      zoomAt(Math.exp(-event.deltaY * 0.0018), event.clientX - rect.left, event.clientY - rect.top);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Keep the view inside the frame when the layout changes.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      setSize({ w: frame.clientWidth, h: frame.clientHeight });
      apply(viewRef.current);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [apply]);

  /** Frame coordinates to natural image pixels, accounting for zoom and pan. */
  const toNatural = useCallback(
    (clientX: number, clientY: number) => {
      const frame = frameRef.current;
      if (!frame) return null;
      const rect = frame.getBoundingClientRect();
      const v = viewRef.current;
      const x = ((clientX - rect.left - v.tx) / v.scale / rect.width) * width;
      const y = ((clientY - rect.top - v.ty) / v.scale / rect.height) * height;
      if (x < 0 || y < 0 || x > width || y > height) return null;
      return { x, y, fx: clientX - rect.left, fy: clientY - rect.top };
    },
    [width, height],
  );

  const updateLens = (event: PointerEvent) => {
    if (!loupe) return;
    const point = toNatural(event.clientX, event.clientY);
    setLens(point ? { cx: point.fx, cy: point.fy, nx: point.x, ny: point.y } : null);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) {
      gesture.current = { startX: event.clientX, startY: event.clientY, moved: false, pinch: null, multi: false };
    } else if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = Array.from(pointers.current.values());
      gesture.current.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale: viewRef.current.scale };
      gesture.current.multi = true;
      setLens(null);
    }
    setCross(null);
    updateLens(event);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) {
      // Hovering with a mouse: only the loupe follows.
      if (event.pointerType === "mouse") updateLens(event);
      return;
    }
    const g = gesture.current;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (!g) return;

    if (pointers.current.size >= 2 && g.pinch) {
      const frame = frameRef.current;
      if (!frame) return;
      const [a, b] = Array.from(pointers.current.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const rect = frame.getBoundingClientRect();
      const target = g.pinch.scale * (distance / Math.max(1, g.pinch.distance));
      zoomAt(target / viewRef.current.scale, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      return;
    }

    if (!g.moved && Math.hypot(event.clientX - g.startX, event.clientY - g.startY) > TAP_SLOP) g.moved = true;
    if (g.moved && viewRef.current.scale > 1) {
      const v = viewRef.current;
      apply({ scale: v.scale, tx: v.tx + event.clientX - previous.x, ty: v.ty + event.clientY - previous.y });
      setLens(null);
    } else {
      updateLens(event);
    }
  };

  const endPointer = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    const g = gesture.current;
    if (pointers.current.size > 0) return;
    gesture.current = null;
    if (event.pointerType !== "mouse") setLens(null);
    if (!g || cancelled || g.moved || g.multi || !onPick) return;
    const point = toNatural(event.clientX, event.clientY);
    if (point) onPick(point.x, point.y);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const stepX = (event.shiftKey ? 0.005 : 0.02) * width;
    const stepY = (event.shiftKey ? 0.005 : 0.02) * height;
    const at = cross ?? { x: width / 2, y: height / 2 };
    const move = (dx: number, dy: number) => {
      event.preventDefault();
      const next = {
        x: Math.min(width, Math.max(0, at.x + dx)),
        y: Math.min(height, Math.max(0, at.y + dy)),
      };
      setCross(next);
      // Pan so the crosshair stays visible while zoomed in.
      const frame = frameRef.current;
      if (frame && viewRef.current.scale > 1) {
        const v = viewRef.current;
        const fx = (next.x / width) * frame.clientWidth * v.scale + v.tx;
        const fy = (next.y / height) * frame.clientHeight * v.scale + v.ty;
        const margin = 40;
        let { tx, ty } = v;
        if (fx < margin) tx += margin - fx;
        if (fx > frame.clientWidth - margin) tx -= fx - (frame.clientWidth - margin);
        if (fy < margin) ty += margin - fy;
        if (fy > frame.clientHeight - margin) ty -= fy - (frame.clientHeight - margin);
        apply({ scale: v.scale, tx, ty });
      }
    };
    switch (event.key) {
      case "ArrowLeft":
        return move(-stepX, 0);
      case "ArrowRight":
        return move(stepX, 0);
      case "ArrowUp":
        return move(0, -stepY);
      case "ArrowDown":
        return move(0, stepY);
      case "Enter":
      case " ":
        if (!onPick) return;
        event.preventDefault();
        setCross(at);
        onPick(at.x, at.y);
        return;
      case "+":
      case "=":
        event.preventDefault();
        return zoomCenter(1.4);
      case "-":
        event.preventDefault();
        return zoomCenter(1 / 1.4);
      case "0":
        event.preventDefault();
        return apply({ scale: 1, tx: 0, ty: 0 });
    }
  };

  const frameW = size.w;
  const frameH = size.h;
  const inverse = 1 / view.scale;
  const zoomed = view.scale > 1.001;

  return (
    <div className={className}>
      <div
        ref={frameRef}
        role="group"
        tabIndex={0}
        aria-label={
          onPick
            ? `${alt}. Use the arrow keys to move the crosshair and Enter to guess. Plus and minus zoom.`
            : `${alt}. Plus and minus zoom, arrow keys move the crosshair.`
        }
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => endPointer(event, false)}
        onPointerCancel={(event) => endPointer(event, true)}
        onPointerLeave={() => {
          if (pointers.current.size === 0) setLens(null);
        }}
        onBlur={() => setCross(null)}
        className={`relative w-full touch-none select-none overflow-hidden border border-line bg-paper-deep ${
          onPick ? "cursor-crosshair" : zoomed ? "cursor-grab" : "cursor-default"
        }`}
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        <div
          className="absolute left-0 top-0 h-full w-full origin-top-left will-change-transform"
          style={{ transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.scale})` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} draggable={false} className="pointer-events-none block h-full w-full" />
          {overlaySrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={overlaySrc}
              alt=""
              draggable={false}
              className="fade-in pointer-events-none absolute inset-0 h-full w-full"
            />
          ) : null}
          {box ? (
            <div
              aria-hidden
              className="pointer-events-none absolute border-edited"
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.w * 100}%`,
                height: `${box.h * 100}%`,
                borderWidth: `${2 * inverse}px`,
                outline: `${1 * inverse}px solid rgba(255,255,255,0.85)`,
              }}
            />
          ) : null}
          {markers.map((marker, index) => (
            <div
              key={`${marker.x}-${marker.y}-${index}`}
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: `${(marker.x / width) * 100}%`,
                top: `${(marker.y / height) * 100}%`,
                transform: `translate(-50%, -50%) scale(${inverse})`,
              }}
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 ${MARKER_STYLE[marker.result]}`}
              >
                <span className="mono text-[11px] font-semibold text-ink">{index + 1}</span>
              </div>
            </div>
          ))}
          {cross ? (
            <div
              aria-hidden
              className="pointer-events-none absolute"
              style={{
                left: `${(cross.x / width) * 100}%`,
                top: `${(cross.y / height) * 100}%`,
                transform: `translate(-50%, -50%) scale(${inverse})`,
              }}
            >
              <div className="relative h-10 w-10">
                <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-ink outline outline-1 outline-white" />
                <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-ink outline outline-1 outline-white" />
              </div>
            </div>
          ) : null}
        </div>

        {loupe && lens && frameW > 0 ? (
          <div
            aria-hidden
            className="pointer-events-none absolute z-10 rounded-full border-2 border-ink bg-paper-deep shadow-[0_2px_10px_rgba(0,0,0,0.35)]"
            style={{
              width: LOUPE_SIZE,
              height: LOUPE_SIZE,
              left: Math.min(frameW - LOUPE_SIZE - 4, Math.max(4, lens.cx - LOUPE_SIZE / 2)),
              // Above the finger when there is room, otherwise below it.
              top: lens.cy > LOUPE_SIZE + 36 ? lens.cy - LOUPE_SIZE - 28 : Math.min(frameH - LOUPE_SIZE - 4, lens.cy + 28),
              backgroundImage: `url("${src}")`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${frameW * view.scale * LOUPE_ZOOM}px ${frameH * view.scale * LOUPE_ZOOM}px`,
              backgroundPosition: `${LOUPE_SIZE / 2 - (lens.nx / width) * frameW * view.scale * LOUPE_ZOOM}px ${
                LOUPE_SIZE / 2 - (lens.ny / height) * frameH * view.scale * LOUPE_ZOOM
              }px`,
            }}
          >
            <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-ink/70" />
            <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-ink/70" />
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center" role="group" aria-label="Zoom">
          <button type="button" className="btn btn-quiet w-11 px-0" onClick={() => zoomCenter(1 / 1.5)} disabled={!zoomed} aria-label="Zoom out">
            <span aria-hidden className="text-lg leading-none">&minus;</span>
          </button>
          <span className="mono w-14 border-y border-line py-[11px] text-center text-sm" aria-live="off">
            {Math.round(view.scale * 100)}%
          </span>
          <button
            type="button"
            className="btn btn-quiet w-11 px-0"
            onClick={() => zoomCenter(1.5)}
            disabled={view.scale >= MAX_SCALE - 0.001}
            aria-label="Zoom in"
          >
            <span aria-hidden className="text-lg leading-none">+</span>
          </button>
        </div>
        <button type="button" className="btn btn-quiet" onClick={() => apply({ scale: 1, tx: 0, ty: 0 })} disabled={!zoomed}>
          Fit
        </button>
        {toolbar}
      </div>
    </div>
  );
}
