import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { ListItemNode, ListNode } from "@lexical/list";
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  registerMarkdownShortcuts,
  TRANSFORMERS,
} from "@lexical/markdown";
import { LexicalComposer, type InitialConfigType } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import type { EnvironmentId, IssueActor } from "@pathwayos/contracts";
import {
  $applyNodeReplacement,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  EditorConfig,
  EditorState,
  KEY_ENTER_COMMAND,
  LexicalEditor,
  NodeKey,
  SerializedTextNode,
  Spread,
  TextNode,
} from "lexical";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { useActiveEnvironmentId } from "~/state/entities";
import { useIssueActors } from "~/state/issueEntities";

const MENTION_MARKDOWN = /@\[([^\]]+)]\(([^)]+)\)/g;

type SerializedIssueMentionNode = Spread<
  {
    actorId: string;
    displayName: string;
    type: "issue-mention";
    version: 1;
  },
  SerializedTextNode
>;

class IssueMentionNode extends TextNode {
  __actorId: string;
  __displayName: string;

  static override getType(): string {
    return "issue-mention";
  }

  static override clone(node: IssueMentionNode): IssueMentionNode {
    return new IssueMentionNode(node.__displayName, node.__actorId, node.__key);
  }

  static override importJSON(serialized: SerializedIssueMentionNode): IssueMentionNode {
    return $createIssueMentionNode(serialized.displayName, serialized.actorId).updateFromJSON(
      serialized,
    );
  }

  constructor(displayName: string, actorId: string, key?: NodeKey) {
    super(displayName, key);
    this.__displayName = displayName;
    this.__actorId = actorId;
  }

  override createDOM(_config: EditorConfig): HTMLElement {
    const element = document.createElement("span");
    element.className =
      "mx-0.5 inline-flex rounded bg-primary/10 px-1 py-0.5 font-medium text-primary";
    element.textContent = `@${this.__displayName}`;
    return element;
  }

  override updateDOM(previous: IssueMentionNode, dom: HTMLElement): boolean {
    if (
      previous.__displayName !== this.__displayName ||
      previous.__actorId !== this.__actorId
    ) {
      dom.textContent = `@${this.__displayName}`;
    }
    return false;
  }

  override exportJSON(): SerializedIssueMentionNode {
    return {
      ...super.exportJSON(),
      actorId: this.__actorId,
      displayName: this.__displayName,
      type: "issue-mention",
      version: 1,
    };
  }

  override getTextContent(): string {
    return `@[${this.__displayName}](${this.__actorId})`;
  }

  override isTextEntity(): true {
    return true;
  }
}

function $createIssueMentionNode(displayName: string, actorId: string): IssueMentionNode {
  return $applyNodeReplacement(
    new IssueMentionNode(displayName, actorId).setMode("token").setDetail(1),
  );
}

function importMarkdown(markdown: string): void {
  const mentions: Array<{ actorId: string; displayName: string }> = [];
  const protectedMarkdown = markdown.replace(
    MENTION_MARKDOWN,
    (_match, displayName: string, actorId: string) => {
      const index = mentions.push({ actorId, displayName }) - 1;
      return `\uE000${index}\uE001`;
    },
  );
  $convertFromMarkdownString(protectedMarkdown, TRANSFORMERS);

  for (const textNode of $getRoot().getAllTextNodes()) {
    let current: TextNode | null = textNode;
    while (current !== null) {
      const text = current.getTextContent();
      const match = /\uE000(\d+)\uE001/.exec(text);
      if (!match || match.index === undefined) break;
      const mention = mentions[Number(match[1])];
      if (!mention) break;
      const end = match.index + match[0].length;
      let target: TextNode;
      let remainder: TextNode | null = null;
      if (match.index > 0) {
        const parts = current.splitText(match.index, end);
        const mentionPart = parts[1];
        if (!mentionPart) break;
        target = mentionPart;
        remainder = parts[2] ?? null;
      } else if (end < text.length) {
        const parts = current.splitText(end);
        const mentionPart = parts[0];
        if (!mentionPart) break;
        target = mentionPart;
        remainder = parts[1] ?? null;
      } else {
        target = current;
      }
      target.replace($createIssueMentionNode(mention.displayName, mention.actorId));
      current = remainder;
    }
  }
}

function ControlledMarkdownPlugin(props: {
  onChange: (markdown: string) => void;
  value: string;
}) {
  const [editor] = useLexicalComposerContext();
  const lastEmitted = useRef(props.value);

  useEffect(() => {
    if (props.value === lastEmitted.current) return;
    lastEmitted.current = props.value;
    editor.update(() => importMarkdown(props.value));
  }, [editor, props.value]);

  const handleChange = useCallback(
    (editorState: EditorState) => {
      const markdown = editorState.read(() => $convertToMarkdownString(TRANSFORMERS));
      if (markdown === lastEmitted.current) return;
      lastEmitted.current = markdown;
      props.onChange(markdown);
    },
    [props.onChange],
  );

  return <OnChangePlugin ignoreSelectionChange onChange={handleChange} />;
}

function SubmitShortcutPlugin(props: { onSubmit?: (() => void) | undefined }) {
  const [editor] = useLexicalComposerContext();
  const onSubmitRef = useRef(props.onSubmit);
  onSubmitRef.current = props.onSubmit;

  useEffect(
    () =>
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (!event || (!event.metaKey && !event.ctrlKey) || !onSubmitRef.current) return false;
          event.preventDefault();
          onSubmitRef.current();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  );
  return null;
}

function MarkdownShortcutsPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(() => registerMarkdownShortcuts(editor, TRANSFORMERS), [editor]);
  return null;
}

function insertMention(editor: LexicalEditor, actor: IssueActor, query: string): void {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
    const node = selection.anchor.getNode();
    if (!$isTextNode(node)) return;
    const offset = selection.anchor.offset;
    const start = Math.max(0, offset - query.length - 1);
    node.spliceText(start, query.length + 1, "", true);
    const nextSelection = $getSelection();
    if ($isRangeSelection(nextSelection)) {
      nextSelection.insertNodes([$createIssueMentionNode(actor.displayName, actor.id), $createTextNode(" ")]);
    }
  });
}

function MentionPlugin(props: { actors: ReadonlyArray<IssueActor> }) {
  const [editor] = useLexicalComposerContext();
  const [query, setQuery] = useState<string | null>(null);

  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        const nextQuery = editorState.read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) return null;
          const node = selection.anchor.getNode();
          if (!$isTextNode(node)) return null;
          const beforeCursor = node.getTextContent().slice(0, selection.anchor.offset);
          return /(?:^|\s)@([\p{L}\p{N}_.-]*)$/u.exec(beforeCursor)?.[1] ?? null;
        });
        setQuery((current) => (current === nextQuery ? current : nextQuery));
      }),
    [editor],
  );

  const suggestions = useMemo(() => {
    if (query === null) return [];
    const normalized = query.toLocaleLowerCase();
    return props.actors
      .filter(
        (actor) =>
          actor.deletedAt === null &&
          actor.displayName.toLocaleLowerCase().includes(normalized),
      )
      .slice(0, 6);
  }, [props.actors, query]);

  if (query === null || suggestions.length === 0) return null;
  return (
    <div className="absolute bottom-2 left-2 z-20 min-w-52 rounded-lg border bg-popover p-1 shadow-lg">
      {suggestions.map((actor) => (
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          key={actor.id}
          onMouseDown={(event) => {
            event.preventDefault();
            insertMention(editor, actor, query);
            setQuery(null);
          }}
          type="button"
        >
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: actor.avatarColor }}
          />
          <span className="truncate">{actor.displayName}</span>
        </button>
      ))}
    </div>
  );
}

export interface MarkdownEditorProps {
  readonly value: string;
  readonly onChange: (markdown: string) => void;
  readonly placeholder?: string;
  readonly minHeight?: number | string;
  readonly onSubmit?: (() => void) | undefined;
  readonly environmentId?: EnvironmentId | null;
  readonly className?: string;
  readonly autoFocus?: boolean;
}

export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write with markdown…",
  minHeight = 120,
  onSubmit,
  environmentId: environmentIdProp,
  className,
  autoFocus = false,
}: MarkdownEditorProps) {
  const activeEnvironmentId = useActiveEnvironmentId();
  const actors = useIssueActors(environmentIdProp ?? activeEnvironmentId);
  const initialValue = useRef(value);
  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      namespace: "IssueMarkdownEditor",
      nodes: [CodeNode, HeadingNode, IssueMentionNode, LinkNode, ListItemNode, ListNode, QuoteNode],
      editorState: () => importMarkdown(initialValue.current),
      onError(error) {
        throw error;
      },
      theme: {
        code: "my-2 block overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs",
        heading: {
          h1: "mb-2 mt-3 text-xl font-semibold",
          h2: "mb-2 mt-3 text-lg font-semibold",
          h3: "mb-1 mt-2 font-semibold",
        },
        link: "text-primary underline underline-offset-2",
        list: {
          listitem: "ml-5",
          nested: { listitem: "ml-4" },
          ol: "my-2 list-decimal",
          ul: "my-2 list-disc",
        },
        paragraph: "mb-2 last:mb-0",
        quote: "my-2 border-l-2 border-border pl-3 text-muted-foreground",
        text: {
          bold: "font-semibold",
          code: "rounded bg-muted px-1 py-0.5 font-mono text-xs",
          italic: "italic",
          strikethrough: "line-through",
        },
      },
    }),
    [],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div
        className={cn(
          "relative rounded-lg border border-input bg-background text-sm shadow-xs/5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/24",
          className,
        )}
        style={{ minHeight }}
      >
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              aria-label={placeholder}
              autoFocus={autoFocus}
              className="min-h-[inherit] px-3 py-2 outline-none"
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
          placeholder={
            <div className="pointer-events-none absolute left-3 top-2 text-muted-foreground/72">
              {placeholder}
            </div>
          }
        />
        <HistoryPlugin />
        <MarkdownShortcutsPlugin />
        <ControlledMarkdownPlugin onChange={onChange} value={value} />
        <SubmitShortcutPlugin onSubmit={onSubmit} />
        <MentionPlugin actors={actors} />
      </div>
    </LexicalComposer>
  );
}
