const LogoSVG = ({ className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 360 72"
    fill="none"
    className={className}
  >
    {/* Circle with house icon */}
    <g transform="translate(4, 4)">
      {/* Outer circle */}
      <circle cx="32" cy="32" r="30" stroke="#1B3A4B" strokeWidth="2.2" fill="none" />
      {/* House roof — left slope extends to circle edge */}
      <path d="M8 36L28 16L44 32" stroke="#1B3A4B" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* House body — left wall taller, right wall shorter */}
      <path d="M14 36V50H42V32" stroke="#1B3A4B" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {/* Door (right side) */}
      <rect x="34" y="40" width="6" height="10" stroke="#1B3A4B" strokeWidth="1.8" fill="none" />
    </g>

    {/* Main title: ADUAtlas.com — serif, regular/medium weight */}
    <text
      x="82"
      y="38"
      fontFamily="Georgia, 'Times New Roman', 'Playfair Display', serif"
      fontSize="28"
      fontWeight="500"
      fill="#1B3A4B"
    >
      ADUAtlas.com
    </text>

    {/* Subtitle line 1 — sans-serif, uppercase, wide tracking, centered */}
    <text
      x="150"
      y="52"
      fontFamily="'Montserrat', 'Open Sans', 'Helvetica Neue', Arial, sans-serif"
      fontSize="7"
      fontWeight="400"
      letterSpacing="3.5"
      fill="#1B3A4B"
      textAnchor="middle"
    >
      US ADU LISTINGS
    </text>

    {/* Subtitle line 2 — sans-serif, uppercase, wide tracking, centered */}
    <text
      x="150"
      y="63"
      fontFamily="'Montserrat', 'Open Sans', 'Helvetica Neue', Arial, sans-serif"
      fontSize="7"
      fontWeight="400"
      letterSpacing="3.5"
      fill="#1B3A4B"
      textAnchor="middle"
    >
      ZONING &amp; GUIDELINES
    </text>
  </svg>
);

export default LogoSVG;
