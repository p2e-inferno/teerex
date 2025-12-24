import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { Color } from '@tiptap/extension-color';
import HardBreak from '@tiptap/extension-hard-break';
import DOMPurify from 'dompurify';
import { Button } from '@/components/ui/button';
import { RichTextDisplay } from './RichTextDisplay';
import { LinkInputDialog } from './LinkInputDialog';
import { LinkPopover } from './LinkPopover';
import { useToast } from '@/hooks/use-toast';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link as LinkIcon,
  Eye,
  Edit
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = "Start writing...",
  className = "",
  disabled = false
}) => {
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [selectedTextForLink, setSelectedTextForLink] = useState('');
  const [hasSelectionForLink, setHasSelectionForLink] = useState(false);
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [linkPopoverPosition, setLinkPopoverPosition] = useState({ x: 0, y: 0 });
  const [currentLinkUrl, setCurrentLinkUrl] = useState('');
  const [currentLinkText, setCurrentLinkText] = useState('');
  const [, setForceUpdate] = useState(0);
  const lastEmittedValueRef = useRef<string>(value);
  const rafUpdateRef = useRef<number | null>(null);

  const { toast } = useToast();

  const sanitizeHtml = (html: string) => DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote', 'a',
      'span'
    ],
    ALLOWED_ATTR: [
      'href', 'target', 'rel',
      'class', 'style'
    ]
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        },
        paragraph: {
          HTMLAttributes: {
            class: 'mb-2' // Reduce paragraph margin
          }
        }
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 hover:text-blue-800 underline'
        }
      }),
      Color,
      HardBreak // Add hard break support for Shift+Enter
    ],
    content: value,
    onUpdate: ({ editor }) => {
      if (!disabled) {
        const html = editor.getHTML();
        lastEmittedValueRef.current = html;
        onChange(html);
      }
    },
    onBlur: ({ editor }) => {
      if (disabled) return;
      if (isLinkDialogOpen) return;
      const html = editor.getHTML();
      const sanitized = sanitizeHtml(html);
      if (sanitized !== html) {
        editor.commands.setContent(sanitized, { emitUpdate: false });
        lastEmittedValueRef.current = sanitized;
        onChange(sanitized);
      }
    },
    onTransaction: () => {
      if (rafUpdateRef.current !== null) {
        return;
      }
      rafUpdateRef.current = window.requestAnimationFrame(() => {
        setForceUpdate(prev => prev + 1);
        rafUpdateRef.current = null;
      });
    },
    editorProps: {
      attributes: {
        class: `prose prose-gray max-w-none focus:outline-none min-h-[120px] p-4 rounded-md border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 leading-relaxed ${
          disabled ? 'bg-gray-50 cursor-not-allowed' : 'bg-white'
        }`,
        placeholder
      },
      handlePaste: (_view, event) => {
        if (disabled) return false;
        if (!editor) return false;
        const clipboardEvent = event as ClipboardEvent;
        const html = clipboardEvent.clipboardData?.getData('text/html');
        if (!html) return false;
        const sanitized = sanitizeHtml(html);
        if (!sanitized.trim()) return false;
        clipboardEvent.preventDefault();
        editor.chain().focus().insertContent(sanitized).run();
        return true;
      },
      handleClick: (_view, _pos, event) => {
        // Handle link clicks to show popover
        const target = event.target as HTMLElement;
        const linkElement = target.closest('a');

        if (linkElement && linkElement.hasAttribute('href')) {
          handleLinkClick(event as any);
          return true; // Prevent default handling
        }
        return false;
      },
      handleKeyDown: (_view, event) => {
        // Allow Shift+Enter for line breaks, Enter for new paragraphs
        if (event.key === 'Enter' && !event.shiftKey) {
          // Normal Enter - create new paragraph with controlled spacing
          return false; // Let Tiptap handle it
        }
      }
    },
    editable: !disabled
  });

  // Sync editor content when value prop changes
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedValueRef.current) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
      lastEmittedValueRef.current = value;
    }
  }, [editor, value]);

  useEffect(() => {
    return () => {
      if (rafUpdateRef.current !== null) {
        window.cancelAnimationFrame(rafUpdateRef.current);
        rafUpdateRef.current = null;
      }
    };
  }, []);

  // Helper to check if a mark/node is active OR stored for next character
  const isMarkActive = (type: string, attrs?: object) => {
    if (!editor) return false;

    // Check if already active in selection
    if (editor.isActive(type, attrs)) return true;

    // Check stored marks (for next character to be typed)
    const { storedMarks } = editor.state;
    if (storedMarks) {
      return storedMarks.some(mark => mark.type.name === type);
    }

    return false;
  };

  const togglePreview = () => {
    setIsPreviewMode(!isPreviewMode);
  };

  const addLink = () => {
    if (!editor) return;

    // Capture selected text before opening dialog
    const hasSelection = !editor.state.selection.empty;
    const selectedText = hasSelection
      ? editor.state.doc.textBetween(editor.state.selection.from, editor.state.selection.to)
      : '';

    setSelectedTextForLink(selectedText);
    setHasSelectionForLink(hasSelection);
    setIsLinkDialogOpen(true);
  };

  const handleLinkClick = (event: MouseEvent) => {
    if (!editor) return;

    event.preventDefault();

    // Get the link element that was clicked
    const target = event.target as HTMLElement;
    const linkElement = target.closest('a');

    if (linkElement && linkElement.hasAttribute('href')) {
      const url = linkElement.getAttribute('href') || '';
      const text = linkElement.textContent || '';

      setCurrentLinkUrl(url);
      setCurrentLinkText(text);
      setLinkPopoverPosition({
        x: event.clientX,
        y: event.clientY
      });
      setLinkPopoverOpen(true);
    }
  };

  const handleLinkConfirm = (url: string, text: string) => {
    if (!editor) return;

    const finalText = text.trim() || selectedTextForLink || url;

    if (hasSelectionForLink) {
      // Replace the selected text with the link
      editor.chain().focus().setLink({ href: url }).run();
    } else {
      // Insert new link content
      editor.chain().focus().insertContent({
        type: 'text',
        text: finalText,
        marks: [{ type: 'link', attrs: { href: url } }]
      }).run();
    }

  // Reset state
  setSelectedTextForLink('');
  setHasSelectionForLink(false);
};

  const handleEditLink = () => {
    // Pre-fill the link dialog with current values
    setSelectedTextForLink(currentLinkText);
    setIsLinkDialogOpen(true);
    // Close popover
    setLinkPopoverOpen(false);
  };

  const handleUnlink = () => {
    if (editor) {
      editor.chain().focus().unsetLink().run();
    }
    setLinkPopoverOpen(false);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(currentLinkUrl);
      toast({
        title: "Link copied",
        description: "Link URL has been copied to clipboard",
      });
    } catch (err) {
      console.error('Failed to copy link:', err);
      toast({
        title: "Copy failed",
        description: "Failed to copy link to clipboard",
        variant: "destructive",
      });
    }
    setLinkPopoverOpen(false);
  };

  const handleOpenLink = () => {
    window.open(currentLinkUrl, '_blank', 'noopener,noreferrer');
    setLinkPopoverOpen(false);
  };

  if (!editor) {
    return (
      <div className={`min-h-[120px] p-4 rounded-md border border-gray-300 bg-gray-50 animate-pulse ${className}`}>
        Loading editor...
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Toolbar */}
      <div className="flex flex-nowrap sm:flex-wrap items-center gap-1 p-2 bg-gray-50 rounded-t-md border border-gray-300 border-b-0 overflow-x-auto">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`h-10 w-10 p-0 sm:h-8 sm:w-8 ${isMarkActive('bold') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Bold className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`h-10 w-10 p-0 sm:h-8 sm:w-8 ${isMarkActive('italic') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Italic className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`h-10 w-10 p-0 sm:h-8 sm:w-8 ${isMarkActive('strike') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Strikethrough className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`h-10 w-10 p-0 sm:h-8 sm:w-8 ${isMarkActive('code') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Code className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`h-10 w-10 p-0 sm:h-8 sm:w-8 ${isMarkActive('heading', { level: 2 }) ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Heading2 className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`h-10 w-10 p-0 sm:h-8 sm:w-8 ${isMarkActive('bulletList') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <List className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`h-10 w-10 p-0 sm:h-8 sm:w-8 ${isMarkActive('orderedList') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`h-10 w-10 p-0 sm:h-8 sm:w-8 ${isMarkActive('blockquote') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Quote className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addLink}
          className={`h-10 w-10 p-0 sm:h-8 sm:w-8 ${isMarkActive('link') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo() || disabled}
          className="h-10 w-10 p-0 sm:h-8 sm:w-8"
        >
          <Undo className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo() || disabled}
          className="h-10 w-10 p-0 sm:h-8 sm:w-8"
        >
          <Redo className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(e) => e.preventDefault()}
          onClick={togglePreview}
          className={`h-10 w-10 p-0 sm:h-8 sm:w-8 ${isPreviewMode ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
          title={isPreviewMode ? 'Switch to Edit Mode' : 'Preview Formatted Content'}
        >
          {isPreviewMode ? <Edit className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>

      {/* Editor/Preview Content */}
      <div className="min-h-[120px] rounded-b-md border border-t-0 border-gray-300 overflow-visible">
        <div
          className={`flex items-center justify-between gap-2 px-3 py-2 text-xs border-b border-gray-200 ${
            isPreviewMode ? 'bg-gray-50 text-gray-600' : 'bg-blue-50 text-blue-700'
          }`}
        >
          <span className="font-medium">
            {isPreviewMode ? 'Preview mode' : 'Edit mode'}
          </span>
          <span className="text-muted-foreground">
            {isPreviewMode ? 'Tap the pencil to edit' : 'Tap the eye to preview'}
          </span>
        </div>
        {isPreviewMode ? (
          <div className="p-4 bg-gray-50 min-h-[120px]">
            <RichTextDisplay content={editor.getHTML()} />
          </div>
        ) : (
          <EditorContent editor={editor} />
        )}
      </div>

      {/* Link Input Dialog */}
      <LinkInputDialog
        isOpen={isLinkDialogOpen}
        onClose={() => {
          setIsLinkDialogOpen(false);
          setSelectedTextForLink('');
          setHasSelectionForLink(false);
        }}
        onConfirm={handleLinkConfirm}
        initialText={selectedTextForLink}
        initialUrl={currentLinkUrl}
      />

      {/* Link Popover */}
      <LinkPopover
        isOpen={linkPopoverOpen}
        onClose={() => setLinkPopoverOpen(false)}
        position={linkPopoverPosition}
        url={currentLinkUrl}
        text={currentLinkText}
        onEdit={handleEditLink}
        onUnlink={handleUnlink}
        onCopy={handleCopyLink}
        onOpenLink={handleOpenLink}
      />
    </div>
  );
};
