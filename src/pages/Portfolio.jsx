import { useState, useEffect, useRef } from 'react';
import UpcomingProjects from '../components/UpcomingProjects';
import './Portfolio.css';

const PROJECTS = [
    {
        id: 'e-commerce',
        title: 'E-commerce Platform',
        image: 'https://picsum.photos/seed/ecommerce/800/600',
        description:
            'Full-stack e-commerce solution with payment integration, inventory management, and admin dashboard.',
        tech: ['React', 'Node.js', 'MongoDB'],
    },
    {
        id: 'portfolio',
        title: 'Portfolio Website',
        image: 'https://picsum.photos/seed/portfolio/800/600',
        description:
            'Modern, responsive portfolio website with interactive elements and smooth animations.',
        tech: ['HTML5', 'CSS3', 'JavaScript'],
    },
    {
        id: 'mobile-app',
        title: 'Mobile App',
        image: 'https://picsum.photos/seed/mobile/800/600',
        description:
            'Cross-platform mobile application for task management with real-time synchronization.',
        tech: ['React Native', 'Firebase', 'Redux'],
    },
];

const EXPERIENCE = [
    {
        title: 'Senior Frontend Developer',
        date: '2023 - Present',
        company: 'Tech Company Name',
        description:
            'Led development of responsive web applications serving 100K+ users. Implemented modern React architecture and improved performance by 40%.',
        skills: ['React', 'TypeScript', 'Node.js'],
    },
    {
        title: 'Full Stack Developer',
        date: '2021 - 2023',
        company: 'Digital Agency',
        description:
            'Developed custom web solutions for clients across various industries. Collaborated with design teams to create pixel-perfect implementations.',
        skills: ['JavaScript', 'PHP', 'MySQL'],
    },
    {
        title: 'Junior Developer',
        date: '2020 - 2021',
        company: 'Startup Company',
        description:
            'Started my journey in web development, learning modern technologies and best practices while contributing to real-world projects.',
        skills: ['HTML', 'CSS', 'JavaScript'],
    },
];

function Portfolio() {
    const [activeProject, setActiveProject] = useState(null);
    const [formData, setFormData] = useState({ name: '', email: '', message: '' });
    const [formStatus, setFormStatus] = useState(null);
    const [visibleSections, setVisibleSections] = useState(new Set());
    const sectionRefs = useRef([]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setVisibleSections(
                            (prev) => new Set([...prev, entry.target.dataset.section])
                        );
                    }
                });
            },
            { threshold: 0.1 }
        );
        sectionRefs.current.forEach((el) => {
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormStatus('sending');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setFormStatus('success');
        setFormData({ name: '', email: '', message: '' });
        setTimeout(() => setFormStatus(null), 5000);
    };

    const openProject = (project) => setActiveProject(project);
    const closeProject = () => setActiveProject(null);

    return (
        <>
            <section
                className="portfolio-hero"
                data-section="hero"
                ref={(el) => (sectionRefs.current[0] = el)}
            >
                <div className={`hero-content ${visibleSections.has('hero') ? 'animate-in' : ''}`}>
                    <div className="hero-badge">Professional Profile</div>
                    <h1 className="hero-title">
                        Hi, I&apos;m <span className="highlight">Symon</span>
                    </h1>
                    <p className="hero-subtitle">
                        Creative Developer & Designer passionate about building beautiful,
                        functional web experiences
                    </p>
                    <div className="hero-stats">
                        <div className="stat-item">
                            <span className="stat-number">3+</span>
                            <span className="stat-label">Years Experience</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-number">50+</span>
                            <span className="stat-label">Projects Completed</span>
                        </div>
                        <div className="stat-item">
                            <span className="stat-number">100%</span>
                            <span className="stat-label">Client Satisfaction</span>
                        </div>
                    </div>
                </div>
                <div className="hero-visual">
                    <div className="profile-image">
                        <img
                            src="/images/me.jpg"
                            alt="Professional headshot"
                            className="profile-photo"
                        />
                        <div className="profile-overlay"></div>
                    </div>
                </div>
            </section>

            <section
                className="about-section"
                data-section="about"
                ref={(el) => (sectionRefs.current[1] = el)}
            >
                <div className="section-container">
                    <div className="section-header">
                        <div className="section-label">About Me</div>
                        <h2>Get to Know Me Better</h2>
                    </div>
                    <div className="about-grid">
                        <div className="about-content">
                            <h3>Who I Am?</h3>
                            <p>
                                I&apos;m a passionate developer and designer who believes in creating
                                digital experiences that not only look beautiful but also solve real
                                problems.
                            </p>
                            <p>
                                My journey in tech started with curiosity about how websites work,
                                and it has evolved into a career dedicated to crafting user-centered
                                solutions.
                            </p>
                            <div className="personal-info">
                                <div className="info-item">
                                    <span className="info-label">Name:</span>
                                    <span className="info-value">Nirmal BK </span>
                                </div>
                                <div className="info-item">
                                    <span className="info-label">Location:</span>
                                    <span className="info-value">Kohalpur, Nepal</span>
                                </div>
                                <div className="info-item">
                                    <span className="info-label">Email:</span>
                                    <span className="info-value">nirmalbdrbk@gmail.com</span>
                                </div>
                                <div className="info-item">
                                    <span className="info-label">Experience:</span>
                                    <span className="info-value">1+ Years</span>
                                </div>
                            </div>
                        </div>
                        <div className="skills-content">
                            <h3>My Skills</h3>
                            <div className="skills-grid">
                                <div className="skill-category">
                                    <h4>Frontend Development</h4>
                                    <div className="skill-tags">
                                        {['HTML5', 'CSS3', 'JavaScript', 'React', 'Vue.js'].map(
                                            (s) => (
                                                <span key={s} className="skill-tag">
                                                    {s}
                                                </span>
                                            )
                                        )}
                                    </div>
                                </div>
                                <div className="skill-category">
                                    <h4>Backend Development</h4>
                                    <div className="skill-tags">
                                        {['Node.js', 'Python', 'MongoDB', 'PostgreSQL'].map((s) => (
                                            <span key={s} className="skill-tag">
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div className="skill-category">
                                    <h4>Design & Tools</h4>
                                    <div className="skill-tags">
                                        {['Figma', 'Adobe XD', 'Photoshop', 'Git'].map((s) => (
                                            <span key={s} className="skill-tag">
                                                {s}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section
                className="experience-section"
                data-section="experience"
                ref={(el) => (sectionRefs.current[2] = el)}
            >
                <div className="section-container">
                    <div className="section-header">
                        <div className="section-label">Experience</div>
                        <h2>My Professional Journey</h2>
                    </div>
                    <div className="timeline">
                        {EXPERIENCE.map((exp, i) => (
                            <div key={i} className="timeline-item">
                                <div className="timeline-marker"></div>
                                <div className="timeline-content">
                                    <div className="timeline-header">
                                        <h3>{exp.title}</h3>
                                        <span className="timeline-date">{exp.date}</span>
                                    </div>
                                    <div className="timeline-company">{exp.company}</div>
                                    <p>{exp.description}</p>
                                    <div className="timeline-skills">
                                        {exp.skills.map((s) => (
                                            <span key={s}>{s}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section
                className="projects-section"
                data-section="projects"
                ref={(el) => (sectionRefs.current[3] = el)}
            >
                <div className="section-container">
                    <div className="section-header">
                        <div className="section-label">Projects</div>
                        <h2>Featured Work</h2>
                    </div>
                    <div className="projects-grid">
                        {PROJECTS.map((project) => (
                            <div
                                key={project.id}
                                className="project-card"
                                onClick={() => openProject(project)}
                            >
                                <div className="project-image">
                                    <img src={project.image} alt={project.title} />
                                    <div className="project-overlay">
                                        <span className="project-link">View Project</span>
                                    </div>
                                </div>
                                <div className="project-content">
                                    <h3>{project.title}</h3>
                                    <p>{project.description}</p>
                                    <div className="project-tech">
                                        {project.tech.map((t) => (
                                            <span key={t}>{t}</span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <UpcomingProjects />

            <section
                className="contact-section"
                data-section="contact"
                ref={(el) => (sectionRefs.current[4] = el)}
            >
                <div className="section-container">
                    <div className="section-header">
                        <div className="section-label">Contact</div>
                        <h2>Let&apos;s Work Together</h2>
                    </div>
                    <div className="contact-content">
                        <div className="contact-info">
                            <div className="contact-item">
                                <div className="contact-icon">📧</div>
                                <div className="contact-details">
                                    <h4>Email</h4>
                                    <p>nirmalbdrbk@gmail.com</p>
                                </div>
                            </div>
                            <div className="contact-item">
                                <div className="contact-icon">📱</div>
                                <div className="contact-details">
                                    <h4>Phone</h4>
                                    <p>+977 9812426300</p>
                                </div>
                            </div>
                            <div className="contact-item">
                                <div className="contact-icon">📍</div>
                                <div className="contact-details">
                                    <h4>Location</h4>
                                    <p>Kohalpur, Nepal</p>
                                </div>
                            </div>
                        </div>
                        <div className="contact-form">
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label htmlFor="contact-name">Name</label>
                                    <input
                                        type="text"
                                        id="contact-name"
                                        name="name"
                                        value={formData.name}
                                        onChange={(e) =>
                                            setFormData({ ...formData, name: e.target.value })
                                        }
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="contact-email">Email</label>
                                    <input
                                        type="email"
                                        id="contact-email"
                                        name="email"
                                        value={formData.email}
                                        onChange={(e) =>
                                            setFormData({ ...formData, email: e.target.value })
                                        }
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor="contact-message">Message</label>
                                    <textarea
                                        id="contact-message"
                                        name="message"
                                        rows="5"
                                        value={formData.message}
                                        onChange={(e) =>
                                            setFormData({ ...formData, message: e.target.value })
                                        }
                                        required
                                    ></textarea>
                                </div>
                                <button
                                    type="submit"
                                    className="submit-btn"
                                    disabled={formStatus === 'sending'}
                                >
                                    {formStatus === 'sending' ? 'Sending...' : 'Send Message'}
                                </button>
                                {formStatus === 'success' && (
                                    <div className="form-success">Message sent successfully!</div>
                                )}
                            </form>
                        </div>
                    </div>
                </div>
            </section>

            {activeProject && (
                <div className="project-modal" onClick={closeProject}>
                    <div className="modal-backdrop" />
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>{activeProject.title}</h2>
                            <button className="modal-close" onClick={closeProject}>
                                ×
                            </button>
                        </div>
                        <div className="modal-body">
                            <div className="modal-image">
                                <img src={activeProject.image} alt={activeProject.title} />
                            </div>
                            <div className="modal-details">
                                <p className="modal-description">{activeProject.description}</p>
                                <div className="modal-section">
                                    <h3>Technologies Used</h3>
                                    <div className="tech-stack">
                                        {activeProject.tech.map((t) => (
                                            <span key={t} className="tech-tag">
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

export default Portfolio;
