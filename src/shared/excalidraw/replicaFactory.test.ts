import { describe, expect, it } from "vitest";
import { placeLibraryItem } from "./libraryItem.ts";
import { fitText, generateReplicaElements } from "./replicaFactory.ts";

describe("generateReplicaElements", () => {
	it("keeps geometry, z-order and binds arrows", () => {
		const { elements, warnings } = generateReplicaElements({
			canvas: { width: 800, height: 600, background: "#fafafa" },
			elements: [
				{ id: "a", type: "rectangle", x: 10, y: 20, width: 160, height: 60, fill: "#e7f5ff", text: "开始" },
				{ id: "b", type: "ellipse", x: 300, y: 20, width: 160, height: 60 },
				{ id: "ar", type: "arrow", points: [[170, 50], [300, 50]], startId: "a", endId: "b" },
			],
		});
		expect(warnings).toEqual([]);
		expect(elements.map((e) => e.id)).toEqual(["a", "b", "ar"]);
		const arrow = elements[2] as unknown as {
			x: number;
			points: number[][];
			start: { id: string };
			endArrowhead: string;
		};
		expect(arrow.x).toBe(170);
		expect(arrow.points).toEqual([[0, 0], [130, 0]]);
		expect(arrow.start.id).toBe("a");
		expect(arrow.endArrowhead).toBe("arrow");
	});

	it("reports invalid input instead of throwing", () => {
		const { elements, warnings } = generateReplicaElements({
			canvas: { width: 100, height: 100 },
			elements: [
				{ id: "a", type: "rectangle", x: 0, y: 0, width: 300, height: 20 },
				{ id: "a", type: "rectangle" },
				{ id: "l", type: "arrow", points: [[0, 0], [5, 5]], endId: "ghost" },
			],
		});
		expect(elements).toHaveLength(2);
		expect(warnings.join("|")).toContain("超出原图范围");
		expect(warnings.join("|")).toContain("a_2");
		expect(warnings.join("|")).toContain("ghost");
	});
});

describe("fitText", () => {
	it("wraps and shrinks long text to fit the box", () => {
		const r = fitText("这是一段相当长的中文说明文字需要自动换行", 120, 60, 20);
		expect(r.fits).toBe(true);
		expect(r.fontSize).toBeLessThan(20);
		expect(r.text).toContain("\n");
	});
});

describe("placeLibraryItem + library replica element", () => {
	it("remaps ids, groups, containerId, bindings and scales uniformly into box", () => {
		const rawLibItem = [
			{
				id: "box1",
				type: "rectangle",
				x: 100,
				y: 100,
				width: 100,
				height: 50,
				groupIds: ["g_orig"],
				boundElements: [
					{ id: "txt1", type: "text" },
					{ id: "arr1", type: "arrow" },
				],
			},
			{
				id: "txt1",
				type: "text",
				x: 110,
				y: 115,
				width: 80,
				height: 20,
				fontSize: 16,
				groupIds: ["g_orig"],
				containerId: "box1",
			},
			{
				id: "arr1",
				type: "arrow",
				x: 150,
				y: 150,
				width: 0,
				height: 50,
				points: [
					[0, 0],
					[0, 50],
				] as [number, number][],
				startBinding: { elementId: "box1", focus: 0, gap: 1 },
				endBinding: { elementId: "missing", focus: 0, gap: 1 },
			},
		];

		const { elements, warnings } = generateReplicaElements(
			{
				elements: [
					{
						id: "srv",
						type: "library",
						librarySource: "test/server.excalidrawlib",
						itemIndex: 0,
						x: 200,
						y: 300,
						width: 200,
						height: 200,
					},
				],
			},
			{
				resolveLibrary: (el) =>
					placeLibraryItem(
						rawLibItem,
						{
							x: el.x as number,
							y: el.y as number,
							width: el.width as number,
							height: el.height as number,
						},
						`lib_${el.id}`,
					),
			},
		);

		expect(warnings).toEqual([]);
		expect(elements).toHaveLength(3);
		const [rect, txt, arr] = elements as unknown as {
			id: string;
			x: number;
			y: number;
			width: number;
			height: number;
			fontSize?: number;
			groupIds: string[];
			containerId: string | null;
			boundElements: { id: string; type: string }[];
			startBinding: { elementId: string } | null;
			endBinding: { elementId: string } | null;
			points?: [number, number][];
		}[];

		// Source bounds: 100x100 -> scaled 2x into 200x200 at (200, 300)
		expect(rect.id).toBe("lib_srv_0");
		expect(rect.x).toBe(200);
		expect(rect.y).toBe(300);
		expect(rect.width).toBe(200);
		expect(rect.height).toBe(100);
		expect(rect.boundElements.map((b) => b.id)).toEqual([
			"lib_srv_1",
			"lib_srv_2",
		]);
		expect(rect.groupIds).toEqual(["lib_srv_g0", "lib_srv_all"]);

		expect(txt.id).toBe("lib_srv_1");
		expect(txt.containerId).toBe("lib_srv_0");
		expect(txt.fontSize).toBe(32);

		expect(arr.id).toBe("lib_srv_2");
		expect(arr.startBinding?.elementId).toBe("lib_srv_0");
		expect(arr.endBinding).toBeNull();
		expect(arr.points).toEqual([
			[0, 0],
			[0, 100],
		]);
	});
});
