import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  installCommand: "npm install -g vite-plus && vp install --filter '@pathwayos/marketing'",
  buildCommand: "vp run --filter @pathwayos/marketing build",
  outputDirectory: "dist",
};
