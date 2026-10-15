import { describe, expect, it } from "vitest";
import { generateExcalidrawElements } from "./elementFactory.ts";
import { calculateArrowRoute } from "./arrowRouter.ts";

describe("Excalidraw Subtractive Arrow Routing & Binding", () => {
	it("always preserves start and end node bindings for all connections", () => {
		const elements = [
			{ id: "start", type: "ellipse" as const, label: "推演起点" },
			{ id: "decision", type: "diamond" as const, label: "回踩是否守住" },
			{ id: "stepA", type: "rectangle" as const, label: "买点A企稳做多" },
			{
				id: "stepError",
				type: "rectangle" as const,
				label: "破位风控离场",
				color: "red" as const,
			},
		];

		const connections = [
			{ from: "start", to: "decision" },
			{ from: "decision", to: "stepA", label: "企稳" },
			{ from: "decision", to: "stepError", label: "跌破" },
		];

		const generated = generateExcalidrawElements({
			layout: "vertical_flow",
			mode: "replace",
			elements,
			connections,
		});

		const arrows = generated.filter((el) => el.type === "arrow");
		expect(arrows.length).toBe(3);

		// Every single arrow MUST be bound to both start and end elements
		for (const arrow of arrows) {
			const a = arrow as unknown as {
				start?: { id: string };
				end?: { id: string };
				points: [number, number][];
				roundness: { type: number } | null;
			};
			expect(a.start?.id).toBeDefined();
			expect(a.end?.id).toBeDefined();
			expect(a.roundness).toEqual({ type: 2 });
			// Subtractive rule: no arrow should have more than 4 points
			expect(a.points.length).toBeLessThanOrEqual(4);
		}
	});

	it("uses clean 3-point L-route for diamond decision branches", () => {
		const diamondPos = {
			x: 100,
			y: 100,
			width: 120,
			height: 120,
			type: "diamond" as const,
		};
		const sideCardPos = {
			x: 300,
			y: 250,
			width: 220,
			height: 80,
			type: "rectangle" as const,
		};

		const route = calculateArrowRoute(diamondPos, sideCardPos, [], true);

		// Must have exactly 3 points (origin -> horizontal turn -> vertical drop)
		expect(route.points.length).toBe(3);
		// Origin is [0, 0]
		expect(route.points[0]).toEqual([0, 0]);
		// Point 1 should be strictly horizontal (y offset = 0)
		expect(route.points[1][1]).toBe(0);
		// Point 2 drops vertically to the target top
		expect(route.points[2][0]).toBe(route.points[1][0]);
		expect(route.points[2][1]).toBeGreaterThan(0);
	});

	it("uses clean 2-point straight line for vertical downflow", () => {
		const nodeA = {
			x: 100,
			y: 100,
			width: 200,
			height: 70,
			type: "rectangle" as const,
		};
		const nodeB = {
			x: 100,
			y: 240,
			width: 200,
			height: 70,
			type: "rectangle" as const,
		};

		const route = calculateArrowRoute(nodeA, nodeB, [], true);

		// Must be direct straight line (2 points)
		expect(route.points.length).toBe(2);
		expect(route.points[0]).toEqual([0, 0]);
		expect(route.points[1][0]).toBe(0); // vertical: dx is 0
		expect(route.points[1][1]).toBe(nodeB.y - (nodeA.y + nodeA.height));
	});
});
