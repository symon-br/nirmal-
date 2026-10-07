# CRETURES - Personal Portfolio

A modern, responsive personal portfolio website built with React, Vite, and GSAP. Features a 3D depth carousel gallery, dark mode, and smooth animations.

## Features

- **Home Page** - Hero section with animated typing effect, about section, features/services, and CTA
- **Portfolio Page** - Detailed professional profile with skills, experience timeline, projects showcase, and contact form
- **Gallery Page** - 3D depth carousel with GSAP animations, drag/wheel/keyboard navigation
- **Login Page** - "Share Your Info" form for visitors to submit their details
- **Dark Mode** - Toggle between light and dark themes
- **Responsive Design** - Fully responsive across all devices
- **Smooth Animations** - Scroll-triggered animations, parallax effects, and micro-interactions

## Tech Stack

- **React 18** - UI library with hooks
- **Vite 5** - Build tool and dev server
- **GSAP 3** - Animation library for the depth carousel
- **React Router 6** - Client-side routing
- **Cloudflare Wrangler** - Deployment via Cloudflare Workers

## Project Structure

```
My_Portfolio/
├── index.html              # Vite entry point
├── package.json            # Dependencies and scripts
├── vite.config.js          # Vite configuration
├── public/
│   └── images/             # Static image assets
│       └── IMG1.jpg - IMG10.jpg
├── src/
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # Router and layout setup
│   ├── index.css           # Global styles and CSS variables
│   ├── components/         # Reusable components
│   │   ├── Navbar.jsx
│   │   ├── Footer.jsx
│   │   ├── ScrollToTop.jsx
│   │   ├── PageLoader.jsx
│   │   ├── ThemeToggle.jsx
│   │   ├── ScrollProgressBar.jsx
│   │   └── DepthCarousel/  # 3D carousel component
│   │       ├── DepthCarousel.jsx
│   │       └── DepthCarousel.css
│   └── pages/              # Page components
│       ├── Home.jsx
│       ├── Portfolio.jsx
│       ├── Gallery.jsx
│       └── Login.jsx
├── wrangler.jsonc          # Cloudflare Wrangler config
└── .github/workflows/      # CI/CD pipeline
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/symon-br/My_Portfolio.git
   cd My_Portfolio
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the dev server:
   ```bash
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5501`

### Build for Production

```bash
npm run build
```

The build output will be in the `dist/` directory.

### Deployment

This project is configured for deployment via Cloudflare Wrangler:

```bash
# Login to Cloudflare
wrangler login

# Deploy
wrangler deploy
```

## Available Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start Vite dev server on port 5501   |
| `npm run build` | Build for production to `dist/`      |
| `npm run preview` | Preview the production build       |
| `npm run lint`  | Run ESLint on source files           |

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contact

- **Email**: nirmalbdrbk@gmail.com
- **GitHub**: [symon-br](https://github.com/symon-br)
- **LinkedIn**: [NIRMAL BAHADUR BK](https://www.linkedin.com/in/nirmal-bahadur-bk-346a613a9/)
