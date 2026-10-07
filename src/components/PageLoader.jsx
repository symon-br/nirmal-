import { useState, useEffect } from 'react';
import './PageLoader.css';

function PageLoader() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  if (!loading) return null;

  return (
    <div className="page-loader">
      <div className="loader-content">
        <div className="loader-spinner"></div>
        <p>Loading...</p>
      </div>
    </div>
  );
}

export default PageLoader;
