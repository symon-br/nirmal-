import DepthCarousel from '../components/DepthCarousel/DepthCarousel';
import './Gallery.css';

const items = [
  { image: '/images/FAV.jpg', alt: 'Favorite memory' },
  { image: '/images/FAV1.jpg', alt: 'Favorite moment' },
  { image: '/images/FAV2.jpg', alt: 'Favorite time' },
  { image: '/images/IMG1.jpg', alt: 'Loving memories - We must learn to live' },
  { image: '/images/IMG2.jpg', alt: 'Loving memories - Those in my territory' },
  { image: '/images/IMG3.jpg', alt: 'Soft corner - My dear Sister' },
  { image: '/images/IMG4.jpg', alt: 'Soft corner - Friendship' },
  { image: '/images/IMG5.jpg', alt: 'Gallery image 5' },
  { image: '/images/IMG6.jpg', alt: 'Gallery image 6' },
  { image: '/images/IMG9.jpg', alt: 'Gallery image 9' },
  { image: '/images/IMG10.jpg', alt: 'Gallery image 10' },
  { image: '/images/me.jpg', alt: 'Me' },
  { image: '/images/MESSI.jpg', alt: 'Messi' },
  { image: '/images/MESSI1.jpg', alt: 'Messi celebration' },
  { image: '/images/NIGHT.jpg', alt: 'Night view' },
  { image: '/images/PANDA.jpg', alt: 'Panda' },
  { image: '/images/PEACE.jpg', alt: 'Peace' },
];

function Gallery() {
  return (
    <div className="gallery-page">
      <header className="page-header">
        <div className="hero-panel">
          <div className="hero-copy">
            <p className="eyebrow">Private Gallery</p>
            <h1 className="hero-title">View pictures organized by folder</h1>
            <p className="hero-text">
              A cold-toned gallery interface for browsing your personal uploads. Click on images to view them larger.
            </p>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="hero-shape"></div>
            <div className="hero-accent"></div>
          </div>
        </div>
      </header>

      <main>
        <section className="section gallery-section">
          <div className="section-title">
            <span>Folder Gallery</span>
            <h2>COULD BE TOGETHER AGAIN.</h2>
          </div>

          <div className="carousel-wrapper">
            <DepthCarousel
              items={items}
              depth={220}
              spread={90}
              tilt={22}
              tiltDirection="right"
              perspective={1400}
              visibleCards={4}
              falloff={0.2}
              blur={6}
              autoplay={false}
              loop
              cardWidth={300}
              cardHeight={380}
              radius={18}
              tint="#05060a"
              duration={700}
              ease="power3.out"
              autoplayDelay={3200}
              showControls
              showIndicators
            />
          </div>
        </section>
      </main>
    </div>
  );
}

export default Gallery;
