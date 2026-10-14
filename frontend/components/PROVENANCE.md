# Component provenance

Third-party component code copied into this repository. Components written from scratch are not listed.
Retrieved 2026-10-14 for CM-084 milestone B2 (decision D-14) from the public shadcn-format registries; source read before adoption.

| Component | Path | Source URL | Registry / item | License | Dependencies | Modifications |
|---|---|---|---|---|---|---|
| LightRays | `components/fx/light-rays.tsx` | https://reactbits.dev/r/LightRays-TS-TW.json | React Bits `LightRays-TS-TW` | MIT + Commons Clause (React Bits) | ogl (already installed) | none in the file; wrapped by `components/landing/HeroLight.tsx`, which paints a static glow and skips the WebGL layer under reduced motion |
| RotatingText | `components/fx/rotating-text.tsx` | https://reactbits.dev/r/RotatingText-TS-TW.json | React Bits `RotatingText-TS-TW` | MIT + Commons Clause (React Bits) | motion (already installed) | none; caller stops auto rotation under reduced motion and gives screen readers one stable sentence |
| StarBorder | `components/fx/star-border.tsx` | https://reactbits.dev/r/StarBorder-TS-TW.json | React Bits `StarBorder-TS-TW` | MIT + Commons Clause (React Bits) | none | settings ref synced in `useLayoutEffect` instead of during render (React 19 lint rule) |
| SpotlightCard | `components/fx/spotlight-card.tsx` | https://reactbits.dev/r/SpotlightCard-TS-TW.json | React Bits `SpotlightCard-TS-TW` | MIT + Commons Clause (React Bits) | none | same ref-sync change as StarBorder |
| AnimatedBeam | `components/fx/animated-beam.tsx` | https://magicui.design/r/animated-beam.json | Magic UI `animated-beam` | MIT (Magic UI) | motion | none |
| BorderBeam | `components/fx/border-beam.tsx` | https://magicui.design/r/border-beam.json | Magic UI `border-beam` | MIT (Magic UI) | motion | none |
| Marquee | `components/fx/marquee.tsx` | https://magicui.design/r/marquee.json | Magic UI `marquee` | MIT (Magic UI) | none | keyframes moved into `app/globals.css`; static under reduced motion |
| Ripple | `components/fx/ripple.tsx` | https://magicui.design/r/ripple.json | Magic UI `ripple` | MIT (Magic UI) | none | circle fill and border use `--primary` instead of `--foreground`; keyframes in `app/globals.css`; static under reduced motion |
| ConstellationGrid | `components/fx/constellation-grid.tsx` | owner-supplied snippet pasted in chat (2026-10-14); original source not stated | unknown | **unknown: owner to confirm source and licence** | none | rewritten around the snippet's spring-mass mesh: sized to its container instead of the window, transparent canvas, links only between grid neighbours (was an all-pairs scan), ChatMee colours, pauses off screen and in hidden tabs, one still frame and no pointer response under reduced motion, title overlay and theme sync removed; placed in `components/fx/` (not `components/ui/`, reserved for shadcn) |

Project-written helpers in `components/fx/`: `motion-provider.tsx` (all `motion` animations follow the reduced-motion setting) and
`use-prefers-reduced-motion.ts`.

Reduced motion: `MotionConfig reducedMotion="user"` covers every `motion`-based item; the canvas items (StarBorder, SpotlightCard) read
the preference themselves; LightRays is not mounted; CSS loops (marquee, ripple, live pulse) are switched off in `globals.css`.

Licence note: React Bits is MIT with the Commons Clause (no selling the components themselves); using them inside this app is allowed.

Candidates considered and not adopted: Magic UI `blur-fade` (tried on the landing; content stayed invisible when its in-view observer missed a fast scroll, and is invisible without JavaScript; replaced by the CSS `.reveal` scroll-driven animation), React Bits `ShinyText` and `BlurText` (copied, then removed: unused), Magic UI `dot-pattern` (one animated SVG
circle per dot, thousands on a chat pane; replaced by a CSS background), Magic UI `magic-card` (needs next-themes), Magic UI
`bento-grid` (needs @radix-ui/react-icons; grid built with plain CSS), React Bits `SplitText` (needs gsap; RotatingText covers the role).
