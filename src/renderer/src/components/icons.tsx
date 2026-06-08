import React from 'react';
import { useFileIcon } from '../hooks/useFileIcon';

export function FolderGlyph({
    className,
    transform,
    style,
}: {
    className?: string;
    transform?: string;
    style?: React.CSSProperties;
}) {
    return (
        <svg viewBox="0 0 24 24" width={24} height={24} fill="none" className={className} transform={transform} style={style}>
            <path
                d="M3.5 8.1A2.1 2.1 0 0 1 5.6 6h4c.55 0 1.07.21 1.46.59l1 1.01c.39.38.91.59 1.46.59h4.92a2.1 2.1 0 0 1 2.1 2.1v6.11a2.1 2.1 0 0 1-2.1 2.1H5.6a2.1 2.1 0 0 1-2.1-2.1V8.1Z"
                fill="currentColor"
                fillOpacity="0.92"
            />
        </svg>
    );
}

export function StackGlyph({
    className,
    transform,
    style,
}: {
    className?: string;
    transform?: string;
    style?: React.CSSProperties;
}) {
    return (
        <svg viewBox="0 0 24 24" width={24} height={24} fill="none" className={className} transform={transform} style={style}>
            <rect x="4" y="5" width="11" height="11" rx="2.2" fill="currentColor" fillOpacity="0.84" />
            <rect x="9" y="9" width="11" height="11" rx="2.2" fill="currentColor" fillOpacity="0.58" />
        </svg>
    );
}

export function ChevronLeftIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="none" className={className}>
            <path d="m12.5 4.5-5 5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function ChevronRightIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="none" className={className}>
            <path d="m7.5 4.5 5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function HomeGlyph({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 20 20" fill="none" className={className}>
            <path d="M4.5 8.8 10 4l5.5 4.8v6.2a1 1 0 0 1-1 1h-2.8V11h-3.4v5H5.5a1 1 0 0 1-1-1V8.8Z" fill="currentColor" fillOpacity="0.9" />
        </svg>
    );
}

export function MacFolderIcon({
    className,
    style,
    name,
    kind,
}: {
    className?: string;
    style?: React.CSSProperties;
    name?: string;
    kind?: 'directory' | 'other';
}) {
    const lowerName = (name || '').toLowerCase();

    // Determine stencil glyph based on folder name
    let stencil: React.ReactNode = null;
    const stencilColor = "#094a73";
    const stencilOpacity = "0.45";

    if (kind === 'other') {
        // Stack glyph / loose files
        stencil = (
            <g fill={stencilColor} opacity={stencilOpacity}>
                <rect x="42" y="42" width="36" height="4" rx="1.5" />
                <rect x="42" y="52" width="36" height="4" rx="1.5" />
                <rect x="42" y="62" width="36" height="4" rx="1.5" />
            </g>
        );
    } else if (lowerName === 'library' || lowerName === '라이브러리') {
        // Library / Temple
        stencil = (
            <g fill={stencilColor} opacity={stencilOpacity}>
                <path d="M38 45 L60 35 L82 45 V48 H38 V45 Z" />
                <rect x="42" y="50" width="4" height="14" rx="0.5" />
                <rect x="51" y="50" width="4" height="14" rx="0.5" />
                <rect x="60" y="50" width="4" height="14" rx="0.5" />
                <rect x="69" y="50" width="4" height="14" rx="0.5" />
                <rect x="74" y="50" width="4" height="14" rx="0.5" />
                <rect x="38" y="65" width="44" height="3" rx="0.5" />
                <rect x="36" y="68" width="48" height="3" rx="0.5" />
            </g>
        );
    } else if (lowerName === 'applications' || lowerName === '응용 프로그램' || lowerName === '응용프로그램') {
        // Applications (App Store A)
        stencil = (
            <g stroke={stencilColor} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" opacity={stencilOpacity}>
                <line x1="45" y1="68" x2="60" y2="42" />
                <line x1="75" y1="68" x2="60" y2="42" />
                <line x1="49" y1="60" x2="71" y2="60" />
            </g>
        );
    } else if (lowerName === 'users' || lowerName === '사용자') {
        // Users / Profile
        stencil = (
            <g fill={stencilColor} opacity={stencilOpacity}>
                <circle cx="60" cy="54" r="18" fill="none" stroke={stencilColor} strokeWidth="3" />
                <circle cx="60" cy="48" r="6" />
                <path d="M47 67 C47 60 52 57 60 57 C68 57 73 60 73 67 V68 H47 V67 Z" />
            </g>
        );
    } else if (lowerName === 'system' || lowerName === '시스템' || lowerName === 'macos') {
        // System / macOS text
        stencil = (
            <text
                x="60"
                y="60"
                fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
                fontWeight="700"
                fontSize="15"
                fill={stencilColor}
                fillOpacity={stencilOpacity}
                textAnchor="middle"
                letterSpacing="-0.5"
            >
                macOS
            </text>
        );
    } else if (lowerName === 'downloads' || lowerName === '다운로드') {
        stencil = (
            <g stroke={stencilColor} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" opacity={stencilOpacity}>
                <line x1="60" y1="38" x2="60" y2="64" />
                <path d="M49 53 L60 64 L71 53" fill="none" />
                <line x1="40" y1="70" x2="80" y2="70" />
            </g>
        );
    } else if (lowerName === 'documents' || lowerName === '문서') {
        stencil = (
            <g stroke={stencilColor} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity={stencilOpacity} fill="none">
                <rect x="42" y="38" width="36" height="30" rx="3" />
                <line x1="49" y1="46" x2="71" y2="46" />
                <line x1="49" y1="53" x2="71" y2="53" />
                <line x1="49" y1="60" x2="63" y2="60" />
            </g>
        );
    } else if (lowerName === 'desktop' || lowerName === '데스크탑' || lowerName === '데스크톱') {
        stencil = (
            <g stroke={stencilColor} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity={stencilOpacity} fill="none">
                <rect x="40" y="38" width="40" height="24" rx="2" />
                <path d="M52 62 L48 70 H72 L68 62" fill={stencilColor} fillOpacity={stencilOpacity} />
            </g>
        );
    } else if (lowerName === 'movies' || lowerName === '동영상' || lowerName === '영화') {
        stencil = (
            <g stroke={stencilColor} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity={stencilOpacity} fill="none">
                <rect x="40" y="40" width="40" height="26" rx="3" />
                <circle cx="50" cy="53" r="5" />
                <circle cx="70" cy="53" r="5" />
            </g>
        );
    } else if (lowerName === 'music' || lowerName === '음악') {
        stencil = (
            <g fill={stencilColor} opacity={stencilOpacity}>
                <circle cx="48" cy="64" r="7" />
                <circle cx="74" cy="59" r="7" />
                <path d="M55 64 V38 L81 33 V59 H75 V33 L55 38 V64 H49 Z" />
            </g>
        );
    } else if (lowerName === 'pictures' || lowerName === '사진' || lowerName === 'images') {
        stencil = (
            <g stroke={stencilColor} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" opacity={stencilOpacity} fill="none">
                <rect x="40" y="42" width="40" height="26" rx="3" />
                <circle cx="60" cy="55" r="7" />
                <path d="M52 42 L55 36 H65 L68 42" fill={stencilColor} fillOpacity={stencilOpacity} />
            </g>
        );
    }

    const id = React.useId().replace(/:/g, '');

    return (
        <svg viewBox="0 0 120 100" fill="none" className={className} style={style}>
            <defs>
                {/* Back flap gradient: macOS bright sky blue */}
                <linearGradient id={`backGrad-${id}`} x1="60" y1="12" x2="60" y2="88" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#42b4f6" />
                    <stop offset="100%" stopColor="#007bd4" />
                </linearGradient>
                {/* Front pocket gradient: macOS glossy cyan-blue */}
                <linearGradient id={`frontGrad-${id}`} x1="60" y1="25" x2="60" y2="85" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#69d1ff" />
                    <stop offset="100%" stopColor="#008be3" />
                </linearGradient>
                {/* Inner pocket highlight (light reflection line at the top of front pocket) */}
                <linearGradient id={`highlightGrad-${id}`} x1="17.5" y1="25" x2="102.5" y2="25" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
                    <stop offset="50%" stopColor="#ffffff" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0.2" />
                </linearGradient>
                {/* Bottom shadow filter */}
                <filter id={`shadow-${id}`} x="-10%" y="-10%" width="120%" height="130%" filterUnits="userSpaceOnUse">
                    <feDropShadow dx="0" dy="4" stdDeviation="4" floodColor="#011b33" floodOpacity="0.35" />
                </filter>
            </defs>

            {/* Back Folder Flap with Rounded Tab - mathematically precise macOS tab shape */}
            <path
                d="M14 22 C14 16.48 18.48 12 24 12 H44 C48 12 50 24 54 24 H96 C101.52 24 106 28.48 106 34 V76 C106 81.52 101.52 86 96 86 H24 C18.48 86 14 81.52 14 76 V22 Z"
                fill={`url(#backGrad-${id})`}
            />

            {/* Front Folder Pocket (with shadow & gradient) */}
            <path
                d="M14 33 C14 28.58 17.58 25 22 25 H98 C102.42 25 106 28.58 106 33 V77 C106 81.42 102.42 85 98 85 H22 C17.58 85 14 81.42 14 77 V33 Z"
                fill={`url(#frontGrad-${id})`}
                filter={`url(#shadow-${id})`}
            />

            {/* Glossy top edge highlight for the front pocket */}
            <path
                d="M17.5 25H102.5"
                stroke={`url(#highlightGrad-${id})`}
                strokeWidth="1.5"
                strokeLinecap="round"
            />

            {/* The Stencil Artwork */}
            {stencil}
        </svg>
    );
}

// Folders where app.getFileIcon returns a generic plain blue folder on macOS —
// our custom SVG stencils are more distinctive for these well-known names.
const CUSTOM_STENCIL_NAMES = new Set([
    'library', '라이브러리',
    'applications', '응용 프로그램', '응용프로그램',
    'users', '사용자',
    'system', '시스템', 'macos',
    'downloads', '다운로드',
    'documents', '문서',
    'desktop', '데스크탑', '데스크톱',
    'movies', '동영상', '영화',
    'music', '음악',
    'pictures', '사진', 'images',
]);

export function NativeFileIcon({
    path,
    name,
    kind,
    className,
    style,
}: {
    path: string;
    name?: string;
    kind?: 'directory' | 'other';
    className?: string;
    style?: React.CSSProperties;
}) {
    // Directory rows can include thousands of app bundles and system folders.
    // Fetching native macOS icons for those paths can crash Electron inside
    // NSImage/IconServices, so keep directory visualization on SVG icons.
    const skipNative = kind === 'directory'
        || kind === 'other'
        || CUSTOM_STENCIL_NAMES.has((name ?? '').toLowerCase());
    const iconUrl = useFileIcon(skipNative ? null : path);

    if (iconUrl) {
        // macOS icons are always square. Use the height dimension as the base so the
        // icon stays within the same vertical footprint as the MacFolderIcon SVG
        // (which has a wider-than-tall 120×100 viewBox). Using width would make the
        // icon taller than the SVG and overflow the bubble content area.
        const size = style?.height ?? style?.width ?? '20px';
        return <img src={iconUrl} className={className} style={{ width: size, height: size, flexShrink: 0, display: 'block' }} draggable={false} alt={name} />;
    }
    return <MacFolderIcon name={name} kind={kind} className={className} style={style} />;
}
