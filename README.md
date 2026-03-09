# Sabbatical '25–26 — 3D Globe Journey

An interactive 3D globe visualization of an 89-day sabbatical journey across 10 countries.

![Preview](preview.png)

## 🌍 Features

- **3D Earth Globe** — Real NASA textures, smooth rotation
- **Animated Route** — Flight paths draw as you scroll
- **City Markers** — Glow effects for peak moments
- **Scroll-Driven** — Journey unfolds as you scroll
- **Responsive** — Works on mobile and desktop
- **Static Export** — Hosts free on GitHub Pages

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- Git installed

### Local Development

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/sabbatical-globe.git
cd sabbatical-globe

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Build for Production

```bash
npm run export
```

Static files will be in the `out/` folder.

## 📝 Editing Your Journey

All content is in one file: `src/data/journey.ts`

### Add Photos

1. Put images in `public/images/`
2. Add filenames to the chapter:

```typescript
{
  id: 3,
  title: "Everest Base Camp",
  photos: [
    "ebc-sunrise.jpg",
    "namche-market.jpg",
    "khumbu-glacier.jpg",
  ],
  // ...
}
```

### Add Videos

For YouTube embeds, use the video ID:

```typescript
{
  videos: [
    { 
      src: "dQw4w9WgXcQ",  // YouTube video ID
      start: 12,           // Start at 12 seconds
      end: 18,             // End at 18 seconds
      caption: "Walking through Namche Bazaar"
    },
  ],
}
```

### Add/Edit Chapters

Each chapter needs:
- `coordinates` — Latitude & longitude for globe positioning
- `dates` — Display dates
- `highlights` — Tag chips
- Optional: `isPeak: true` for special moments

## 🌐 Deploy to GitHub Pages

### Option 1: Automatic (Recommended)

1. Push to GitHub
2. Go to repo → Settings → Pages
3. Source: "GitHub Actions"
4. Push any change → auto-deploys

### Option 2: Manual

```bash
npm run export
# Upload contents of `out/` folder to your hosting
```

## 📁 Project Structure

```
sabbatical-globe/
├── src/
│   ├── app/
│   │   ├── layout.tsx     # HTML wrapper, fonts, meta
│   │   └── page.tsx       # Main page component
│   ├── components/
│   │   ├── Globe.tsx      # 3D Earth + routes
│   │   └── ChapterCard.tsx # Chapter info cards
│   ├── data/
│   │   └── journey.ts     # ← EDIT THIS FILE
│   ├── hooks/
│   │   └── useScrollProgress.ts
│   └── styles/
│       └── globals.css
├── public/
│   └── images/            # Your photos here
└── package.json
```

## 🎨 Customization

### Colors

Edit `tailwind.config.ts`:

```typescript
colors: {
  midnight: '#0a0a0f',  // Background
  gold: '#c9a227',       // Accent color
  copper: '#b87333',     // Secondary accent
  cream: '#f5f3ef',      // Text color
}
```

### Fonts

Edit `src/app/layout.tsx` to change Google Fonts.

## 📄 License

Personal use. Built with ❤️ and Three.js.

---

**Tech Stack:** Next.js 14, React Three Fiber, Three.js, GSAP, Tailwind CSS
