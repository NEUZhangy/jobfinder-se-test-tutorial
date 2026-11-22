declare module "istanbul-lib-instrument" {
  export function createInstrumenter(options?: Record<string, unknown>): {
    instrumentSync(code: string, filename: string, inputSourceMap?: unknown): string;
    lastSourceMap(): unknown;
    fileCoverage: object;
  };
}
