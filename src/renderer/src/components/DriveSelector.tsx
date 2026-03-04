import React from 'react';
import { themeTokens } from '../theme/tokens';

interface DriveSelectorProps {
    rootPath: string;
    setRootPath: (val: string) => void;
}

export function DriveSelector({ rootPath, setRootPath }: DriveSelectorProps) {
    return (
        <div
            className="flex items-center gap-3 px-5 py-3 rounded-2xl mb-12 cursor-pointer transition-all duration-300 hover:bg-white/10 border border-white/10 z-10"
            style={{ background: themeTokens.colors.glassBg }}
        >
            {/* Drive Icon */}
            <div className="w-6 h-6 rounded bg-gray-300 flex items-center justify-center shadow-inner">
                <div className="w-4 h-4 border border-gray-400 rounded-sm bg-gray-200" />
            </div>
            <select
                className="bg-transparent text-white font-medium text-lg outline-none cursor-pointer appearance-none pr-8"
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
            >
                <option value="/" className="text-black">Macintosh HD</option>
                <option value="/Users" className="text-black">/Users</option>
                {rootPath !== '/' && rootPath !== '/Users' && (
                    <option value={rootPath} className="text-black">{rootPath}</option>
                )}
            </select>
            <svg className="w-4 h-4 ml-2 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
        </div>
    );
}
