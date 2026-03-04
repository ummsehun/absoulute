import React from 'react';

interface DriveSelectorProps {
    rootPath: string;
    setRootPath: (val: string) => void;
}

export function DriveSelector({ rootPath, setRootPath }: DriveSelectorProps) {
    return (
        <div className="flex items-center gap-4 w-full px-4 py-2 bg-transparent z-10 w-72 cursor-pointer group">
            {/* Drive Icon */}
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] border border-white/10 shrink-0 group-hover:bg-white/20 transition-colors">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
            </div>

            <div className="flex flex-col flex-1 min-w-0 pointer-events-none">
                <span className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mb-0.5 pointer-events-auto">Target Disk</span>
                <select
                    className="bg-transparent text-white font-semibold text-base outline-none cursor-pointer appearance-none truncate pointer-events-auto min-w-0"
                    value={rootPath}
                    onChange={(e) => setRootPath(e.target.value)}
                >
                    <option value="/" className="text-black bg-white">Macintosh HD</option>
                    <option value="/Users" className="text-black bg-white">/Users (Home)</option>
                    {rootPath !== '/' && rootPath !== '/Users' && (
                        <option value={rootPath} className="text-black bg-white">{rootPath}</option>
                    )}
                </select>
            </div>

            {/* Dropdown Chevron */}
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/5 border border-white/10 shrink-0 group-hover:bg-white/10 transition-colors">
                <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    );
}
