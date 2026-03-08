import React from 'react';

export function FolderGlyph({
    className,
    transform,
}: {
    className?: string;
    transform?: string;
}) {
    return (
        <svg viewBox="0 0 24 24" width={24} height={24} fill="none" className={className} transform={transform}>
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
}: {
    className?: string;
    transform?: string;
}) {
    return (
        <svg viewBox="0 0 24 24" width={24} height={24} fill="none" className={className} transform={transform}>
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
