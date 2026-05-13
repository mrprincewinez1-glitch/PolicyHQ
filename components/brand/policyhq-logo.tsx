type PolicyHqLogoProps = {
  variant?: "light" | "dark";
  className?: string;
};

export function PolicyHqLogo({ variant = "light", className = "" }: PolicyHqLogoProps) {
  const navy = variant === "dark" ? "#FFFFFF" : "#0D1B3E";
  const tagline = variant === "dark" ? "#CBD5E1" : "#8B97B8";

  return (
    <svg
      viewBox="12 42 390 132"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="PolicyHQ"
      className={className}
    >
      <text
        x="148"
        y="122"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
        fontSize="42"
        fontWeight="600"
        fill={navy}
        textAnchor="end"
        letterSpacing="-0.5"
      >
        Policy
      </text>

      <line x1="158" y1="52" x2="158" y2="146" stroke="#C9A84C" strokeWidth="1" />

      <rect x="178" y="52" width="114" height="14" fill={navy} />
      <rect x="190" y="66" width="28" height="5" fill={navy} />
      <rect x="195" y="71" width="22" height="58" fill={navy} />
      <rect x="190" y="129" width="28" height="5" fill={navy} />
      <rect x="252" y="66" width="28" height="5" fill={navy} />
      <rect x="253" y="71" width="22" height="58" fill={navy} />
      <rect x="252" y="129" width="28" height="5" fill={navy} />
      <rect x="217" y="93" width="36" height="10" fill="#C9A84C" />
      <rect x="182" y="134" width="106" height="8" fill={navy} />
      <rect x="172" y="142" width="126" height="6" fill={navy} />

      <path
        fillRule="evenodd"
        fill="#C9A84C"
        d="
          M 372,98
          A 24,24 0 1 0 300,98
          A 24,24 0 1 0 372,98
          Z
          M 362,98
          A 14,14 0 1 1 320,98
          A 14,14 0 1 1 362,98
          Z
        "
      />
      <line x1="360" y1="112" x2="381" y2="133" stroke="#C9A84C" strokeWidth="9" strokeLinecap="round" />

      <text
        x="172"
        y="164"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
        fontSize="9.5"
        fontWeight="400"
        fill={tagline}
        letterSpacing="3.8"
      >
        INSURANCE PLATFORM
      </text>
    </svg>
  );
}
