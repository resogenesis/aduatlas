const FooterLogoSVG = ({ className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 360 72"
    fill="none"
    className={className}
  >
    {/* Circle with house icon */}
    <g transform="translate(4, 4)">
      <circle cx="32" cy="32" r="30" stroke="#8FBFB0" strokeWidth="2.2" fill="none" />
      <path d="M8 36L28 16L44 32" stroke="#8FBFB0" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14 36V50H42V32" stroke="#8FBFB0" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="34" y="40" width="6" height="10" stroke="#8FBFB0" strokeWidth="1.8" fill="none" />
    </g>

    <text x="82" y="38" fontFamily="Georgia, 'Times New Roman', serif" fontSize="28" fontWeight="500" fill="white">
      ADUAtlas.com
    </text>
    <text x="150" y="52" fontFamily="'Helvetica Neue', Arial, sans-serif" fontSize="7" fontWeight="400" letterSpacing="3.5" fill="#B8D4CB" textAnchor="middle">
      US ADU LISTINGS
    </text>
    <text x="150" y="63" fontFamily="'Helvetica Neue', Arial, sans-serif" fontSize="7" fontWeight="400" letterSpacing="3.5" fill="#B8D4CB" textAnchor="middle">
      ZONING &amp; GUIDELINES
    </text>
  </svg>
);

export default FooterLogoSVG;
