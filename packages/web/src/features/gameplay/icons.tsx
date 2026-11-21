import type { CSSProperties } from 'react';
import {
  ArrowLeft,
  BarChart2,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleAlert,
  CircleHelp,
  CircleOff,
  Copy,
  Delete,
  Eye,
  Lightbulb,
  Link,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Palette,
  QrCode,
  RefreshCw,
  Search,
  Settings,
  Share,
  Shuffle,
  Smartphone,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';

export interface IconProps {
  size?: number | string;
  strokeWidth?: number;
  className?: string;
  style?: CSSProperties;
}

export function ChevronDownIcon(props: IconProps): React.JSX.Element {
  return <ChevronDown size={14} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function ChevronLeftIcon(props: IconProps): React.JSX.Element {
  return <ChevronLeft size={16} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function ChevronRightIcon(props: IconProps): React.JSX.Element {
  return <ChevronRight size={16} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function CheckIcon(props: IconProps): React.JSX.Element {
  return <Check size={18} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function LockIcon(props: IconProps): React.JSX.Element {
  return <Lock size={12} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function DeleteIcon(props: IconProps): React.JSX.Element {
  return <Delete size={18} strokeWidth={2.4} aria-hidden="true" {...props} />;
}

export function ShuffleIcon(props: IconProps): React.JSX.Element {
  return <Shuffle size={18} strokeWidth={2.4} aria-hidden="true" {...props} />;
}

export function ShareIcon(props: IconProps): React.JSX.Element {
  return <Share size={18} strokeWidth={2.4} aria-hidden="true" {...props} />;
}

export function CircleIcon(props: IconProps): React.JSX.Element {
  return <Circle size={21} strokeWidth={2.3} aria-hidden="true" {...props} />;
}

export function CircleOffIcon(props: IconProps): React.JSX.Element {
  return <CircleOff size={22} strokeWidth={2.3} aria-hidden="true" {...props} />;
}

export function CircleStarIcon({
  size = 22,
  strokeWidth = 2.3,
  className,
  style,
}: IconProps): React.JSX.Element {
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
      <circle cx="12" cy="12" r="10" />
      <polygon points="12 7.5 13.4 10.4 16.5 10.8 14.2 13 14.8 16.1 12 14.6 9.2 16.1 9.8 13 7.5 10.8 10.6 10.4" />
    </svg>
  );
}

export function BulbIcon({ style, ...props }: IconProps): React.JSX.Element {
  return (
    <Lightbulb
      size="1em"
      strokeWidth={2.5}
      aria-hidden="true"
      style={{
        verticalAlign: '-0.15em',
        display: 'inline-block',
        marginLeft: '0.25em',
        ...style,
      }}
      {...props}
    />
  );
}

export function SummaryIcon(props: IconProps): React.JSX.Element {
  return (
    <Search
      size="1em"
      strokeWidth={2.5}
      aria-hidden="true"
      className="inline-block align-middle ml-1"
      {...props}
    />
  );
}

export function DistributionIcon(props: IconProps): React.JSX.Element {
  return (
    <BarChart2
      size="1em"
      strokeWidth={2.5}
      aria-hidden="true"
      className="inline-block align-middle ml-1"
      {...props}
    />
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
  return <Calendar size={20} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function StatsIcon(props: IconProps): React.JSX.Element {
  return <BarChart2 size={20} strokeWidth={3} aria-hidden="true" {...props} />;
}

export function CircleHelpIcon(props: IconProps): React.JSX.Element {
  return <CircleHelp size={20} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function SettingsIcon(props: IconProps): React.JSX.Element {
  return <Settings size={20} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function ArrowLeftIcon(props: IconProps): React.JSX.Element {
  return <ArrowLeft size={18} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function SunIcon(props: IconProps): React.JSX.Element {
  return <Sun size={20} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function MoonIcon(props: IconProps): React.JSX.Element {
  return <Moon size={20} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function CopyIcon(props: IconProps): React.JSX.Element {
  return <Copy size={14} strokeWidth={1.5} aria-hidden="true" {...props} />;
}

export function EyeIcon(props: IconProps): React.JSX.Element {
  return <Eye size={14} strokeWidth={2} aria-hidden="true" {...props} />;
}

export function CloseIcon(props: IconProps): React.JSX.Element {
  return <X size={20} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function PaletteIcon(props: IconProps): React.JSX.Element {
  return <Palette size={20} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function MonitorIcon(props: IconProps): React.JSX.Element {
  return <Monitor size={14} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function LinkIcon(props: IconProps): React.JSX.Element {
  return <Link size={14} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function AlertCircleIcon(props: IconProps): React.JSX.Element {
  return <CircleAlert size={14} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function SmartphoneIcon(props: IconProps): React.JSX.Element {
  return <Smartphone size={14} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function SparklesIcon(props: IconProps): React.JSX.Element {
  return <Sparkles size={14} strokeWidth={2.5} aria-hidden="true" {...props} />;
}

export function MailIcon(props: IconProps): React.JSX.Element {
  return <Mail size={14} strokeWidth={2} aria-hidden="true" {...props} />;
}

export function QrCodeIcon(props: IconProps): React.JSX.Element {
  return <QrCode size={14} strokeWidth={2} aria-hidden="true" {...props} />;
}

export function RefreshCwIcon(props: IconProps): React.JSX.Element {
  return <RefreshCw size={14} strokeWidth={2} aria-hidden="true" {...props} />;
}

export function LogOutIcon(props: IconProps): React.JSX.Element {
  return <LogOut size={14} strokeWidth={2} aria-hidden="true" {...props} />;
}
