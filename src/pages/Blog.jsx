import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchBlogs } from '../lib/api';
import './Blog.css';

function fmtDate(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function Blog() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchBlogs()
      .then((list) => !cancelled && setPosts(Array.isArray(list) ? list : []))
      .catch((err) => !cancelled && setError(err.message || 'Could not load posts.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="blog-page">
      <header className="page-header">
        <div className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">Notes & stories</p>
            <h1 className="hero-title">Blog</h1>
            <p className="hero-text">Thoughts, tutorials and updates — written from the admin dashboard.</p>
          </div>
        </div>
      </header>

      <main className="section">
        {loading ? (
          <p className="muted">Loading posts…</p>
        ) : error ? (
          <p className="muted">{error} Please try again later.</p>
        ) : !posts.length ? (
          <p className="muted">No posts published yet. Check back soon.</p>
        ) : (
          <div className="blog-grid">
            {posts.map((p) => (
              <Link key={p.id || p.slug} to={`/blog/${p.slug}`} className="blog-card">
                {p.cover_url ? (
                  <div className="blog-cover">
                    <img src={p.cover_url} alt={p.title} loading="lazy" />
                  </div>
                ) : null}
                <div className="blog-card-body">
                  <div className="blog-meta">
                    <span>{fmtDate(p.published_at || p.created_at)}</span>
                    {Array.isArray(p.tags) && p.tags[0] ? <span className="blog-tag">{p.tags[0]}</span> : null}
                  </div>
                  <h2>{p.title}</h2>
                  {p.excerpt ? <p className="blog-excerpt">{p.excerpt}</p> : null}
                  <span className="read-more">Read →</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default Blog;
