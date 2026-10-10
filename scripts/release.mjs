import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function run(command) {
	return execSync(command, { cwd: rootDir, stdio: "inherit" });
}

function runOutput(command) {
	return execSync(command, { cwd: rootDir, encoding: "utf-8" }).trim();
}

// Ask user confirmation via terminal
async function askConfirmation(question) {
	if (!process.stdin.isTTY) {
		return false;
	}
	const rl = readline.createInterface({ input, output });
	try {
		const answer = await rl.question(question);
		return /^(y|yes)$/i.test(answer.trim());
	} finally {
		rl.close();
	}
}

// Compute target version without modifying any files
function computeNextVersion(currentVersion, bumpType) {
	if (/^v?\d+\.\d+\.\d+/.test(bumpType)) {
		return bumpType.replace(/^v/, "");
	}

	const match = currentVersion.match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
	if (!match) {
		throw new Error(`Current version "${currentVersion}" is not valid semver.`);
	}
	const [, major, minor, patch] = match.map((v, i) =>
		i >= 1 && i <= 3 ? parseInt(v, 10) : v,
	);

	switch (bumpType) {
		case "patch":
			return `${major}.${minor}.${patch + 1}`;
		case "minor":
			return `${major}.${minor + 1}.0`;
		case "major":
			return `${major + 1}.0.0`;
		default:
			throw new Error(`Unknown bump type or invalid version: ${bumpType}`);
	}
}

// 1. Parse arguments (patch | minor | major | x.y.z, and optional flags)
const bumpType =
	process.argv.find(
		(arg) =>
			!arg.startsWith("-") &&
			arg !== process.argv[0] &&
			arg !== process.argv[1],
	) || "patch";
const isForceYes = process.argv.includes("-y") || process.argv.includes("--yes");
const shouldSkipBuild = process.argv.includes("--no-build");

// 2. Ensure git working directory has no uncommitted changes
try {
	const status = runOutput("git status --porcelain");
	if (status) {
		console.error(
			"❌ Git working directory is not clean. Please commit or stash your changes first.",
		);
		process.exit(1);
	}
} catch (err) {
	console.error("❌ Failed to check git status:", err);
	process.exit(1);
}

// Retrieve the latest semver version from git tags, falling back to package.json
function getLatestBaseVersion(fallbackVersion) {
	try {
		const tagsOutput = runOutput('git tag -l "v*" --sort=-v:refname');
		const tags = tagsOutput
			.split("\n")
			.map((tag) => tag.trim())
			.filter(Boolean);

		for (const tag of tags) {
			const cleanTag = tag.replace(/^v/, "");
			if (/^\d+\.\d+\.\d+/.test(cleanTag)) {
				return cleanTag;
			}
		}
	} catch {
		// Fallback if git fails or tags are unavailable
	}
	return fallbackVersion;
}

// 3. Read current version and calculate target version
const rootPkgPath = path.join(rootDir, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
const pkgVersion = rootPkg.version;
const baseVersion = getLatestBaseVersion(pkgVersion);
const newVersion = computeNextVersion(baseVersion, bumpType);
const isCustomVersion = bumpType === newVersion || bumpType === `v${newVersion}`;

// 4. Check if target tag already exists locally
const existingTag = runOutput(`git tag -l "v${newVersion}"`);
let overwriteExistingTag = false;
if (existingTag) {
	console.warn(`\n⚠️  Tag v${newVersion} already exists locally!`);
	const overwrite =
		isForceYes ||
		(await askConfirmation(
			`❓ Overwrite existing tag v${newVersion}? This will delete and recreate it. (y/N) `,
		));
	if (!overwrite) {
		console.log("\n⏸️ Release cancelled.");
		process.exit(0);
	}
	overwriteExistingTag = true;
}

// 5. Release confirmation
console.log(`\n📋 Release Confirmation:`);
if (baseVersion !== pkgVersion) {
	console.log(`   • Base version:    v${baseVersion} (Git tag; package.json was v${pkgVersion})`);
} else {
	console.log(`   • Current version: v${baseVersion}`);
}
console.log(
	`   • Target version:  v${newVersion} (${isCustomVersion ? "custom" : bumpType})`,
);
console.log(`   • Target branch:   main -> origin/main`);
console.log(
	`   • Actions:         Pre-flight Build -> Update package.json -> Git Commit & Tag -> Push to remote\n`,
);

const confirmed =
	isForceYes ||
	(await askConfirmation(
		`❓ Are you sure you want to release v${newVersion} and push to remote? (y/N) `,
	));

if (!confirmed) {
	console.log("\n⏸️ Release cancelled. No files were changed.");
	process.exit(0);
}

// 6. Pre-flight build to prevent releasing broken builds
if (!shouldSkipBuild) {
	console.log("\n🔨 Running pre-flight build check (pnpm run build)...");
	try {
		run("pnpm run build");
		console.log("✅ Pre-flight build passed.\n");
	} catch {
		console.error("\n❌ Build failed! Release aborted. No files or tags were modified.");
		process.exit(1);
	}
}

// 7. Update root package.json
console.log(`📦 Updating root package.json to v${newVersion}...`);
rootPkg.version = newVersion;
writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`, "utf-8");

// 8. Sync version to extensions/aicollector/package.json
const extPkgPath = path.join(
	rootDir,
	"extensions",
	"aicollector",
	"package.json",
);
try {
	const extPkg = JSON.parse(readFileSync(extPkgPath, "utf-8"));
	extPkg.version = newVersion;
	writeFileSync(extPkgPath, `${JSON.stringify(extPkg, null, 2)}\n`, "utf-8");
	console.log(
		`📦 Synced version v${newVersion} to extensions/aicollector/package.json`,
	);
} catch (err) {
	console.warn(
		"⚠️ Failed to update extensions/aicollector/package.json:",
		err.message,
	);
}

// 9. Remove existing tag if overwriting
if (overwriteExistingTag) {
	console.log(`🗑️ Deleting old local tag v${newVersion}...`);
	run(`git tag -d "v${newVersion}"`);
	try {
		runOutput(`git push origin :refs/tags/v${newVersion}`);
		console.log(`🗑️ Deleted old remote tag v${newVersion}`);
	} catch {
		// Remote tag might not exist, ignore
	}
}

// 10. Git commit and tag
console.log(`🏷️ Creating commit and tag v${newVersion}...`);
run("git add package.json extensions/aicollector/package.json");
run(`git commit -m "chore(release): v${newVersion}"`);
run(`git tag -a "v${newVersion}" -m "Release v${newVersion}"`);

// 11. Push commit and tag to remote
console.log("⬆️ Pushing changes and tags to origin main...");
run("git push origin main --tags");

console.log(
	`\n🎉 Successfully released v${newVersion} and pushed to origin main!`,
);
console.log("🚀 GitHub Actions build has been triggered.");
