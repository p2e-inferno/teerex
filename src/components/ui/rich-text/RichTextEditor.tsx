import React, { useEffect, useState } from 'react';
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

  const { toast } = useToast();

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
        // Sanitize HTML content
        const sanitized = DOMPurify.sanitize(html, {
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
        onChange(sanitized);
      }
    },
    editorProps: {
      attributes: {
        class: `prose prose-gray max-w-none focus:outline-none min-h-[120px] p-4 rounded-md border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 leading-relaxed ${
          disabled ? 'bg-gray-50 cursor-not-allowed' : 'bg-white'
        }`,
        placeholder
      },
      handleClick: (view, pos, event) => {
        // Handle link clicks to show popover
        const target = event.target as HTMLElement;
        const linkElement = target.closest('a');

        if (linkElement && linkElement.hasAttribute('href')) {
          handleLinkClick(event as any);
          return true; // Prevent default handling
        }
        return false;
      },
      handleKeyDown: (view, event) => {
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
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

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
      <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 rounded-t-md border border-gray-300 border-b-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('bold') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Bold className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('italic') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Italic className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('strike') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Strikethrough className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleCode().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('code') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Code className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`h-8 w-8 p-0 ${editor.isActive('heading', { level: 2 }) ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Heading2 className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('bulletList') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <List className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('orderedList') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          className={`h-8 w-8 p-0 ${editor.isActive('blockquote') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <Quote className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addLink}
          className={`h-8 w-8 p-0 ${editor.isActive('link') ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo() || disabled}
          className="h-8 w-8 p-0"
        >
          <Undo className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo() || disabled}
          className="h-8 w-8 p-0"
        >
          <Redo className="h-4 w-4" />
        </Button>

        <div className="w-px h-6 bg-gray-300 mx-1" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={togglePreview}
          className={`h-8 w-8 p-0 ${isPreviewMode ? 'bg-blue-100 text-blue-700' : ''}`}
          disabled={disabled}
          title={isPreviewMode ? 'Switch to Edit Mode' : 'Preview Formatted Content'}
        >
          {isPreviewMode ? <Edit className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </div>

      {/* Editor/Preview Content */}
      <div className="min-h-[120px] rounded-b-md border border-t-0 border-gray-300 overflow-hidden">
        {isPreviewMode ? (
          <div className="p-4 bg-white min-h-[120px]">
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
