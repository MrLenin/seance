// The UI scale setting: an ordered scale of root font sizes. Everything in
// style.css is sized in rem, so a step grows the whole interface — messages,
// sidebar, header, buttons, menus — not just the text. The value is applied
// as a `data-font-size` attribute on <html> (settings.ts) and the sizes live
// entirely in style.css (`html[data-font-size=...] { font-size: N% }`, of the
// browser's default font size), so a theme or the custom stylesheet can
// override them. "large" is the browser default (16px unless the user changed
// it); "medium" is the 14px the client shipped with before the scale applied
// to the chrome too. Vue-free: test/helpers/fontSize.ts.

export const fontSizes = ["tiny", "small", "medium", "large", "xlarge", "huge"] as const;

export type FontSize = typeof fontSizes[number];

export const defaultFontSize: FontSize = "large";

export const fontSizeLabels: Record<FontSize, string> = {
	tiny: "Tiny",
	small: "Small",
	medium: "Medium",
	large: "Large",
	xlarge: "Extra large",
	huge: "Huge",
};

/** A stored setting can be anything (stale key, hand-edited localStorage);
 * anything that is not on the scale means the default. */
export function normalizeFontSize(value: unknown): FontSize {
	return fontSizes.includes(value as FontSize) ? (value as FontSize) : defaultFontSize;
}

/** The slider position of a value, on the same guarantee. */
export function fontSizeIndex(value: unknown): number {
	return fontSizes.indexOf(normalizeFontSize(value));
}
