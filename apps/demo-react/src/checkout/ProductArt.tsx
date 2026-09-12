// Flat isometric product box, drawn inline so the page makes no image requests.
export function ProductArt() {
  return (
    <svg className="product-art" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <g transform="translate(0 -3)">
        <ellipse cx="60" cy="106" rx="38" ry="6" fill="#18181b" opacity="0.08" />
        <path d="M60 24 100 44 60 64 20 44Z" fill="#3f3f46" />
        <path d="M20 44 60 64v36L20 80Z" fill="#27272a" />
        <path d="M60 64 100 44v36L60 100Z" fill="#18181b" />
        <path d="M42.4 32.8 82.4 52.8 77.6 55.2 37.6 35.2Z" fill="#f4f4f5" />
        <path d="M77.6 32.8 82.4 35.2 42.4 55.2 37.6 52.8Z" fill="#f4f4f5" />
        <path d="M37.6 52.8 42.4 55.2v36l-4.8-2.4Z" fill="#d4d4d8" />
        <path d="M77.6 55.2 82.4 52.8v36l-4.8 2.4Z" fill="#a1a1aa" />
      </g>
    </svg>
  );
}
