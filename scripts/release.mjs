import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function run(command) {
	return execSync(command, { cwd: rootDir, stdio: "inherit" });
}

function runOutput(command) {
	return execSync(command, { cwd: rootDir, encoding: "utf-8" }).trim();
}

// 1. Get version bump type or target version from argv (patch | minor | major | x.y.z)
const bumpType = process.argv[2] || "patch";

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
console.log(
	"🚀 Run 'git push origin main --tags' to push and trigger GitHub Actions build.",
);
