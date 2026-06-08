import { useEffect, useState } from "react";

const iconCache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();

function getElectronAPI() {
    return (window as Window & { electronAPI?: { getFileIcon: (p: string) => Promise<{ ok: boolean; dataUrl: string | null }> } }).electronAPI ?? null;
}

async function fetchIcon(filePath: string): Promise<string | null> {
    const api = getElectronAPI();
    if (!api) return null;
    const result = await api.getFileIcon(filePath);
    return result.ok ? result.dataUrl : null;
}

function getOrFetchIcon(filePath: string): Promise<string | null> {
    if (iconCache.has(filePath)) {
        return Promise.resolve(iconCache.get(filePath) ?? null);
    }
    if (pending.has(filePath)) {
        return pending.get(filePath)!;
    }
    const p = fetchIcon(filePath).then((url) => {
        iconCache.set(filePath, url);
        pending.delete(filePath);
        return url;
    });
    pending.set(filePath, p);
    return p;
}

export function useFileIcon(filePath: string | null | undefined): string | null {
    const [dataUrl, setDataUrl] = useState<string | null>(() => {
        if (!filePath) return null;
        return iconCache.get(filePath) ?? null;
    });

    useEffect(() => {
        if (!filePath) return;
        let cancelled = false;
        getOrFetchIcon(filePath).then((url) => {
            if (!cancelled) setDataUrl(url);
        });
        return () => { cancelled = true; };
    }, [filePath]);

    return dataUrl;
}
