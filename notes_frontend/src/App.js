import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

/**
 * Application-wide constants for theme and storage keys.
 */
const THEME = {
  primary: '#2563EB',
  secondary: '#F59E0B',
  background: '#f9fafb',
  surface: '#ffffff',
  text: '#111827',
  error: '#EF4444'
};

const STORAGE_KEY = 'notes_app_data_v1';

/**
 * Utility: generate a simple unique id.
 */
function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Utility: debounce a function.
 */
function useDebouncedCallback(callback, delay, deps = []) {
  const timeoutRef = useRef(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoCb = useCallback(callback, deps);

  const debounced = useCallback(
    (...args) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => memoCb(...args), delay);
    },
    [delay, memoCb]
  );

  useEffect(() => () => clearTimeout(timeoutRef.current), []);
  return debounced;
}

/**
 * Storage helpers with defensive parsing.
 */
function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // ignore
  }
  return [];
}

function saveNotes(notes) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // ignore storage failures (quota, etc.)
  }
}

/**
 * Markdown renderer (very minimal): supports
 * - #, ## headings
 * - **bold**, *italic*
 * - `inline code`
 * - simple line breaks into paragraphs
 * Note: We avoid adding dependencies. This is intentionally basic.
 */
function renderBasicMarkdown(text = '') {
  const esc = (s) =>
    s.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const lines = text.split(/\n/);
  const htmlLines = lines.map((line) => {
    let l = esc(line);
    // headings
    if (/^###\s+/.test(line)) {
      l = `<h3>${esc(line.replace(/^###\s+/, ''))}</h3>`;
    } else if (/^##\s+/.test(line)) {
      l = `<h2>${esc(line.replace(/^##\s+/, ''))}</h2>`;
    } else if (/^#\s+/.test(line)) {
      l = `<h1>${esc(line.replace(/^#\s+/, ''))}</h1>`;
    } else if (l.trim().length === 0) {
      l = '<br/>';
    } else {
      // inline styles
      l = l
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
      l = `<p>${l}</p>`;
    }
    return l;
  });
  return htmlLines.join('\n');
}

/**
 * PUBLIC_INTERFACE
 * Top navigation bar component with app title, actions, search, and developer link.
 */
function TopNav({ onNewNote, onDelete, onTogglePin, pinned, onSearch, search, onToggleSettings }) {
  /** This is the top navigation bar containing the brand, primary actions, search, and developer link. */
  return (
    <header className="topnav" role="banner">
      <div className="brand">
        <div className="brand-logo" aria-hidden="true">🗒️</div>
        <div className="brand-title">Simple Notes</div>
      </div>
      <div className="actions">
        <button className="btn primary" onClick={onNewNote} title="Create a new note (N)">
          + New
        </button>
        <button className="btn" onClick={onTogglePin} title="Pin/Unpin note">
          {pinned ? 'Unpin' : 'Pin'}
        </button>
        <button className="btn danger" onClick={onDelete} title="Delete current note (Del)">
          Delete
        </button>
      </div>
      <div className="search">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search notes..."
          aria-label="Search notes"
        />
      </div>
      <div className="dev">
        <a className="dev-link" href="#/dev/figma" title="Open Figma reference in-app via iframe">
          Developer
        </a>
        <button className="btn subtle" onClick={onToggleSettings} title="Open settings/help">
          ⚙️
        </button>
      </div>
    </header>
  );
}

/**
 * PUBLIC_INTERFACE
 * Sidebar component with notes list and quick search filter.
 */
function Sidebar({ notes, activeId, onSelect, onCreate, onSearch, search }) {
  /** Sidebar lists pinned first then others, sorted by updatedAt desc. */
  const sorted = useMemo(() => {
    const pinned = notes.filter((n) => n.pinned);
    const others = notes.filter((n) => !n.pinned);
    const sortByUpdated = (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt);
    pinned.sort(sortByUpdated);
    others.sort(sortByUpdated);
    return [...pinned, ...others];
  }, [notes]);

  return (
    <aside className="sidebar" role="complementary" aria-label="Notes list">
      <div className="sidebar-header">
        <div className="sidebar-title">Notes</div>
        <button className="btn primary small" onClick={onCreate}>+ New</button>
      </div>
      <div className="sidebar-search">
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Filter notes..."
          aria-label="Filter notes"
        />
      </div>
      <div className="notes-list" role="list">
        {sorted.map((n) => {
          const isActive = n.id === activeId;
          return (
            <button
              key={n.id}
              className={`note-item ${isActive ? 'active' : ''}`}
              onClick={() => onSelect(n.id)}
              role="listitem"
              title={n.title || 'Untitled'}
            >
              <div className="note-item-title">
                {n.pinned ? '📌 ' : ''}
                {n.title?.trim() ? n.title.trim() : 'Untitled'}
              </div>
              <div className="note-item-meta">
                {new Date(n.updatedAt).toLocaleString()}
              </div>
            </button>
          );
        })}
        {sorted.length === 0 && (
          <div className="empty-list">No notes yet. Create your first note!</div>
        )}
      </div>
    </aside>
  );
}

/**
 * PUBLIC_INTERFACE
 * Note editor with title and content. Includes markdown preview toggle.
 */
function NoteEditor({ note, onChange, onDelete, onTogglePin }) {
  /** The main editor where users write and format their notes. */
  const [preview, setPreview] = useState(false);

  const handleTitle = (e) => onChange({ ...note, title: e.target.value });
  const handleContent = (e) => onChange({ ...note, content: e.target.value });

  return (
    <section className="editor" role="main" aria-label="Note editor">
      {!note ? (
        <EmptyState />
      ) : (
        <>
          <div className="editor-toolbar">
            <div className="left">
              <button className="btn subtle" onClick={onTogglePin}>
                {note.pinned ? '📌 Unpin' : '📌 Pin'}
              </button>
              <button className={`btn subtle ${preview ? 'active' : ''}`} onClick={() => setPreview((p) => !p)}>
                {preview ? 'Edit' : 'Preview'}
              </button>
            </div>
            <div className="right">
              <button className="btn danger" onClick={onDelete}>Delete</button>
            </div>
          </div>

          <input
            className="title-input"
            value={note.title}
            onChange={handleTitle}
            placeholder="Title"
            aria-label="Note title"
          />

          {!preview ? (
            <textarea
              className="content-input"
              value={note.content}
              onChange={handleContent}
              placeholder="Write your note in plain text or basic markdown..."
              aria-label="Note content"
            />
          ) : (
            <div
              className="content-preview"
              // Safe because we escape and only allow very limited replacements.
              dangerouslySetInnerHTML={{ __html: renderBasicMarkdown(note.content) }}
            />
          )}
        </>
      )}
    </section>
  );
}

/**
 * PUBLIC_INTERFACE
 * Empty state when no note is selected or present.
 */
function EmptyState() {
  /** A simple empty state prompt encouraging users to create a note. */
  return (
    <div className="empty-state">
      <div className="empty-emoji" aria-hidden="true">📝</div>
      <div className="empty-title">Welcome to Simple Notes</div>
      <div className="empty-subtitle">Create a note to get started.</div>
    </div>
  );
}

/**
 * PUBLIC_INTERFACE
 * Modal for Settings/Help.
 */
function SettingsModal({ open, onClose }) {
  /** Provides quick help and information on shortcuts and features. */
  if (!open) return null;
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Settings and help">
      <div className="modal">
        <div className="modal-header">
          <div className="modal-title">Settings & Help</div>
          <button className="btn subtle" onClick={onClose} aria-label="Close settings">✖</button>
        </div>
        <div className="modal-content">
          <p>Keyboard shortcuts:</p>
          <ul>
            <li>Ctrl/Cmd + S: Save</li>
            <li>N: New note</li>
            <li>Delete: Delete current note</li>
          </ul>
          <p>Notes are saved to your browser’s localStorage under key "{STORAGE_KEY}".</p>
          <p>Markdown preview supports headings, bold, italic, and inline code.</p>
        </div>
        <div className="modal-actions">
          <button className="btn primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/**
 * PUBLIC_INTERFACE
 * Developer route: iframe preview for the static Figma HTML asset.
 */
function DevFigmaView() {
  /** Shows the macbook-pro-2-3-40.html file inside an iframe for reference. */
  // The asset lives at /assets/macbook-pro-2-3-40.html relative to the app root.
  const base = process.env.REACT_APP_ASSETS_BASE || '';
  const iframeSrc = `${base}/assets/macbook-pro-2-3-40.html`;

  return (
    <div className="dev-figma-view">
      <div className="dev-figma-header">
        <div className="dev-figma-title">Figma Screen Preview</div>
        <a className="btn subtle" href={iframeSrc} target="_blank" rel="noreferrer">Open in new tab</a>
        <a className="btn subtle" href="#/" title="Back to App">Back</a>
      </div>
      <iframe
        title="Figma Static Screen"
        src={iframeSrc}
        className="dev-figma-iframe"
      />
    </div>
  );
}

/**
 * PUBLIC_INTERFACE
 * Main App component with layout, storage, search, and keyboard shortcuts.
 */
function App() {
  /** Main application orchestrating notes state, persistence, and UI layout. */
  const [notes, setNotes] = useState(() => loadNotes());
  const [activeId, setActiveId] = useState(() => (loadNotes()[0]?.id || null));
  const [search, setSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Save notes debounced for smoother typing
  const debouncedSave = useDebouncedCallback((nextNotes) => saveNotes(nextNotes), 300, [notes]);

  useEffect(() => {
    debouncedSave(notes);
  }, [notes, debouncedSave]);

  // Keyboard shortcuts: save, new, delete
  useEffect(() => {
    const handler = (e) => {
      const isSave = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's';
      if (isSave) {
        e.preventDefault();
        saveNotes(notes);
      }
      if (!e.ctrlKey && !e.metaKey) {
        if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          handleNewNote();
        }
        if (e.key === 'Delete') {
          e.preventDefault();
          handleDeleteNote();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, activeId]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) => {
      const t = (n.title || '').toLowerCase();
      const c = (n.content || '').toLowerCase();
      return t.includes(q) || c.includes(q);
    });
  }, [notes, search]);

  const activeNote = useMemo(() => notes.find((n) => n.id === activeId) || null, [notes, activeId]);

  const updateNote = (next) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === next.id ? { ...next, updatedAt: new Date().toISOString() } : n))
    );
  };

  const handleNewNote = () => {
    const n = {
      id: uid(),
      title: '',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
      color: null
    };
    setNotes((prev) => [n, ...prev]);
    setActiveId(n.id);
  };

  const handleDeleteNote = () => {
    if (!activeNote) return;
    const ok = window.confirm('Delete this note? This cannot be undone.');
    if (!ok) return;
    setNotes((prev) => prev.filter((n) => n.id !== activeNote.id));
    // pick next active id (closest by updatedAt)
    const remaining = notes.filter((n) => n.id !== activeNote.id);
    const nextActive = remaining.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0]?.id || null;
    setActiveId(nextActive);
  };

  const handleTogglePin = () => {
    if (!activeNote) return;
    updateNote({ ...activeNote, pinned: !activeNote.pinned });
  };

  const handleSelectNote = (id) => setActiveId(id);

  // Hash-based "routing" to support developer iframe view,
  // keeps the app compatible with simple preview systems without extra deps.
  const [route, setRoute] = useState(window.location.hash || '#/');
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash || '#/');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const isDevRoute = route.startsWith('#/dev/figma');

  return (
    <div className="app-root">
      <style>{`:root{
        --primary:${THEME.primary};
        --secondary:${THEME.secondary};
        --bg:${THEME.background};
        --surface:${THEME.surface};
        --text:${THEME.text};
        --error:${THEME.error};
      }`}</style>

      {!isDevRoute && (
        <>
          <TopNav
            onNewNote={handleNewNote}
            onDelete={handleDeleteNote}
            onTogglePin={handleTogglePin}
            pinned={!!activeNote?.pinned}
            onSearch={setSearch}
            search={search}
            onToggleSettings={() => setSettingsOpen(true)}
          />
          <div className="layout">
            <Sidebar
              notes={filteredNotes}
              activeId={activeId}
              onSelect={handleSelectNote}
              onCreate={handleNewNote}
              onSearch={setSearch}
              search={search}
            />
            <NoteEditor
              note={activeNote}
              onChange={updateNote}
              onDelete={handleDeleteNote}
              onTogglePin={handleTogglePin}
            />
          </div>
          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </>
      )}

      {isDevRoute && <DevFigmaView />}
    </div>
  );
}

export default App;
