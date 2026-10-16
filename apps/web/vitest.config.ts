import { mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.js";
import shared from "../../vitest.shared.js";

export default mergeConfig(viteConfig, shared);
