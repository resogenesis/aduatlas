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
      <path d="M12 38L30 18L46 38" stroke="#8FBFB0" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22 38V52H46V38" stroke="#8FBFB0" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 38V48" stroke="#8FBFB0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M12 48H22" stroke="#8FBFB0" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M26 52V42H32V52" stroke="#8FBFB0" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
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
