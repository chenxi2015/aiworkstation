import React from 'react';

export interface LogoIconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number | string;
}

/**
 * AI Workstation Collector Logo Icon
 * Exact 1:1 reproduction of hero-illustration.svg with right-side ambient shadow/glow.
 */
export const CollectorLogoIcon: React.FC<LogoIconProps> = ({
  className = 'w-5 h-5',
  size,
  ...props
}) => {
  return (
    <svg
      viewBox="25.5 15 71 59"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width={size}
      height={size}
      aria-label="AI Collector Logo"
      role="img"
      {...props}
    >
      <defs>
        <linearGradient id="cloudGradExt" x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#FDBA74" />
          <stop offset="30%" stopColor="#F472B6" />
          <stop offset="65%" stopColor="#A855F7" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
        <filter id="softGlowExt" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Ambient glow / right-side shadow behind cloud */}
      <ellipse
        cx="62"
        cy="42"
        rx="34"
        ry="22"
        fill="url(#cloudGradExt)"
        opacity="0.25"
        filter="url(#softGlowExt)"
      />

      {/* Soft fluffy cloud shape */}
      <path
        d="M40 56 C32 56 26 49.5 26 42 C26 35 31.5 29.5 38.5 28.5 C41 20.5 48 15 57 15 C66.5 15 74.5 21.5 76 30 C79.5 30.5 84 33.5 84 39 C84 45.5 79 51 72.5 51.5"
        fill="url(#cloudGradExt)"
        opacity="0.95"
      />

      {/* Highlight reflections */}
      <circle cx="51" cy="27" r="4" fill="white" opacity="0.9" />
      <circle cx="67" cy="35" r="3" fill="white" opacity="0.85" />

      {/* Stylized floating laptop */}
      <g transform="translate(29, 35)">
        <path
          d="M4 39 L56 39 C58 39 59.5 37.5 58.5 35.5 L56 34 L4 34 L1.5 35.5 C0.5 37.5 2 39 4 39 Z"
          fill="#CBD5E1"
        />
        <path
          d="M9 13 L51 13 C53 13 54.5 14.5 54 16.5 L50 34 L10 34 L6 16.5 C5.5 14.5 7 13 9 13 Z"
          fill="#E2E8F0"
        />
        <path
          d="M12 15.5 L48 15.5 L45 31.5 L15 31.5 Z"
          fill="#94A3B8"
          opacity="0.8"
        />
        <circle cx="30" cy="23.5" r="2.5" fill="white" opacity="0.9" />
      </g>
    </svg>
  );
};
