const FooterLogoSVG = ({ className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 340 70"
    fill="none"
    className={className}
  >
    {/* Circle with house icon */}
    <g transform="translate(4, 4)">
      <circle cx="31" cy="31" r="29" stroke="#8FBFB0" strokeWidth="2" fill="none" />
      <path d="M14 34L29 19L44 34" stroke="#8FBFB0" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="17" y="34" width="24" height="15" stroke="#8FBFB0" strokeWidth="2" fill="none" />
      <path d="M33 49V39.5C33 38 34.5 36.5 36 36.5C37.5 36.5 39 38 39 39.5V49" stroke="#8FBFB0" strokeWidth="1.8" fill="none" />
      <rect x="21" y="37" width="7" height="5.5" stroke="#8FBFB0" strokeWidth="1.5" fill="none" />
    </g>

    <text x="78" y="36" fontFamily="Georgia, 'Times New Roman', serif" fontSize="26" fontWeight="700" fill="white">
      ADUAtlas.com
    </text>
    <text x="78" y="50" fontFamily="Georgia, 'Times New Roman', serif" fontSize="7.5" fontWeight="400" letterSpacing="3" fill="#B8D4CB">
      US ADU LISTINGS
    </text>
    <text x="78" y="61" fontFamily="Georgia, 'Times New Roman', serif" fontSize="7.5" fontWeight="400" letterSpacing="3" fill="#B8D4CB">
      ZONING &amp; GUIDELINES
    </text>
  </svg>
);

export default FooterLogoSVG;
