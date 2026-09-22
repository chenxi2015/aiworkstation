export const cardClass =
	"w-full h-full rounded-lg border border-border bg-surface shadow-sm overflow-hidden transition-[border-color,box-shadow] duration-150";

export function autoFocus(el: HTMLTextAreaElement | HTMLInputElement | null) {
	if (!el) return;
	el.focus();
	el.select();
}
