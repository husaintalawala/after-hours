import type { Metadata } from "next"
import styles from "./page.module.css"

export const metadata: Metadata = {
  title: "After Hours Ventures — Good ideas keep odd hours",
  description: "After Hours Ventures is an independent home for ideas that become useful products. Meet Drift, our travel-planning app, and read our side quest.",
  alternates: { canonical: "https://after-hours.app/" },
  openGraph: {
    title: "After Hours Ventures",
    description: "Good ideas keep odd hours. Meet Drift, the first thing we made.",
    url: "https://after-hours.app/",
    siteName: "After Hours Ventures",
    type: "website",
  },
}

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <a className={styles.wordmark} href="/" aria-label="After Hours Ventures home">
            <span className={styles.symbol} aria-hidden="true"><span /></span>
            <span>AFTER HOURS<span className={styles.wordmarkSub}>VENTURES LLC</span></span>
          </a>
          <nav className={styles.nav} aria-label="Main navigation">
            <a href="https://usedrift.ai/">Drift <span aria-hidden="true">↗</span></a>
            <a href="https://rashu.after-hours.app/">Side quest <span aria-hidden="true">↗</span></a>
          </nav>
        </header>

        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.intro}>
            <div className={styles.kicker}><span className={styles.liveDot} /> AN INDEPENDENT MAKER, STILL AWAKE</div>
            <h1 id="hero-title">Good ideas<br />keep <em>odd hours.</em></h1>
            <p className={styles.introCopy}>After Hours Ventures is a small home for useful things born from curiosity. We make them because we want them to exist.</p>
            <a className={styles.primaryLink} href="https://usedrift.ai/">See what we&apos;re making <span aria-hidden="true">↗</span></a>
            <p className={styles.marginNote}>The lights are on. Come in.</p>
          </div>

          <article className={styles.product} aria-label="Featured product: Drift">
            <div className={styles.productTop}><span>01 / CURRENTLY MAKING</span><span className={styles.productStatus}><span /> OUT IN THE WORLD</span></div>
            <a className={styles.productImage} href="https://usedrift.ai/" aria-label="Explore Drift at usedrift.ai">
              <img src="/drift/assets/photo/hero-aurora.webp" alt="Northern lights over a campsite" />
              <span className={styles.photoShade} />
              <span className={styles.driftBadge}><img src="/brand/drift-mark.png" alt="" /> drift</span>
              <span className={styles.imageArrow} aria-hidden="true">↗</span>
            </a>
            <div className={styles.productBottom}>
              <div><h2>Drift</h2><p>Discover the next trip. Plan it together. Go.</p></div>
              <a href="https://usedrift.ai/" aria-label="Visit Drift"><span aria-hidden="true">↗</span></a>
            </div>
          </article>
        </section>

        <section className={styles.afterword} aria-label="Our side quest">
          <div className={styles.afterwordNumber}>AFTER HOURS / PERSONAL ARCHIVE</div>
          <p>Before we built the travel app, we took the trip.</p>
          <a href="https://rashu.after-hours.app/">Our 89-day side quest <span aria-hidden="true">↗</span></a>
        </section>

        <footer className={styles.footer}>
          <span>© 2026 After Hours Ventures LLC</span>
          <a href="mailto:hello@after-hours.app">Say hello ↗</a>
        </footer>
      </div>
    </main>
  )
}
