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

// 1. Get version bump type or target version from argv (patch | minor | major | x.y.z)
const bumpType = process.argv.find((arg) => !arg.startsWith("-") && arg !== process.argv[0] && arg !== process.argv[1]) || "patch";
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

// 3. Bump version using npm version (updates root package.json)
console.log(`📦 Bumping root package.json (${bumpType})...`);
const newVersionTag = runOutput(`npm version ${bumpType} --no-git-tag-version`);
const newVersion = newVersionTag.replace(/^v/, "");

// 4. Sync version to extensions/aicollector/package.json
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
		`📦 Synced version ${newVersion} to extensions/aicollector/package.json`,
	);
} catch (err) {
	console.warn(
		"⚠️ Failed to update extensions/aicollector/package.json:",
		err.message,
	);
}

// 5. Git commit and tag
console.log(`🏷️ Creating commit and tag v${newVersion}...`);
run("git add package.json extensions/aicollector/package.json");
run(`git commit -m "chore(release): v${newVersion}"`);
run(`git tag -a "v${newVersion}" -m "Release v${newVersion}"`);

console.log(`\n🎉 Successfully bumped and tagged to v${newVersion}!`);

// 6. Secondary confirmation to push and trigger release
const shouldPush =
	isForceYes ||
	(await askConfirmation(
		`🚀 Push commit and tag v${newVersion} to origin main now? (y/N) `,
	));

if (shouldPush) {
	console.log("⬆️ Pushing changes and tags to origin main...");
	run("git push origin main --tags");
	console.log(
		`\n✨ Release v${newVersion} triggered successfully on GitHub Actions!`,
	);
} else {
	console.log("\n⏸️ Push skipped. When you're ready, manually run:");
	console.log("   git push origin main --tags");
	console.log("\nIf you want to undo this version bump locally, run:");
	console.log(`   git tag -d v${newVersion} && git reset --hard HEAD~1`);
}
