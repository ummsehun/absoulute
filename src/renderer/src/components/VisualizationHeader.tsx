import React from 'react';
import { labelFromPath, truncateLabel } from '../utils/helpers';
import { ChevronLeftIcon, ChevronRightIcon, FolderGlyph, HomeGlyph } from './icons';
import { Button } from './ui/button';

interface VisualizationHeaderProps {
    parentPath: string | null;
    rootPath: string;
    breadcrumbPaths: string[];
    setActiveRootPath: (path: string) => void;
}

export function VisualizationHeader({
    parentPath,
    rootPath,
    breadcrumbPaths,
    setActiveRootPath,
}: VisualizationHeaderProps) {
    return (
        <div className="flex items-center gap-3 px-8 py-7">
            <Button
                variant="outline"
                size="icon"
                onClick={() => {
                    if (parentPath) {
                        setActiveRootPath(parentPath);
                    }
                }}
                disabled={!parentPath}
                className="rounded-full"
            >
                <ChevronLeftIcon className="h-5 w-5" />
            </Button>
            <Button
                variant="outline"
                size="icon"
                onClick={() => setActiveRootPath(rootPath)}
                className="rounded-full"
            >
                <HomeGlyph className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex items-center gap-2 overflow-hidden text-base text-white/84">
                {breadcrumbPaths.map((path, index) => (
                    <React.Fragment key={path}>
                        {index > 0 ? <ChevronRightIcon className="h-4 w-4 shrink-0 text-white/34" /> : null}
                        <Button
                            variant="ghost"
                            onClick={() => setActiveRootPath(path)}
                            className="flex shrink-0 items-center gap-2 rounded-full px-2 py-1 text-left h-auto"
                        >
                            <FolderGlyph className="h-4 w-4 text-cyan-200/92" />
                            <span className="truncate max-w-[150px]">{truncateLabel(labelFromPath(path), 18)}</span>
                        </Button>
                    </React.Fragment>
                ))}
            </div>
        </div>
    );
}
