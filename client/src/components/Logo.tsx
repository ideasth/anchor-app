// Buoy logo — life-ring with rope.
//
// Stylised vector mark inspired by /buoy-app-logo.jpg. Transparent background
// so it sits cleanly on any surface (dark sidebar, light header, gradient
// hero). Colours are baked in to match the brand JPEG; pass `className` to
// control size only.
//
// Pass `monochrome` for a single-colour stroke version that picks up
// `currentColor` — useful inside coloured pills or themed chrome.

export function Logo({
  className = "h-6 w-6",
  monochrome = false,
}: {
  className?: string;
  monochrome?: boolean;
}) {
  if (monochrome) {
    return (
      <svg
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Buoy"
        className={className}
      >
        <rect
          x="6"
          y="6"
          width="52"
          height="52"
          rx="14"
          ry="14"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
        <circle
          cx="32"
          cy="32"
          r="17"
          stroke="currentColor"
          strokeWidth="6"
          fill="none"
        />
        <path
          d="M32 11 V18 M32 46 V53 M11 32 H18 M46 32 H53"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // Full-colour brand mark.
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Buoy"
      className={className}
    >
      <defs>
        {/* Ring body: dark green with subtle inner highlight */}
        <radialGradient id="buoy-ring" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stopColor="#4f8275" />
          <stop offset="55%" stopColor="#3a6358" />
          <stop offset="100%" stopColor="#274338" />
        </radialGradient>
        {/* Rope: cream with warm shadow */}
        <linearGradient id="buoy-rope" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f3eadb" />
          <stop offset="100%" stopColor="#bfb29c" />
        </linearGradient>
        {/* Clip the wraps to exactly the ring's body */}
        <mask id="buoy-ring-mask">
          <rect width="64" height="64" fill="black" />
          <circle
            cx="32"
            cy="32"
            r="17"
            stroke="white"
            strokeWidth="10"
            fill="none"
          />
        </mask>
      </defs>

      {/* Rope: rounded-square outline. Solid stroke (continuous), with a
          second offset thinner stroke to imply the twist. */}
      <rect
        x="6.5"
        y="6.5"
        width="51"
        height="51"
        rx="14"
        ry="14"
        stroke="url(#buoy-rope)"
        strokeWidth="3"
        fill="none"
      />
      <rect
        x="6.5"
        y="6.5"
        width="51"
        height="51"
        rx="14"
        ry="14"
        stroke="#8a7d62"
        strokeOpacity="0.35"
        strokeWidth="3"
        strokeDasharray="0.6 1.4"
        fill="none"
      />

      {/* Life-ring body */}
      <circle
        cx="32"
        cy="32"
        r="17"
        stroke="url(#buoy-ring)"
        strokeWidth="10"
        fill="none"
      />

      {/* Four pale wraps at N/E/S/W, masked to ring body so they read as
          bands wrapping around the donut */}
      <g mask="url(#buoy-ring-mask)" fill="#8eb5a3">
        <rect x="28.5" y="11" width="7" height="11" />
        <rect x="28.5" y="42" width="7" height="11" />
        <rect x="11" y="28.5" width="11" height="7" />
        <rect x="42" y="28.5" width="11" height="7" />
      </g>

      {/* Soft top highlight on the ring (sheen) */}
      <path
        d="M19.5 25 A 13 13 0 0 1 44.5 25"
        stroke="#7aa899"
        strokeOpacity="0.45"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
