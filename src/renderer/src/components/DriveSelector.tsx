import React from 'react';

interface DriveSelectorProps {
    rootPath: string;
    setRootPath: (val: string) => void;
}

export function DriveSelector({ rootPath, setRootPath }: DriveSelectorProps) {
    return (
        <div className="flex w-full cursor-pointer items-center gap-3 bg-transparent px-3 py-1.5 z-10 group">
            {/* Drive Icon */}
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)] border border-white/10 shrink-0 group-hover:bg-white/20 transition-colors">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                </svg>
            </div>

            <div className="flex flex-col flex-1 min-w-0 pointer-events-none">
                <span className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mb-0.5 pointer-events-auto">Target Disk</span>
                <select
                    className="w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent text-sm font-semibold text-white outline-none pointer-events-auto"
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
            <div className="w-7 h-7 rounded-full flex items-center justify-center bg-white/5 border border-white/10 shrink-0 group-hover:bg-white/10 transition-colors">
                <svg className="w-4 h-4 text-white/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
            </div>
        </div>
    );
}
