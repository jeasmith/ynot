# Adapting Apple Liquid Glass principles to Ynot's browser UI

Checked 2026-09-02 against Apple's Human Interface Guidelines, Apple Design Resources and license, official WWDC25 sessions and transcripts, and official WebKit documentation. This note distinguishes Apple's native material from a faithful web interpretation.

## Conclusion

Ynot can credibly adopt the **design principles** of Liquid Glass, but a browser implementation should be described as **Liquid Glass-inspired**, not as Apple's Liquid Glass or as Apple-native/conformant. Apple's material is a coordinated system of adaptive optics, tint, shadow, dynamic range, interaction, motion, and system accessibility behavior supplied by Apple's UI frameworks. CSS `backdrop-filter` can reproduce blur and some depth cues, but not that complete system. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) [Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/) [WebKit: Introducing Backdrop Filters](https://webkit.org/blog/3632/introducing-backdrop-filters/)

For Ynot, the closest faithful translation is a **single, restrained floating control-and-navigation layer** over a calm, opaque content layer:

- use glass for the floating account rail, compact top search/facet controls, and transient menus or batch actions;
- keep the transaction register, split contents, memo text, tag analytics, totals, and detailed parent view in the content layer rather than making every surface translucent;
- let the selected row open or update an inspector, but make only the inspector's navigation/actions glass-like; its financial information should remain on a stable, high-legibility surface;
- use the green palette from variant B as selective tint for primary actions and selection, not as a wash over every glass control.

This preserves hierarchy and density while meeting the user's request for a floating left rail and an Apple-influenced look.

## Evidence and browser translation

| Apple guidance | Practical implication for Ynot |
|---|---|
| Liquid Glass forms a distinct functional layer for controls and navigation, floating above content. Apple explicitly advises against using it in the content layer. [HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) [Meet Liquid Glass, 10:31 Principles](https://developer.apple.com/videos/play/wwdc2025/219/?time=631) | Treat glass as chrome, not as the register's base material. The account rail, search/facet bar, tab selector, and important floating controls are candidates. Rows, split breakdowns, memo bodies, category lists, and tag totals are not. |
| Apple's current sidebar guidance treats the sidebar as a leading-side navigation surface; in the new system, sidebars are inset and content may extend beneath them. [HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) [Get to know the new design system, 6:16 Structure](https://developer.apple.com/videos/play/wwdc2025/356/?time=376) | Float the account rail inside a visible outer gutter rather than attaching it to the viewport edge. Only ambient or nonessential content should continue beneath it; account and transaction text must retain a stable legible surface. |
| Apple says to use the effect sparingly and reserve it for the most important functional elements. Glass-on-glass muddies hierarchy; content over glass should use fills, transparency, and vibrancy rather than a second glass layer. [HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) [Meet Liquid Glass, 10:31 Principles](https://developer.apple.com/videos/play/wwdc2025/219/?time=631) | Establish one apparent glass plane. Do not stack a glass batch tray over a glass inspector or put glass chips inside a glass toolbar. Use quiet translucent/opaque fills for nested facet chips, reconciliation markers, tags, and selected states. |
| Content can move beneath floating navigation, while scroll-edge effects preserve separation and legibility. Apple says edge effects clarify the boundary and are not decoration; use one consistent effect per view. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) [Get to know the new design system, 6:16 Structure](https://developer.apple.com/videos/play/wwdc2025/356/?time=376) | The rail may float over a background extension, and the register may scroll behind a compact top control bar. Add one restrained edge fade/blur where scrolling content meets pinned controls. Do not sprinkle blurred dividers through the table. |
| Rounded floating forms should follow their containing geometry; Apple calls this concentricity. Larger glass forms appear optically thicker and more opaque than small controls. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) [Build a UIKit app with the new design, 19:15 Custom elements](https://developer.apple.com/videos/play/wwdc2025/284/?time=1155) | Give the floating rail and major toolbar related corner radii and insets. A large rail needs a more opaque/frosted treatment than small buttons. Avoid arbitrary pill shapes on dense data rows merely to signal the style. |
| Regular glass is the versatile, adaptive variant. Clear glass is intended only over media-rich content, where dimming is acceptable and foreground labels are bold and bright; Apple says not to mix the variants. [HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials) [Meet Liquid Glass, 10:31 Principles](https://developer.apple.com/videos/play/wwdc2025/219/?time=631) | A financial register is not an appropriate Clear-glass backdrop. Use one regular/frosted approximation with a stable fallback color. Do not combine highly transparent and heavily frosted glass styles in the same screen. |
| Native Liquid Glass adapts tint, shadow, dynamic range, and foreground light/dark treatment to what lies behind it. Apple asks designers to use color judiciously and selectively for emphasis. [Liquid Glass technology overview](https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass) [HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color) [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | CSS cannot be assumed to provide native content-aware adaptation. Specify explicit light/dark tokens and test them against every backdrop. Reserve B's strongest green for the selected account, active facet/tag, and primary Apply action; use neutral glass elsewhere. Never depend on green alone to communicate state. |
| Layout and grouping should express hierarchy. Toolbar items should be grouped by function and frequency; tint should distinguish the primary action. [Get to know the new design system, 6:16 Structure](https://developer.apple.com/videos/play/wwdc2025/356/?time=376) | Keep Find, Review, and Apply legible as a workflow, but group search/facets separately from selection and mutation actions. Avoid one undifferentiated glass toolbar containing navigation, filters, status, and destructive actions. |
| Motion and appearance are designed together. Native controls can flex, illuminate, merge, and morph, but Apple says motion must be purposeful and optional. [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) [HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion) | Use short motion to preserve origin and continuity: a selected row can visually lead into the inspector, and neighboring controls may share a subtle transition. Avoid perpetual shimmer, cursor-following refraction, large zooms, parallax, or springy table rows. State must remain understandable with no animation. |
| `backdrop-filter` applies effects to content behind an element, but WebKit warns that it causes additional rendering passes and should be limited to where necessary. [WebKit: Introducing Backdrop Filters](https://webkit.org/blog/3632/introducing-backdrop-filters/) [WebKit: Safari 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/) | Keep blurred regions few and bounded. Test scrolling thousands of rows on integrated/mobile GPUs. Provide an opaque/translucent fallback when `backdrop-filter` is unavailable or too costly. Glass must not be required for operation. |

## Accessibility requirements

Apple's native material automatically responds to three relevant settings: Reduce Transparency makes it frostier and obscures more background content; Increase Contrast moves elements toward black or white and adds a contrasting border; Reduce Motion reduces effect intensity and removes elastic behavior. [Meet Liquid Glass, accessibility discussion](https://developer.apple.com/videos/play/wwdc2025/219/?time=1086) [HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) [Testing system accessibility features](https://developer.apple.com/documentation/accessibility/testing-system-accessibility-features-in-your-app)

A web approximation does **not** inherit all of that native behavior automatically. Ynot should therefore make the adaptations explicit:

1. Respect `prefers-reduced-motion` in CSS and in any JavaScript-driven transition. WebKit documents both the media query and `matchMedia()`; it recommends replacing vestibular triggers with simpler variants rather than removing information. For Ynot, disable elastic scale, morphing, parallax, and animated blur; use an instant update or a restrained dissolve. [WebKit: Responsive Design for Motion](https://webkit.org/blog/7551/responsive-design-for-motion/)
2. Use `prefers-contrast: more` where supported to strengthen boundaries, foregrounds, focus indicators, and status symbols. Safari's developer tools can emulate contrast and reduced-motion preferences. [WebKit: Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
3. Provide a Ynot-level **Reduce transparency** setting that replaces blur with an opaque surface and stronger border. As of this check, WebKit's official implementation issue for `prefers-reduced-transparency` remains open, so a browser page cannot rely on receiving Apple's system setting. [WebKit bug 175497](https://bugs.webkit.org/show_bug.cgi?id=175497)
4. Maintain contrast independently of blur. Every label, table value, tag, reconciliation symbol, selection state, and focus indicator needs a stable foreground/background pair. Background blur is decoration, not the contrast mechanism.
5. Preserve semantics without color or motion. The `C` and padlock reconciliation states need accessible names/tooltips; current-filter counts and selected tags need text/ARIA state; focus order must follow the visible workflow.
6. Test the ordinary, reduced-transparency, increased-contrast, reduced-motion, light, and dark combinations. Apple specifically treats these accessibility settings as material modifiers, so testing only the default glass treatment is not a faithful adaptation.

## Recommended application to the next prototype

### Use glass here

- **Floating account rail:** one inset, rounded, moderately frosted plane anchored near the left edge. It selects one account at a time. Its selected-account treatment may use the B green tint.
- **Search and facets:** a compact floating control group above the register. Facet popovers can emerge from the invoking control, maintaining a visible spatial relationship. Nested facet rows and dynamic counts should use quiet fills, not more glass.
- **Focused-view navigation:** the Parent / Tag tabs and top-level close or batch action may sit on the same functional plane. The transaction and tag analytics themselves remain opaque content.
- **Transient actions:** menus, popovers, and the final Apply affordance are appropriate candidates when they do not overlap another glass surface.

### Keep out of glass

- the dense transaction table and its selected rows;
- category group/category text, ordinary memo text, clickable tag chips, split lines, and reconciliation symbols;
- the parent transaction breakdown and tag analytics cards;
- large backgrounds behind financial figures;
- multiple simultaneous floating trays.

This boundary lets the green accents, clear reconciliation states, split detail, dynamic facet counts, and high transaction density remain legible instead of competing with the material effect.

## Fidelity and naming boundary

Apple describes Liquid Glass as a native, adaptive material supplied by SwiftUI, UIKit, and AppKit, with standard components gaining the appearance when apps build against the relevant SDKs. Its distinctive behavior includes content-aware tint/shadow/dynamic-range changes and automatic system accessibility adaptations. A browser's CSS blur, gradient, translucency, shadow, and pointer animations are therefore an **interpretation of the principles**, not the Apple material itself. [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass) [Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/)

Use wording such as **“Liquid Glass-inspired browser treatment”**, **“glass functional layer”**, or **“Apple-influenced depth and hierarchy.”** Do not claim that the web UI “uses Liquid Glass,” “matches the Liquid Glass spec completely,” is “Apple-native,” or is HIG-conformant. Those claims would overstate what the web implementation and the evidence can establish.

Do not copy assets from Apple's downloadable UI kits into this browser prototype without a separate rights review. Apple's current Design Resources license limits those resources to mock-ups for software that runs only on Apple's operating systems and prohibits using them to create website content or products outside the permitted scope. The design principles can be studied without importing the licensed kit assets. This is a product-design caution, not legal advice. [Apple Design Resources](https://developer.apple.com/design/resources/) [Apple Design Resources License](https://developer.apple.com/support/downloads/terms/apple-design-resources/Apple-Design-Resources-License-20230621-English.pdf)

## Prototype acceptance checks

- Glass reads as one floating functional layer; no glass-on-glass overlap occurs.
- The register and detail figures remain clear with blur disabled.
- The account rail, search/facet bar, and inspector controls share related geometry and spacing.
- The strongest green tint identifies only selection or a primary action.
- Scrolling content has at most one deliberate edge treatment per pane.
- All motion has a purpose and a reduced-motion variant.
- An explicit reduced-transparency mode is available and makes surfaces opaque.
- Reconciliation status, filter state, and selected tags remain understandable without color.
- Large data sets scroll smoothly with blur enabled and disabled.
- Product copy calls the result Liquid Glass-inspired, not native Liquid Glass.

## Primary sources

- [Apple HIG: Materials](https://developer.apple.com/design/human-interface-guidelines/materials)
- [Apple HIG: Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars)
- [Apple HIG: Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Apple HIG: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Apple HIG: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple: Liquid Glass technology overview](https://developer.apple.com/documentation/TechnologyOverviews/liquid-glass)
- [Apple: Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass)
- [WWDC25: Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)
- [WWDC25: Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/)
- [WWDC25: Build a UIKit app with the new design](https://developer.apple.com/videos/play/wwdc2025/284/)
- [Apple: Testing system accessibility features in your app](https://developer.apple.com/documentation/accessibility/testing-system-accessibility-features-in-your-app)
- [WebKit: Introducing Backdrop Filters](https://webkit.org/blog/3632/introducing-backdrop-filters/)
- [WebKit: Responsive Design for Motion](https://webkit.org/blog/7551/responsive-design-for-motion/)
- [WebKit: Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)
- [WebKit: Safari 18.0](https://webkit.org/blog/15865/webkit-features-in-safari-18-0/)
- [WebKit bug 175497: `prefers-reduced-transparency`](https://bugs.webkit.org/show_bug.cgi?id=175497)
- [Apple Design Resources and license](https://developer.apple.com/design/resources/)
