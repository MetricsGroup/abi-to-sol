import prettier from "prettier";
import * as Codec from "@truffle/codec";
import * as Abi from "@truffle/abi-utils";
import { Abi as SchemaAbi } from "@truffle/contract-schema/spec";

import { Visitor, VisitOptions, dispatch, Node } from "./visitor";

import * as defaults from "./defaults";

import {
  Component,
  Declaration,
  Declarations,
  collectDeclarations,
} from "./declarations";

export interface GenerateSolidityOptions {
  abi: Abi.Abi | SchemaAbi;
  name?: string;
  solidityVersion?: string;
  license?: string;
  prettier?: boolean;
}

export const generateSolidity = ({
  abi,
  ...options
}: GenerateSolidityOptions) => {
  const generated = dispatch({
    node: abi,
    visitor: new SolidityGenerator({
      ...options,
      declarations: collectDeclarations(abi),
    }),
  });

  if (!options.prettier) {
    return generated;
  }

  try {
    return prettier.format(generated, {
      plugins: ["prettier-plugin-solidity"],
      // @ts-ignore
      parser: "solidity-parse",
    });
  } catch (error) {
    return generated;
  }
};

interface Context {
  parameterModifiers: (parameter: Abi.Parameter) => string[];
}

type Visit<N extends Node> = VisitOptions<N, Context | undefined>;

type ConstructorOptions = { declarations: Declarations } & Omit<
  GenerateSolidityOptions,
  "abi"
>;

class SolidityGenerator implements Visitor<string, Context | undefined> {
  private name: string;
  private license: string;
  private solidityVersion: string;
  private declarations: Declarations;
  private identifiers: {
    [signature: string]: string;
  };

  constructor({
    declarations,
    name = defaults.name,
    license = defaults.license,
    solidityVersion = defaults.solidityVersion,
  }: ConstructorOptions) {
    this.name = name;
    this.license = license;
    this.declarations = declarations;
    this.solidityVersion = solidityVersion;

    this.identifiers = {};
    let index = 0;
    for (const [signature, { identifier }] of Object.entries(declarations)) {
      if (identifier) {
        this.identifiers[signature] = identifier;
      } else {
        this.identifiers[signature] = `S_${index++}`;
      }
    }
  }

  visitAbi({ node: abi }: Visit<Abi.Abi>) {
    return [
      this.generateHeader(),
      this.generateDeclarations(),
      this.generateInterface(abi),
      this.generateAutogeneratedNotice(abi),
    ].join("\n\n");
  }

  visitFunctionEntry({ node: entry }: Visit<Abi.FunctionEntry>): string {
    const { name, inputs, stateMutability } = entry;

    return [
      `function ${name}(`,
      entry.inputs.map((node) =>
        dispatch({
          node,
          visitor: this,
          context: {
            parameterModifiers: (parameter: Abi.Parameter) =>
              parameter.type.startsWith("tuple") ||
              parameter.type.includes("[") ||
              parameter.type === "bytes" ||
              parameter.type === "string"
                ? ["memory"]
                : [],
          },
        })
      ),
      `) external`,
      this.generateStateMutability(entry),
      entry.outputs && entry.outputs.length > 0
        ? [
            `returns (`,
            entry.outputs
              .map((node) =>
                dispatch({
                  node,
                  visitor: this,
                  context: {
                    parameterModifiers: (parameter: Abi.Parameter) =>
                      parameter.type.startsWith("tuple") ||
                      parameter.type.includes("[") ||
                      parameter.type === "bytes" ||
                      parameter.type === "string"
                        ? ["memory"]
                        : [],
                  },
                })
              )
              .join(", "),
            `)`,
          ].join("")
        : ``,
      `;`,
    ].join(" ");
  }

  visitConstructorEntry({ node: entry }: Visit<Abi.ConstructorEntry>): string {
    // interfaces don't have constructors
    return "";
  }

  visitFallbackEntry({ node: entry }: Visit<Abi.FallbackEntry>): string {
    const { stateMutability } = entry;
    return `fallback () external ${
      stateMutability === "payable" ? "payable" : ""
    };`;
  }

  visitReceiveEntry() {
    return `receive () external payable;`;
  }

  visitEventEntry({ node: entry }: Visit<Abi.EventEntry>): string {
    const { name, inputs, anonymous } = entry;

    return [
      `event ${name}(`,
      inputs.map((node) =>
        dispatch({
          node,
          visitor: this,
          context: {
            parameterModifiers: (parameter: Abi.Parameter) =>
              // TODO fix this
              (parameter as Abi.EventParameter).indexed ? ["indexed"] : [],
          },
        })
      ),
      `)`,
      `${anonymous ? "anonymous" : ""};`,
    ].join(" ");
  }

  visitParameter({ node: parameter, context }: Visit<Abi.Parameter>) {
    const type = this.generateType(parameter);

    // @ts-ignore
    const { parameterModifiers } = context;

    return [type, ...parameterModifiers(parameter), parameter.name].join(" ");
  }

  private generateHeader(): string {
    return [
      `// SPDX-License-Identifier: ${this.license}`,
      `// !! THIS FILE WAS AUTOGENERATED BY abi-to-sol. SEE BELOW FOR SOURCE. !!`,
      `pragma solidity ${this.solidityVersion};`,
      `pragma experimental ABIEncoderV2;`, // TODO emit this only if needed
    ].join("\n");
  }

  private generateAutogeneratedNotice(abi: Abi.Abi): string {
    return [
      ``,
      `// THIS FILE WAS AUTOGENERATED FROM THE FOLLOWING ABI JSON:`,
      `/*`,
      JSON.stringify(abi),
      `*/`,
    ].join("\n");
  }

  private generateDeclarations(): string {
    return [...Object.entries(this.declarations).entries()]
      .map(([index, [signature, declaration]]) => {
        const identifier = this.identifiers[signature];
        const components = this.generateComponents(declaration);

        return `struct ${identifier} { ${components} }`;
      })
      .join("\n\n");
  }

  private generateComponents(declaration: Declaration): string {
    return declaration.components
      .map((component) => {
        const { name, type, signature } = component;

        if (!signature) {
          return `${type} ${name};`;
        }

        const identifier = type.replace("tuple", this.identifiers[signature]);

        return `${identifier} ${name};`;
      })
      .join("\n");
  }

  private generateType(parameter: Abi.Parameter): string {
    if (!parameter.components) {
      return parameter.type;
    }

    const { type, components } = parameter;

    const signature = Codec.AbiData.Utils.abiTupleSignature(components);

    return type.replace("tuple", this.identifiers[signature]);
  }

  private generateStateMutability(
    entry:
      | Abi.FunctionEntry
      | Abi.FallbackEntry
      | Abi.ConstructorEntry
      | Abi.ReceiveEntry
  ): string {
    if (entry.stateMutability && entry.stateMutability !== "nonpayable") {
      return entry.stateMutability;
    }

    return "";
  }

  private generateInterface(abi: Abi.Abi): string {
    return [
      `interface ${this.name} {`,
      ...abi.map((node) => dispatch({ node, visitor: this })),
      `}`,
    ].join("\n");
  }
}
