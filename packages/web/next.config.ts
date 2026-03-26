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
    config.output = "export";
    // Next 15.5 crashes during static export with "Unexpected response from worker".
    // Disabling worker threads is the documented workaround until the upstream fix lands.
    config.experimental = { ...(config.experimental || {}), workerThreads: false };
  }

  return config;
};
