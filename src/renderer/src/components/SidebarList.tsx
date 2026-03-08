import React from 'react';
import { formatBytes, truncateLabel, resolveBubbleTone } from '../utils/helpers';
import { StackGlyph, ChevronRightIcon } from './icons';
import type { ListRow } from './VisualizationView';

export interface SidebarListProps {
    listRows: ListRow[];
    selectedPaths: Set<string>;
    hoveredPath: string | null;
    toggleRowSelection: (path: string) => void;
    onHoverChange: (path: string | null) => void;
    setActiveRootPath: (path: string) => void;
}

export function SidebarList({
    listRows,
    selectedPaths,
    hoveredPath,
    toggleRowSelection,
    onHoverChange,
    setActiveRootPath,
}: SidebarListProps) {
    return (
        <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-[28px] border border-white/10 bg-black/10 p-2">
            <div className="flex h-full flex-col gap-2 overflow-y-auto">
                {listRows.map((row) => {
                    const selected = selectedPaths.has(row.path);
                    const tone =
                        row.kind === 'other'
                            ? {
                                fill: 'rgba(255,255,255,0.14)',
                                stroke: 'rgba(255,255,255,0.16)',
                                text: 'rgba(255,255,255,0.86)',
                            }
                            : resolveBubbleTone(row.path);

                    return (
                        <div
                            key={row.path}
                            className={`rounded-[20px] border px-3 py-3 transition ${selected || hoveredPath === row.path
                                ? 'border-white/18 bg-white/12'
                                : 'border-transparent bg-white/[0.04] hover:border-white/10 hover:bg-white/[0.08]'
                                }`}
                            onMouseEnter={() => onHoverChange(row.path)}
                            onMouseLeave={() => {
                                if (hoveredPath === row.path) {
                                    onHoverChange(null);
                                }
                            }}
                        >
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleRowSelection(row.path)}
                                    className="h-5 w-5 rounded border-white/30 bg-transparent accent-fuchsia-300"
                                />

                                <div
                                    className="flex h-10 w-10 items-center justify-center rounded-[12px] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                    style={{ background: tone.fill }}
                                >
                                    {row.kind === 'other' ? (
                                        <StackGlyph className="h-4 w-4" />
                                    ) : (
                                        <span className="text-sm font-bold">
                                            {row.name.trim().charAt(0).toUpperCase() || '?'}
                                        </span>
                                    )}
                                </div>

                                <div className="min-w-0 flex-1 ml-2">
                                    <p className="truncate text-[15px] font-semibold tracking-tight text-white">
                                        {truncateLabel(row.name, 22)}
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-white/42">
                                        {row.kind === 'other'
                                            ? 'Grouped items to keep the map readable'
                                            : row.path}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="rounded-full border border-white/14 bg-white/6 px-2.5 py-1 text-[12px] font-semibold text-white/76">
                                        {formatBytes(row.size)}
                                    </span>
                                    {row.interactive ? (
                                        <button
                                            type="button"
                                            onClick={() => setActiveRootPath(row.path)}
                                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 bg-white/6 text-white/78 transition hover:bg-white/12 hover:text-white"
                                        >
                                            <ChevronRightIcon className="h-4 w-4" />
                                        </button>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {listRows.length === 0 ? (
                    <div className="rounded-[24px] border border-white/10 bg-white/[0.04] px-5 py-6 text-sm text-white/56">
                        This folder is mostly direct files, so there are no deeper folders to drill into.
                    </div>
                ) : null}
            </div>
        </div>
    );
}
