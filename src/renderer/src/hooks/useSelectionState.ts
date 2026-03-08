import { useState, useCallback } from 'react';
import type { ListRow } from '../components/VisualizationView';

const EMPTY_PATH_SET = new Set<string>();

export function useSelectionState(visualizationRoot: string, listRows: ListRow[]) {
    const [selectionState, setSelectionState] = useState<{
        scopePath: string;
        paths: Set<string>;
    }>({
        scopePath: visualizationRoot,
        paths: new Set(),
    });

    const [hoverState, setHoverState] = useState<{
        scopePath: string;
        path: string | null;
    }>({
        scopePath: visualizationRoot,
        path: null,
    });

    const selectedPaths =
        selectionState.scopePath === visualizationRoot ? selectionState.paths : EMPTY_PATH_SET;
    const hoveredPath = hoverState.scopePath === visualizationRoot ? hoverState.path : null;

    const toggleRowSelection = useCallback((path: string) => {
        setSelectionState((prev) => {
            const next = new Set(
                prev.scopePath === visualizationRoot ? prev.paths : EMPTY_PATH_SET,
            );

            if (next.has(path)) {
                next.delete(path);
            } else {
                next.add(path);
            }

            return {
                scopePath: visualizationRoot,
                paths: next,
            };
        });
    }, [visualizationRoot]);

    const toggleSelectAll = useCallback(() => {
        setSelectionState((prev) => {
            const scopedPaths =
                prev.scopePath === visualizationRoot ? prev.paths : EMPTY_PATH_SET;

            if (listRows.length === 0) {
                return {
                    scopePath: visualizationRoot,
                    paths: new Set(),
                };
            }

            if (listRows.every((row) => scopedPaths.has(row.path))) {
                return {
                    scopePath: visualizationRoot,
                    paths: new Set(),
                };
            }

            return {
                scopePath: visualizationRoot,
                paths: new Set(listRows.map((row) => row.path)),
            };
        });
    }, [visualizationRoot, listRows]);

    const clearSelection = useCallback(() => {
        setSelectionState({
            scopePath: visualizationRoot,
            paths: new Set(),
        });
    }, [visualizationRoot]);

    const setHoveredPath = useCallback((path: string | null) => {
        setHoverState((prev) =>
            path === null && prev.scopePath === visualizationRoot
                ? { scopePath: visualizationRoot, path: null }
                : { scopePath: visualizationRoot, path }
        );
    }, [visualizationRoot]);

    return {
        selectedPaths,
        hoveredPath,
        toggleRowSelection,
        toggleSelectAll,
        clearSelection,
        setHoveredPath,
    };
}
