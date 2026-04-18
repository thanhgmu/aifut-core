import styles from './page.module.css';

const capabilityGroups = [
  {
    title: 'Platform spine',
    items: [
      'Model C SaaS/operator stack backbone',
      'Tenant + workspace foundation',
      'Lean operator-first execution model',
    ],
  },
  {
    title: 'Natural-language control',
    items: [
      'In-app chat as a control surface',
      'External messaging channels as command surfaces',
      'Intent -> action -> workflow orchestration contracts',
    ],
  },
  {
    title: 'Global operation',
    items: [
      'Multi-country support',
      'Multi-language support',
      'Multi-currency support with real-time FX',
    ],
  },
  {
    title: 'Commercial operating system',
    items: [
      'Marketplace + solution publishing',
      'Affiliate / commission layers',
      'Packaging, pricing options, coupon and discount control',
    ],
  },
];

const immediateTracks = [
  'Tenancy backbone with workspace-aware operation',
  'Natural-language orchestration contracts and channel model',
  'Globalization policies for locale, currency, and FX',
  'Sovereign data/storage topology and backup model',
];

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <section className={styles.hero}>
          <span className={styles.eyebrow}>AIFUT Core</span>
          <h1>Model C execution board</h1>
          <p className={styles.lead}>
            This project is being shaped as a lean SaaS/operator-stack platform that can operate at extreme scale with a very small operator footprint.
          </p>
        </section>

        <section className={styles.panel}>
          <h2>Current delivery focus</h2>
          <ul>
            <li>Build the platform spine in the API first.</li>
            <li>Keep chat-native control as a first-class capability.</li>
            <li>Treat globalization and money handling as core infrastructure, not a later patch.</li>
            <li>Preserve flexibility for sovereign data, modular integrations, and commercial extensibility.</li>
          </ul>
        </section>

        <section className={styles.grid}>
          {capabilityGroups.map((group) => (
            <article key={group.title} className={styles.card}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        <section className={styles.panel}>
          <h2>Immediate implementation tracks</h2>
          <ol>
            {immediateTracks.map((track) => (
              <li key={track}>{track}</li>
            ))}
          </ol>
        </section>

        <section className={styles.panel}>
          <h2>Visible progress already landed</h2>
          <ul>
            <li>API backbone expanded beyond a bare starter shell.</li>
            <li>Tenancy, orchestration, and globalization have dedicated first-pass modules.</li>
            <li>This docs app now reflects the real project direction instead of the default template.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
