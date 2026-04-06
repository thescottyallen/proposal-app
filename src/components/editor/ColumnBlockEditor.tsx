"use client";

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TipTapImage from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { AlignCenter, AlignLeft, AlignRight, Columns2, Grid3X3, ImageIcon, Plus, Trash2, Type, Upload, X } from "lucide-react";
import type { ColumnBlock as ColumnBlockType, ColumnCell } from "@/lib/proposal-document";
import { newId } from "@/lib/proposal-document";

// ─── Shared styles ────────────────────────────────────────────────────────────

const CELL_PROSE =
  "prose prose-sm max-w-none focus:outline-none min-h-[80px]" +
  " [&_.tiptap]:outline-none" +
  " [&_.tiptap_p]:mb-2 [&_.tiptap_p]:leading-relaxed" +
  // TipTap TextAlign writes inline style="text-align:…" directly on nodes,
  // which takes priority over prose defaults — no extra classes needed.
  " [&_.tiptap_.is-editor-empty:first-child::before]:text-gray-400" +
  " [&_.tiptap_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]" +
  " [&_.tiptap_.is-editor-empty:first-child::before]:float-left" +
  " [&_.tiptap_.is-editor-empty:first-child::before]:h-0" +
  " [&_.tiptap_.is-editor-empty:first-child::before]:pointer-events-none";

// ─── Text cell ────────────────────────────────────────────────────────────────

interface TextCellProps {
  cell: ColumnCell;
  onUpdate: (cell: ColumnCell) => void;
  readOnly: boolean;
}

function TextCell({ cell, onUpdate, readOnly }: TextCellProps) {
  const [focused, setFocused] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TipTapImage.configure({ inline: false }),
      Placeholder.configure({ placeholder: "Type here..." }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
    ],
    content: cell.content ?? { type: "doc", content: [{ type: "paragraph" }] },
    editable: !readOnly,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      onUpdate({ ...cell, content: editor.getJSON() });
    },
  });

  return (
    <div
      className="relative h-full"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {/* Mini formatting toolbar — appears when cell is focused */}
      {!readOnly && focused && (
        <div className="absolute -top-8 left-0 flex items-center gap-0.5 z-20 bg-white border border-gray-200 rounded-md shadow-sm px-1 py-0.5">
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor?.chain().focus().toggleBold().run();
            }}
            className={`px-2 py-0.5 rounded text-xs font-bold transition-colors ${
              editor?.isActive("bold")
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            B
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor?.chain().focus().toggleItalic().run();
            }}
            className={`px-2 py-0.5 rounded text-xs italic transition-colors ${
              editor?.isActive("italic")
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            I
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor?.chain().focus().toggleUnderline().run();
            }}
            className={`px-2 py-0.5 rounded text-xs underline transition-colors ${
              editor?.isActive("underline")
                ? "bg-blue-100 text-blue-700"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            U
          </button>
          <div className="w-px h-3 bg-gray-200 mx-0.5" />
          <select
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "p") {
                editor?.chain().focus().setParagraph().run();
              } else {
                editor
                  ?.chain()
                  .focus()
                  .setHeading({ level: parseInt(val) as 1 | 2 | 3 })
                  .run();
              }
            }}
            value={
              editor?.isActive("heading", { level: 1 })
                ? "1"
                : editor?.isActive("heading", { level: 2 })
                ? "2"
                : editor?.isActive("heading", { level: 3 })
                ? "3"
                : "p"
            }
            className="text-xs text-gray-600 bg-transparent border-none outline-none cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5"
          >
            <option value="p">Normal</option>
            <option value="1">H1</option>
            <option value="2">H2</option>
            <option value="3">H3</option>
          </select>
          <div className="w-px h-3 bg-gray-200 mx-0.5" />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor?.chain().focus().setTextAlign("left").run();
            }}
            className={`p-0.5 rounded transition-colors ${
              editor?.isActive({ textAlign: "left" }) || !editor?.isActive({ textAlign: "center" }) && !editor?.isActive({ textAlign: "right" })
                ? "bg-blue-100 text-blue-700"
                : "text-gray-500 hover:bg-gray-100"
            }`}
            title="Align left"
          >
            <AlignLeft size={11} />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor?.chain().focus().setTextAlign("center").run();
            }}
            className={`p-0.5 rounded transition-colors ${
              editor?.isActive({ textAlign: "center" })
                ? "bg-blue-100 text-blue-700"
                : "text-gray-500 hover:bg-gray-100"
            }`}
            title="Align center"
          >
            <AlignCenter size={11} />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              editor?.chain().focus().setTextAlign("right").run();
            }}
            className={`p-0.5 rounded transition-colors ${
              editor?.isActive({ textAlign: "right" })
                ? "bg-blue-100 text-blue-700"
                : "text-gray-500 hover:bg-gray-100"
            }`}
            title="Align right"
          >
            <AlignRight size={11} />
          </button>
        </div>
      )}

      <EditorContent editor={editor} className={CELL_PROSE} />
    </div>
  );
}

// ─── Image cell ───────────────────────────────────────────────────────────────

interface ImageCellProps {
  cell: ColumnCell;
  onUpdate: (cell: ColumnCell) => void;
  readOnly: boolean;
}

function ImageCell({ cell, onUpdate, readOnly }: ImageCellProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      onUpdate({ ...cell, imageUrl: data.url });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (readOnly) return;
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (cell.imageUrl) {
    return (
      <div className="h-full">
        <div className="relative group/img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cell.imageUrl}
            alt={cell.imageAlt || ""}
            className="w-full h-auto rounded object-contain"
          />
          {!readOnly && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover/img:opacity-100 transition-opacity bg-black/30 rounded">
              <button
                onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 bg-white text-gray-900 text-xs font-medium rounded-lg shadow hover:bg-gray-50"
              >
                Replace
              </button>
              <button
                onClick={() => onUpdate({ ...cell, imageUrl: "" })}
                className="px-3 py-1.5 bg-white text-red-600 text-xs font-medium rounded-lg shadow hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          )}
        </div>
        {!readOnly && (
          <input
            type="text"
            value={cell.imageAlt || ""}
            onChange={(e) => onUpdate({ ...cell, imageAlt: e.target.value })}
            placeholder="Alt text (optional)"
            className="w-full mt-1.5 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-600"
          />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-full min-h-[80px]">
      <button
        onClick={() => !readOnly && fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        disabled={readOnly || uploading}
        className="w-full h-full min-h-[80px] flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {uploading ? (
          <span className="text-xs text-gray-500 animate-pulse">Uploading...</span>
        ) : (
          <>
            <Upload size={18} className="text-gray-300" />
            <span className="text-xs text-gray-400">
              Click or drag to upload
            </span>
            <span className="text-xs text-gray-300">PNG, JPG, GIF — max 5 MB</span>
          </>
        )}
      </button>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
    </div>
  );
}

// ─── Block editor ─────────────────────────────────────────────────────────────

interface ColumnBlockEditorProps {
  block: ColumnBlockType;
  onChange: (block: ColumnBlockType) => void;
  readOnly?: boolean;
}

function makeTextCell(): ColumnCell {
  return {
    id: newId(),
    type: "text",
    content: { type: "doc", content: [{ type: "paragraph" }] },
    imageUrl: "",
    imageAlt: "",
    colSpan: 1,
  };
}

function makeRow(count: number): ColumnCell[] {
  return Array.from({ length: count }, () => makeTextCell());
}

/** CSS class for a cell's column span */
function spanClass(span: number): string {
  if (span === 3) return "col-span-3";
  if (span === 2) return "col-span-2";
  return "col-span-1";
}

/** Total span consumed by a row */
function rowSpanTotal(row: ColumnCell[]): number {
  return row.reduce((sum, c) => sum + (c.colSpan ?? 1), 0);
}

export function ColumnBlockEditor({
  block,
  onChange,
  readOnly = false,
}: ColumnBlockEditorProps) {
  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const updateCell = (rowIdx: number, colIdx: number, cell: ColumnCell) => {
    onChange({
      ...block,
      rows: block.rows.map((row, ri) =>
        ri === rowIdx
          ? row.map((c, ci) => (ci === colIdx ? cell : c))
          : row
      ),
    });
  };

  const switchCellType = (
    rowIdx: number,
    colIdx: number,
    type: "text" | "image"
  ) => {
    const cell = block.rows[rowIdx][colIdx];
    updateCell(rowIdx, colIdx, { ...cell, type });
  };

  /** Merge a cell with the one to its right — absorbs the right cell's span */
  const mergeRight = (rowIdx: number, colIdx: number) => {
    const row = block.rows[rowIdx];
    const cell = row[colIdx];
    const next = row[colIdx + 1];
    if (!next) return;
    const newSpan = (cell.colSpan ?? 1) + (next.colSpan ?? 1);
    if (newSpan > block.columnCount) return; // safety guard
    const newRow = row
      .map((c, ci) => (ci === colIdx ? { ...c, colSpan: newSpan } : c))
      .filter((_, ci) => ci !== colIdx + 1);
    onChange({
      ...block,
      rows: block.rows.map((r, ri) => (ri === rowIdx ? newRow : r)),
    });
  };

  /** Split a merged cell back by one column — inserts a blank cell to its right */
  const splitCell = (rowIdx: number, colIdx: number) => {
    const row = block.rows[rowIdx];
    const cell = row[colIdx];
    const currentSpan = cell.colSpan ?? 1;
    if (currentSpan <= 1) return;
    const newRow = [...row];
    newRow[colIdx] = { ...cell, colSpan: currentSpan - 1 };
    newRow.splice(colIdx + 1, 0, makeTextCell());
    onChange({
      ...block,
      rows: block.rows.map((r, ri) => (ri === rowIdx ? newRow : r)),
    });
  };

  const setColumnCount = (count: 2 | 3) => {
    const rows = block.rows.map((row) => {
      // Normalise spans so nothing exceeds the new column count
      let normalised: ColumnCell[] = row.map((c) => ({
        ...c,
        colSpan: Math.min(c.colSpan ?? 1, count),
      }));
      // If the row is now under-filled, add blank cells
      const total = rowSpanTotal(normalised);
      if (total < count) {
        normalised = [
          ...normalised,
          ...Array.from({ length: count - total }, () => makeTextCell()),
        ];
      }
      // If over-filled (e.g. 2→3 with a span-2 cell), trim trailing cells
      while (rowSpanTotal(normalised) > count && normalised.length > 1) {
        normalised = normalised.slice(0, -1);
      }
      return normalised;
    });
    onChange({ ...block, columnCount: count, rows });
  };

  const addRow = () => {
    onChange({ ...block, rows: [...block.rows, makeRow(block.columnCount)] });
  };

  const removeRow = (rowIdx: number) => {
    if (block.rows.length <= 1) return;
    onChange({ ...block, rows: block.rows.filter((_, i) => i !== rowIdx) });
  };

  // ─── Layout classes ───────────────────────────────────────────────────────────

  const gridCols = block.columnCount === 3 ? "grid-cols-3" : "grid-cols-2";
  const cellBorder = block.showBorders
    ? "border border-gray-200"
    : "border border-transparent";

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
      {/* Toolbar */}
      {!readOnly && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-gray-100 bg-gray-50 rounded-t-lg flex-wrap">
          {/* Column count */}
          <span className="text-xs text-gray-400 font-medium mr-1">Columns</span>
          <button
            onClick={() => setColumnCount(2)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              block.columnCount === 2
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Columns2 size={13} />2
          </button>
          <button
            onClick={() => setColumnCount(3)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
              block.columnCount === 3
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            <Grid3X3 size={13} />3
          </button>

          <div className="w-px h-4 bg-gray-200 mx-1" />

          {/* Border toggle */}
          <button
            onClick={() => onChange({ ...block, showBorders: !block.showBorders })}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              block.showBorders
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-200"
            }`}
          >
            {block.showBorders ? "Borders on" : "Borders off"}
          </button>

          <div className="flex-1" />

          {/* Add row */}
          <button
            onClick={addRow}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <Plus size={12} /> Add row
          </button>
        </div>
      )}

      {/* Rows */}
      <div className="p-3 space-y-0">
        {block.rows.map((row, rowIdx) => (
          <div key={rowIdx} className="relative group/row">
            {/* Delete row button */}
            {!readOnly && block.rows.length > 1 && (
              <button
                onClick={() => removeRow(rowIdx)}
                className="absolute -top-2 -right-2 z-20 w-5 h-5 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-300 hover:text-red-500 hover:border-red-300 opacity-0 group-hover/row:opacity-100 transition-all shadow-sm"
                title="Remove row"
              >
                <X size={10} />
              </button>
            )}

            {/* Cell grid */}
            <div className={`grid ${gridCols}`}>
              {row.map((cell, colIdx) => {
                const span = cell.colSpan ?? 1;
                const canMergeRight =
                  !readOnly &&
                  colIdx < row.length - 1 &&
                  span + (row[colIdx + 1]?.colSpan ?? 1) <= block.columnCount;
                const canSplit = !readOnly && span > 1;

                return (
                  <div
                    key={cell.id}
                    className={`relative group/cell ${cellBorder} p-2 ${spanClass(span)}`}
                  >
                    {/* Cell controls: type toggle + merge/split */}
                    {!readOnly && (
                      <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-all">
                        {/* Merge right */}
                        {canMergeRight && (
                          <button
                            onClick={() => mergeRight(rowIdx, colIdx)}
                            className="h-5 px-1.5 flex items-center rounded bg-white border border-gray-200 text-gray-400 hover:text-orange-600 hover:border-orange-300 shadow-sm text-[10px] font-medium"
                            title="Merge with next column"
                          >
                            Merge →
                          </button>
                        )}
                        {/* Split */}
                        {canSplit && (
                          <button
                            onClick={() => splitCell(rowIdx, colIdx)}
                            className="h-5 px-1.5 flex items-center rounded bg-white border border-gray-200 text-gray-400 hover:text-orange-600 hover:border-orange-300 shadow-sm text-[10px] font-medium"
                            title="Split merged cell"
                          >
                            Split
                          </button>
                        )}
                        {/* Type toggle */}
                        <button
                          onClick={() =>
                            switchCellType(
                              rowIdx,
                              colIdx,
                              cell.type === "text" ? "image" : "text"
                            )
                          }
                          className="w-5 h-5 flex items-center justify-center rounded bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-400 shadow-sm"
                          title={
                            cell.type === "text"
                              ? "Switch to image"
                              : "Switch to text"
                          }
                        >
                          {cell.type === "text" ? (
                            <ImageIcon size={10} />
                          ) : (
                            <Type size={10} />
                          )}
                        </button>
                      </div>
                    )}

                    {/* Cell content */}
                    <div className="pt-1">
                      {cell.type === "text" ? (
                        <TextCell
                          key={`text-${cell.id}`}
                          cell={cell}
                          onUpdate={(c) => updateCell(rowIdx, colIdx, c)}
                          readOnly={readOnly}
                        />
                      ) : (
                        <ImageCell
                          key={`img-${cell.id}`}
                          cell={cell}
                          onUpdate={(c) => updateCell(rowIdx, colIdx, c)}
                          readOnly={readOnly}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Row divider */}
            {rowIdx < block.rows.length - 1 && block.showBorders && (
              <div className="border-b border-gray-200" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Read-only version for public view ────────────────────────────────────────

export function ColumnBlockReadOnly({ block }: { block: ColumnBlockType }) {
  const gridCols = block.columnCount === 3 ? "grid-cols-3" : "grid-cols-2";
  const cellBorder = block.showBorders ? "border border-gray-200" : "";

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
      <div className="space-y-0">
        {block.rows.map((row, rowIdx) => (
          <div key={rowIdx}>
            <div className={`grid ${gridCols}`}>
              {row.map((cell) => (
                <div key={cell.id} className={`${cellBorder} p-2 ${spanClass(cell.colSpan ?? 1)}`}>
                  {cell.type === "text" ? (
                    <ReadOnlyTextCell content={cell.content} />
                  ) : cell.imageUrl ? (
                    <div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={cell.imageUrl}
                        alt={cell.imageAlt || ""}
                        className="w-full h-auto rounded object-contain"
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {rowIdx < block.rows.length - 1 && block.showBorders && (
              <div className="border-b border-gray-200" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Read-only text cell (no editing) ─────────────────────────────────────────

function ReadOnlyTextCell({
  content,
}: {
  content: Record<string, unknown>;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TipTapImage.configure({ inline: false }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Underline,
    ],
    content: content ?? undefined,
    editable: false,
    immediatelyRender: false,
  });

  return <EditorContent editor={editor} className={CELL_PROSE} />;
}
