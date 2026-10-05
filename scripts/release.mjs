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
			if (/^v?\d+\.\d+\.\d+/.test(bumpType)) {
				return bumpType.replace(/^v/, "");
			}
			throw new Error(`Unknown bump type or invalid version: ${bumpType}`);
	}
}

// 1. Parse arguments (patch | minor | major | x.y.z, and optional -y/--yes)
const bumpType =
	process.argv.find(
		(arg) =>
			!arg.startsWith("-") &&
			arg !== process.argv[0] &&
			arg !== process.argv[1],
	) || "patch";
const isForceYes = process.argv.includes("-y") || process.argv.includes("--yes");

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

// 3. Read current version and calculate target version
const rootPkgPath = path.join(rootDir, "package.json");
const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf-8"));
const currentVersion = rootPkg.version;
const newVersion = computeNextVersion(currentVersion, bumpType);

// 4. Secondary confirmation BEFORE making any changes
console.log(`\n📋 Release Confirmation:`);
console.log(`   • Current version: v${currentVersion}`);
console.log(`   • Target version:  v${newVersion} (${bumpType})`);
console.log(`   • Target branch:   main -> origin/main`);
console.log(
	`   • Actions:         Update package.json -> Git Commit & Tag -> Push to remote\n`,
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

// 5. Update root package.json
console.log(`\n📦 Updating root package.json to v${newVersion}...`);
rootPkg.version = newVersion;
writeFileSync(rootPkgPath, `${JSON.stringify(rootPkg, null, 2)}\n`, "utf-8");

// 6. Sync version to extensions/aicollector/package.json
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

// 7. Git commit and tag
console.log(`🏷️ Creating commit and tag v${newVersion}...`);
run("git add package.json extensions/aicollector/package.json");
run(`git commit -m "chore(release): v${newVersion}"`);
run(`git tag -a "v${newVersion}" -m "Release v${newVersion}"`);

// 8. Push commit and tag to remote
console.log("⬆️ Pushing changes and tags to origin main...");
run("git push origin main --tags");

console.log(
	`\n🎉 Successfully released v${newVersion} and pushed to origin main!`,
);
console.log("🚀 GitHub Actions build has been triggered.");
