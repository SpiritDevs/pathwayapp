import {
  SelectableMarkdownText as PathwayOSSelectableMarkdownText,
  type SelectableMarkdownTextProps,
} from "@pathwayos/mobile-markdown-text/renderer";

import { highlightCodeSnippet } from "../features/review/shikiReviewHighlighter";

type MobileSelectableMarkdownTextProps = Omit<SelectableMarkdownTextProps, "highlightCode">;

export type {
  NativeMarkdownTextStyle,
  SelectableMarkdownSkill,
} from "@pathwayos/mobile-markdown-text/types";

export function hasNativeSelectableMarkdownText(): boolean {
  return true;
}

export function SelectableMarkdownText(props: MobileSelectableMarkdownTextProps) {
  return <PathwayOSSelectableMarkdownText {...props} highlightCode={highlightCodeSnippet} />;
}
