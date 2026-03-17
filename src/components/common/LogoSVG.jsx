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

      {/* Roof — asymmetric, left overhang extends past house body */}
      <path d="M12 38L30 18L46 38" stroke="#1B3A4B" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* House body — right-aligned under roof, not centered */}
      <path d="M22 38V52H46V38" stroke="#1B3A4B" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

      {/* Left porch support post — vertical line from left roof edge down */}
      <path d="M12 38V48" stroke="#1B3A4B" strokeWidth="2.2" fill="none" strokeLinecap="round" />

      {/* Porch floor connecting post to house */}
      <path d="M12 48H22" stroke="#1B3A4B" strokeWidth="2.2" fill="none" strokeLinecap="round" />

      {/* Door — tall narrow opening on left side of house body */}
      <path d="M26 52V42H32V52" stroke="#1B3A4B" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </g>

    {/* Main title: ADUAtlas.com — serif, medium weight */}
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

    {/* Subtitle line 1 — sans-serif, uppercase, wide tracking, centered under title */}
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

    {/* Subtitle line 2 */}
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
