import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

type Props = {
  frames: string[];
  alt: string;
  poster?: string;
  autoRotate?: boolean;
  /** pixels of horizontal drag per frame step */
  pixelsPerFrame?: number;
  /** milliseconds per frame while auto-rotating */
  autoRotateInterval?: number;
};

/**
 * Drag-to-spin viewer for a pre-rendered turntable (e.g. 72 frames, 5° apart).
 * touch-action: pan-y keeps vertical page scrolling working on phones; only
 * horizontal drags turn the product.
 */
export function ImageSequenceSpin({
  frames,
  alt,
  poster,
  autoRotate = true,
  pixelsPerFrame = 8,
  autoRotateInterval = 110,
}: Props) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const drag = useRef<{ x: number; start: number; id: number } | null>(null);
  const n = frames.length;

  // Preload every frame (decoded images stay in the browser cache).
  useEffect(() => {
    let alive = true;
    setLoaded(0);
    const imgs = frames.map((f) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = img.onerror = () => alive && setLoaded((c) => c + 1);
      img.src = f;
      return img;
    });
    return () => {
      alive = false;
      imgs.forEach((i) => (i.onload = i.onerror = null));
    };
  }, [frames]);

  const allLoaded = loaded >= n;

  useEffect(() => {
    if (!autoRotate || interacted || !allLoaded) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % n), autoRotateInterval);
    return () => window.clearInterval(t);
  }, [autoRotate, interacted, allLoaded, n, autoRotateInterval]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    setInteracted(true);
    drag.current = { x: e.clientX, start: index, id: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 4 && !e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    const step = Math.round(dx / pixelsPerFrame); // drag right -> front turns right
    setIndex((((d.start + step) % n) + n) % n);
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      setInteracted(true);
      setIndex((i) => (i + (e.key === 'ArrowRight' ? 1 : -1) + n) % n);
    }
  };

  return (
    <div
      role="img"
      aria-label={`${alt} – 360° view, drag or use arrow keys to rotate`}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        touchAction: 'pan-y',
        cursor: drag.current ? 'grabbing' : 'grab',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        background: '#ffffff',
      }}
    >
      <img
        src={allLoaded ? frames[index] : poster || frames[0]}
        alt={alt}
        draggable={false}
        style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
      />
      {!allLoaded && (
        <div style={{ position: 'absolute', left: 0, bottom: 0, height: 3, width: `${(loaded / n) * 100}%`, background: '#1f4a3e', transition: 'width .2s' }} />
      )}
    </div>
  );
}

/** Builds ['/spin/frame_000.webp', ...] */
export function frameUrls(base = '/spin/frame_', count = 72, ext = '.webp', pad = 3) {
  return Array.from({ length: count }, (_, i) => `${base}${String(i).padStart(pad, '0')}${ext}`);
}
