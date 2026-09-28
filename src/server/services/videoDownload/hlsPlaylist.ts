import type { SegmentCryptoInfo, VideoSegmentItem } from "./types.ts";

function resolveUrl(maybeRelative: string, baseUrl: string): string {
	return new URL(maybeRelative.trim(), baseUrl).href;
}

export function parseMasterPlaylist(
	text: string,
	baseUrl: string,
): { url: string; bandwidth: number; audioGroup?: string }[] {
	const lines = text.split("\n").map((l) => l.trim());
	const variants: { url: string; bandwidth: number; audioGroup?: string }[] =
		[];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.startsWith("#EXT-X-STREAM-INF")) continue;

		const bwMatch = line.match(/BANDWIDTH=(\d+)/);
		const audioMatch = line.match(/AUDIO="([^"]+)"/);
		for (let j = i + 1; j < lines.length; j++) {
			const uri = lines[j];
			if (!uri) continue;
			if (uri.startsWith("#")) break;
			variants.push({
				url: resolveUrl(uri, baseUrl),
				bandwidth: bwMatch ? Number(bwMatch[1]) : 0,
				audioGroup: audioMatch?.[1],
			});
			break;
		}
	}
	return variants;
}

export function parseAudioPlaylistUrl(
	text: string,
	baseUrl: string,
	targetAudioGroup?: string,
): string | null {
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("#EXT-X-MEDIA") || !/TYPE=AUDIO/.test(trimmed))
			continue;
		const uriMatch = trimmed.match(/URI="([^"]+)"/);
		if (!uriMatch?.[1]) continue;

		const groupId = trimmed.match(/GROUP-ID="([^"]+)"/)?.[1];
		if (!targetAudioGroup || groupId === targetAudioGroup) {
			return resolveUrl(uriMatch[1], baseUrl);
		}
	}
	return null;
}

export function parseMediaPlaylist(
	text: string,
	baseUrl: string,
): { segments: VideoSegmentItem[]; isFmp4: boolean } {
	const segments: VideoSegmentItem[] = [];
	let isFmp4 = false;

	let currentCrypto: { method: string; keyUrl: string; rawIv?: string } | null =
		null;
	let mediaSequence = 0;

	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (!line) continue;

		if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
			const match = line.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
			if (match?.[1]) {
				mediaSequence = parseInt(match[1], 10);
			}
			continue;
		}

		if (line.startsWith("#EXT-X-KEY:")) {
			const methodMatch = line.match(/METHOD=([^,\s]+)/);
			const method = methodMatch?.[1]?.toUpperCase();

			if (!method || method === "NONE") {
				currentCrypto = null;
			} else if (method === "AES-128") {
				const uriMatch =
					line.match(/URI="([^"]+)"/) || line.match(/URI=([^,\s]+)/);
				if (uriMatch?.[1]) {
					const ivMatch = line.match(/IV=(0x[0-9a-fA-F]+)/i);
					currentCrypto = {
						method: "AES-128",
						keyUrl: resolveUrl(uriMatch[1], baseUrl),
						rawIv: ivMatch?.[1],
					};
				}
			}
			continue;
		}

		if (line.startsWith("#EXT-X-MAP")) {
			const uriMatch = line.match(/URI="([^"]+)"/);
			if (uriMatch?.[1]) {
				isFmp4 = true;
				segments.unshift({
					url: resolveUrl(uriMatch[1], baseUrl),
				});
			}
			continue;
		}

		if (line.startsWith("#")) continue;

		const segSeq = mediaSequence + segments.length;
		let segCrypto: SegmentCryptoInfo | undefined;

		if (currentCrypto && currentCrypto.method === "AES-128") {
			let ivBuf: Buffer;
			if (currentCrypto.rawIv) {
				const hex = currentCrypto.rawIv.slice(2).padStart(32, "0");
				ivBuf = Buffer.from(hex, "hex");
			} else {
				ivBuf = Buffer.alloc(16);
				ivBuf.writeBigUInt64BE(BigInt(segSeq), 8);
			}

			segCrypto = {
				method: "AES-128",
				keyUrl: currentCrypto.keyUrl,
				iv: ivBuf,
			};
		}

		segments.push({
			url: resolveUrl(line, baseUrl),
			crypto: segCrypto,
		});
	}

	return { segments, isFmp4 };
}
