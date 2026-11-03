# Interface colors and hierarchy

The interface follows the light-gray and warm-white hierarchy of the Manus reference. Light colors sampled from the supplied screenshot include the sidebar `#F0F0F0`, content `#F8F8F7`, selected navigation `#E5E5E5`, brand ink `#34322D` and body text `#1A1A1A`. The dark palette adapts that neutral temperature and hierarchy. Solid ink-colored actions and gray hover/selection states establish emphasis.

| Role | Light | Dark |
| --- | --- | --- |
| Primary action | `#34322D` | `#E6E4DE` |
| Primary button text | `#FFFFFF` | `#26241F` |
| Primary hover | `#262521` | `#F4F2ED` |
| Page | `#F8F8F7` | `#191919` |
| Card | `#FFFFFF` | `#242424` |
| Sidebar | `#F0F0F0` | `#212121` |
| Selected navigation | `#E5E5E5` | `#303030` |
| Ordinary hover | `#EAEAE7` | `#333333` |
| Selected tool | `#E7E5E0` | `#373633` |
| Body text | `#1A1A1A` | `#ECEBE8` |
| Secondary text | `#706D67` | `#A5A29C` |
| Border | `#E2E2E2` | `#353535` |
| Focus | `#6D6961` | `#AAA69E` |

The sidebar uses a quiet background and small icons. The project page places creation at the top, a recent canvas preview beside four compact examples, and search/duplicate/rename/import with the project list. Layout carries hierarchy instead of broad color fills.

Semantic variables in `apps/web/src/main.css` distinguish ordinary accent hover from brand-soft selected tools. Base UI and Excalidraw share variables, including sliders, focus and property panels. Text, images and web works retain their own content colors. Card titles, borders and placeholder chrome are reflected in previews and exports.

Previews target a 960-pixel longest edge, up to 2× scale, with image-size limits. Card exports retain titles, icons, placeholders and borders, waiting for images before generating. Render version, dimensions and document revision trigger old-preview regeneration without changing document revision or editing time.

Cards have 36-pixel headers, always-visible work viewing, and secondary actions on hover, keyboard focus or selection. Selection-only floating controls preserve reading space. Exports use the same compact structure. Running connections use the primary color; errors use the error color, while outdated results use small text/icons. Reduced-motion preferences disable connection animation.

Work windows use neutral reading areas, a 320-pixel creation sidebar on desktop and view/instructions switching on mobile. Text uses 16-pixel body copy and a bounded line length. Images have a quiet surround, and pages retain their own colors. English controls wrap or resize rather than depending on Chinese label lengths.

The checked primary-button contrast is 12.80:1 in light mode and 12.19:1 in dark mode. Tested body, secondary, navigation, tool-selection and text-selection combinations reach at least 4.53:1. These results cover the specified combinations rather than a full accessibility audit.
