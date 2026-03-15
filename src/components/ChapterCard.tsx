'use client'

import { useRef, useEffect, useState } from 'react'
import type { Chapter, TagCategory, DayEntry } from '@/data/journey'
import Filmstrip from './Filmstrip'

const tagColors: Record<TagCategory, { bg: string; text: string }> = {
  food:      { bg: 'rgba(234,179,8,0.10)',  text: '#eab308' },
  culture:   { bg: 'rgba(168,85,247,0.10)', text: '#a855f7' },
  nature:    { bg: 'rgba(34,197,94,0.10)',   text: '#22c55e' },
  adventure: { bg: 'rgba(239,68,68,0.10)',   text: '#ef4444' },
  transit:   { bg: 'rgba(59,130,246,0.10)',  text: '#3b82f6' },
  rest:      { bg: 'rgba(156,163,175,0.10)', text: '#9ca3af' },
  peak:      { bg: 'rgba(201,162,39,0.12)',  text: '#c9a227' },
  family:    { bg: 'rgba(244,114,182,0.10)', text: '#f472b6' },
}
const transitIcons: Record<string, string> = { flight:'✈', train:'🚄', bus:'🚌', car:'🚗', ferry:'⛴', helicopter:'🚁', walk:'🥾' }

function TagPill({ tag }: { tag: TagCategory }) {
  const c = tagColors[tag] || tagColors.rest
  return <span className="inline-block px-1.5 py-0.5 text-[9px] font-mono tracking-wider uppercase rounded-full" style={{ background: c.bg, color: c.text }}>{tag}</span>
}

function TransitCard({ transit }: { transit: DayEntry['transit'] }) {
  if (!transit) return null
  return <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-mono" style={{ background:'rgba(59,130,246,0.06)', border:'1px solid rgba(59,130,246,0.12)' }}><span>{transitIcons[transit.mode]||'→'}</span><span className="text-blue-400/70">{transit.from} → {transit.to}</span>{transit.duration && <span className="text-cream/25">· {transit.duration}</span>}</div>
}

function ElevationChart({ days }: { days: DayEntry[] }) {
  const ed = days.filter(d => d.elevation)
  if (ed.length < 2) return null
  const mx = Math.max(...ed.map(d=>d.elevation!)), mn = Math.min(...ed.map(d=>d.elevation!)), rg = mx-mn||1, w=100, h=40
  const pts = ed.map((d,i) => `${(i/(ed.length-1))*w},${h-((d.elevation!-mn)/rg)*(h-4)}`).join(' ')
  return <div className="mt-4 mb-2"><div className="flex justify-between text-[9px] font-mono text-cream/20 mb-1"><span>{mn.toLocaleString()} ft</span><span className="text-gold/40">{mx.toLocaleString()} ft</span></div><svg viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none"><defs><linearGradient id="elevG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c9a227" stopOpacity="0.25"/><stop offset="100%" stopColor="#c9a227" stopOpacity="0"/></linearGradient></defs><polygon points={`0,${h} ${pts} ${w},${h}`} fill="url(#elevG)"/><polyline points={pts} fill="none" stroke="#c9a227" strokeWidth="1.5" strokeLinecap="round"/></svg></div>
}

function DayRow({ day, index, isExpanded }: { day: DayEntry; index: number; isExpanded: boolean }) {
  return <div className="group relative pl-8 pb-4 last:pb-0" style={{animationDelay:`${index*30}ms`}}>
    <div className="absolute left-[11px] top-0 bottom-0 w-px bg-white/[0.06]"/>
    <div className="absolute left-[7px] top-1 w-[9px] h-[9px] rounded-full border-2" style={{borderColor:day.highlight?'#c9a227':'rgba(255,255,255,0.15)',background:day.highlight?'rgba(201,162,39,0.3)':'transparent'}}/>
    <div className="flex items-baseline gap-2 mb-0.5"><span className="text-[10px] font-mono text-gold/50 tabular-nums">Day {day.day}</span><span className="text-[9px] font-mono text-cream/20">{day.date}</span></div>
    <p className="text-[12px] text-cream/70 leading-snug">{day.highlight && <span className="text-gold font-medium">{day.highlight}</span>}{day.highlight && day.summary && <span className="text-cream/30"> — </span>}{isExpanded ? <span>{day.summary}</span> : day.summary && <span>{day.summary.slice(0,60)}{day.summary.length>60?'...':''}</span>}</p>
    {isExpanded && <div className="flex flex-wrap items-center gap-1.5 mt-1.5">{day.tags.map((tag,i)=><TagPill key={i} tag={tag}/>)}{day.transit && <TransitCard transit={day.transit}/>}</div>}
  </div>
}

function Itinerary({ days }: { days: DayEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const hasElev = days.some(d => d.elevation)
  const preview = days.slice(0,3), rest = days.slice(3)
  return <div className="mt-6">
    <div className="flex items-center gap-3 mb-4"><div className="w-6 h-px bg-gold/30"/><span className="text-[10px] font-mono tracking-[0.25em] text-gold/40 uppercase">Itinerary</span><span className="text-[10px] font-mono text-cream/20">{days.length} days</span><div className="flex-1 h-px bg-white/[0.04]"/></div>
    {hasElev && <ElevationChart days={days}/>}
    <div className="relative">
      {preview.map((d,i)=><DayRow key={d.day} day={d} index={i} isExpanded={expanded}/>)}
      <div className="overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]" style={{maxHeight:expanded?`${rest.length*100}px`:'0px',opacity:expanded?1:0}}>
        {rest.map((d,i)=><DayRow key={d.day} day={d} index={i+3} isExpanded={expanded}/>)}
      </div>
      {!expanded && rest.length>0 && <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none" style={{background:'linear-gradient(transparent,rgba(10,10,15,0.95))'}}/>}
    </div>
    {rest.length>0 && <button onClick={()=>setExpanded(!expanded)} className="w-full mt-2 py-2.5 rounded-lg text-[11px] font-mono tracking-wider uppercase transition-all duration-300 hover:scale-[1.01]" style={{background:expanded?'rgba(201,162,39,0.08)':'rgba(201,162,39,0.06)',border:'1px solid rgba(201,162,39,0.15)',color:expanded?'#c9a227':'rgba(201,162,39,0.6)'}}>{expanded?'↑ Collapse':`↓ Show all ${days.length} days`}</button>}
  </div>
}

interface ChapterCardProps { chapter: Chapter; index: number; isActive: boolean }

export default function ChapterCard({ chapter, index, isActive }: ChapterCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const obs = new IntersectionObserver(([e])=>{if(e.isIntersecting)setIsVisible(true)},{threshold:0.15})
    obs.observe(el)
    return ()=>obs.disconnect()
  }, [])
  const isLeft = index%2===0
  const alignment = isLeft ? 'mr-auto ml-4 md:ml-10' : 'ml-auto mr-4 md:mr-10'
  const coordStr = `${chapter.coordinates.lat.toFixed(4)}°N ${Math.abs(chapter.coordinates.lng).toFixed(4)}°${chapter.coordinates.lng>=0?'E':'W'}`
  return <div ref={cardRef} className={`max-w-xl w-full ${alignment} transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible?'opacity-100 translate-y-0':isLeft?'opacity-0 -translate-x-8 translate-y-6':'opacity-0 translate-x-8 translate-y-6'}`}>
    <div className="relative rounded-xl overflow-hidden" style={{background:'rgba(12,12,18,0.75)',backdropFilter:'blur(20px)',border:isActive?'1px solid rgba(201,162,39,0.2)':'1px solid rgba(255,255,255,0.04)',boxShadow:isActive?'0 20px 60px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.03)':'0 8px 32px rgba(0,0,0,0.3),inset 0 1px 0 rgba(255,255,255,0.02)',transition:'border-color 0.5s,box-shadow 0.5s'}}>
      <div className="h-px w-full" style={{background:isActive?'linear-gradient(90deg,transparent,rgba(201,162,39,0.4),transparent)':'linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)',transition:'background 0.5s'}}/>
      <div className="p-6 md:p-8">
        {chapter.isPeak && <div className="inline-flex items-center gap-1.5 px-3 py-1 mb-5 text-[10px] font-mono tracking-wider uppercase rounded-full" style={{background:'rgba(201,162,39,0.12)',color:'#c9a227',border:'1px solid rgba(201,162,39,0.25)'}}><span className="animate-pulse">✦</span><span>{chapter.peakLabel||'Peak Moment'}</span></div>}
        <div className="flex items-baseline justify-between mb-3"><span className="font-mono text-[10px] tracking-[0.3em] text-gold/50 uppercase">Chapter {String(index+1).padStart(2,'0')}</span><span className="font-mono text-[9px] tracking-wider text-cream/15 coord-glitch" data-text={coordStr}>{coordStr}</span></div>
        <h2 className="text-4xl md:text-5xl font-display font-light text-cream tracking-tight mb-1">{chapter.title}</h2>
        <p className="text-lg font-display italic text-gold/60 mb-2">{chapter.subtitle}</p>
        <div className="font-mono text-[10px] tracking-wider text-cream/30 uppercase mb-6">{chapter.dates}</div>
        {chapter.description && <p className="text-[13px] text-cream/50 leading-relaxed mb-5">{chapter.description}</p>}
        {chapter.stats && chapter.stats.length>0 && <div className="flex gap-8 mb-6">{chapter.stats.map((s,i)=><div key={i}><div className="text-2xl font-display text-cream tabular-nums">{s.value}</div><div className="text-[9px] font-mono tracking-wider text-cream/25 uppercase">{s.label}</div></div>)}</div>}
        {chapter.highlights.length>0 && <div className="flex flex-wrap gap-1.5 mb-2">{chapter.highlights.map((h,i)=><span key={i} className="px-2.5 py-1 text-[10px] font-mono tracking-wide rounded-full" style={{background:'rgba(255,255,255,0.03)',color:'rgba(245,243,239,0.4)',border:'1px solid rgba(255,255,255,0.05)'}}>{h}</span>)}</div>}
        <Filmstrip photos={chapter.photos} videos={chapter.videos} chapterTitle={chapter.title}/>
        {chapter.days && chapter.days.length>0 && <Itinerary days={chapter.days}/>}
      </div>
    </div>
  </div>
}
