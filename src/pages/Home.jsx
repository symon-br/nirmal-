import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import MaskedHeading from '../components/MaskedHeading/MaskedHeading';
import './Home.css';

const QUOTES = [
  { text: 'The only true wisdom is in knowing you know nothing.', author: 'Socrates' },
  { text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', author: 'Aristotle' },
  { text: 'The unexamined life is not worth living.', author: 'Socrates' },
  { text: 'He who has a why to live can bear almost any how.', author: 'Friedrich Nietzsche' },
  { text: 'The mind is everything. What you think you become.', author: 'Buddha' },
  { text: 'We suffer more often in imagination than in reality.', author: 'Seneca' },
  { text: 'The best way to predict the future is to create it.', author: 'Peter Drucker' },
  { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
];

function Home() {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [counters, setCounters] = useState([0, 0, 0]);
  const aboutRef = useRef(null);
  const [aboutVisible, setAboutVisible] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex(prev => (prev + 1) % QUOTES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAboutVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (aboutRef.current) observer.observe(aboutRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!aboutVisible) return;
    const targets = [85, 90, 95];
    const duration = 2000;
    const steps = duration / 16;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = Math.min(step / steps, 1);
      setCounters(targets.map(t => Math.floor(t * progress)));
      if (progress >= 1) clearInterval(timer);
    }, 16);
    return () => clearInterval(timer);
  }, [aboutVisible]);

  return (
    <>
      <section className="hero">
        <MaskedHeading
          text={QUOTES[quoteIndex].text}
          src="/images/IMG10.jpg"
          mediaType="image"
          fillScale={1.25}
          parallax={26}
          drift={18}
          brightness={1}
          saturation={1}
          grayscale={false}
          reveal="rise"
          duration={1.1}
          stagger={0.09}
          trigger="view"
          align="center"
          weight={700}
          tracking={-0.03}
          lineHeight={1.06}
          textScale={0.115}
        />
      </section>

      <section id="about" className="about" ref={aboutRef}>
        <div className="about-wrapper">
          <div className="about-content">
            <div className="section-label">About Me</div>
            <h2>Passionate about Code & Design</h2>
            <p>
              I&apos;m a developer who loves creating seamless user experiences. With expertise in modern
              technologies and design-first thinking, I transform ideas into interactive digital
              solutions that engage and delight users.
            </p>
            <ul className="skills-list">
              <li>
                <span className="skill-counter">{counters[0]}%</span>Web Design & UX
              </li>
              <li>
                <span className="skill-counter">{counters[1]}%</span>Frontend Development
              </li>
              <li>
                <span className="skill-counter">{counters[2]}%</span>Interactive Experiences
              </li>
              <li>Performance Optimization</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="features-wrapper">
          <div className="section-header">
            <div className="section-label">What I Offer</div>
            <h2>Services & Expertise</h2>
            <p>Comprehensive solutions for digital presence</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🎨</div>
              <h3>Web Design</h3>
              <p>Beautiful, responsive interfaces that create lasting impressions and drive user engagement.</p>
              <a href="#contact" className="feature-link">Learn More →</a>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚙️</div>
              <h3>Development</h3>
              <p>Robust, scalable applications built with best practices and cutting-edge technology.</p>
              <a href="#contact" className="feature-link">Learn More →</a>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Optimization</h3>
              <p>Fast, efficient solutions that perform beautifully across all devices and networks.</p>
              <a href="#contact" className="feature-link">Learn More →</a>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="cta-wrapper">
          <div className="cta-content">
            <div className="cta-label">Ready to Collaborate?</div>
            <h2>Let&apos;s Create Something Amazing</h2>
            <p>Explore my gallery or get in touch to discuss your next project</p>
            <div className="cta-actions">
              <Link to="/gallery" className="cta-primary">See My Photography</Link>
              <Link to="/portfolio" className="cta-secondary">View Portfolio</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default Home;
