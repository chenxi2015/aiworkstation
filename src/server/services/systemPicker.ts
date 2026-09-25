import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { detectHostOS } from "../../lib/platform.ts";

const execFileAsync = promisify(execFile);

/**
 * Pick local files or a directory via native OS dialog.
 * Supports macOS via AppleScript and Windows via PowerShell.
 * Returns array of absolute POSIX paths.
 * Returns empty array if user cancels the dialog.
 */
export async function pickSystemPaths(
	mode: "files" | "directory",
): Promise<string[]> {
	const hostOS = detectHostOS();

	// 1. macOS via AppleScript
	if (hostOS === "macos") {
		try {
			if (mode === "files") {
				const script = [
					'set chosen to choose file with prompt "选择素材文件" with multiple selections allowed',
					'set out to ""',
					"repeat with f in chosen",
					"set out to out & (POSIX path of f) & linefeed",
					"end repeat",
					"return out",
				].join("\n");

				const { stdout } = await execFileAsync("osascript", ["-e", script]);
				return (stdout || "")
					.split("\n")
					.map((p) => p.trim())
					.filter(Boolean);
			}

			if (mode === "directory") {
				const script =
					'POSIX path of (choose folder with prompt "选择素材文件夹")';
				const { stdout } = await execFileAsync("osascript", ["-e", script]);
				const dirPath = (stdout || "").trim();
				return dirPath ? [dirPath] : [];
			}
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			if (msg.includes("User cancelled") || msg.includes("(-128)")) {
				return [];
			}
			console.warn("[systemPicker:darwin] Failed to pick paths:", msg);
			throw new Error(`唤起系统访达失败: ${msg}`);
		}
	}

	// 2. Windows via PowerShell System.Windows.Forms
	if (hostOS === "windows") {
		try {
			if (mode === "files") {
				const psCmd =
					"Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.OpenFileDialog; $f.Multiselect = $true; $f.Title = '选择素材文件'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){ $f.FileNames }";
				const { stdout } = await execFileAsync("powershell.exe", [
					"-NoProfile",
					"-NonInteractive",
					"-Command",
					psCmd,
				]);
				return (stdout || "")
					.split(/\r?\n/)
					.map((p) => p.trim())
					.filter(Boolean);
			}

			if (mode === "directory") {
				const psCmd =
					"Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = '选择素材文件夹'; if($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK){ $f.SelectedPath }";
				const { stdout } = await execFileAsync("powershell.exe", [
					"-NoProfile",
					"-NonInteractive",
					"-Command",
					psCmd,
				]);
				const dirPath = (stdout || "").trim();
				return dirPath ? [dirPath] : [];
			}
		} catch (err: unknown) {
			console.warn("[systemPicker:win32] Failed to pick paths:", err);
			return [];
		}
	}

	throw new Error(
		"当前操作系统不支持唤起原生文件选择器，请直接粘贴本地绝对路径导入",
	);
}
