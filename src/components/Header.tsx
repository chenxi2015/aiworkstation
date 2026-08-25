import { Link } from "@tanstack/react-router";
import ThemeToggle from "./ThemeToggle";

export default function Header() {
	return (
		<header className="sticky top-0 z-50 border-b border-border bg-surface/80 px-4 backdrop-blur-lg">
			<nav className="page-wrap flex flex-wrap items-center gap-x-3 gap-y-2 py-3 sm:py-4">
				<h2 className="m-0 flex-shrink-0 text-base font-semibold tracking-tight">
					<Link
						to="/"
						className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-secondary px-3 py-1.5 text-sm text-foreground no-underline shadow-sm transition hover:bg-surface-hover hover:border-border-secondary sm:px-4 sm:py-2"
					>
						<span className="h-2 w-2 rounded-full bg-accent" />
						AI Workstation
					</Link>
				</h2>

				<div className="order-3 flex w-full flex-wrap items-center gap-x-4 gap-y-1 pb-1 text-sm font-medium sm:order-none sm:w-auto sm:flex-nowrap sm:pb-0">
					<Link
						to="/"
						className="text-muted hover:text-foreground transition-colors py-1"
						activeProps={{ className: "text-foreground font-semibold py-1" }}
					>
						工作台
					</Link>
					<Link
						to="/about"
						className="text-muted hover:text-foreground transition-colors py-1"
						activeProps={{ className: "text-foreground font-semibold py-1" }}
					>
						关于
					</Link>
				</div>

				<div className="ml-auto flex items-center gap-1.5 sm:gap-2">
					<ThemeToggle />
				</div>
			</nav>
		</header>
	);
}
