"use client";

import { Shell } from "@/components/ui/Shell";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Toolbar } from "@/components/editor/Toolbar";
import { ContentBlockPicker } from "@/components/editor/ContentBlockPicker";
import { useParams } from "next/navigation";
import { useState, useEffect } from "react";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";

const CATEGORIES = [
  "About Us",
  "Terms & Conditions",
  "Pricing",
  "Introduction",
  "Scope of Work",
  "Timeline",
  "Other",
];

interface ContentBlock {
  id: string;
  name: string;
  category: string;
  content: Record<string, unknown>;
}

export default function EditContentBlockPage() {
  const params = useParams();
  const id = params.id as string;

  const [block, setBlock] = useState<ContentBlock | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [content, setContent] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [showBlockPicker, setShowBlockPicker] = useState(false);

  useUnsavedChanges(hasChanges);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({
        placeholder: "Start writing your content block...",
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Underline,
    ],
    content: undefined,
    editable: true,
    onUpdate: ({ editor }) => {
      setContent(editor.getJSON());
      setHasChanges(true);
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    fetch(`/api/content-blocks/${id}`)
      .then((res) => res.json())
      .then((data) => {
        setBlock(data);
        setName(data.name);
        setCategory(data.category);
        setContent(data.content);
        if (editor) {
          editor.commands.setContent(data.content);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, editor]);

  const handleNameChange = (value: string) => {
    setName(value);
    setHasChanges(true);
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/content-blocks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, content }),
      });
      setHasChanges(false);
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Loading content block...</p>
        </div>
      </Shell>
    );
  }

  if (!block) {
    return (
      <Shell>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Content block not found</p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="px-8 py-8 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/content-library"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              className="text-2xl font-bold text-gray-900 border-0 bg-transparent focus:outline-none focus:ring-0 p-0"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {/* Category selector */}
        <div className="mb-6">
          <label className="block text-xs text-gray-500 mb-1">Category</label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {/* Editor */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <Toolbar
            editor={editor}
            onInsertBlock={() => setShowBlockPicker(true)}
          />
          <div className="px-8 py-6">
            <EditorContent
              editor={editor}
              className="prose prose-sm sm:prose-base max-w-none focus:outline-none min-h-[400px]
                [&_.tiptap]:outline-none
                [&_.tiptap_h1]:text-3xl [&_.tiptap_h1]:font-bold [&_.tiptap_h1]:mb-4 [&_.tiptap_h1]:mt-6
                [&_.tiptap_h2]:text-2xl [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:mb-3 [&_.tiptap_h2]:mt-5
                [&_.tiptap_h3]:text-xl [&_.tiptap_h3]:font-semibold [&_.tiptap_h3]:mb-2 [&_.tiptap_h3]:mt-4
                [&_.tiptap_p]:mb-3 [&_.tiptap_p]:leading-relaxed
                [&_.tiptap_img]:rounded-lg [&_.tiptap_img]:max-w-full
                [&_.tiptap_hr]:my-6 [&_.tiptap_hr]:border-gray-200
                [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-6
                [&_.tiptap_ol]:list-decimal [&_.tiptap_ol]:pl-6
                [&_.tiptap_.is-editor-empty:first-child::before]:text-gray-400
                [&_.tiptap_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]
                [&_.tiptap_.is-editor-empty:first-child::before]:float-left
                [&_.tiptap_.is-editor-empty:first-child::before]:h-0
                [&_.tiptap_.is-editor-empty:first-child::before]:pointer-events-none
              "
            />
          </div>
        </div>

        <ContentBlockPicker
          editor={editor}
          isOpen={showBlockPicker}
          onClose={() => setShowBlockPicker(false)}
        />
      </div>
    </Shell>
  );
}
