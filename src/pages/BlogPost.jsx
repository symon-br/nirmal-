import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchBlogBySlug } from '../lib/api';
import './BlogPost.css';

function fmtDate(v) {
  if (!v) return '';
  try {
    return new Date(v).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

function BlogPost() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBlogBySlug(slug)
      .then((p) => !cancelled && setPost(p))
      .catch((err) => !cancelled && setError(err.status === 404 ? 'Post not found.' : (err.message || 'Could not load this post.')))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  if (loading) {
    return (
      <div className="post-page">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="post-page">
        <p className="muted">{error || 'Post not found.'}</p>
        <Link to="/blog" className="back-link">← Back to blog</Link>
      </div>
    );
  }

  return (
    <article className="post-page">
      <Link to="/blog" className="back-link">← Back to blog</Link>
      <header className="post-header">
        <div className="blog-meta">
          <span>{fmtDate(post.published_at || post.created_at)}</span>
          {Array.isArray(post.tags) &&
            post.tags.map((t) => (
              <span key={t} className="blog-tag">{t}</span>
            ))}
        </div>
        <h1>{post.title}</h1>
        {post.excerpt ? <p className="post-excerpt">{post.excerpt}</p> : null}
      </header>
      {post.cover_url ? (
        <img className="post-cover" src={post.cover_url} alt={post.title} />
      ) : null}
      <div className="post-body" dangerouslySetInnerHTML={{ __html: post.content_html || '' }} />
    </article>
  );
}

export default BlogPost;
