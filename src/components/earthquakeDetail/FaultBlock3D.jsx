import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { buildFaultBlockModel, faultBlockCamera, faultBlockScene, projectFaultPoint } from './faultBlockGeometry.js';

const wrap = angle => ((angle % 360) + 360) % 360;
const clampElevation = angle => Math.min(90, Math.max(5, angle));
const faceColor = (shape) => {
    if (shape.kind === 'fault') return shape.side > 0 ? '#c084fc' : '#a78bfa';
    if (shape.side > 0) return shape.kind === 'top' ? '#fed7aa' : shape.kind === 'east' || shape.kind === 'west' ? '#fdba74' : '#f59e67';
    return shape.kind === 'top' ? '#cbd5e1' : shape.kind === 'east' || shape.kind === 'west' ? '#94a3b8' : '#a8b7c9';
};

function FaultBlock3D({ planeData, planeKey }) {
    const id = useId().replace(/:/g, '');
    const [azimuth, setAzimuth] = useState(() => wrap((planeData?.strike || 0) + 135));
    const [elevation, setElevation] = useState(28);
    const [progress, setProgress] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const drag = useRef(null);
    const progressRef = useRef(progress);
    progressRef.current = progress;
    const model = useMemo(() => buildFaultBlockModel(planeData, progress), [planeData, progress]);
    const camera = useMemo(() => faultBlockCamera(azimuth, elevation), [azimuth, elevation]);
    const scene = useMemo(() => faultBlockScene(model, camera), [model, camera]);

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const onChange = () => { setReducedMotion(query.matches); if (query.matches) setPlaying(false); };
        query.addEventListener?.('change', onChange);
        return () => query.removeEventListener?.('change', onChange);
    }, []);

    useEffect(() => {
        if (!playing || reducedMotion) return;
        let frame, start;
        const initial = progressRef.current;
        const animate = time => {
            if (start === undefined) start = time;
            const next = Math.min(1, initial + (time - start) / 4000);
            setProgress(next);
            if (next < 1) frame = window.requestAnimationFrame(animate);
            else setPlaying(false);
        };
        frame = window.requestAnimationFrame(animate);
        return () => window.cancelAnimationFrame(frame);
    }, [playing, reducedMotion]);

    if (!model) return <p className="p-3 text-sm text-slate-600">3D fault model unavailable: valid strike, dip, and rake are required.</p>;

    const planeLabel = planeKey === 'np2' ? 'Nodal plane 2' : 'Nodal plane 1';
    const vertical = planeData.dip === 90;
    const slipStart = projectFaultPoint(model.slip.map(value => -value * 0.26), camera, [512, 54], 80);
    const slipEnd = projectFaultPoint(model.slip.map(value => value * 0.26), camera, [512, 54], 80);
    const slipVisible = Math.hypot(slipEnd.x - slipStart.x, slipEnd.y - slipStart.y) > 2;
    const slipTowardViewer = model.slip.reduce((sum, value, index) => sum + value * camera.towardViewer[index], 0) > 0;
    const pointerEnd = () => { drag.current = null; };
    const buttonClass = 'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-purple-600';

    return (
        <figure className="w-full" aria-labelledby={`fault-3d-heading-${id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-1">
                <h3 id={`fault-3d-heading-${id}`} className="text-sm font-semibold text-slate-800">Explore the fault in 3D</h3>
                <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] text-slate-600">{planeLabel} · illustrative model</span>
            </div>
            <svg viewBox="0 0 600 390" className="mx-auto w-full max-w-2xl cursor-grab active:cursor-grabbing" style={{ touchAction: 'pan-y' }}
                role="img" aria-labelledby={`fault-3d-title-${id} fault-3d-desc-${id}`} data-testid="fault-block-3d" data-slip={progress}
                onPointerDown={event => {
                    if (event.button !== 0) return;
                    drag.current = { x: event.clientX, y: event.clientY, azimuth, elevation };
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                }}
                onPointerMove={event => {
                    if (!drag.current) return;
                    setAzimuth(wrap(drag.current.azimuth + (event.clientX - drag.current.x) * 0.5));
                    setElevation(clampElevation(drag.current.elevation - (event.clientY - drag.current.y) * 0.35));
                }} onPointerUp={pointerEnd} onPointerCancel={pointerEnd} onLostPointerCapture={pointerEnd}>
                <title id={`fault-3d-title-${id}`}>{planeLabel}: rotatable 3D fault block</title>
                <desc id={`fault-3d-desc-${id}`}>Strike {planeData.strike}°, dip {planeData.dip}°, rake {planeData.rake}°. Orange block A moves relative to gray block B along the selected plane. The fence shows offset from illustrative slip. Drag to rotate, or use the view controls below.</desc>
                <defs>
                    <marker id={`fault-3d-arrow-${id}`} markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0 0L7 3.5L0 7Z" fill="#0369a1"/></marker>
                </defs>
                <ellipse cx="300" cy="341" rx="178" ry="17" fill="#cbd5e1" opacity="0.25"/>
                {scene.shapes.map(shape => shape.type === 'face' ? (
                    <polygon key={shape.key} points={shape.points.map(point => `${point.x},${point.y}`).join(' ')} fill={faceColor(shape)} stroke={shape.kind === 'fault' ? '#7e22ce' : '#475569'} strokeWidth={shape.kind === 'fault' ? 1.8 : 1.2} strokeLinejoin="round"/>
                ) : (
                    <line key={shape.key} x1={shape.points[0].x} y1={shape.points[0].y} x2={shape.points[1].x} y2={shape.points[1].y} stroke="#713f12" strokeWidth={shape.kind === 'rail' ? 3 : 2.5} strokeLinecap="round"/>
                ))}
                {scene.labels.map(label => <g key={label.side} transform={`translate(${label.point.x} ${label.point.y})`}><circle r="18" fill="white" fillOpacity="0.85"/><text textAnchor="middle" y="6" fontSize="18" fontWeight="700" fill={label.side > 0 ? '#9a3412' : '#334155'}>{label.side > 0 ? 'A' : 'B'}</text></g>)}
                <g aria-hidden="true">
                    {[[[0, 0.38, 0], 'N', '#334155'], [[0.38, 0, 0], 'E', '#64748b'], [[0, 0, 0.38], 'Up', '#7e22ce']].map(([vector, label, color]) => {
                        const end = projectFaultPoint(vector, camera, [63, 330], 94);
                        return <g key={label}><line x1="63" y1="330" x2={end.x} y2={end.y} stroke={color} strokeWidth="2"/><circle cx={end.x} cy={end.y} r="2.5" fill={color}/><text x={end.x} y={end.y - 7} textAnchor="middle" fontSize="16" fontWeight="600" fill={color}>{label}</text></g>;
                    })}
                    <text x="63" y="371" textAnchor="middle" fontSize="14" fill="#64748b">Orientation</text>
                    {slipVisible ? <line x1={slipStart.x} y1={slipStart.y} x2={slipEnd.x} y2={slipEnd.y} stroke="#0369a1" strokeWidth="2.5" markerEnd={`url(#fault-3d-arrow-${id})`}/> : <text x="512" y="58" textAnchor="middle" fill="#0369a1" fontSize="20">{slipTowardViewer ? '⊙' : '⊗'}</text>}
                    <text x="512" y="101" textAnchor="middle" fontSize="14" fill="#0369a1">A relative to B</text>
                    {!slipVisible && <text x="512" y="120" textAnchor="middle" fontSize="14" fill="#0369a1">{slipTowardViewer ? 'toward you' : 'away from you'}</text>}
                </g>
            </svg>
            <div className="-mt-1 space-y-3 rounded-lg border border-slate-200 bg-white/90 p-3">
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={buttonClass} onClick={() => { setAzimuth(wrap(planeData.strike + 135)); setElevation(28); }}>Oblique view</button>
                    <button type="button" className={buttonClass} onClick={() => { setAzimuth(180); setElevation(90); }}>North-up top view</button>
                    <button type="button" className={buttonClass} onClick={() => { setAzimuth(wrap(planeData.strike + 180)); setElevation(5); }}>Along strike</button>
                    <span className="text-xs text-slate-500">Drag to rotate · sliders support arrow keys</span>
                </div>
                <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                    <label className="text-xs font-medium text-slate-700" htmlFor={`fault-azimuth-${id}`}>View azimuth <span className="float-right tabular-nums text-slate-500">{Math.round(azimuth)}°</span>
                        <input id={`fault-azimuth-${id}`} type="range" min="0" max="359" step="1" value={Math.round(azimuth)} onChange={event => setAzimuth(Number(event.target.value))} className="mt-2 block w-full accent-purple-600"/>
                    </label>
                    <label className="text-xs font-medium text-slate-700" htmlFor={`fault-elevation-${id}`}>View elevation <span className="float-right tabular-nums text-slate-500">{Math.round(elevation)}°</span>
                        <input id={`fault-elevation-${id}`} type="range" min="5" max="90" step="1" value={Math.round(elevation)} onChange={event => setElevation(Number(event.target.value))} className="mt-2 block w-full accent-purple-600"/>
                    </label>
                </div>
                <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
                    <label className="min-w-0 flex-1 basis-full text-xs font-medium text-slate-700 sm:basis-0" htmlFor={`fault-slip-${id}`}>Illustrative slip <span className="float-right tabular-nums text-slate-500">{Math.round(progress * 100)}%</span>
                        <input id={`fault-slip-${id}`} type="range" min="0" max="100" step="1" value={Math.round(progress * 100)} onChange={event => { setPlaying(false); setProgress(Number(event.target.value) / 100); }} className="mt-2 block w-full accent-sky-700"/>
                    </label>
                    <button type="button" className={`${buttonClass} disabled:cursor-default disabled:opacity-50`} disabled={reducedMotion} onClick={() => { if (!playing && progress >= 1) setProgress(0); setPlaying(!playing); }}>{playing ? 'Pause slip' : progress >= 1 ? 'Replay slip' : 'Play slip'}</button>
                    <button type="button" className={buttonClass} onClick={() => { setPlaying(false); setProgress(0); }}>Reset slip</button>
                </div>
                {reducedMotion && <p className="text-xs text-slate-500">Reduced motion is enabled. Use the slip slider to compare positions.</p>}
            </div>
            <figcaption className="mt-3 space-y-1 text-xs leading-relaxed text-slate-600">
                <p><span className="font-semibold text-orange-800">A: {vertical ? 'right side facing along strike' : 'hanging wall (above the plane)'}</span>. <span className="font-semibold text-slate-700">B: {vertical ? 'left side' : 'footwall (below)'}</span>. {vertical ? 'A vertical fault has no distinct hanging wall or footwall. ' : ''}The brown fence makes relative offset visible; exposed purple faces mark the fault plane.</p>
                {!model.surfaceIntersection && <p>The plane stays below this block’s top; the surface fence sits entirely on A.</p>}
                <p>Orientation and slip direction come from this nodal plane. Block size, fence, displacement, and playback speed are illustrative: this is not a surface rupture reconstruction or a displacement estimate. Both blocks move symmetrically to show their relative motion.</p>
            </figcaption>
        </figure>
    );
}

export default FaultBlock3D;
