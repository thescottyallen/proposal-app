"use client";

import { Editor } from "@tiptap/react";
import { NodeSelection } from "@tiptap/pm/state";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  Link as LinkIcon,
  Link2Off as LinkOff,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Image as ImageIcon,
  Upload,
  Minus,
  Undo,
  Redo,
  Blocks,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef } from "react";

interface ToolbarProps {
  editor: Editor | null;
  onInsertBlock?: () => void;
}

interface ToolbarButtonProps {
  onClick: () => void;
  isActive?: boolean;
  children: React.ReactNode;
  title: string;
}

function ToolbarButton({ onClick, isActive, children, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      // Use onMouseDown + preventDefault so the editor never loses focus when
      // a toolbar button is pressed. This is the standard TipTap pattern and
      // fixes commands (like toggleHeading) that fail if focus is lost first.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      title={title}
      className={cn(
        "p-2 rounded-md hover:bg-gray-100 transition-colors",
        isActive && "bg-gray-200 text-blue-600"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-6 bg-gray-200 mx-1" />;
}

export function Toolbar({ editor, onInsertBlock }: ToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!editor) return null;

  // ─── Link helpers ──────────────────────────────────────────────────────────

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url  = window.prompt("Enter link URL:", prev ?? "https://");
    if (url === null) return; // cancelled
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
  };

  // ─── Image helpers ─────────────────────────────────────────────────────────

  const addImageFromUrl = () => {
    const url = window.prompt("Enter image URL:");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const addImageFromFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be under 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      editor.chain().focus().setImage({ src: base64 }).run();
    };
    reader.readAsDataURL(file);

    e.target.value = "";
  };

  // ─── Image link helpers ────────────────────────────────────────────────────

  const isImageNodeSelected = (): boolean => {
    const sel = editor.state.selection;
    return (
      sel instanceof NodeSelection &&
      sel.node.type.name === "image"
    );
  };

  const setImageLink = () => {
    const sel = editor.state.selection;
    if (!(sel instanceof NodeSelection) || sel.node.type.name !== "image") return;
    const currentHref = sel.node.attrs.href as string | null;
    const url = window.prompt("Enter image link URL (leave blank to remove):", currentHref ?? "https://");
    if (url === null) return; // cancelled
    editor
      .chain()
      .focus()
      .updateAttributes("image", { href: url || null })
      .run();
  };

  const isLinkActive = editor.isActive("link");
  const imageSelected = isImageNodeSelected();

  return (
    <div className="flex items-center gap-0.5 px-3 py-2 border-b border-gray-200 bg-white flex-wrap">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        title="Undo"
      >
        <Undo size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        title="Redo"
      >
        <Redo size={16} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Bold"
      >
        <Bold size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic"
      >
        <Italic size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        title="Underline"
      >
        <UnderlineIcon size={16} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 size={16} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet List"
      >
        <List size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Ordered List"
      >
        <ListOrdered size={16} />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        isActive={editor.isActive({ textAlign: "left" })}
        title="Align Left"
      >
        <AlignLeft size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        isActive={editor.isActive({ textAlign: "center" })}
        title="Align Center"
      >
        <AlignCenter size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        isActive={editor.isActive({ textAlign: "right" })}
        title="Align Right"
      >
        <AlignRight size={16} />
      </ToolbarButton>

      <Divider />

      {/* Text link */}
      {!imageSelected && (
        <>
          <ToolbarButton
            onClick={setLink}
            isActive={isLinkActive}
            title={isLinkActive ? "Edit link" : "Add link"}
          >
            <LinkIcon size={16} />
          </ToolbarButton>
          {isLinkActive && (
            <ToolbarButton onClick={removeLink} title="Remove link">
              <LinkOff size={16} />
            </ToolbarButton>
          )}
        </>
      )}

      {/* Image link — only shown when an image node is selected */}
      {imageSelected && (
        <ToolbarButton
          onClick={setImageLink}
          title="Set image link"
          isActive={!!(editor.state.selection instanceof NodeSelection && (editor.state.selection as NodeSelection).node.attrs.href)}
        >
          <LinkIcon size={16} />
        </ToolbarButton>
      )}

      <Divider />

      <ToolbarButton onClick={addImageFromFile} title="Upload Image">
        <Upload size={16} />
      </ToolbarButton>
      <ToolbarButton onClick={addImageFromUrl} title="Image from URL">
        <ImageIcon size={16} />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        title="Horizontal Rule"
      >
        <Minus size={16} />
      </ToolbarButton>

      {onInsertBlock && (
        <>
          <Divider />
          <ToolbarButton onClick={onInsertBlock} title="Insert Content Block">
            <Blocks size={16} />
          </ToolbarButton>
        </>
      )}
    </div>
  );
}
