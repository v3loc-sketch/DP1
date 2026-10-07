import { ProductSpin360, frameUrls } from './components/ProductSpin360';

// Demo page. `?mode=images` forces the image-sequence fallback.
const params = new URLSearchParams(window.location.search);
const mode = (params.get('mode') as 'auto' | '3d' | 'images') || 'auto';
const frames = frameUrls('/spin/frame_', 72);

export default function App() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22 }}>6-Slot Watch Box – Green Aluminium</h1>
      <ProductSpin360
        alt="6-slot watch box with glass lid, green ribbed aluminium and green velvet interior"
        src="/models/watch-box.glb"
        iosSrc="/models/watch-box.usdz"
        poster="/spin/poster.webp"
        frames={frames}
        mode={mode}
        style={{ borderRadius: 12, border: '1px solid #eee' }}
      />
      <p style={{ color: '#555', lineHeight: 1.6 }}>
        Drag to rotate, pinch or scroll to zoom, tap the button to open the lid. On phones, vertical swipes keep
        scrolling the page.
      </p>
      <div style={{ height: 1200, background: 'linear-gradient(#fafafa,#fff)' }} />
    </main>
  );
}
