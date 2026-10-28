import type { CSSProperties, ReactNode } from 'react';

export interface IconProps {
  size?: number | string;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

function SvgIcon({
  size = 20,
  strokeWidth = 2.5,
  className,
  style,
  children,
}: IconProps & { children: ReactNode }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      {children}
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2.5} {...props}>
      <path d="m6 9 6 6 6-6" />
    </SvgIcon>
  );
}

export function CheckIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={18} strokeWidth={2.5} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </SvgIcon>
  );
}

export function LockIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={12} strokeWidth={2.5} {...props}>
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </SvgIcon>
  );
}

export function DeleteIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={18} strokeWidth={2.4} {...props}>
      <path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
      <path d="m12 9 6 6" />
      <path d="m18 9-6 6" />
    </SvgIcon>
  );
}

export function ShuffleIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={18} strokeWidth={2.4} {...props}>
      <path d="m18 14 4 4-4 4" />
      <path d="m18 2 4 4-4 4" />
      <path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22" />
      <path d="M2 6h1.972a4 4 0 0 1 3.6 2.2" />
      <path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45" />
    </SvgIcon>
  );
}

export function ShareIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={18} strokeWidth={2.4} {...props}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </SvgIcon>
  );
}

export function CircleIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={21} strokeWidth={2.3} {...props}>
      <circle cx="12" cy="12" r="10" />
    </SvgIcon>
  );
}

export function CircleOffIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={22} strokeWidth={2.3} {...props}>
      <path d="m2 2 20 20" />
      <path d="M8.35 2.69A10 10 0 0 1 21.3 15.65" />
      <path d="M19.08 19.08A10 10 0 1 1 4.92 4.92" />
    </SvgIcon>
  );
}

export function CircleStarIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={22} strokeWidth={2.3} {...props}>
      <circle cx="12" cy="12" r="10" />
      <polygon points="12 7.5 13.4 10.4 16.5 10.8 14.2 13 14.8 16.1 12 14.6 9.2 16.1 9.8 13 7.5 10.8 10.6 10.4" />
    </SvgIcon>
  );
}

export function BulbIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon
      size="1em"
      strokeWidth={2.5}
      style={{
        verticalAlign: '-0.15em',
        display: 'inline-block',
        marginLeft: '0.25em',
      }}
      {...props}
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </SvgIcon>
  );
}

export function SummaryIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size="1em" strokeWidth={2.5} className="inline-block align-middle ml-1" {...props}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </SvgIcon>
  );
}

export function DistributionIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size="1em" strokeWidth={2.5} className="inline-block align-middle ml-1" {...props}>
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </SvgIcon>
  );
}

export function PairsIcon(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="inline-block ml-1"
      style={{
        fontWeight: 450,
        fontSize: '1.1em',
        lineHeight: 1,
        verticalAlign: 'baseline',
      }}
    >
      AB
    </span>
  );
}

export function CalendarIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={20} strokeWidth={2.5} {...props}>
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
    </SvgIcon>
  );
}

export function StatsIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={20} strokeWidth={3} {...props}>
      <line x1="18" x2="18" y1="20" y2="10" />
      <line x1="12" x2="12" y1="20" y2="4" />
      <line x1="6" x2="6" y1="20" y2="14" />
    </SvgIcon>
  );
}

export function CircleHelpIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={20} strokeWidth={2.5} {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </SvgIcon>
  );
}

export function SettingsIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={20} strokeWidth={2.5} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </SvgIcon>
  );
}

export function ArrowLeftIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={18} strokeWidth={2.5} {...props}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </SvgIcon>
  );
}

export function SunIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={20} strokeWidth={2.5} {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </SvgIcon>
  );
}

export function MoonIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={20} strokeWidth={2.5} {...props}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </SvgIcon>
  );
}

export function UserIcon({
  loggedIn,
  ...props
}: IconProps & { loggedIn?: boolean }): React.JSX.Element {
  return loggedIn ? (
    <SvgIcon size={20} strokeWidth={2.5} {...props}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </SvgIcon>
  ) : (
    <SvgIcon size={20} strokeWidth={2.5} {...props}>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </SvgIcon>
  );
}

export function CopyIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={1.5} {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </SvgIcon>
  );
}

export function EyeIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2} {...props}>
      <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
      <circle cx="12" cy="12" r="3" />
    </SvgIcon>
  );
}

export function CloseIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={20} strokeWidth={2.5} {...props}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </SvgIcon>
  );
}

export function PaletteIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={20} strokeWidth={2.5} {...props}>
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
    </SvgIcon>
  );
}

export function MonitorIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2.5} {...props}>
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <line x1="8" x2="16" y1="21" y2="21" />
      <line x1="12" x2="12" y1="17" y2="21" />
    </SvgIcon>
  );
}

export function LinkIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2.5} {...props}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </SvgIcon>
  );
}

export function AlertCircleIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2.5} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </SvgIcon>
  );
}

export function SmartphoneIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2.5} {...props}>
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </SvgIcon>
  );
}

export function SparklesIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2.5} {...props}>
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M3 5h4" />
    </SvgIcon>
  );
}

export function MailIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2} {...props}>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </SvgIcon>
  );
}

export function QrCodeIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2} {...props}>
      <rect width="5" height="5" x="3" y="3" rx="1" />
      <rect width="5" height="5" x="16" y="3" rx="1" />
      <rect width="5" height="5" x="3" y="16" rx="1" />
      <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
      <path d="M21 21v.01" />
      <path d="M12 7v3a2 2 0 0 1-2 2H7" />
      <path d="M3 12h.01" />
      <path d="M12 3h.01" />
      <path d="M12 16v.01" />
      <path d="M16 12h1" />
      <path d="M21 12v.01" />
      <path d="M12 21v-1" />
    </SvgIcon>
  );
}

export function RefreshCwIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2} {...props}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </SvgIcon>
  );
}

export function LogOutIcon(props: IconProps): React.JSX.Element {
  return (
    <SvgIcon size={14} strokeWidth={2} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" x2="9" y1="12" y2="12" />
    </SvgIcon>
  );
}
