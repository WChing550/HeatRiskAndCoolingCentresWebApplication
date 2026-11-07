import React from 'react';

export default function ClimateArt({ compact = false }) {
  return <div className={'climate-art ' + (compact ? 'compact' : '')} aria-hidden="true">
    <div className="orbit orbit-one" /><div className="orbit orbit-two" />
    <div className="climate-sun"><div className="sun-core" /></div>
    <div className="contour contour-one" /><div className="contour contour-two" /><div className="contour contour-three" />
    <div className="climate-cross cross-one">+</div><div className="climate-cross cross-two">+</div>
    <div className="art-coordinate">3.1390° N<br />101.6869° E</div>
    <div className="art-label"><span /> A COOLER PERSPECTIVE</div>
    <svg className="city-line" viewBox="0 0 600 160" fill="none"><path d="M0 145H45V115H75V145H130V80H151V60H162V28H169V60H180V80H201V145H221V80H242V60H253V28H260V60H271V80H292V145H326V97H350V145H386V72H400V55H406V10H410V55H418V72H432V145H475V105H510V145H600" stroke="currentColor" strokeWidth="1.2"/><path d="M201 98H221M201 105H221" stroke="currentColor" /></svg>
  </div>;
}
