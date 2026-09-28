let lastCaptureCallTimestamp = 0;
let captureQueuePromise = Promise.resolve();

/**
 * Serialized rate-limited captureVisibleTab executor
 * Guarantees at least 650ms between successive chrome.tabs.captureVisibleTab calls
 */
export function rateLimitedCaptureVisibleTab(
	windowId: number,
	options: chrome.extensionTypes.ImageDetails = { format: "png" },
): Promise<string> {
	const execute = async (): Promise<string> => {
		const minInterval = 650;
		const elapsed = Date.now() - lastCaptureCallTimestamp;
		if (elapsed < minInterval) {
			await new Promise((resolve) =>
				setTimeout(resolve, minInterval - elapsed),
			);
		}

		const backoffRetries = [0, 700, 1400];
		let lastErr: Error | null = null;

		for (const delay of backoffRetries) {
			if (delay > 0) {
				await new Promise((resolve) => setTimeout(resolve, delay));
			}

			try {
				const dataUrl = await new Promise<string>((resolve, reject) => {
					lastCaptureCallTimestamp = Date.now();
					chrome.tabs.captureVisibleTab(windowId, options, (res) => {
						if (chrome.runtime.lastError || !res) {
							reject(
								new Error(
									chrome.runtime.lastError?.message ||
										"Failed to capture visible tab",
								),
							);
						} else {
							resolve(res);
						}
					});
				});

				return dataUrl;
			} catch (err: any) {
				lastErr = err;
				console.warn(
					"[AI Collector Background] captureVisibleTab attempt warning:",
					err?.message,
				);
			}
		}

		throw lastErr || new Error("Failed to capture visible tab after retries");
	};

	// Chain onto sequential promise queue
	const queuedPromise = captureQueuePromise.then(execute, execute);
	captureQueuePromise = queuedPromise.then(
		() => {},
		() => {},
	);
	return queuedPromise;
}
