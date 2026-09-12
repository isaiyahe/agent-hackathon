import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Svg({ size = 12, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

const line = {
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export const CheckIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M3.5 8.5l3 3 6-7" {...line} />
  </Svg>
);

export const CrossIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4.5 4.5l7 7m0-7l-7 7" {...line} />
  </Svg>
);

export const LockIcon = (props: IconProps) => (
  <Svg {...props}>
    <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" {...line} />
    <path d="M5.5 7V5.25a2.5 2.5 0 015 0V7" {...line} />
  </Svg>
);

export const AlertIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M8 2l6.25 11.25H1.75z" {...line} />
    <path d="M8 6.5v2.75M8 11.25v.01" {...line} />
  </Svg>
);

export const ClearIcon = (props: IconProps) => (
  <Svg {...props}>
    <circle cx="8" cy="8" r="5.75" {...line} />
    <path d="M4 12l8-8" {...line} />
  </Svg>
);

export const PlayIcon = (props: IconProps) => (
  <Svg {...props}>
    <path d="M5 3.25v9.5L12.5 8z" fill="currentColor" />
  </Svg>
);

export const GitHubIcon = (props: IconProps) => (
  <Svg {...props}>
    <path
      fill="currentColor"
      d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
    />
  </Svg>
);

export const LogoMark = (props: IconProps) => (
  <Svg {...props}>
    <rect x="1.75" y="1.75" width="12.5" height="12.5" rx="3.25" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="2.6" fill="var(--red)" />
  </Svg>
);

export const Spinner = ({ size = 12 }: { size?: number }) => (
  <Svg size={size} className="spinner">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
    <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </Svg>
);
