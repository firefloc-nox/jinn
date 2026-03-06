#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();
program
  .name("jimmy")
  .description("Lightweight AI gateway daemon")
  .version("0.1.0");

program
  .command("setup")
  .description("Initialize Jimmy and install dependencies")
  .action(() => {
    console.log("TODO: setup");
  });

program
  .command("start")
  .description("Start the gateway daemon")
  .option("--daemon", "Run in background")
  .action(() => {
    console.log("TODO: start");
  });

program
  .command("stop")
  .description("Stop the gateway daemon")
  .action(() => {
    console.log("TODO: stop");
  });

program
  .command("status")
  .description("Show gateway status")
  .action(() => {
    console.log("TODO: status");
  });

program.parse();
