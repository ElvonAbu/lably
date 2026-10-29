// First-aid kit used for the scientist marker on the map.
// Self-contained colours (red kit, white cross) so it reads on any map tile.
function FirstAidIcon({ width = 46, height = 42 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width}
      height={height}
      viewBox="0 0 46 42"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="firstAidBody" x1="23" y1="9" x2="23" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF6B63" />
          <stop offset="1" stopColor="#D92D2D" />
        </linearGradient>
      </defs>

      {/* carry handle */}
      <path
        d="M16 11V6.5A2.5 2.5 0 0 1 18.5 4h9A2.5 2.5 0 0 1 30 6.5V11"
        stroke="#fff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 11V6.5A2.5 2.5 0 0 1 18.5 4h9A2.5 2.5 0 0 1 30 6.5V11"
        stroke="#A61E1E"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* case (white outline first so it separates from the map) */}
      <rect x="3" y="10" width="40" height="30" rx="8" fill="#fff" />
      <rect x="4.6" y="11.6" width="36.8" height="26.8" rx="6.6" fill="url(#firstAidBody)" />

      {/* gloss */}
      <path
        d="M10 14.5h18"
        stroke="#fff"
        strokeOpacity=".35"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* cross */}
      <rect x="20" y="16.5" width="6" height="17" rx="1.6" fill="#fff" />
      <rect x="14.5" y="22" width="17" height="6" rx="1.6" fill="#fff" />
    </svg>
  );
}

export default FirstAidIcon;
