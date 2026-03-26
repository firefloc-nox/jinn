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
    // config.output = "export"; // Disabled for dynamic features
  }

  return config;
};
