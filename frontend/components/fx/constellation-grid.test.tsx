import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import ConstellationGrid from './constellation-grid';

/**
 * Deterministic harness: a manual clock, a manual requestAnimationFrame queue, a fake 2D context that counts drawn dots,
 * and controllable IntersectionObserver/matchMedia. jsdom has no canvas, layout or animation frames of its own.
 */
let clock = 0;
let rafQueue = new Map<number, FrameRequestCallback>();
let nextRafId = 1;
let arcCalls = 0;
let intersect: ((entries: { isIntersecting: boolean }[]) => void) | null = null;

const WIDTH = 1280;
const HEIGHT = 800;
/** Full quality: cell = round(1280 / 26) = 49 -> 28 x 18 nodes. Degraded: cell 78 -> 18 x 12 nodes. */
const FULL_NODES = 28 * 18;
const COARSE_NODES = 18 * 12;

class FakePath2D {
    moveTo() {}
    lineTo() {}
}

const fakeContext = {
    clearRect: () => {},
    setTransform: () => {},
    stroke: () => {},
    beginPath: () => {},
    fill: () => {},
    fillText: () => {},
    arc: () => {
        arcCalls += 1;
    },
    lineWidth: 1,
    strokeStyle: '',
    fillStyle: '',
    font: '',
};

/** Runs every queued animation frame at time t and returns how many dots that frame drew. */
const frameAt = (t: number) => {
    clock = t;
    const callbacks = [...rafQueue.values()];
    rafQueue = new Map();
    arcCalls = 0;
    act(() => callbacks.forEach((callback) => callback(t)));
    return arcCalls;
};

const pending = () => rafQueue.size;

beforeEach(() => {
    clock = 0;
    rafQueue = new Map();
    nextRafId = 1;
    intersect = null;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        const id = nextRafId++;
        rafQueue.set(id, callback);
        return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
        rafQueue.delete(id);
    });
    vi.stubGlobal('Path2D', FakePath2D);
    vi.stubGlobal('devicePixelRatio', 2);
    vi.stubGlobal(
        'matchMedia',
        (query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })
    );
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            disconnect() {}
        }
    );
    vi.stubGlobal(
        'IntersectionObserver',
        class {
            constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
                intersect = callback;
            }
            observe() {}
            disconnect() {}
        }
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext as never);
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: WIDTH,
        height: HEIGHT,
        left: 0,
        top: 0,
    } as DOMRect);
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

const mount = () => render(<ConstellationGrid />).container.querySelector('canvas') as HTMLCanvasElement;

describe('ConstellationGrid adaptive quality', () => {
    it('loop_sustainedSlowFrames_coarsensMeshThenFreezes', () => {
        const canvas = mount();
        expect(canvas.width).toBe(WIDTH * 2);

        let t = 0;
        // 60 ms per frame (about 16 fps). The watcher waits at least 45 frames before each escalation.
        for (let i = 0; i < 44; i++) expect(frameAt((t += 60))).toBe(FULL_NODES);
        expect(canvas.width).toBe(WIDTH * 2);

        frameAt((t += 60));
        // Level 1: coarser cells at 1x pixel density, still animating.
        expect(canvas.width).toBe(WIDTH);
        expect(pending()).toBe(1);
        expect(frameAt((t += 60))).toBe(COARSE_NODES);

        for (let i = 0; i < 43; i++) frameAt((t += 60));
        expect(pending()).toBe(1);
        frameAt((t += 60));
        // Level 2: one still frame, no further animation frames.
        expect(pending()).toBe(0);
        expect(canvas.width).toBe(WIDTH);
    });

    it('loop_fastFrames_keepsFullQuality', () => {
        const canvas = mount();
        let t = 0;
        for (let i = 0; i < 200; i++) expect(frameAt((t += 16))).toBe(FULL_NODES);
        expect(canvas.width).toBe(WIDTH * 2);
        expect(pending()).toBe(1);
    });

    it('resume_afterOffscreenPause_doesNotCountGapAsSlowFrame', () => {
        const canvas = mount();
        let t = 0;
        for (let i = 0; i < 100; i++) frameAt((t += 16));

        act(() => intersect?.([{ isIntersecting: false }]));
        expect(pending()).toBe(0);

        // Ten seconds off screen, then back.
        t += 10_000;
        clock = t;
        act(() => intersect?.([{ isIntersecting: true }]));
        expect(pending()).toBe(1);

        for (let i = 0; i < 100; i++) expect(frameAt((t += 16))).toBe(FULL_NODES);
        expect(canvas.width).toBe(WIDTH * 2);
        expect(pending()).toBe(1);
    });
});
