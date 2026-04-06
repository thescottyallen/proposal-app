"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { useState } from "react";
import { Toolbar } from "./Toolbar";
import { ContentBlockPicker } from "./ContentBlockPicker";
import type { RichTextBlock as RichTextBlockType } from "@/lib/proposal-document";

const PROSE =
  "prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[120px]" +
  " [&_.tiptap]:outline-none" +
  " [&_.tiptap_h1]:text-3xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mb-4 [&_.tiptap_h1]:mt-6" +
  " [&_.tiptap_h2]:text-2xl [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:mb-3 [&_.tiptap_h2]:mt-5" +
  " [&_.tiptap_h3]:text-xl [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mb-2 [&_.tiptap_h3]:mt-4" +
  " [&_.tiptap_p]:mb-3 [&_.tiptap_p]:leading-relaxed" +
  " [&_.tiptap_img]:rounded-lg [&_.tiptap_img]:max-w-full" +
  " [&_.tiptap_hr]:my-6 [&_.tiptap_hr]:border-gray-200" +
  " [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6" +
  " [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6" +
  " [&_.tiptap_.is-editor-empty:first-child::before]:text-gray-400" +
  " [&_.tiptap_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]" +
  " [&_.tiptap_.is-editor-empty:first-child::before]:float-left" +
  " [&_.tiptap_.is-editor-empty:first-child::before]:h-0" +
  " [&_.tiptap_.is-editor-empty:first-child::before]:pointer-events-none";

interface RichTextBlockProps {
  block: RichTextBlockType;
  onChange: (content: Record<string, unknown>) => void;
  readOnly?: boolean;
  /**
   * When provided, clicking the content-block icon in the toolbar calls this
   * instead of opening a local picker — lets ProposalEditor own insertion.
   */
  onInsertContentBlock?: () => void;
}

export function RichTextBlock({
  block,
  onChange,
  readOnly = false,
  onInsertContentBlock,
}: RichTextBlockProps) {
  const [showBlockPicker, setShowBlockPicker] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder: "Start writing..." }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
    ],
    content: block.content || undefined,
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onChange(editor.getJSON());
    },
  });

  // If a page-level handler is provided, route the toolbar button there;
  // otherwise fall back to the local picker (used in stand-alone editors).
  const handleInsertBlock = onInsertContentBlock
    ? onInsertContentBlock
    : () => setShowBlockPicker(true);

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {!readOnly && (
        <Toolbar
          editor={editor}
          onInsertBlock={handleInsertBlock}
        />
      )}
      {/* Local picker only active when no page-level handler is present */}
      {!onInsertContentBlock && (
        <ContentBlockPicker
          editor={editor}
          isOpen={showBlockPicker}
          onClose={() => setShowBlockPicker(false)}
        />
      )}
      <div className="px-8 py-6">
        <EditorContent editor={editor} className={PROSE} />
      </div>
    </div>
  );
}

/** Read-only version used in the public proposal view */
export function RichTextBlockReadOnly({
  content,
}: {
  content: Record<string, unknown>;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Image.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
    ],
    content: content || undefined,
    editable: false,
    immediatelyRender: false,
  });

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      <div className="px-8 py-6">
        <EditorContent editor={editor} className={PROSE} />
      </div>
    </div>
  );
}
