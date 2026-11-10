"use client";
import { useEffect, useRef, useState } from "react";
import { LiquidGlassWordmarkFooter } from "@/components/ui/liquid-glass-wordmark-footer";
import "@fontsource-variable/manrope";

const settings = {
  wordmark: "Flows",
  headline: "Make room for what matters.",
  useHostTheme: true,
  frost: 20,
  opacity: 0.24,
  saturation: 1.3,
  edgeLight: 0.8,
  refraction: 36,
  glassTint: "#eee9df",
  accentColor: "#9af1d6",
  letterDepth: 0.3,
  motionAmount: 1,
  rippleStrength: 1,
  cursorSize: 32,
  showCursor: true,
  motion: true,
  showSignup: true,
};

const photograph = "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?auto=format&fit=crop&w=1920&q=80";

const demoCSS = `
:where(.w-screen):has(.lgwf-demo){width:100%;min-width:0;max-width:100%;}
.lgwf-demo{position:relative;isolation:isolate;width:100%;min-width:0;min-height:100svh;display:flex;align-items:flex-end;overflow:hidden;font-family:'Manrope Variable',sans-serif;color-scheme:light;}
.lgwf-demo[data-dark=true]{color-scheme:dark;}
.lgwf-demo-scene{position:absolute;inset:0;z-index:-3;background-size:cover;background-position:50% 30%;}
.lgwf-demo-shade{position:absolute;inset:0;z-index:-2;pointer-events:none;}
.lgwf-demo-footer{width:min(1120px,calc(100% - 96px));margin:130px auto 48px;}
.lgwf-demo .g-wordmark-canvas{height:clamp(180px,20vw,270px);}
.lgwf-demo-credit{position:absolute;right:16px;bottom:12px;font-size:8px;color:white;text-shadow:0 1px 4px #000;}
@media(min-width:1600px){.lgwf-demo .g-wordmark-canvas{height:340px;}}
@media(max-width:600px){.lgwf-demo-footer{width:calc(100% - 48px);margin:80px 24px 32px;}.lgwf-demo .g-wordmark-canvas{height:148px;}.lgwf-demo-credit{font-size:7px;right:12px;bottom:10px;}}
@media(max-width:540px){.lgwf-demo-scene{bottom:-42%;background-position:50% 0%;}}
`;

/** Demo-only photography, branded copy and local form feedback. */
export default function LiquidGlassFooterDemo(props: Partial<typeof settings>) {
  const s = { ...settings, ...props };
  const photo = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const media = matchMedia('(prefers-color-scheme:dark)');
    const update = () =>
      setDark(
        root.classList.contains('dark') ||
          root.dataset.theme === 'dark' ||
          (!root.classList.contains('light') &&
            root.dataset.theme !== 'light' &&
            media.matches)
      );
    const observer = new MutationObserver(update);
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    media.addEventListener('change', update);
    update();
    return () => {
      observer.disconnect();
      media.removeEventListener('change', update);
    };
  }, []);

  const shade = dark ? 'rgba(9,15,12,.42)' : 'rgba(250,244,233,.22)';

  return (
    <div className="lgwf-demo" data-dark={dark}>
      <style>{demoCSS}</style>
      <div
        ref={photo}
        className="lgwf-demo-scene"
        style={{ backgroundImage: `url("${photograph}")` }}
        aria-hidden="true"
      />
      <div className="lgwf-demo-shade" style={{ background: shade }} aria-hidden="true" />
      <div className="lgwf-demo-footer">
        <LiquidGlassWordmarkFooter
          wordmark={s.wordmark}
          title={s.headline}
          brand="Automate Flows"
          brandHref="https://automateflows.io/"
          description="Thoughtful ideas for a more connected business."
          theme={s.useHostTheme ? undefined : dark ? 'dark' : 'light'}
          glass={{
            blur: s.frost,
            opacity: s.opacity,
            saturation: s.saturation,
            edge: s.edgeLight,
            distortion: s.refraction,
            tint: s.glassTint,
          }}
          accent={s.useHostTheme ? undefined : s.accentColor}
          depth={s.letterDepth}
          motionIntensity={s.motionAmount}
          rippleStrength={s.rippleStrength}
          cursorSize={s.cursorSize}
          showCursor={s.showCursor}
          motion={s.motion}
          refractionImage={photograph}
          refractionTargetRef={photo}
          refractionOverlay={shade}
          groups={[
            {
              title: 'Explore',
              links: [
                { label: 'Home', href: 'https://automateflows.io/' },
                { label: 'Workflows', href: 'https://automateflows.io/workflows' },
                { label: 'Pricing', href: 'https://automateflows.io/pricing' },
              ],
            },
            {
              title: 'Build with us',
              links: [
                { label: 'Web development', href: 'https://automateflows.io/services/web-development' },
                { label: 'Talk about a project', href: 'https://automateflows.io/#contact' },
              ],
            },
            {
              title: 'Our work',
              links: [
                { label: '21st collection', href: 'https://21st.dev/@automate_flows' },
                { label: 'useKnockout', href: 'https://useknockout.com' },
                { label: 'YourPeptideIQ', href: 'https://yourpeptideiq.com' },
              ],
            },
          ]}
          copyright="© 2026 Automate Flows"
          subscriptionNote="Demo form. Nothing is sent or subscribed."
          onSubscribe={
            s.showSignup
              ? async () => {
                  await new Promise((resolve) => setTimeout(resolve, 450));
                }
              : undefined
          }
        />
      </div>
      <span className="lgwf-demo-credit">Photography via Unsplash</span>
    </div>
  );
}
