import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
	component: About,
});

function About() {
	return (
		<main className="page-wrap px-4 py-12">
			<section className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-surface">
				<p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">
					About
				</p>
				<h1 className="mb-3 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
					A small starter with room to grow.
				</h1>
				<p className="m-0 max-w-3xl text-base leading-8 text-muted">
					TanStack Start gives you type-safe routing, server functions, and
					modern SSR defaults. Built with HeroUI modern theming and design
					system.
				</p>
			</section>
		</main>
	);
}
