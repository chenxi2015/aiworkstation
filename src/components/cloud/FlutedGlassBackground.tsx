import { FlutedGlass } from "@paper-design/shaders-react";
import { useEffect, useState } from "react";

interface FlutedGlassBackgroundProps {
	className?: string;
	overlayClassName?: string;
}

/**
 * Fullscreen / modal ambient background powered by FlutedGlass shader
 */
export function FlutedGlassBackground({
	className = "",
	overlayClassName = "bg-background/60 backdrop-blur-md",
}: FlutedGlassBackgroundProps) {
	const [mounted, setMounted] = useState(false);
	const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });

	useEffect(() => {
		setMounted(true);
		const updateDimensions = () => {
			setDimensions({
				width: Math.max(window.innerWidth, 1280),
				height: Math.max(window.innerHeight, 720),
			});
		};
		updateDimensions();
		window.addEventListener("resize", updateDimensions);
		return () => window.removeEventListener("resize", updateDimensions);
	}, []);

	if (!mounted) {
		return (
			<div
				className={`absolute inset-0 -z-10 bg-radial from-accent/10 via-background/90 to-background ${className}`}
			/>
		);
	}

	return (
		<div
			className={`absolute inset-0 -z-10 overflow-hidden pointer-events-none select-none ${className}`}
		>
			<FlutedGlass
				width={dimensions.width}
				height={dimensions.height}
				image="https://paper.design/flowers.webp"
				colorBack="#00000000"
				colorShadow="#000000"
				colorHighlight="#ffffff"
				size={0.5}
				shadows={0.25}
				highlights={0.1}
				shape="lines"
				angle={0}
				distortionShape="prism"
				distortion={0.5}
				shift={0}
				stretch={0}
				blur={0}
				edges={0.25}
				margin={0}
				grainMixer={0}
				grainOverlay={0}
				fit="cover"
				className="w-full h-full object-cover scale-105"
			/>
			{/* Subtle tint overlay to keep HeroUI Cards high-contrast and readable */}
			<div className={`absolute inset-0 ${overlayClassName}`} />
		</div>
	);
}
