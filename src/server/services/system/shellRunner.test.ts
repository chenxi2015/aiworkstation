import { describe, expect, it } from "vitest";
import { runSystemCommand } from "./shellRunner.ts";

describe("runSystemCommand — execution & termination", () => {
	it("executes a basic shell command successfully", async () => {
		const result = await runSystemCommand("echo hello_runner");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("hello_runner");
	});

	it("immediately returns aborted result if signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await runSystemCommand("echo should_not_run", {
			signal: controller.signal,
		});

		expect(result.exitCode).toBe(-1);
		expect(result.stderr).toContain("[Aborted]");
		expect(result.stdout).toBe("");
	});

	it("aborts long-running command and kills process tree when signal fires", async () => {
		const controller = new AbortController();
		const startTime = Date.now();

		// Schedule abort after 100ms
		setTimeout(() => {
			controller.abort();
		}, 100);

		// Run a command that would normally take 10 seconds
		const result = await runSystemCommand("sleep 10", {
			signal: controller.signal,
			timeoutMs: 15_000,
		});

		const duration = Date.now() - startTime;
		expect(result.exitCode).toBe(-1);
		expect(result.stderr).toContain("[Aborted]");
		// Should have terminated well before 10 seconds
		expect(duration).toBeLessThan(3000);
	});

	it("terminates command when timeoutMs expires", async () => {
		const startTime = Date.now();
		const result = await runSystemCommand("sleep 10", {
			timeoutMs: 300,
		});

		const duration = Date.now() - startTime;
		expect(result.exitCode).toBe(-1);
		expect(result.stderr).toContain("[Timeout]");
		expect(duration).toBeLessThan(3000);
	});
});

