import { describe, expect, it } from "vitest";
import { calculateArrowRoutes } from "./arrowRouter.ts";
import { generateExcalidrawElements } from "./elementFactory.ts";

type Pt = [number, number];
interface TestArrow {
	x: number;
	y: number;
	points: Pt[];
	start?: { id: string };
	end?: { id: string };
	startArrowhead?: string;
	roundness: { type: number } | null;
	label?: { text: string };
}

const getArrows = (generated: { type: string }[]) =>
	generated.filter((el) => el.type === "arrow") as unknown as TestArrow[];

/** Absolute polyline vertices of an arrow. */
const toAbsolute = (a: TestArrow): Pt[] =>
	a.points.map(([px, py]) => [a.x + px, a.y + py]);

const ccw = (a: Pt, b: Pt, c: Pt) =>
	(c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
const segmentsCross = (a: Pt, b: Pt, c: Pt, d: Pt) =>
	ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);

function countCrossings(arrows: TestArrow[]): number {
	let count = 0;
	for (let i = 0; i < arrows.length; i++) {
		for (let j = i + 1; j < arrows.length; j++) {
			const p = toAbsolute(arrows[i]);
			const q = toAbsolute(arrows[j]);
			for (let a = 0; a < p.length - 1; a++) {
				for (let b = 0; b < q.length - 1; b++) {
					if (segmentsCross(p[a], p[a + 1], q[b], q[b + 1])) count++;
				}
			}
		}
	}
	return count;
}

describe("Excalidraw arrow routing", () => {
	it("keeps start/end bindings and curved roundness on every arrow", () => {
		const generated = generateExcalidrawElements({
			layout: "vertical_flow",
			mode: "replace",
			elements: [
				{ id: "start", type: "ellipse", label: "起点" },
				{ id: "decision", type: "diamond", label: "判断" },
				{ id: "ok", type: "rectangle", label: "成功" },
				{ id: "err", type: "rectangle", label: "失败", color: "red" },
			],
			connections: [
				{ from: "start", to: "decision" },
				{ from: "decision", to: "ok", label: "是" },
				{ from: "decision", to: "err", label: "否" },
			],
		});

		const arrows = getArrows(generated);
		expect(arrows).toHaveLength(3);
		for (const a of arrows) {
			expect(a.start?.id).toBeDefined();
			expect(a.end?.id).toBeDefined();
			expect(a.roundness).toEqual({ type: 2 });
		}
		expect(countCrossings(arrows)).toBe(0);
	});

	it("merges A->B and B->A into one double-headed arrow", () => {
		const generated = generateExcalidrawElements({
			layout: "vertical_flow",
			mode: "replace",
			elements: [
				{ id: "server", label: "服务器" },
				{ id: "pc", label: "电脑" },
			],
			connections: [
				{ from: "pc", to: "server", label: "上传" },
				{ from: "server", to: "pc", label: "下载" },
			],
		});

		const arrows = getArrows(generated);
		expect(arrows).toHaveLength(1);
		expect(arrows[0].startArrowhead).toBe("arrow");
		expect(arrows[0].label?.text).toBe("上传 / 下载");
	});

	it("hub with bidirectional spokes produces no crossings", () => {
		const generated = generateExcalidrawElements({
			layout: "architecture_layers",
			mode: "replace",
			elements: [
				{ id: "hub", label: "服务器" },
				{ id: "a", label: "笔记本" },
				{ id: "b", label: "台式机" },
				{ id: "c", label: "手机" },
			],
			connections: ["a", "b", "c"].flatMap((id) => [
				{ from: "hub", to: id, label: "下载", style: "dashed" as const },
				{ from: id, to: "hub", label: "上传" },
			]),
		});

		const arrows = getArrows(generated);
		expect(arrows).toHaveLength(3);
		expect(countCrossings(arrows)).toBe(0);
	});

	it("gives parallel arrows on one node side distinct ports", () => {
		const positions = new Map([
			["top", { x: 100, y: 0, width: 200, height: 70 }],
			["l", { x: 0, y: 200, width: 120, height: 70 }],
			["r", { x: 300, y: 200, width: 120, height: 70 }],
		]);
		const routes = calculateArrowRoutes(
			[
				{ fromId: "top", toId: "l" },
				{ fromId: "top", toId: "r" },
			],
			positions,
		);
		expect(routes[0]?.start[0]).toBeLessThan(routes[1]?.start[0] ?? 0);
	});

	it("uses a straight 2-point line for aligned vertical flow", () => {
		const positions = new Map([
			["a", { x: 100, y: 100, width: 200, height: 70 }],
			["b", { x: 100, y: 240, width: 200, height: 70 }],
		]);
		const [route] = calculateArrowRoutes([{ fromId: "a", toId: "b" }], positions);
		expect(route?.points).toEqual([
			[0, 0],
			[0, 70],
		]);
	});

	it("bypasses a node sitting between source and target", () => {
		const positions = new Map([
			["a", { x: 100, y: 0, width: 200, height: 70 }],
			["mid", { x: 100, y: 150, width: 200, height: 70 }],
			["b", { x: 100, y: 300, width: 200, height: 70 }],
		]);
		const [route] = calculateArrowRoutes([{ fromId: "a", toId: "b" }], positions);
		expect(route?.points).toHaveLength(3);
		expect(Math.abs(route?.points[1][0] ?? 0)).toBeGreaterThan(100);
	});
});
