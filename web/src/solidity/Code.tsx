import React from 'react';
import {
  Box,
  HStack,
  Divider,
  Flex,
  Stack,
  FormLabel,
  Switch,
  Center,
  Spacer,
  Heading,
} from "@chakra-ui/react";

import * as Options from "./Options";
import * as Output from "./Output";
import { CopyButton } from "../CopyButton";

// Highlight.js setup
import "highlight.js/styles/default.css";
import hljs from "highlight.js";
import hljsDefineSolidity from "highlightjs-solidity";
hljsDefineSolidity(hljs);
hljs.initHighlightingOnLoad();


export const Code = () => {
  const { isGenerating, ...result } = Output.Container.useContainer();
  const { prettifyOutput, setPrettifyOutput } = Options.Container.useContainer();

  const [html, setHtml] = React.useState("");
  const [showHtml, setShowHtml] = React.useState(false);

  React.useEffect(() => {
    if (isGenerating) {
      setShowHtml(false);
      return;
    }

    if ("contents" in result) {
      const { contents } = result;

      try {
        setHtml(hljs.highlight(contents, { language: "solidity" }).value);
        setShowHtml(true);
      } catch {
        setHtml(contents);
        setShowHtml(true);
      }

      return;
    }

    setShowHtml(false);

  }, [isGenerating, result]);

  return (
      <Box paddingTop="1em">
        {showHtml && (
          <pre dangerouslySetInnerHTML={{
            __html: html
          }} />
        )}
    {/*<Flex
      direction="column"
      height="100%"
      overflow="hidden"
    >*/}
      </Box>
  )
   /*

    <div className="stack">
      <span className="header">Solidity</span>
      <span>
        <CopyButton text={contents} />
      </span>
      <div className="pane">
        <pre dangerouslySetInnerHTML={{
          __html: html
        }} />
      </div>
    </div>
      */
}

