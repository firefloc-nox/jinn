import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";
import type { NextConfig } from "next";

export default (phase: string): NextConfig => {
  const config: NextConfig = {
    distDir: "out",
  };

  if (phase === PHASE_DEVELOPMENT_SERVER) {
    config.rewrites = async () => [
      { source: "/api/:path*", destination: "http://127.0.0.1:7778/api/:path*" },
      { source: "/ws", destination: "http://127.0.0.1:7778/ws" },
    ];
  } else {
    // static export disabled — causes "Unexpected response from worker" crash in Next 15.5
    // TODO: re-enable once Next.js fixes the worker crash
    // config.output = "export";
  }

  return config;
};
