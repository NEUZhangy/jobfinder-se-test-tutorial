import { mkdirSync, rmSync } from "node:fs";
import { COVERAGE_DIR } from "./paths";

export default function globalSetup() {
  rmSync(COVERAGE_DIR, { recursive: true, force: true });
  mkdirSync(COVERAGE_DIR, { recursive: true });
}
