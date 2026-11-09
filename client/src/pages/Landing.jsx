import React, { useId, useState } from 'react';
import { Sun, ArrowUpRight, ArrowDown, MapPin, ThermometerSun, Waves, ArrowRight, ShieldCheck } from 'lucide-react';
import ClimateArt from '../components/ClimateArt.jsx';
import './landing-field-notes.css';

const fieldRoute = 'M 168 273 C 216 390, 300 485, 443 529 S 690 476, 755 628';
const trendLine = 'M 2 37 C 29 34, 42 17, 66 18 S 112 40, 139 26 S 166 8, 184 9 S 209 34, 231 30 S 251 21, 268 22';

function FieldNotes({ openTrends, openCommunity }) {
  const routeMask = useId();

  return (
    <div className="hero-art-wrap field-notes" data-reveal>
      <ClimateArt />
      <svg className="field-notes-route" viewBox="0 0 1000 800" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <mask id={routeMask} maskUnits="userSpaceOnUse" x="0" y="0" width="1000" height="800">
            <path className="field-notes-route-reveal" d={fieldRoute} pathLength="1" />
          </mask>
        </defs>
        <path className="field-notes-route-dots" d={fieldRoute} mask={`url(#${routeMask})`} />
        <circle className="field-notes-pin" cx="168" cy="273" r="8" />
        <circle className="field-notes-pin" cx="755" cy="628" r="8" />
      </svg>

      <div className="field-note-position field-note-position--trends">
        <button type="button" className="field-note field-note--trends" onClick={openTrends}>
          <span className="field-note-icon"><Waves size={22} aria-hidden="true" /></span>
          <span className="field-note-copy">
            <strong>Local trends</strong>
            <small>See how heat changes</small>
          </span>
          <ArrowUpRight className="field-note-arrow" size={19} aria-hidden="true" />
          <svg className="field-note-chart" viewBox="0 0 270 44" preserveAspectRatio="none" aria-hidden="true">
            <path className="field-note-chart-fill" d={`${trendLine} L 268 44 H 2 Z`} />
            <path className="field-note-chart-line" d={trendLine} pathLength="1" />
            <circle className="field-note-chart-halo" cx="184" cy="9" r="8" />
            <circle className="field-note-chart-dot" cx="184" cy="9" r="3.5" />
          </svg>
        </button>
      </div>

      <div className="field-note-position field-note-position--community">
        <button type="button" className="field-note field-note--community" onClick={openCommunity}>
          <span className="field-note-icon"><ShieldCheck size={25} aria-hidden="true" /></span>
          <span className="field-note-copy">
            <strong>Community care</strong>
            <small>Share a local report</small>
          </span>
          <ArrowUpRight className="field-note-arrow" size={19} aria-hidden="true" />
        </button>
      </div>

      <span className="art-footnote mono">CLIMATE STUDY — KUALA LUMPUR</span>
    </div>
  );
}

const steps = [
  { title: 'Read the city.', label: 'Heat intelligence', text: 'Get a clearer picture of the heat. Explore local conditions, heat index readings and recent trends before you head outside.', action: 'Explore heat risk', page: 'heat', icon: ThermometerSun },
  { title: 'Find your cool.', label: 'Cooling spaces', text: 'Discover verified cooling centres around Kuala Lumpur. Check locations, opening information and facilities, all in one place.', action: 'Find cooling centres', page: 'centres', icon: MapPin },
  { title: 'Look out for each other.', label: 'Community care', text: 'Share what you see. Submit a local heat-related report and track its review through your community account.', action: 'Join the community', page: 'register', icon: Waves },
];
export default function Landing({ enter, signIn, register }) {
  const [selected, select] = useState(0);
  const step = steps[selected]; const Icon = step.icon;
  return <div className="landing">
    <a className="skip-link" href="#landing-main">Skip to content</a>
    <header className="landing-nav"><a href="#" className="landing-brand"><span className="brand-mark"><Sun size={24} /></span>HeatSafe<span className="brand-kl">KL</span><sup>°</sup></a><nav aria-label="Main navigation"><a href="#how-it-works">The approach</a><button onClick={() => enter('centres')}>Cooling spaces</button><button className="nav-signin" onClick={signIn}>Sign in <ArrowUpRight size={16} /></button></nav></header>
    <main id="landing-main">
      <section className="landing-hero landing-hero--field-notes">
        <div className="landing-intro">
          <div className="mono intro-kicker"><span className="status-dot" /> KUALA LUMPUR / A LITTLE MORE HEAT-AWARE</div>
          <h1>
            Big city.<br />
            Hot days.<br />
            <span className="cool-word">
              Cool moves.
              <svg viewBox="0 0 430 20" aria-hidden="true"><path d="M3 12 Q130 -3 210 11 T425 8" /></svg>
            </span>
          </h1>
          <p>Your city. Your shade. Your next safer step.<br />Local heat insights and cooling spaces for the everyday KL.</p>
          <div className="landing-actions">
            <button type="button" className="pill-button dark" onClick={() => enter('heat')}>
              Check the heat <ArrowUpRight size={20} aria-hidden="true" />
            </button>
            <button type="button" className="round-link" onClick={() => enter('centres')}>
              <span><MapPin size={19} aria-hidden="true" /></span> Find a cooler space
            </button>
          </div>
          <a href="#how-it-works" className="scroll-cue mono">
            <span><ArrowDown size={16} aria-hidden="true" /></span> A BETTER DAY STARTS WITH A LITTLE KNOW-HOW
          </a>
        </div>
        <FieldNotes openTrends={() => enter('trends')} openCommunity={register} />
      </section>
      <div className="ticker" aria-hidden="true"><div>{[0,1,2,3].map(i => <span key={i}>STAY AWARE <Sun /> FIND YOUR SHADE <Waves /> LOOK OUT FOR EACH OTHER <ArrowUpRight /></span>)}</div></div>
      <section id="how-it-works" className="approach-section"><div className="section-label mono" data-reveal><span>01 — THE APPROACH</span><span>A SMALL SHIFT. A COOLER CITY.</span></div><div className="approach-heading" data-reveal><h2>Navigate the heat.<br /><em>Keep your rhythm.</em></h2><p>City life doesn't stop when the temperature rises. A little awareness helps you plan your day with more confidence.</p></div>
      <div className="experience-panel" data-reveal><div className="experience-tabs" role="tablist" aria-label="Explore HeatSafe">{steps.map((item,i) => <button id={'step-tab-'+i} role="tab" aria-selected={selected===i} aria-controls="step-content" tabIndex={selected===i?0:-1} key={item.label} onClick={()=>select(i)} onKeyDown={e=>{if(['ArrowRight','ArrowLeft','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?2:(selected+(e.key==='ArrowRight'?1:2))%3;select(next);document.getElementById('step-tab-'+next)?.focus();}}} className={selected===i?'selected':''}><span className="mono">0{i+1}</span>{item.label}<ArrowUpRight size={20}/></button>)}</div>
      <div id="step-content" role="tabpanel" aria-labelledby={'step-tab-'+selected} className="experience-content" tabIndex={0}><div key={selected} className="experience-copy"><span className="experience-icon"><Icon size={32}/></span><h3>{step.title}</h3><p>{step.text}</p><button className="text-action" onClick={()=>step.page==='register'?register():enter(step.page)}>{step.action}<ArrowRight size={19}/></button></div><div className={'abstract-map scene-'+selected} aria-hidden="true"><div className="map-grid"/><div className="map-ring ring-a"/><div className="map-ring ring-b"/><div className="map-point"><Icon size={35}/></div><span className="map-tag mono">{selected===0?'OBSERVE / UNDERSTAND':selected===1?'DISCOVER / COOL DOWN':'CONNECT / CONTRIBUTE'}</span><div className="map-coordinates mono">KL<br/>03° 08′ N</div></div></div></div></section>
      <section className="community-section" data-reveal><div><span className="mono">02 — MADE FOR THE EVERYDAY</span><h2>A little care<br />goes a <em>long way.</em></h2><button className="pill-button dark" onClick={register}>Be part of the community <ArrowUpRight size={20}/></button></div><div className="community-cards">{[['01','Know before you go','Explore the heat index and recent trends to plan your next move.'],['02','Make room to cool down','Find a verified space for a break from the city heat.'],['03','Your neighbourhood matters','Report local conditions. Help build a more aware community.']].map(([n,title,text])=><article key={n}><span className="mono">{n}</span><div><h3>{title}</h3><p>{text}</p></div><ArrowUpRight size={20}/></article>)}</div></section>
      <section className="closing-section" data-reveal><div className="mono"><ShieldCheck size={15}/> LOCAL INSIGHTS. SHARED RESPONSIBILITY.</div><h2>Stay curious.<br />Stay <em>heat-aware.</em></h2><button className="pill-button mint" onClick={()=>enter('overview')}>Explore HeatSafe KL <ArrowUpRight size={22}/></button><div className="closing-orb" aria-hidden="true"/></section>
    </main><footer className="landing-footer"><a href="#" className="landing-brand"><Sun size={23}/>HeatSafe KL°</a><p>Designed for safer days in Kuala Lumpur.<br /><small>Follow official heat advisories. Heat index information is not emergency advice.</small></p><span className="mono">© {new Date().getFullYear()} HEATSAFE KL</span></footer>
  </div>;
}
