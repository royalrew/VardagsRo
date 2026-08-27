interface BrandMarkProps {
  size?: number;
  className?: string;
  label?: string;
}

/** Vardagsros own mark: a calm home, a new day and a confirmed plan. */
export function BrandMark({ size = 40, className, label }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <rect x="2" y="2" width="60" height="60" rx="18" fill="#315C4F" />
      <circle cx="47" cy="16" r="8" fill="#F2A56F" />
      <path
        d="M11.5 31.8 31.8 13.7l20.7 18.1v19.1a5.6 5.6 0 0 1-5.6 5.6H17.1a5.6 5.6 0 0 1-5.6-5.6V31.8Z"
        fill="#FFF8EB"
      />
      <path
        d="m22.4 38.3 6.4 6.4 13.1-14.2"
        stroke="#315C4F"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.7 33.2 31.8 13.7l22.5 19.5"
        stroke="#FFF8EB"
        strokeWidth="4.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
