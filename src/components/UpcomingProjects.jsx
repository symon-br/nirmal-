import { useEffect, useState } from 'react';
import { fetchUpcoming } from '../lib/api';
import './UpcomingProjects.css';

const STATUS_LABEL = { planned: 'Planned', 'in-progress': 'In Progress', paused: 'Paused', done: 'Done' };

function UpcomingProjects() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchUpcoming()
      .then((list) => !cancelled && setItems(Array.isArray(list) ? list : []))
      .catch((err) => !cancelled && setError(err.message || 'Could not load upcoming projects.'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (error) {
    return (
      <section className="upcoming-section" data-section="upcoming">
        <div className="section-container">
          <div className="section-header">
            <div className="section-label">Coming Soon</div>
            <h2>Upcoming Projects</h2>
            <p className="muted">{error} Please try again later.</p>
          </div>
        </div>
      </section>
    );
  }
  if (!items.length) return null;

  return (
    <section className="upcoming-section" data-section="upcoming">
      <div className="section-container">
        <div className="section-header">
          <div className="section-label">Coming Soon</div>
          <h2>Upcoming Projects</h2>
        </div>
        <div className="upcoming-grid">
          {items.map((p) => (
            <article key={p.id} className="upcoming-card">
              {p.image_url ? (
                <div className="upcoming-image">
                  <img src={p.image_url} alt={p.title} loading="lazy" />
                </div>
              ) : null}
              <div className="upcoming-body">
                <div className="upcoming-top">
                  <span className={`status-badge status-${p.status}`}>{STATUS_LABEL[p.status] || p.status}</span>
                  {p.target_date ? <span className="upcoming-date">{p.target_date}</span> : null}
                </div>
                <h3>{p.title}</h3>
                {p.description ? <p className="upcoming-desc">{p.description}</p> : null}
                {Array.isArray(p.tags) && p.tags.length ? (
                  <div className="upcoming-tags">
                    {p.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                ) : null}
                {typeof p.progress === 'number' && p.progress > 0 ? (
                  <div className="progress-wrap" title={`${p.progress}%`}>
                    <div className="progress-bar">
                      <span style={{ width: `${Math.min(100, p.progress)}%` }} />
                    </div>
                    <span className="progress-label">{p.progress}%</span>
                  </div>
                ) : null}
                {p.link_url ? (
                  <a className="upcoming-link" href={p.link_url} target="_blank" rel="noreferrer">
                    {p.link_label || 'Learn more'} →
                  </a>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

export default UpcomingProjects;
