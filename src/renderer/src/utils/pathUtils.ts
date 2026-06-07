export function getTopRootPath(inputPath: string): string {
    const normalized = normalizeFsPath(inputPath);
    if (/^[a-z]:\//i.test(normalized)) {
        return normalized.slice(0, 3);
    }

    return "/";
}

export function buildBreadcrumbPaths(basePath: string, currentPath: string): string[] {
    const normalizedBase = normalizeFsPath(basePath);
    const normalizedCurrent = normalizeFsPath(currentPath);

    if (!normalizedBase || !normalizedCurrent || !isSameOrChildPath(normalizedCurrent, normalizedBase)) {
        return [];
    }

    const paths = [normalizedCurrent];
    let cursor = normalizedCurrent;

    while (cursor !== normalizedBase) {
        const parent = parentPathOf(cursor);
        if (!parent) {
            break;
        }

        paths.push(parent);
        cursor = parent;
    }

    return paths.reverse();
}

export function labelFromPath(input: string): string {
    const normalized = normalizeFsPath(input);
    if (normalized === "/" || /^[a-z]:\/$/i.test(normalized)) {
        return normalized;
    }

    const segments = normalized.split("/").filter(Boolean);
    return segments.at(-1) ?? normalized;
}

export function normalizeFsPath(rawPath: string): string {
    const trimmed = rawPath.trim();
    if (!trimmed) {
        return "";
    }

    const slashNormalized = trimmed.replace(/\\/g, "/");
    if (/^[a-z]:\/?$/i.test(slashNormalized)) {
        return `${slashNormalized.slice(0, 2).toLowerCase()}/`;
    }

    if (slashNormalized === "/") {
        return "/";
    }

    const noTrailing = slashNormalized.replace(/\/+$/, "");
    if (/^[a-z]:/i.test(noTrailing)) {
        return `${noTrailing.slice(0, 1).toLowerCase()}${noTrailing.slice(1)}`;
    }

    return noTrailing || "/";
}

export function parentPathOf(inputPath: string): string | null {
    const normalized = normalizeFsPath(inputPath);

    if (!normalized || normalized === "/" || /^[a-z]:\/$/i.test(normalized)) {
        return null;
    }

    const index = normalized.lastIndexOf("/");
    if (index < 0) {
        return null;
    }

    if (index === 0) {
        return "/";
    }

    const candidate = normalized.slice(0, index);
    if (/^[a-z]:$/i.test(candidate)) {
        return `${candidate.toLowerCase()}/`;
    }

    return candidate;
}

export function isSameOrChildPath(candidate: string, base: string): boolean {
    const normalizedCandidate = normalizeFsPath(candidate);
    const normalizedBase = normalizeFsPath(base);

    if (!normalizedCandidate || !normalizedBase) {
        return false;
    }

    if (normalizedCandidate === normalizedBase) {
        return true;
    }

    if (normalizedBase === "/") {
        return normalizedCandidate.startsWith("/");
    }

    if (/^[a-z]:\/$/i.test(normalizedBase)) {
        return normalizedCandidate.startsWith(normalizedBase);
    }

    return normalizedCandidate.startsWith(`${normalizedBase}/`);
}

export function isFilesystemRootPath(inputPath: string): boolean {
    const normalized = normalizeFsPath(inputPath);
    return normalized === "/" || /^[a-z]:\/$/i.test(normalized);
}

export function pathDepth(inputPath: string): number {
    const normalized = normalizeFsPath(inputPath);
    if (!normalized || normalized === "/") {
        return 0;
    }

    if (/^[a-z]:\/$/i.test(normalized)) {
        return 1;
    }

    return normalized.split("/").filter(Boolean).length;
}
