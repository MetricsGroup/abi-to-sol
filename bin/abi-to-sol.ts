#!/usr/bin/env node

const neodoc = require("neodoc");
import {Abi as SchemaAbi} from "@truffle/contract-schema/spec";
import * as abiSchema from "@truffle/contract-schema/spec/abi.spec.json";
import betterAjvErrors from "better-ajv-errors";
import Ajv from "ajv";

import {generateSolidity} from "../lib";
import * as defaults from "../lib/defaults";

const usage = `
abi-to-sol

Usage:
  abi-to-sol
    [--solidity-version=<solidityVersion>]
    [--license=<license>]
    [--validate]
    [<name>]
  abi-to-sol -h | --help
  abi-to-sol --version

Options:
  <name>
    Name of generated interface. Default: ${defaults.name}

  --validate
    Validate JSON before starting

  -V --solidity-version
    Version of Solidity (for pragma). Default: ${defaults.solidityVersion}

  -L --license
    SPDX license identifier. Default: ${defaults.license}

  -h --help     Show this screen.
  --version     Show version.
`;

const readStdin = async () =>
  await new Promise((accept, reject) => {
    const chunks: Buffer[] = [];

    process.stdin.setEncoding("utf8");

    process.stdin.on("data", (chunk) => chunks.push(chunk));

    process.stdin.on("end", () => {
      try {
        const json = chunks.join();
        const abi = JSON.parse(json);
        accept(abi);
      } catch (error) {
        reject(error);
      }
    });
  });

const main = async () => {
  const args = neodoc.run(usage, {
    smartOptions: true,
    laxPlacement: true,
  });

  const ajv = new Ajv({jsonPointers: true});
  const validate = ajv.compile(abiSchema);

  const options = {
    solidityVersion: args["-V"] || args["--solidity-version"],
    name: args["<name>"],
    license: args["-L"] || args["--license"],
    validate: args["--validate"] || false,
  };

  const abi: SchemaAbi = (await readStdin()) as SchemaAbi;

  if (options.validate) {
    const valid = validate(abi);
    if (!valid) {
      const output = betterAjvErrors(abiSchema, abi, validate.errors, {
        format: "cli",
      });
      console.log(output);
      process.exit(1);
    }
  }

  process.stdout.write(
    generateSolidity({
      ...options,
      abi,
    })
  );
};

main();
