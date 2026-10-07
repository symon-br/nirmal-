import { useEffect, useRef, useState } from 'react';
import { uploadImage } from '../lib/api';
import './RichTextEditor.css';

function RichTextEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const lastValue = useRef(value || '');

  useEffect(() => {
    if (editorRef.current && value !== lastValue.current && document.activeElement !== editorRef.current) {
      editorRef.current.innerHTML = value || '';
      lastValue.current = value || '';
    }
  }, [value]);

  const emit = () => {
    const html = editorRef.current ? editorRef.current.innerHTML : '';
    lastValue.current = html;
    onChange(html);
  };

  const exec = (cmd, arg = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const addLink = () => {
    const href = window.prompt('Link URL (https://…)');
    if (href) exec('createLink', href);
  };

  const addImage = () => fileRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      editorRef.current?.focus();
      document.execCommand('insertImage', false, url);
      emit();
    } catch {
      window.alert('Image upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const buttons = [
    { label: 'B', title: 'Bold', fn: () => exec('bold'), cls: 'rte-b' },
    { label: 'I', title: 'Italic', fn: () => exec('italic'), cls: 'rte-i' },
    { label: 'U', title: 'Underline', fn: () => exec('underline'), cls: 'rte-u' },
    { label: 'H2', title: 'Heading', fn: () => exec('formatBlock', 'h2') },
    { label: 'H3', title: 'Subheading', fn: () => exec('formatBlock', 'h3') },
    { label: '“”', title: 'Quote', fn: () => exec('formatBlock', 'blockquote') },
    { label: '• List', title: 'Bullet list', fn: () => exec('insertUnorderedList') },
    { label: '1. List', title: 'Numbered list', fn: () => exec('insertOrderedList') },
    { label: '🔗', title: 'Add link', fn: addLink },
    { label: uploading ? '…' : '🖼', title: 'Insert image', fn: addImage },
    { label: '⌫', title: 'Clear formatting', fn: () => exec('removeFormat') },
  ];

  return (
    <div className="rte">
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
        {buttons.map((b) => (
          <button key={b.title} type="button" title={b.title} className={`rte-btn ${b.cls || ''}`} onClick={b.fn}>
            {b.label}
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        className="rte-area"
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder || 'Write your story…'}
      />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  );
}

export default RichTextEditor;
