import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { ImageSequenceSpin } from './ImageSequenceSpin';

export type ProductSpin360Props = {
  /** GLB url (local /models/watch-box.glb or a Shopify Model3d source url). */
  src?: string;
  /** USDZ url for iPhone/iPad AR Quick Look. Optional: model-viewer can generate one. */
  iosSrc?: string;
  /** Poster image shown while the model loads (and as the fallback's first frame). */
  poster?: string;
  /** Fallback image sequence (e.g. 72 frames). */
  frames?: string[];
  alt: string;
  /** auto = 3D when WebGL works and the model loads, otherwise the image sequence. */
  mode?: 'auto' | '3d' | 'images';
  autoRotate?: boolean;
  /** Animation clip names baked into the GLB. */
  openClip?: string;
  closeClip?: string;
  openLabel?: string;
  closeLabel?: string;
  arLabel?: string;
  className?: string;
  style?: CSSProperties;
};

type ModelViewerElement = HTMLElement & {
  animationName: string;
  currentTime: number;
  canActivateAR: boolean;
  play: (opts?: { repetitions?: number; pingpong?: boolean }) => void;
  updateComplete: Promise<unknown>;
  pause: () => void;
  availableAnimations: string[];
};

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function ProductSpin360({
  src = '/models/watch-box.glb',
  iosSrc = '/models/watch-box.usdz',
  poster = '/spin/poster.webp',
  frames,
  alt,
  mode = 'auto',
  autoRotate = true,
  openClip = 'OpenLid',
  closeClip = 'CloseLid',
  openLabel = 'Tap to open lid',
  closeLabel = 'Close lid',
  arLabel = 'View in your room',
  className,
  style,
}: ProductSpin360Props) {
  const [use3d, setUse3d] = useState(mode !== 'images');
  const [ready, setReady] = useState(false);
  const [lidOpen, setLidOpen] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [progress, setProgress] = useState(0);
  const mvRef = useRef<ModelViewerElement | null>(null);
  const unlockTimer = useRef<number>(undefined);

  // Load the web component lazily, only when 3D is actually used.
  useEffect(() => {
    if (mode === 'images') return;
    if (mode === 'auto' && !webglAvailable()) {
      setUse3d(false);
      return;
    }
    let cancelled = false;
    import('@google/model-viewer').catch(() => {
      if (!cancelled && mode === 'auto') setUse3d(false);
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  useEffect(() => {
    const mv = mvRef.current;
    if (!mv || !use3d) return;
    const onLoad = () => setReady(true);
    const onError = () => {
      if (mode === 'auto' && frames?.length) setUse3d(false);
    };
    const onProgress = (e: Event) => setProgress((e as CustomEvent<{ totalProgress: number }>).detail.totalProgress);
    const onFinished = () => setAnimating(false);
    mv.addEventListener('load', onLoad);
    mv.addEventListener('error', onError);
    mv.addEventListener('progress', onProgress);
    mv.addEventListener('finished', onFinished);
    return () => {
      mv.removeEventListener('load', onLoad);
      mv.removeEventListener('error', onError);
      mv.removeEventListener('progress', onProgress);
      mv.removeEventListener('finished', onFinished);
    };
  }, [use3d, mode, frames]);

  const toggleLid = useCallback(async () => {
    const mv = mvRef.current;
    if (!mv || animating) return;
    const clip = lidOpen ? closeClip : openClip;
    if (mv.availableAnimations && !mv.availableAnimations.includes(clip)) return;
    setAnimating(true);
    setLidOpen(!lidOpen);
    mv.animationName = clip;
    // Changing animationName is applied in model-viewer's async update, which
    // restarts the clip looping forever; wait for it, then play exactly once
    // (repetitions: 1 holds the last frame).
    await mv.updateComplete;
    mv.currentTime = 0;
    mv.play({ repetitions: 1 });
    // safety net in case the 'finished' event is missed (clip is 1.5 s)
    window.clearTimeout(unlockTimer.current);
    unlockTimer.current = window.setTimeout(() => setAnimating(false), 2500);
  }, [animating, lidOpen, openClip, closeClip]);

  useEffect(() => () => window.clearTimeout(unlockTimer.current), []);

  const rootStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    aspectRatio: '1 / 1',
    background: '#ffffff',
    overflow: 'hidden',
    ...style,
  };

  if (!use3d) {
    return (
      <div className={className} style={rootStyle}>
        {frames?.length ? (
          <ImageSequenceSpin frames={frames} alt={alt} autoRotate={autoRotate} poster={poster} />
        ) : (
          <img src={poster} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
      </div>
    );
  }

  return (
    <div className={className} style={rootStyle}>
      <model-viewer
        ref={mvRef as never}
        src={src}
        ios-src={iosSrc}
        poster={poster}
        alt={alt}
        loading="eager"
        reveal="auto"
        camera-controls=""
        // horizontal drags rotate, vertical swipes keep scrolling the page
        touch-action="pan-y"
        auto-rotate={autoRotate ? '' : undefined}
        auto-rotate-delay="2500"
        rotation-per-second="14deg"
        interaction-prompt="none"
        camera-orbit="-32deg 68deg auto"
        min-camera-orbit="auto 10deg auto"
        max-camera-orbit="auto 95deg auto"
        field-of-view="24deg"
        min-field-of-view="10deg"
        max-field-of-view="32deg"
        shadow-intensity="0.7"
        shadow-softness="1"
        exposure="1.05"
        tone-mapping="neutral"
        environment-image="neutral"
        ar=""
        ar-modes="webxr scene-viewer quick-look"
        ar-scale="fixed"
        style={{ width: '100%', height: '100%', background: '#ffffff', ['--poster-color' as string]: '#ffffff' }}
      >
        <button slot="ar-button" style={pill('left')} type="button">
          {arLabel}
        </button>
        <div slot="progress-bar" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'transparent' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.round(progress * 100)}%`,
              background: '#1f4a3e',
              opacity: progress >= 1 ? 0 : 1,
              transition: 'width .2s, opacity .4s',
            }}
          />
        </div>
      </model-viewer>
      {ready && (
        <button type="button" onClick={toggleLid} disabled={animating} aria-pressed={lidOpen} style={pill('right')}>
          {lidOpen ? closeLabel : openLabel}
        </button>
      )}
    </div>
  );
}

function pill(side: 'left' | 'right'): CSSProperties {
  return {
    position: 'absolute',
    bottom: 16,
    [side]: 16,
    padding: '10px 16px',
    borderRadius: 999,
    border: '1px solid rgba(0,0,0,.12)',
    background: 'rgba(255,255,255,.92)',
    color: '#111',
    font: '500 14px/1 system-ui, sans-serif',
    cursor: 'pointer',
    boxShadow: '0 2px 8px rgba(0,0,0,.08)',
    zIndex: 2,
  };
}

export default ProductSpin360;
