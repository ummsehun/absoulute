import { formatBytes } from '../utils/helpers';
import { ChevronRightIcon, NativeFileIcon } from './icons';
import type { ListRow } from './VisualizationView';
import { Checkbox } from './ui/checkbox';

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
        <div className="mt-2 min-h-0 flex-1 overflow-hidden rounded-[24px] border border-white/10 bg-black/15 p-2">
            <div className="flex h-full flex-col gap-1.5 overflow-y-auto pr-1">
                {listRows.map((row) => {
                    const selected = selectedPaths.has(row.path);

                    return (
                        <div
                            key={row.path}
                            className={`group relative rounded-xl border p-2.5 transition duration-150 ${selected || hoveredPath === row.path
                                ? 'border-white/15 bg-white/8'
                                : 'border-transparent bg-white/[0.02] hover:border-white/8 hover:bg-white/[0.05]'
                                }`}
                            onMouseEnter={() => onHoverChange(row.path)}
                            onMouseLeave={() => {
                                if (hoveredPath === row.path) {
                                    onHoverChange(null);
                                }
                            }}
                        >
                            <div className="flex items-center gap-3">
                                {/* Checkbox container */}
                                <div className="flex items-center">
                                    <Checkbox
                                        checked={selected}
                                        onChange={() => toggleRowSelection(row.path)}
                                        className="border-white/30 data-[state=checked]:bg-fuchsia-400"
                                    />
                                </div>

                                {/* Sleek small icon wrapper */}
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white">
                                    <NativeFileIcon
                                        path={row.path}
                                        name={row.name}
                                        kind={row.kind}
                                        style={{ width: '22px', height: '18px' }}
                                    />
                                </div>

                                {/* Text stack - Title and Path */}
                                <div className="min-w-0 flex-1 ml-0.5">
                                    <p
                                        onClick={() => row.interactive && setActiveRootPath(row.path)}
                                        className={`truncate text-sm font-semibold tracking-tight text-white ${row.interactive ? 'cursor-pointer hover:underline hover:text-fuchsia-300' : ''}`}
                                    >
                                        {row.name}
                                    </p>
                                    <p className="mt-0.5 truncate text-[10px] font-mono text-white/30" title={row.path}>
                                        {row.kind === 'other'
                                            ? row.description ?? 'Additional entries grouped in this view'
                                            : row.path}
                                    </p>
                                </div>

                                {/* Size and Actions Container */}
                                <div className="relative flex items-center justify-end w-16 h-7 overflow-hidden">
                                    {/* Size label - fades out on hover if interactive */}
                                    <span className={`text-xs font-semibold text-white/70 font-mono transition-all duration-200 ${row.interactive ? 'group-hover:opacity-0 group-hover:translate-x-3' : ''}`}>
                                        {formatBytes(row.size)}
                                    </span>

                                    {/* Chevron navigation button - reveals on hover */}
                                    {row.interactive && (
                                        <button
                                            onClick={() => setActiveRootPath(row.path)}
                                            className="absolute right-0 flex items-center justify-center h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white opacity-0 translate-x-3 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 cursor-pointer"
                                        >
                                            <ChevronRightIcon className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}

                {listRows.length === 0 ? (
                    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-5 text-xs text-white/50 text-center leading-relaxed">
                        This folder has no subfolders to navigate into.
                    </div>
                ) : null}
            </div>
        </div>
    );
}
