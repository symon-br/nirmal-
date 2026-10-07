import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { slugify } from '../lib/api';
import {
  adminDeleteBlog,
  adminDeleteUpcoming,
  adminListBlogs,
  adminListUpcoming,
  adminRestoreBlog,
  adminRestoreUpcoming,
  adminSaveBlog,
  adminSaveUpcoming,
} from '../lib/api';
import RichTextEditor from '../components/RichTextEditor';
import './Admin.css';

const emptyUpcoming = {
  id: '', title: '', description: '', status: 'planned', image_url: '',
  link_url: '', link_label: '', target_date: '', tags: '', progress: 0,
  published: true, sort_order: 0,
};

const emptyBlog = {
  id: '', title: '', slug: '', excerpt: '', cover_url: '', tags: '',
  content_html: '', published: false,
};

function Field({ label, children }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ImageInput({ value, onChange }) {
  return (
    <div className="image-input">
      <input
        type="url"
        placeholder="https://…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? <img className="image-preview" src={value} alt="preview" /> : null}
    </div>
  );
}

function Admin() {
  const { loading, email, accessConfigured, local } = useAuth();
  const [tab, setTab] = useState('upcoming');
  const [remote, setRemote] = useState(true);

  const [projects, setProjects] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [trashProjects, setTrashProjects] = useState([]);
  const [trashBlogs, setTrashBlogs] = useState([]);
  const [showTrash, setShowTrash] = useState(false);
  const [formUpcoming, setFormUpcoming] = useState(emptyUpcoming);
  const [formBlog, setFormBlog] = useState(emptyBlog);
  const [editingUpcoming, setEditingUpcoming] = useState(false);
  const [editingBlog, setEditingBlog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const reload = useCallback(async () => {
    const [u, b, tu, tb] = await Promise.all([
      adminListUpcoming(),
      adminListBlogs(),
      adminListUpcoming({ trash: true }),
      adminListBlogs({ trash: true }),
    ]);
    setProjects(u.items);
    setBlogs(b.items);
    setTrashProjects(tu.items);
    setTrashBlogs(tb.items);
    setRemote(u.remote && b.remote);
  }, []);

  useEffect(() => {
    if (!loading && (email || local)) reload().catch(() => setNotice('Could not load data.'));
  }, [loading, email, local, reload]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  if (loading) {
    return (
      <div className="admin-page"><p className="muted">Checking access…</p></div>
    );
  }

  if (!email && !local) {
    return (
      <div className="admin-page">
        <div className="admin-gate">
          <h1>Restricted area</h1>
          <p>
            This dashboard is protected by <strong>Cloudflare Access</strong>. Server-side
            verification runs in the Worker — there is no frontend password to bypass.
          </p>
          {!accessConfigured ? (
            <p className="muted">
              Access is not configured yet on the server. Create an Access application for
              <code> /admin* </code> and <code> /api/admin* </code>, then reload this page.
            </p>
          ) : (
            <p className="muted">You are not signed in. Open this page in a session authenticated via your Access login.</p>
          )}
        </div>
      </div>
    );
  }

  /* ---------- upcoming handlers ---------- */
  const submitUpcoming = async (e) => {
    e.preventDefault();
    if (!formUpcoming.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...formUpcoming,
        tags: formUpcoming.tags.split(',').map((s) => s.trim()).filter(Boolean),
        progress: Number(formUpcoming.progress) || 0,
      };
      await adminSaveUpcoming(payload);
      setFormUpcoming(emptyUpcoming);
      setEditingUpcoming(false);
      await reload();
      flash(remote ? 'Project saved.' : 'Saved locally (API unreachable).');
    } catch (err) {
      flash(err.status === 401 ? 'Unauthorized — sign in via Cloudflare Access.' : (err.message || 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const editUpcoming = (p) => {
    setFormUpcoming({
      ...emptyUpcoming,
      ...p,
      tags: Array.isArray(p.tags) ? p.tags.join(', ') : p.tags || '',
    });
    setEditingUpcoming(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const delUpcoming = async (id) => {
    if (!window.confirm('Move this project to trash? You can restore it later.')) return;
    try {
      await adminDeleteUpcoming(id);
      await reload();
      flash('Moved to trash.');
    } catch (err) {
      flash(err.message || 'Delete failed.');
    }
  };

  const restoreUpcoming = async (id) => {
    await adminRestoreUpcoming(id);
    await reload();
    flash('Project restored.');
  };

  const purgeUpcoming = async (id) => {
    if (!window.confirm('PERMANENTLY delete this project? This cannot be undone.')) return;
    await adminDeleteUpcoming(id, true);
    await reload();
    flash('Permanently deleted.');
  };

  /* ---------- blog handlers ---------- */
  const submitBlog = async (e) => {
    e.preventDefault();
    if (!formBlog.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...formBlog,
        slug: formBlog.slug.trim() || slugify(formBlog.title),
        tags: formBlog.tags.split(',').map((s) => s.trim()).filter(Boolean),
      };
      await adminSaveBlog(payload);
      setFormBlog(emptyBlog);
      setEditingBlog(false);
      await reload();
      flash(remote ? 'Post saved.' : 'Saved locally (API unreachable).');
    } catch (err) {
      flash(err.status === 401 ? 'Unauthorized — sign in via Cloudflare Access.' : (err.message || 'Save failed.'));
    } finally {
      setSaving(false);
    }
  };

  const editBlog = (b) => {
    setFormBlog({
      ...emptyBlog,
      ...b,
      tags: Array.isArray(b.tags) ? b.tags.join(', ') : b.tags || '',
    });
    setEditingBlog(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const delBlog = async (id) => {
    if (!window.confirm('Move this post to trash? You can restore it later.')) return;
    try {
      await adminDeleteBlog(id);
      await reload();
      flash('Moved to trash.');
    } catch (err) {
      flash(err.message || 'Delete failed.');
    }
  };

  const restoreBlog = async (id) => {
    await adminRestoreBlog(id);
    await reload();
    flash('Post restored.');
  };

  const purgeBlog = async (id) => {
    if (!window.confirm('PERMANENTLY delete this post? This cannot be undone.')) return;
    await adminDeleteBlog(id, true);
    await reload();
    flash('Permanently deleted.');
  };

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CRETURES · Admin</p>
          <h1>Dashboard</h1>
          <p className="muted small">
            Signed in as <strong>{email || 'local preview'}</strong>
            {!remote && ' · local mode (Worker API unreachable — data stays in this browser)'}
          </p>
        </div>
        <div className="admin-tabs">
          <button className={tab === 'upcoming' ? 'active' : ''} onClick={() => setTab('upcoming')}>Upcoming Projects</button>
          <button className={tab === 'blogs' ? 'active' : ''} onClick={() => setTab('blogs')}>Blogs</button>
        </div>
      </header>

      {notice ? <div className="admin-notice">{notice}</div> : null}

      {tab === 'upcoming' ? (
        <div className="admin-grid">
          <form className="admin-form" onSubmit={submitUpcoming}>
            <h2>{editingUpcoming ? 'Edit project' : 'New upcoming project'}</h2>
            <Field label="Title">
              <input value={formUpcoming.title} onChange={(e) => setFormUpcoming({ ...formUpcoming, title: e.target.value })} required maxLength={160} />
            </Field>
            <Field label="Description">
              <textarea rows={4} value={formUpcoming.description} onChange={(e) => setFormUpcoming({ ...formUpcoming, description: e.target.value })} />
            </Field>
            <div className="form-row">
              <Field label="Status">
                <select value={formUpcoming.status} onChange={(e) => setFormUpcoming({ ...formUpcoming, status: e.target.value })}>
                  <option value="planned">Planned</option>
                  <option value="in-progress">In Progress</option>
                  <option value="paused">Paused</option>
                  <option value="done">Done</option>
                </select>
              </Field>
              <Field label="Target date">
                <input type="date" value={formUpcoming.target_date} onChange={(e) => setFormUpcoming({ ...formUpcoming, target_date: e.target.value })} />
              </Field>
            </div>
            <Field label="Cover image">
              <ImageInput value={formUpcoming.image_url} onChange={(v) => setFormUpcoming({ ...formUpcoming, image_url: v })} />
            </Field>
            <div className="form-row">
              <Field label="Link URL">
                <input type="url" placeholder="https://…" value={formUpcoming.link_url} onChange={(e) => setFormUpcoming({ ...formUpcoming, link_url: e.target.value })} />
              </Field>
              <Field label="Link label">
                <input placeholder="Learn more" value={formUpcoming.link_label} onChange={(e) => setFormUpcoming({ ...formUpcoming, link_label: e.target.value })} />
              </Field>
            </div>
            <Field label="Tags / tech (comma separated)">
              <input placeholder="React, Cloudflare, D1" value={formUpcoming.tags} onChange={(e) => setFormUpcoming({ ...formUpcoming, tags: e.target.value })} />
            </Field>
            <div className="form-row">
              <Field label={`Progress (${formUpcoming.progress}%)`}>
                <input type="range" min={0} max={100} value={formUpcoming.progress} onChange={(e) => setFormUpcoming({ ...formUpcoming, progress: e.target.value })} />
              </Field>
              <Field label="Order">
                <input type="number" value={formUpcoming.sort_order} onChange={(e) => setFormUpcoming({ ...formUpcoming, sort_order: e.target.value })} />
              </Field>
            </div>
            <label className="check">
              <input type="checkbox" checked={!!formUpcoming.published} onChange={(e) => setFormUpcoming({ ...formUpcoming, published: e.target.checked })} />
              Published (visible on Portfolio)
            </label>
            <div className="form-actions">
              <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editingUpcoming ? 'Update project' : 'Add project'}</button>
              {editingUpcoming ? <button type="button" className="btn-secondary" onClick={() => { setFormUpcoming(emptyUpcoming); setEditingUpcoming(false); }}>Cancel</button> : null}
            </div>
          </form>

          <div className="admin-list">
            <h2>All projects ({projects.length})</h2>
            {!projects.length ? <p className="muted">Nothing yet.</p> : null}
            {projects.map((p) => (
              <div key={p.id} className="admin-item">
                <div>
                  <strong>{p.title}</strong>
                  <span className="muted small"> · {p.status}{p.published ? '' : ' · draft'}</span>
                </div>
                <div className="item-actions">
                  <button onClick={() => editUpcoming(p)}>Edit</button>
                  <button className="danger" onClick={() => delUpcoming(p.id)}>Delete</button>
                </div>
              </div>
            ))}
            {trashProjects.length ? (
              <div className="trash-section">
                <button type="button" className="btn-secondary" onClick={() => setShowTrash((v) => !v)}>
                  {showTrash ? 'Hide trash' : `Show trash (${trashProjects.length})`}
                </button>
                {showTrash
                  ? trashProjects.map((p) => (
                      <div key={p.id} className="admin-item trashed">
                        <div>
                          <strong>{p.title}</strong>
                          <span className="muted small"> · in trash</span>
                        </div>
                        <div className="item-actions">
                          <button onClick={() => restoreUpcoming(p.id)}>Restore</button>
                          <button className="danger" onClick={() => purgeUpcoming(p.id)}>Delete forever</button>
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="admin-grid">
          <form className="admin-form" onSubmit={submitBlog}>
            <h2>{editingBlog ? 'Edit post' : 'Write a post'}</h2>
            <Field label="Title">
              <input value={formBlog.title} onChange={(e) => setFormBlog({ ...formBlog, title: e.target.value })} required maxLength={180} />
            </Field>
            <Field label="Slug (auto from title)">
              <input value={formBlog.slug} placeholder={slugify(formBlog.title) || 'my-first-post'} onChange={(e) => setFormBlog({ ...formBlog, slug: e.target.value })} />
            </Field>
            <Field label="Excerpt">
              <textarea rows={2} value={formBlog.excerpt} onChange={(e) => setFormBlog({ ...formBlog, excerpt: e.target.value })} maxLength={600} />
            </Field>
            <Field label="Cover image">
              <ImageInput value={formBlog.cover_url} onChange={(v) => setFormBlog({ ...formBlog, cover_url: v })} />
            </Field>
            <Field label="Tags (comma separated)">
              <input placeholder="dev, cloudflare" value={formBlog.tags} onChange={(e) => setFormBlog({ ...formBlog, tags: e.target.value })} />
            </Field>
            <Field label="Content">
              <RichTextEditor value={formBlog.content_html} onChange={(v) => setFormBlog({ ...formBlog, content_html: v })} placeholder="Write your story…" />
            </Field>
            <label className="check">
              <input type="checkbox" checked={!!formBlog.published} onChange={(e) => setFormBlog({ ...formBlog, published: e.target.checked })} />
              Published (visible on Blog)
            </label>
            <div className="form-actions">
              <button className="btn-primary" disabled={saving}>{saving ? 'Saving…' : editingBlog ? 'Update post' : 'Publish post'}</button>
              {editingBlog ? <button type="button" className="btn-secondary" onClick={() => { setFormBlog(emptyBlog); setEditingBlog(false); }}>Cancel</button> : null}
            </div>
          </form>

          <div className="admin-list">
            <h2>All posts ({blogs.length})</h2>
            {!blogs.length ? <p className="muted">Nothing yet.</p> : null}
            {blogs.map((b) => (
              <div key={b.id} className="admin-item">
                <div>
                  <strong>{b.title}</strong>
                  <span className="muted small"> · /{b.slug}{b.published ? '' : ' · draft'}</span>
                </div>
                <div className="item-actions">
                  <button onClick={() => editBlog(b)}>Edit</button>
                  <button className="danger" onClick={() => delBlog(b.id)}>Delete</button>
                </div>
              </div>
            ))}
            {trashBlogs.length ? (
              <div className="trash-section">
                <button type="button" className="btn-secondary" onClick={() => setShowTrash((v) => !v)}>
                  {showTrash ? 'Hide trash' : `Show trash (${trashBlogs.length})`}
                </button>
                {showTrash
                  ? trashBlogs.map((b) => (
                      <div key={b.id} className="admin-item trashed">
                        <div>
                          <strong>{b.title}</strong>
                          <span className="muted small"> · /{b.slug} · in trash</span>
                        </div>
                        <div className="item-actions">
                          <button onClick={() => restoreBlog(b.id)}>Restore</button>
                          <button className="danger" onClick={() => purgeBlog(b.id)}>Delete forever</button>
                        </div>
                      </div>
                    ))
                  : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export default Admin;
