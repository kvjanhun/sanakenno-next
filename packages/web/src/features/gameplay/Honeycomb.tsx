import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  DEFAULT_THEME_ID,
  getHoneycombCenterOverlayStops,
  getHoneycombCenterOverlayVariant,
  type ThemeId,
} from '@sanakenno/shared';

export interface HoneycombProps {
  center: string;
  outerLetters: string[];
  pressedHexIndex: number | null;
  disabled?: boolean;
  themeId?: ThemeId;
  scheme?: 'light' | 'dark';
  onLetterPress: (letter: string) => void;
  onHexDown: (index: number) => void;
  onHexUp: () => void;
}

interface HexCell {
  x: number;
  y: number;
  letter: string;
  isCenter: boolean;
}

function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

function hexPath(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

function computeHexes(center: string, outerLetters: string[]): HexCell[] {
  const R = 50;
  const dx = R * Math.sqrt(3);
  const dy = R * 1.5;
  const cx = 150;
  const cy = 150;
  const ol = outerLetters;

  return [
    { x: cx - dx / 2, y: cy - dy, letter: ol[0] ?? '', isCenter: false },
    { x: cx + dx / 2, y: cy - dy, letter: ol[1] ?? '', isCenter: false },
    { x: cx - dx, y: cy, letter: ol[2] ?? '', isCenter: false },
    { x: cx, y: cy, letter: center, isCenter: true },
    { x: cx + dx, y: cy, letter: ol[3] ?? '', isCenter: false },
    { x: cx - dx / 2, y: cy + dy, letter: ol[4] ?? '', isCenter: false },
    { x: cx + dx / 2, y: cy + dy, letter: ol[5] ?? '', isCenter: false },
  ];
}

export function Honeycomb({
  center,
  outerLetters,
  pressedHexIndex,
  disabled = false,
  themeId = DEFAULT_THEME_ID,
  scheme = 'light',
  onLetterPress,
  onHexDown,
  onHexUp,
}: HoneycombProps): React.JSX.Element {
  const hexes = useMemo(() => computeHexes(center, outerLetters), [center, outerLetters]);
  const centerOverlayStops = useMemo(
    () => getHoneycombCenterOverlayStops(getHoneycombCenterOverlayVariant(themeId, scheme)),
    [themeId, scheme],
  );

  const ariaLabel = `Kirjainkenno: kirjaimet ${hexes.map((h) => h.letter.toUpperCase()).join(', ')}, keskuskirjain ${center.toUpperCase()}`;

  const svgRef = useRef<SVGSVGElement>(null);
  const handledByPointerRef = useRef(false);
  const preventTouch = useCallback((e: TouchEvent) => e.preventDefault(), []);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener('touchstart', preventTouch, { passive: false });
    el.addEventListener('touchmove', preventTouch, { passive: false });
    return () => {
      el.removeEventListener('touchstart', preventTouch);
      el.removeEventListener('touchmove', preventTouch);
    };
  }, [preventTouch]);

  return (
    <svg
      ref={svgRef}
      viewBox="18 18 264 264"
      width="264"
      height="264"
      role="img"
      aria-label={ariaLabel}
      style={{ touchAction: 'none' }}
    >
      <defs>
        <linearGradient id="hex-outer-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--color-hex-hi)' }} />
          <stop offset="100%" style={{ stopColor: 'var(--color-hex-lo)' }} />
        </linearGradient>
        <linearGradient id="hex-center-overlay" x1="0" y1="0" x2="0" y2="1">
          {centerOverlayStops.map((stop) => (
            <stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={stop.opacity}
            />
          ))}
        </linearGradient>
      </defs>
      {hexes.map((hex, i) => (
        <g
          key={i}
          data-testid={`hex-cell-${hex.letter}`}
          data-hex-center={hex.isCenter ? 'true' : 'false'}
          aria-hidden="true"
          style={{ cursor: disabled ? 'default' : 'pointer' }}
          onPointerDown={
            disabled
              ? undefined
              : (e) => {
                  handledByPointerRef.current = true;
                  (e.target as Element).releasePointerCapture?.(e.pointerId);
                  onHexDown(i);
                  onLetterPress(hex.letter);
                }
          }
          onClick={
            disabled
              ? undefined
              : () => {
                  if (handledByPointerRef.current) {
                    handledByPointerRef.current = false;
                    return;
                  }
                  onHexDown(i);
                  onLetterPress(hex.letter);
                  onHexUp();
                }
          }
          onPointerUp={disabled ? undefined : onHexUp}
          onPointerLeave={disabled ? undefined : onHexUp}
        >
          <polygon
            points={hexPoints(hex.x, hex.y, 46)}
            style={{
              fill: hex.isCenter ? 'var(--color-accent)' : 'url(#hex-outer-grad)',
              stroke: hex.isCenter ? 'var(--color-accent)' : 'var(--color-hex-stroke)',
              strokeWidth: '1.5',
              transform: pressedHexIndex === i ? 'scale(0.92)' : 'scale(1)',
              transformOrigin: `${hex.x}px ${hex.y}px`,
              opacity: pressedHexIndex === i ? 0.78 : 1,
              transition: 'transform 0.08s ease, opacity 0.08s ease',
            }}
          />
          {hex.isCenter && (
            <path
              d={hexPath(hex.x, hex.y, 46)}
              style={{
                fill: 'url(#hex-center-overlay)',
                pointerEvents: 'none',
              }}
            />
          )}
          <text
            x={hex.x}
            y={hex.y}
            textAnchor="middle"
            dominantBaseline="central"
            style={{
              fill: hex.isCenter ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
              fontSize: '24px',
              fontWeight: 600,
              fontFamily: 'var(--font-sans)',
              pointerEvents: 'none',
            }}
          >
            {hex.letter.toUpperCase()}
          </text>
        </g>
      ))}
    </svg>
  );
}
