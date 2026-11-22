import { createInstrumenter } from "istanbul-lib-instrument";
import { decode, encode } from "@jridgewell/sourcemap-codec";

type RawSourceMap = { version: number; sources: string[]; names: string[]; mappings: string; file: string; sourceRoot?: string; sourcesContent?: string[] };

/**
 * Vite's JSX transform leaves whole generated lines without a source mapping (the `jsxDEV(...)` call arguments).
 * nyc then cannot map the END of a statement such as `return (<div/>)` back to the source and drops the statement,
 * so every file made only of components reports 0 of 0. Giving each unmapped line the position of the last mapped
 * line before it lets nyc find an end position. Lines before the first mapping stay unmapped, so generated helper
 * statements such as `_jsxFileName` are still dropped.
 */
export function fillUnmappedLines(map: RawSourceMap): RawSourceMap {
  const lines = decode(map.mappings);
  let last: [number, number, number] | null = null;
  const filled = lines.map((segments) => {
    if (segments.length > 0) {
      const tail = segments[segments.length - 1];
      if (tail.length >= 4) last = [tail[1] as number, tail[2] as number, tail[3] as number];
      return segments;
    }
    return last ? [[0, ...last] as [number, number, number, number]] : segments;
  });
  return { ...map, mappings: encode(filled) };
}

/** An istanbul instrumenter that fills the unmapped lines of the incoming source map first. */
export function createFilledInstrumenter() {
  const inner = createInstrumenter({
    coverageGlobalScopeFunc: false,
    coverageGlobalScope: "globalThis",
    preserveComments: true,
    produceSourceMap: true,
    autoWrap: true,
    esModules: true,
    compact: false,
  });
  return {
    instrumentSync: (code: string, filename: string, map?: RawSourceMap) => inner.instrumentSync(code, filename, map ? fillUnmappedLines(map) : map),
    lastSourceMap: () => inner.lastSourceMap() as RawSourceMap | null,
    get fileCoverage() {
      return inner.fileCoverage;
    },
  };
}
