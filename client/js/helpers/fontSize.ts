// The message font-size setting: an ordered scale, "medium" being the size
// the client has always used. The value is applied as a `data-font-size`
// attribute on <html> (settings.ts) and the pixel sizes live entirely in
// style.css (`html[data-font-size=...]` -> `--user-font-size`), so a theme or
// the custom stylesheet can override them. Vue-free: test/helpers/fontSize.ts.

export const fontSizes = ["tiny", "small", "medium", "large", "xlarge", "huge"] as const;

export type FontSize = typeof fontSizes[number];

export const defaultFontSize: FontSize = "medium";

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
